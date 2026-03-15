# pi-dedumbify

Pi extension for executable spaced repetition with FSRS scheduling.

Write real TypeScript or Python code, run tests in an isolated temp workspace, then rate the review to schedule the next interval.

## Install in pi

From npm:

```bash
pi install npm:pi-dedumbify
```

From GitHub:

```bash
pi install git:github.com/lukaskawerau/pi-dedumbify
```

Then restart pi or run `/reload`.

## What it does

- centered review overlay inside pi
- user-authored global card deck
- TypeScript cards graded via Vitest
- Python cards graded via `uv` + Pytest
- FSRS scheduling via `ts-fsrs`
- automatic review persistence in SQLite

## Commands

- `/sr` — auto-sync cards, then open review modal
- `/sr-sync` — force a card rescan + DB sync
- `/sr-stats` — sync cards, then show DB-backed deck stats
- `/sr-validate` — structural validation + run solution tests without writing reviews

## Keyboard shortcuts in the modal

- `tab` / `shift+tab` — switch panes
- `ctrl+r` — run tests
- `ctrl+s` — toggle starter/solution
- `1` / `2` / `3` / `4` — Again / Hard / Good / Easy
- `esc` — close

## Card location

Cards live under:

```text
~/.pi/agent/spaced-rep/cards/
```

DB lives at:

```text
~/.pi/agent/spaced-rep/fsrs.db
```

## Card format

Each card lives in its own directory.

TypeScript example:

```text
sum-array-ts/
  card.yaml
  prompt.md
  starter.ts
  solution.ts
  tests.ts
```

Python example:

```text
factorial-py/
  card.yaml
  prompt.md
  starter.py
  solution.py
  tests.py
```

Minimal `card.yaml`:

```yaml
id: sum-array-ts
title: Sum an array of numbers
language: typescript
tags:
  - arrays
  - iteration
timeboxSec: 180
files:
  prompt: prompt.md
  starter: starter.ts
  solution: solution.ts
  tests: tests.ts
runner:
  entry: answer.ts
```

## Local development

```bash
cd ~/coding/apps/dedumbify
npm install
npm run check
pi
```

The repo exposes a project-local extension shim at `.pi/extensions/dedumbify.ts`, so pi auto-discovers it when started from the repo root.

## Status

MVP works.

Implemented:

- card discovery + validation
- SQLite deck state + review log
- grading runners for TS and Python
- FSRS scheduling
- review modal with answer buffer and autosave on rating

Still rough:

- result rendering polish
- richer session stats
- nicer reveal-solution flow
