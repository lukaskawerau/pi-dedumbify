---
summary: Stepwise build plan for the dedumbify MVP
read_when:
  - starting implementation
  - deciding what to build next
  - tracking MVP scope
---

# Implementation plan

## Phase 1 — project scaffold

Done:

- create TypeScript project
- add extension entrypoint
- add docs
- add lint/typecheck/test scripts

## Phase 2 — cards

Done:

- implement card discovery
- parse `card.yaml`
- normalize paths
- compute content hash
- validate card packs
- detect duplicate ids

## Phase 3 — SQLite

Done:

- open DB under `~/.pi/agent/spaced-rep/fsrs.db`
- create schema
- upsert synced cards
- initialize state rows
- add DB-backed deck stats
- auto-sync cards when `/sr` opens

## Phase 4 — grading

Done:

- create temp workspaces
- TypeScript runner via Vitest
- Python runner via `uv run pytest`
- parse results into a stable `GradeResult`
- use grading in `/sr-validate` to check solution files

## Phase 5 — review UI

Done for MVP:

- centered overlay modal
- prompt/starter/answer/results panes
- keyboard controls
- answer buffer editing
- run tests from modal
- load next card from DB

## Phase 6 — FSRS loop

Done for MVP:

- choose FSRS package (`ts-fsrs`)
- update `card_state` from user rating
- persist `reviews` automatically on rating/submit
- load next due card

## Phase 7 — polish

Pending:

- sync feedback polish
- nicer result summaries
- reveal solution flow
- richer session stats in the modal

## Acceptance bar for MVP

- user can add valid TS/Python cards without touching extension code
- `/sr-sync` imports card metadata into SQLite
- `/sr` presents due cards in an overlay modal
- user can answer in the modal
- tests run in temp dirs only
- result is recorded in SQLite automatically on review
- next due date is computed with FSRS
