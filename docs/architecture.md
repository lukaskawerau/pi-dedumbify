---
summary: Architecture and MVP plan for the dedumbify pi extension
read_when:
  - implementing the pi spaced repetition extension
  - changing card schema, grading, or FSRS scheduling
  - adding new commands or modal UI behavior
---

# dedumbify architecture

## Goal

Build a pi extension that opens a centered overlay modal for spaced repetition while the main pi session can keep running behind it.

MVP constraints:

- code cards only
- global deck only
- user-authored cards only
- TypeScript and Python
- grading via tests
- FSRS scheduling in SQLite
- highlighted previews are enough; live syntax-highlighted editing is not required

## Non-goals for MVP

- shipping built-in cards
- repo-local decks
- architecture/style/freeform cards
- AI grading
- live syntax-highlighted editor
- importing from Anki
- distributed sync

## Product shape

The extension behaves like a side activity inside pi:

- user opens `/sr`
- extension auto-syncs card packs into SQLite
- centered overlay modal appears
- modal presents one due code card at a time
- user writes code into an answer buffer
- extension grades the answer in an isolated temp workspace
- user confirms an FSRS rating: Again, Hard, Good, Easy
- extension stores review event automatically and updates schedule
- next due card appears

The overlay should be manually opened and manually closed. No surprise popups.

## High-level architecture

Three layers:

1. **pi extension layer**
   - commands
   - overlay UI
   - keyboard handling
   - answer buffer management
   - status/stats display
2. **content layer**
   - user-authored card packs on disk
   - validation
   - preview rendering
3. **data/runtime layer**
   - SQLite DB for card index + FSRS state + review log
   - grader execution in temp dirs
   - FSRS scheduling logic

This separation matters:

- cards stay editable and git-friendly
- DB can be rebuilt from disk
- extension code stays independent from user content

## Storage layout

Global storage under `~/.pi/agent/spaced-rep/`.

Recommended layout:

```text
~/.pi/agent/spaced-rep/
  fsrs.db
  cards/
    two-sum-ts/
      card.yaml
      prompt.md
      starter.ts
      solution.ts
      tests.ts
    parse-env-py/
      card.yaml
      prompt.md
      starter.py
      solution.py
      tests.py
```

## Card pack format

Directory-per-card.

Why:

- clean authoring
- small files
- easy hidden tests later
- friendly to git
- avoids giant YAML blobs

### Required files

For TypeScript:

- `card.yaml`
- `prompt.md`
- `starter.ts`
- `solution.ts`
- `tests.ts`

For Python:

- `card.yaml`
- `prompt.md`
- `starter.py`
- `solution.py`
- `tests.py`

### `card.yaml`

```yaml
id: two-sum-ts
title: Two Sum
language: typescript
tags:
  - arrays
  - hashmap
timeboxSec: 600
files:
  prompt: prompt.md
  starter: starter.ts
  solution: solution.ts
  tests: tests.ts
runner:
  entry: answer.ts
```

Python example:

```yaml
id: parse-env-py
title: Parse env file
language: python
tags:
  - parsing
  - io
timeboxSec: 900
files:
  prompt: prompt.md
  starter: starter.py
  solution: solution.py
  tests: tests.py
runner:
  entry: answer.py
```

## Card model

Normalized card metadata used inside the extension:

```ts
interface CardDefinition {
  id: string;
  title: string;
  language: "typescript" | "python";
  tags: string[];
  timeboxSec?: number;
  path: string;
  files: {
    prompt: string;
    starter: string;
    solution: string;
    tests: string;
  };
  runner: {
    entry: string;
  };
  contentHash: string;
}
```

`contentHash` should be computed from the relevant card files. It lets sync detect changes.

## SQLite schema

SQLite stores index + schedule + review history.

### `cards`

```sql
create table if not exists cards (
  id text primary key,
  title text not null,
  language text not null check (language in ('typescript', 'python')),
  path text not null,
  tags_json text not null,
  timebox_sec integer,
  content_hash text not null,
  active integer not null default 1,
  updated_at text not null
);
```

### `card_state`

One row per card.

```sql
create table if not exists card_state (
  card_id text primary key references cards(id) on delete cascade,
  due_at text,
  stability real,
  difficulty real,
  elapsed_days real,
  scheduled_days real,
  reps integer not null default 0,
  lapses integer not null default 0,
  last_review_at text,
  last_rating integer,
  state text,
  created_at text not null,
  updated_at text not null
);
```

### `reviews`

Append-only review log.

```sql
create table if not exists reviews (
  id text primary key,
  card_id text not null references cards(id) on delete cascade,
  reviewed_at text not null,
  rating integer not null,
  elapsed_ms integer,
  passed integer not null,
  test_summary text,
  stdout text,
  stderr text,
  answer_hash text,
  content_hash text not null
);
```

### optional later

- `attempts`
- `settings`
- `schema_version`

For MVP, `reviews` may be enough for forensic history.

## FSRS model

Use FSRS to calculate next review after each graded attempt.

Rules:

- grader suggests a rating
- user confirms or overrides it
- user choice is the final FSRS input
- FSRS state lives in `card_state`
- every review is persisted in `reviews`

Suggested default mapping:

- all tests pass -> suggest `Good`
- some tests fail -> suggest `Again`
- user can always override to `Hard` or `Easy`

Implementation note:

- FSRS scheduling now uses `ts-fsrs`
- user-selected rating is persisted immediately together with grading output

Reason: FSRS should model memory, not just correctness.

## Sync pipeline

`/sr-sync` scans `~/.pi/agent/spaced-rep/cards/` and:

1. finds card directories
2. parses `card.yaml`
3. validates required files
4. computes `contentHash`
5. upserts into `cards`
6. initializes `card_state` for new cards
7. marks invalid cards inactive or reports them

Cards are source-of-truth on disk. SQLite is the runtime index.

## Validation pipeline

`/sr-validate` should catch bad user-authored cards early.

Validation checks:

- unique `id`
- supported `language`
- all referenced files exist
- starter/solution/tests file extensions match language
- `runner.entry` matches language
- test suite passes against the provided solution
- prompt is readable

Invalid cards should not become reviewable.

## Grading strategy

Run every attempt in an isolated temp directory.

Rules:

- never run inside the current repo
- no access to project files
- no network assumptions
- strict timeout
- capture stdout/stderr
- clean structured result for UI and DB

### TypeScript grading

Temp dir contains:

- `answer.ts`
- `tests.ts`
- maybe generated `package.json`
- minimal vitest config if needed

Run a command equivalent to:

```bash
npx vitest run tests.ts --reporter=json
```

Prefer a stable wrapper around Vitest so parsing stays predictable.

### Python grading

Temp dir contains:

- `answer.py`
- `tests.py`

Run via `uv`:

```bash
uv run pytest tests.py -q
```

Again: wrap output parsing; do not tie the UI directly to raw stderr.

## Grading result model

```ts
interface GradeResult {
  passed: boolean;
  passedCount: number;
  failedCount: number;
  summary: string;
  stdout: string;
  stderr: string;
  failures: Array<{
    name: string;
    message: string;
    details?: string;
  }>;
  suggestedRating: "again" | "hard" | "good" | "easy";
}
```

MVP suggestion logic can stay simple.

## Modal UX

Centered overlay modal.

Sections:

- header: card title, language, tags, due info, timebox
- body tabs/panes:
  - Prompt
  - Starter
  - Answer
  - Results
- footer: key hints

### Key actions

- `tab` / `shift+tab` — cycle focus or pane
- `ctrl+r` — run tests
- `ctrl+s` — reveal solution
- `1` — Again
- `2` — Hard
- `3` — Good
- `4` — Easy
- `esc` — close modal
- `shift+enter` — newline in answer buffer

Because live editor syntax highlighting is out of scope, the **Answer** pane may be a plain text editor buffer while other panes use highlighted previews.

## pi integration notes

Relevant pi capabilities already confirmed from docs/examples:

- overlay modal via `ctx.ui.custom(..., { overlay: true })`
- custom keyboard input
- highlighted Markdown/code rendering
- overlay examples with streaming under active overlays

Known limitation from docs/source review:

- built-in editor does not expose documented live syntax highlighting while typing

So the implementation should prefer:

- plain answer editing
- highlighted read-only previews for prompt/starter/solution/results

## Commands

### `/sr`

Open the review modal.

Behavior:

- ensure sync status is known
- load due/new cards
- show one card
- run grading
- accept rating
- schedule next

### `/sr-sync`

Scan the card directory and sync valid cards into SQLite.

### `/sr-stats`

Show counts:

- due
- new
- learning
- review
- invalid/inactive

### `/sr-validate`

Run validation for all card packs and print a compact report.

## Modules

Suggested TypeScript module split:

```text
src/
  index.ts                # pi extension entry
  commands/
    sr.ts
    sr-sync.ts
    sr-stats.ts
    sr-validate.ts
  db/
    schema.ts
    sqlite.ts
    cards.ts
    reviews.ts
    state.ts
  cards/
    discover.ts
    parse-card.ts
    validate-card.ts
    hash.ts
  fsrs/
    scheduler.ts
    ratings.ts
  grading/
    grade-card.ts
    runners/
      typescript.ts
      python.ts
    parse-vitest.ts
    parse-pytest.ts
    temp-workspace.ts
  ui/
    review-modal.ts
    answer-buffer.ts
    panes/
      prompt-pane.ts
      preview-pane.ts
      results-pane.ts
  types/
    card.ts
    grade.ts
    review.ts
```

Keep files small.

## Suggested implementation order

1. card schema + parser
2. validator
3. SQLite schema + sync
4. TS/Python grading runners
5. minimal `/sr` modal
6. FSRS scheduling
7. stats + polish

## Open questions left for implementation

1. exact FSRS library/package choice
2. exact SQLite client/package choice
3. whether to vendor tiny Vitest/Pytest wrappers for stable machine parsing
4. whether solution reveal should auto-suggest `Again`

## Default decisions unless we learn otherwise

- revealing solution suggests `Again`
- cards are inactive if validation fails
- changed `contentHash` preserves card history if `id` stays stable
- no repo integration at all
- all grading occurs in temp dirs only
