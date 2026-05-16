# Next Steps

## Goal for this branch

Keep this branch scoped to the **playable consequence loop** for the personal adventure app.

That means:
- keep DB-backed canonical state
- keep the body / mind / conditions model
- keep setback instead of hard death
- improve recovery and item-loss behavior
- avoid turning this branch into a giant game platform

## Recommended next steps

### 1. Do a real manual playtest pass
Run through a few deliberate scenarios and verify the app feels coherent:
- normal exploration turn
- risky turn that should cause injury or stress
- a turn that adds a treatment / recovery condition
- a turn that should force collapse / setback
- verify key items are retained
- verify non-key items can be lost
- verify reset still returns the run to a clean starting state

### 2. Add lightweight debug controls for testing state
Make it easy to force specific narrative states during testing.
Useful forced states:
- `healthy`
- `wounded`
- `critical`
- `collapsed`
- `clear`
- `shaken`
- `broken`
- `watched_by_guard`
- `arrow_shoulder`
- `resting`
- `treated`

This can be temporary/debug-only if needed.

### 3. Tighten setback outcomes
Current setback logic is a good start, but should be tuned so outcomes feel distinct and story-rich.

Recommended setback buckets:
- jailed / detained
- rescued / treated
- robbed / stripped of supplies
- displaced / wake up somewhere unfamiliar

Each setback should:
- move the player to a new scene
- update body/mind state
- add concrete conditions
- set at least one persistent flag
- optionally remove one non-key item

### 4. Improve recovery rules
Recovery should become a little more intentional.

Examples:
- `resting` improves body state one step
- `treated` removes or softens serious injury conditions
- `safe_shelter` helps mind state recover
- untreated severe conditions can continue to matter for a while

Goal:
- setbacks should hurt
- recovery should feel earned
- but the player should not get stuck permanently ruined

### 5. Make item classes visible and reliable
Keep item logic simple but consistent.

Current direction:
- `key` items are protected
- `quest` items should also be protected
- `equipment` can be dropped or lost in setbacks
- `consumable` items are easiest to lose/use

Next improvement:
- surface item type cleanly in the UI
- make sure setback logic always respects protected item classes

### 6. Decide whether to add a minimal real-run vs test-run split
Only do this if it stays lightweight.

Possible simple version:
- one main test run
- one main real run

Why it may help:
- lets us experiment without trashing the real story
- avoids needing a full save-slot system

Why not overbuild it:
- this is a personal project
- we do not need a full save management platform yet

### 7. Add one more layer of soft tests
The current soft checks are useful, but we should add tests that target the new consequence loop more directly.

Recommended additions:
- setback trigger check
- protected item retention check
- non-key item loss check
- recovery condition check
- reset-after-setback check

Keep them soft-fail like the current harness.

## Things to avoid on this branch

Do **not** let this branch expand into:
- full quest engine
- admin/content editor
- complicated combat math
- large authored scene graph system
- heavy save-slot architecture
- generalized multi-user platform work

## Good stopping point for this branch

This branch is in a good place to stop when all of the following are true:
- manual playtests feel coherent
- setback logic is believable
- recovery works
- key items are protected
- reset works cleanly
- build and soft checks pass

## Current status

Already in place:
- canonical run-based DB model
- removal of localStorage as game truth
- body / mind / conditions direction
- starter item classes
- soft regression checks
- initial setback / recovery scaffolding

Still worth doing next:
- manual playtest pass
- debug/test state controls
- setback tuning
- recovery tuning
- consequence-focused soft tests
