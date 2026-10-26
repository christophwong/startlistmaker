# Design

## 1. What it does

An organizer goes through five steps, and can jump back to any step they've reached:

1. **Input**: upload a sign-up sheet (CSV/XLSX from Google Forms), paste cells from Google Sheets, open a saved project (`.json`), enter athletes by hand, or open a demo.
2. **Columns**: confirm the header → field mapping (auto-mapped, editable), pool vs depth (auto-detected), which day of a two-day form, and which sheet of a workbook.
3. **Athletes**: an editable table of registrations. Red cells keep a start off the list (name, discipline, AP), and amber cells are warnings. Rows can be added, deleted, or left off the list.
4. **Start list**: event details, settings, then the generated list. Starts can be reordered with ↑↓, by dragging, or by typing a position. Column headers sort it. Breaks can be inserted, edited, or removed. Issues (recovery time, same OT) are listed.
5. **Finalize**: the print sheet as a preview, header and sponsor logos, Print / Save as PDF, Download PDF, CSV, Excel, and Save project.

## 2. Architecture

```
index.html (CSP meta, injected at build)
src/main.tsx → App.tsx (header, stepper, storage controls, #demo)
  state/store.ts     one reducer: source table, mapping, registrations, settings, entries, event, print options, logos
  state/derived.ts   useStartList: starts → schedule() → issues, export table
  state/persist.ts   session/local storage + project files, validated with zod/mini
  steps/*            Input, Columns, Athletes, Start list, Finalize
  components/*       shared UI from pnwapnea (callback-driven)
  lib/               pure logic: import/, startlist/, registrations.ts, export/
  samples/           anonymized CSVs, bundled as text, loaded on demand
```

Pure logic has no DOM or I/O and is unit-tested. Preact runs the React-API code (aliases in `vite.config.ts`).

### State and derivation

- `source.table` holds the uploaded headers and rows, kept so the mapping can change.
- `registrations: RegRow[]` holds editable rows built once by **Continue** from the parsed rows. Clean rows are stored as normalized values, rows with errors as their raw cells, and superseded or "no entry for this day" rows are dropped. **They are the source of truth after that.**
- Starts are derived: `rowsToStarts(registrations, type, maxStarts)`, with ids `${rowId}-s1|s2`.
- `entries` hold the order and breaks only. `schedule()` computes OT / WT / check-in and lanes on every render.
- `logos` (`lib/export/logos.ts`) hold each image as a PNG/JPEG data URL with its pixel size, place (`HEADER_LEFT`, `HEADER_RIGHT`, `SPONSORS`) and size (S/M/L). Array order is left-to-right order within a place. Like `event` and `print`, they're kept when a new file is loaded.
- `manualOrder` is set by hand edits. Sort, generate, and settings with regenerate ask for confirmation before replacing it.

## 3. Engine (extends pnwapnea §4)

| Setting | Default pool / depth | Effect |
|---|---|---|
| `startTime` | 09:00 | First OT |
| `spacingMode` | FIXED | FIXED: `intervalMin` (STA `staIntervalMin`). DIVE_TIME: ⌈longest dive time in the group⌉ + `bufferMin`, rounded up to `roundToMin`; fixed when the group has no dive time |
| `lanes` / `staLanes` | 3 / 1, STA 2 | Parallel starts per OT. "Lane" in pool, "Zone" in depth |
| `scheduleMode`, `round2Order`, `minRecoveryMin`, `roundBreakMin` | as pnwapnea | Two-start events |
| `halftimeBreakMin` | 0 | Break at the OT-group boundary nearest the middle (ties: earlier), only if the list has no other break |
| `groupBy` | DISCIPLINE / MIXED | DISCIPLINE: blocks in `blockOrder`. MIXED: one block (pool static stays its own segment, first or last as it sits in `blockOrder`) |
| `blockOrder` | STA, DNF, DYNB, DYN, CWT, CWTB, CNF, FIM | Editable with ↑↓; only the current type's disciplines are shown |
| `genderOrder` | NONE | Women or men first within a block |
| `sortBy` / `sortDir` | AP ↑ / AP ↓ | AP, dive time (unknown last), last name, or registration order. AP ties go by dive time (pool), then name |

**Column sort** (`sortEntriesBy`) reorders starts within each stretch between breaks and leaves the breaks where they are. **Drag and drop** (`moveEntryTo`) puts the dragged entry where the target was.

## 4. Input formats

- **CSV**, the Google Forms "Download responses" export. Recommended.
- **Paste** cells copied from Google Sheets (tab-separated; CSV if there are no tabs). This skips the download.
- **XLSX** reads every sheet and starts on the one that maps the most fields.
- **Project JSON** is the app's own save file (`app: "startlistmaker"`, `version: 1`).
- Limits are 5 MB and 2,000 rows per file and 20 MB per project file.

Header mapping, value parsing, resubmission merging and the Day 1 / Day 2 picker are exactly pnwapnea's (its DESIGN.md §5).

## 5. Exports

`lib/export/table.ts` builds one table (columns: [#], Diver Name, Gender, Country, Discipline, AP, Time, OT, [WT], [Check-in], [Lane/Zone]; BREAK rows carry "BREAK · n min · resumes hh:mm"). It's used by:

- **Print / Save as PDF**: the Finalize preview, with a print stylesheet (`no-print`, `print-area`, optional page break after each BREAK). It handles every script.
- **Download PDF**: jsPDF + autotable, loaded on click. Letter, header colour per type (pool blue, depth green), page numbers and a legend. The standard fonts are Latin-1 only.
- **Logos**, in print and Download PDF alike, as on the ECAC sheets. Header logos go on the first page in equal side columns (a quarter of the width each, scaled down together to fit) with the title centred in the middle half. Sponsors wrap into centred rows after the list, on the last page (the PDF adds a page if they don't fit above the footer). Heights are in points: header 48/72/96, sponsors 36/54/72 for S/M/L, and a logo is at most 3.5× as wide as its nominal height. `logoBox`, `headerLayout` and `layoutStrip` compute the PDF geometry; the print view sets the same sizes as `width`/`height` attributes and lets flex-wrap do the rest. PDF images are Flate-compressed (jsPDF stores raw pixels otherwise).
- **CSV**: UTF-8 with BOM. Cells starting with `= + - @ tab CR` get a `'` prefix.
- **XLSX**: write-excel-file, loaded on click, with the same escaping.
- **Project JSON**: the full state.

## 6. Security and privacy

GitHub Pages serves static files and can't set response headers, so:

- **CSP meta** (production builds): `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'self' blob:; manifest-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'`. `connect-src 'none'` means the page cannot send data anywhere. Samples are bundled rather than fetched. The build has no inline scripts (`modulePreload.polyfill: false`).
- `<meta name="referrer" content="no-referrer">`. No analytics, CDNs or web fonts. Every dependency is bundled from the lockfile. CI runs `npm audit` and Dependabot is on.
- **Can't be done with a meta tag:** `frame-ancestors` / `X-Frame-Options` (clickjacking) and HSTS headers. Risk is low because there's no login, no secrets, and no state-changing request. HTTPS is enforced in the Pages settings.
- **Untrusted input:** uploaded files are parsed in memory with size and row limits. Stored state and project files are validated (`parseState`, zod/mini, bounded sizes) before use. Rendering goes through Preact only, with no `dangerouslySetInnerHTML`. Exported spreadsheets are formula-escaped.
- **Logo images** (`lib/import/image.ts`): PNG, JPEG, WebP, GIF or SVG up to 10 MB, decoded by the browser from a `blob:` URL (an SVG in an `<img>` runs no scripts and loads nothing) and redrawn on a canvas at most 600 px on its longest side. Only the re-encoded PNG (or JPEG, when the PNG is too big and the image has no transparency) is kept. `parseState` accepts only `data:image/png|jpeg;base64,…`, at most 400,000 characters each, 2,000,000 in total and 12 logos, so state stays within sessionStorage. Inline styles are blocked by the CSP, so print sizes are `width`/`height` attributes.
- **Storage:** `sessionStorage` by default, and `localStorage` only after "Remember on this device". "Clear all data" removes both. Nothing else is stored.
- **Domain:** verify `startlistmaker.online` in GitHub account settings, which prevents another repo claiming it if Pages is ever turned off. Actions are pinned to SHAs and the deploy job has only `pages: write` + `id-token: write`.
- **Sample data:** `scripts/anonymize.mjs` replaces names, emails, contacts, timestamps and PB dates, remaps countries, and jitters performances. It refuses to write if any source name word or email survives. Real exports stay out of the repo.

## 7. Screens

The layout is mobile-first: 16 px gutters, cards below `md`, tables from `md` up, 44 px touch targets. The app opens **light** (white page) whatever the OS setting; a header toggle switches to dark (`html.dark`, Tailwind `@custom-variant dark`), saved in localStorage only once toggled and removed by "Clear all data". The style is copied from pnwapnea: slate surfaces, ocean-blue accent, amber and red for warnings and errors.

- **Start list (desktop):** a table with drag handle + position number, sortable headers (Athlete, G, Country, Disc., AP, Time), OT/WT/Check-in, Lane, ↑↓ and + Break. Rows are tinted per OT group, and BREAK rows are dark with inline editing.
- **Start list (mobile):** one card per OT group, position numbers to move, and a Sort select.
- **Home (Input):** only the calls to action: the headline, one line, a highlighted "New here? ▶ Try a demo" banner above the upload (it opens the demo picker: Depth or Pool, then 1 or 2 days for depth and 1 or 2 starts for pool), a file drop zone with a primary "Choose a file" button, and links for Paste from Google Sheets (opens a textarea in place), Enter athletes by hand, and How it works.
- **Demo picker** (`components/demo-picker.tsx`): the 1-start / 1-day demos are the same anonymized files cut before the second start or day columns (`samples/index.ts`, `START2_FROM`). The template downloads stay the full files, and the `#demo` / `#demo-pool` links still open the 2-start versions.
- **Help:** a native `<dialog>` (the shared `components/modal.tsx`, also used by the demo picker; `components/help.tsx`), opened from the header on every step or from "How it works". It covers how it works, getting responses out of Google Forms/Sheets, what the form needs (field list + sample template downloads), saving projects, and privacy.
- **Athletes:** one spreadsheet at every width: a gridded white sheet with borderless inputs, grouped headers (Athlete / Start 1 / Start 2), a grey row-number gutter, and the row number and first name pinned while scrolling sideways (and the header while scrolling down, inside a 70vh box). Error cells are tinted red and warning cells amber, each with a corner marker like a spreadsheet comment. Hovering shows the message, and every message is also listed in the Notes column. "On list" and delete are on the right, and an "Only rows with problems" filter is above.
- **Finalize:** export buttons and column toggles, a Logos card, then the sheet preview (ECAC layout: header logos beside the title, date · location, coloured header row, black BREAK rows, legend, sponsor strip).
- **Logos card** (`components/logos-editor.tsx`): "+ Header logo" (the first goes left of the title, later ones right) and "+ Sponsor logos", both taking several files. Each logo is a row grouped by place: thumbnail, file name, Place and Size selects, ← → within its place, and ✕. Files that can't be used are listed in a red alert and the rest are still added.

## 8. Testing

| Layer | Tool | What |
|---|---|---|
| Engine and import | Vitest | ported pnwapnea tests (ECAC layouts), spacing modes, half-time, block order, gender, sort keys, column sort, moveTo |
| App logic | Vitest | registrations validation/import, reducer flows (demo, edits, append, sort, type switch, logos), project round-trip and tampered-file rejection (including logo data URLs and size limits), export table / CSV escaping / filenames, logo layout, anonymizer |
| E2E | Playwright on the production build, desktop 1280 + Pixel 7 | CSP present and `fetch` blocked, demo → PDF/CSV, `#demo-pool`, upload → add athlete → generate → move → sort, drag and drop, paste, XLSX, project save/reopen, logos (add PNG/SVG, reject a non-image, reorder, resize, PDF embeds them, project reopen), reload + Clear all data. Every test fails on an off-origin request or console error |
