# Choose Adventure

Minimal Next.js prototype for a single-page choose-your-adventure companion app.

## State files

This app intentionally keeps story state in a tiny set of files under `public/state/`:

- `player.json`
- `world.json`
- `log.json`
- `summary.md`

The page reads those files and renders:

- current scene
- available choices
- running log
- player state
- world state
- markdown summary

## Style

The homepage uses a retro fantasy-console look: part old terminal, part worn adventure manual, part tavern bulletin board.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
