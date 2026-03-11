# Wingman

A CLI-first presentation builder. Create and edit slides from the terminal (or let an AI agent do it), then present from the browser.

## Architecture

```
server/api.js      REST API — reads/writes data/presentations.json
server/dev.js      Dev server — Vite (frontend + HMR) + API on one port
server/index.js    Production server — serves dist/ + API on one port
bin/wingman.js     CLI — thin wrapper around the REST API
src/               React frontend (Vite + Tailwind)
data/              presentations.json lives here (gitignored except .gitkeep)
```

The browser polls the server every 4 seconds, so CLI changes appear live without a refresh.

## Running

```bash
# Dev (single command, single port)
npm run dev        # → http://localhost:5173

# Production
npm run build
npm start          # → http://localhost:3000
```

## CLI

All commands talk to `WINGMAN_SERVER` (default: `http://localhost:5173`).

### Presentations

```bash
wingman list
wingman create "My Talk" [--theme <id>] [--font <family>]
wingman show <id>
wingman set <id> [--title "New Title"] [--theme <id>] [--font <family>]
wingman delete <id>
wingman open [id]
```

### Slides

```bash
wingman slides <id>                          # list slides with IDs and layout
wingman add <id> '<json>' [--at <index>]     # append or insert
wingman update <id> <slide-id> '<json>'      # replace slide content
wingman remove <id> <slide-id>
wingman move <id> <slide-id> <new-index>
```

### Other

```bash
wingman themes     # list available themes
wingman start      # start the server
```

### Slide JSON shapes

```json
{ "layout": "title",      "content": { "title": "...", "subtitle": "..." } }
{ "layout": "bullets",    "content": { "title": "...", "bullets": ["a", "b", "c"] } }
{ "layout": "content",    "content": { "title": "...", "body": "..." } }
{ "layout": "quote",      "content": { "title": "...", "quote": "...", "attribution": "..." } }
{ "layout": "stats",      "content": { "title": "...", "stats": [{ "value": "42%", "label": "Growth" }] } }
{ "layout": "two-column", "content": { "title": "...", "leftColumn": ["a"], "rightColumn": ["b"] } }
```

## Themes

| ID         | Description                          |
|------------|--------------------------------------|
| obsidian   | Dark purple gradient (default)       |
| arctic     | Light blue / white                   |
| midnight   | Near-black with gold accents         |
| ember      | Dark brown with orange accents       |
| forest     | Deep green                           |
| slate      | Dark blue-grey with sky blue accents |
| neon       | Near-black with electric cyan        |
| rose       | Deep dark with hot pink accents      |
| paper      | Warm off-white, terracotta accent    |
| terminal   | Dark green-on-black, has logo        |

To add a theme: edit `src/app/utils/themes.ts` — it's just an object with 7 color fields.

## Export / Import

From the editor's Export menu:
- **Standalone HTML** — self-contained file, runs in any browser, full styling, keyboard navigation. The presentation JSON is embedded in the file so it can be re-imported.
- **PowerPoint (.pptx)** — editable but some styling is approximate (no CSS gradients).

To restore a presentation from an HTML export: Library → **Import HTML**.

## Data

All presentations are stored in `data/presentations.json`. No database. The file is plain JSON — safe to back up, copy, or edit by hand.

## Adding an AI agent (Claude Code)

Point Claude Code at this repo. It can drive the full presentation lifecycle.

**Start every session by listing existing presentations** — `data/presentations.json` is gitignored so IDs aren't in the repo:

```bash
node bin/wingman.js list
```

Then build or iterate:

```bash
# Create a new deck
node bin/wingman.js create "My Talk" --theme terminal

# Add slides
node bin/wingman.js add <id> '{"layout":"bullets","content":{"title":"Key Points","bullets":["a","b","c"]}}'

# Inspect and iterate
node bin/wingman.js slides <id>
node bin/wingman.js update <id> <slide-id> '{"layout":"stats","content":{...}}'
node bin/wingman.js open <id>
```

The browser reflects changes within 4 seconds automatically.

### Logo positioning

Logo position is stored per-presentation as `logoImage` (in 1280×720 slide space). The CLI `set` command doesn't expose it — set it once via the browser editor (Logo button in toolbar), then it persists for all future sessions.
