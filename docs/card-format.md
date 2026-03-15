---
summary: User-authored card pack format for dedumbify
read_when:
  - creating or editing spaced repetition cards
  - validating card packs
  - implementing sync or grading
---

# Card pack format

Cards are user-authored and stored globally under:

```text
~/.pi/agent/spaced-rep/cards/
```

Each card lives in its own directory.

## TypeScript card

```text
two-sum-ts/
  card.yaml
  prompt.md
  starter.ts
  solution.ts
  tests.ts
```

## Python card

```text
parse-env-py/
  card.yaml
  prompt.md
  starter.py
  solution.py
  tests.py
```

## `card.yaml`

### Common fields

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

### Rules

- `id` must be globally unique
- `language` must be `typescript` or `python`
- file names must exist in the card directory
- `runner.entry` must match the language
- cards must be self-contained
- tests must pass against `solution.*`
- cards must not depend on the current repo

## Authoring guidelines

- keep prompts short and concrete
- provide starter code when interface matters
- write deterministic tests
- avoid network access
- avoid filesystem assumptions beyond the temp grading dir
- prefer a few strong assertions over many noisy ones

## Future-compatible extensions

Not part of MVP, but reserved conceptually:

- hidden/public test split
- fixtures/
- multiple source files
- explanation rubrics
- difficulty metadata
