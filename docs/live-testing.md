---
summary: How to run dedumbify live inside pi
read_when:
  - testing the extension in pi
  - reloading the project-local extension
  - trying the sample cards
---

# Live testing

## Auto-discovery

The project exposes a project-local pi extension at:

```text
.pi/extensions/dedumbify.ts
```

So when you run `pi` from this repo root, pi should auto-discover the extension.

## Fast path

From this repo:

```bash
cd ~/coding/apps/dedumbify
pi
```

Inside pi:

- run `/reload` if pi was already open before the extension existed
- run `/sr-stats`
- run `/sr-validate`
- run `/sr`

## Shortcuts

- `ctrl+shift+r` — open the review modal
- `tab` / `shift+tab` — switch panes
- `ctrl+r` — run tests
- `ctrl+s` — toggle starter/solution in the code preview pane
- `1` / `2` / `3` / `4` — Again / Hard / Good / Easy
- `esc` — close modal

## Global deck paths

Cards live under:

```text
~/.pi/agent/spaced-rep/cards/
```

DB lives at:

```text
~/.pi/agent/spaced-rep/fsrs.db
```

## Sample cards

Two sample cards are installed for live testing:

- `sum-array-ts`
- `factorial-py`

They are only there to make the first test loop immediate.

## Expected flow

1. `/sr` opens a centered modal
2. starter code is prefilled into the Answer pane
3. `ctrl+r` runs tests
4. `1/2/3/4` records the review immediately
5. next card loads automatically
