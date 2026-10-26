# Start List Maker: plan and TODO

A light, client-only version of the pnwapnea start-list generator, hosted on GitHub Pages at **startlistmaker.online**. Organizers upload Google Form responses, fix the data, choose timing, lanes, breaks and order, then print or download the start list. See [DESIGN.md](./DESIGN.md).

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Hosting | GitHub Pages from a **public** repo, deployed by GitHub Actions. For now it's served at the GitHub project URL `ctophw.xyz/startlistmaker/` (no DNS yet, per the user). The custom domain `startlistmaker.online` comes later. `base: "./"` so one build works at both |
| Commit email | `christophwong@users.noreply.github.com` (history rewritten before going public, so the Gmail isn't exposed) |
| Architecture | Static SPA, no server, no accounts; all processing in the browser |
| Stack | Vite + TypeScript + Tailwind v4; code written against React's API, **run on Preact** (`preact/compat`) for size |
| Code reuse | pnwapnea's `app/lib/**` and shared components **copied** (forked), not shared as a package |
| Input | CSV (primary), **paste from Google Sheets** (tab-separated), XLSX (lazy-loaded). No Google API / OAuth (privacy) |
| PDF | Browser **Print / Save as PDF**, plus a one-click **Download PDF** (lazy jsPDF + autotable) |
| Other exports | CSV (formula-injection safe), XLSX (lazy), JSON project file (save / reopen everything) |
| Persistence | `sessionStorage` by default; opt-in "Remember on this device" uses `localStorage`; "Clear all data" |
| Routing | No router; one reducer with steps; `#demo` / `#demo-pool` / `#demo-depth` open a sample |
| Validation library | `zod/mini` (the full zod was about 20 KB gzipped more) |
| Demo data | Anonymized from the real ECAC depth form (`scripts/anonymize.mjs --fix-typos`); the pool sample comes from pnwapnea's synthetic pool fixture (no real pool export yet) |
| Header typos | Still not guessed in code (pnwapnea decision); the demo sample's `Dicipline` header is fixed by `--fix-typos` |
| Half-time break | Auto-inserted at the OT-group boundary nearest the middle, only when the list has no other break |
| Column sort | Sorts starts within each stretch between breaks; breaks stay put |
| Grouping | `groupBy` DISCIPLINE (block order editable) or MIXED (pool static stays apart, first or last per block order); optional women/men first; sort key AP / dive time / name / registration, ascending or descending |
| Theme | Light by default (the user found the system-following dark too dark); a header toggle for dark mode |
| Athletes editor | Spreadsheet layout at all widths (gridded, borderless cells, Notes column), replacing the bordered inputs and mobile cards |
| Spacing | FIXED interval, or DIVE_TIME = longest dive in the OT group + buffer, rounded up to 1/5/10 min (falls back to fixed when no dive time) |

## TODO

### Phase 1: scaffold and port
- [x] Vite + TS + Tailwind + Vitest + Playwright; CSP meta injected at build
- [x] Copy pnwapnea libs, components and tests; browser XLSX reader; paste parser
- [x] Ported tests green (ECAC fixtures still reproduce the published sheets)

### Phase 2: engine extensions
- [x] Dive time + buffer spacing (`spacingMode`, `bufferMin`, `roundToMin`)
- [x] Half-time break (`halftimeBreakMin`)
- [x] Block order / group by / gender order / sort key and direction (replaces `poolDisciplineMode` + `poolSortBy`)
- [x] Column sort within break sections (`sortEntriesBy`), drag-and-drop moves (`moveEntryTo`)

### Phase 3: app
- [x] Input step: file (CSV/XLSX/project JSON), paste, demo, enter by hand
- [x] Columns step: mapping, pool/depth, Day 1/Day 2 picker, sheet picker
- [x] Athletes step: editable table with per-cell errors/warnings, add/delete/exclude, 1 or 2 starts
- [x] Start list step: event details, settings, ↑↓ / drag / "move to #", breaks, sort headers, issues, append unscheduled
- [x] Finalize step: print preview, Print / Save as PDF, Download PDF, CSV, XLSX, Save project; column toggles; page per break
- [x] Persistence (session / remember / clear), `#demo` links
- [x] Anonymized samples + `scripts/anonymize.mjs` with leak check

### Review feedback
- [x] Light by default + dark mode toggle
- [x] Athletes step as a spreadsheet
- [x] Home page has only the calls to action; the guidelines are in a Help dialog (header, every step)
- [x] One prominent "Try a demo" button → picker (Pool/Depth, 1 or 2 starts/days)

### Phase 4: ship
- [x] GitHub Actions: checks + Pages deploy (actions pinned to SHAs), Dependabot
- [x] Create the GitHub repo (private for review: christophwong/startlistmaker) and push
- [x] Make it public, enable Pages (source: GitHub Actions); live at https://ctophw.xyz/startlistmaker/
- [ ] Later: custom domain `startlistmaker.online` (verify on the account, DNS at Namecheap, set it in Pages, enforce HTTPS)
- [ ] Try a real form export end to end and compare against the organizer's sheet

### Backlog
- [ ] Page per discipline block in print/PDF (today: optional new page after each break)
- [ ] Unicode font for the jsPDF download (non-Latin names; Print / Save as PDF already handles them)
- [ ] Undo for start-list edits
- [ ] Keyboard drag-and-drop (today: ↑↓ buttons and "move to #")
- [ ] Multiple days in one project (today: one day at a time via the Day picker)
- [ ] Results entry, judges' sheets, emergency contact sheet
