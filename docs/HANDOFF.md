# Handoff

Last updated: 2026-10-25

## State

Phases 1 to 3 of `docs/PLAN.md` are built, committed and pushed to `origin/main`. Test fixtures were scrubbed of real names before the first commit. The checks were run on 2026-10-25:

- `npm run typecheck`: clean.
- `npm test`: 165 Vitest tests pass across 9 files.
- `npm run test:e2e`: 15 pass and 1 is skipped (drag and drop on mobile, by design). They run against the production build with the CSP active, and they fail on any off-origin request or console error.
- `npm run build`: the main JS chunk is 158 KB (51 KB gzipped) and CSS is 6.6 KB gzipped. jsPDF, autotable and the Excel reader/writer load only on demand.

The real ECAC depth exports (`../pnwapnea/temp/data/form_responses/*.csv`) were run through the reducer pipeline, with counts printed and no names. Every file gives 18/18 starts and no errors **once the `Dicipline` column is mapped by hand**. Without that, the Columns step shows the "no column mapped to Start 1 – discipline" banner, as agreed.

## Decisions to keep

These are recorded in PLAN.md → Decisions. Don't re-ask them.

- The app is a static SPA on GitHub Pages with no server and no accounts. Data stays in the browser, and the CSP has `connect-src 'none'`.
- The code is written against React's API but **runs on Preact** (`preact/compat` aliases in `vite.config.ts`). Validation uses `zod/mini`, because the full zod and React DOM were too heavy.
- pnwapnea's libs are **copied**, not shared.
- Inputs are CSV, paste from Sheets, XLSX, and project JSON. There's no Google API.
- PDF comes from Print / Save as PDF plus a lazy jsPDF download.
- Storage is `sessionStorage` by default, with opt-in "Remember on this device" (`localStorage`) and "Clear all data".
- Header typos are still not guessed. Only the demo sample is fixed, with `anonymize.mjs --fix-typos`.
- The half-time break is added only when the list has no other break.
- Column sort works within the stretches between breaks.

## Changes vs pnwapnea's engine

- `poolDisciplineMode` + `poolSortBy` were replaced by `groupBy`, `blockOrder`, `genderOrder`, `sortBy` and `sortDir`. The ECAC fixture tests were updated and still reproduce the published sheets.
- New settings: `spacingMode` / `bufferMin` / `roundToMin` (dive time + buffer) and `halftimeBreakMin`.
- New edits: `moveEntryTo` and `sortEntriesBy`. `EngineStart` gained optional `gender` and `order`.

## Next up

1. The repo is https://github.com/christophwong/startlistmaker and is **private** while the user reviews and tests it. CI runs the checks and skips the deploy while it's private (`!github.event.repository.private` in `pages.yml`).
2. To launch: make the repo public, then Pages → Source: GitHub Actions and re-run the workflow. Set the custom domain, verify the domain on the account, set the DNS records (README), and enforce HTTPS.
3. After the first deploy, open https://startlistmaker.online/#demo, check the console is clean, and print a PDF.
4. Ask the organizer to fix `Dicipline` → `Discipline` in the Google Form. If there's a real **pool** export, anonymize it and replace `src/samples/pool.csv`, which is currently from pnwapnea's synthetic fixture.
5. Backlog (PLAN.md): a page per discipline block, a Unicode font for the jsPDF download, undo, and keyboard drag.

## Notes

- `tmp/` (pre-existing, empty) is gitignored, along with `*.xlsx`, so real exports dropped there won't be committed.
- `src/lib/demo.ts` (`draftsToStarts`) is used only by the ported pipeline tests. The app uses `rowsToStarts`.
- Playwright 1.64 needs its own Chromium (`npx playwright install chromium`). CI installs it.
