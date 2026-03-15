# dedumbify

pi extension for spaced repetition of programming concepts via executable code cards.

## Status

Core MVP loop mostly in place.

Implemented now:

- extension commands + shortcut scaffold
- centered overlay review modal
- global card root + DB path resolution
- card discovery
- `card.yaml` parsing
- structural validation
- duplicate id detection
- content hashing
- SQLite schema + persistence
- DB-backed deck stats
- `/sr` auto-sync before modal open
- TypeScript grading via Vitest in temp dirs
- Python grading via `uv` + Pytest in temp dirs
- FSRS scheduling via `ts-fsrs`
- automatic review persistence on rating
- `/sr-validate` now runs solution tests for valid cards
- Vitest coverage for discovery, validation, DB sync, grading, and review persistence

Still pending:

- polish for result rendering and navigation
- richer review session stats
- nicer reveal-solution flow

## MVP

- pi extension with centered overlay modal
- global, user-authored card deck
- code cards only
- TypeScript + Python
- grading via Vitest and Pytest
- FSRS scheduling in SQLite
- highlighted prompt/starter/solution previews
- plain answer editor buffer

## Commands

- `/sr` — auto-sync cards, then open review modal
- `/sr-sync` — force a card rescan + DB sync
- `/sr-stats` — sync cards, then show DB-backed deck stats
- `/sr-validate` — structural validation + run solution tests without writing reviews
