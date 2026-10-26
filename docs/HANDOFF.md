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

## Review round 1 (2026-10-25, pushed)

The user is testing the local preview before making the repo public (decided: public). Changes from their feedback:
- The app opens light, with a ☾ Dark / ☀ Light header toggle (`src/theme.ts`).
- The Athletes step is a spreadsheet (`src/steps/DataStep.tsx`), and the mobile cards are gone.
- Checks: typecheck clean, 165 unit tests, 17 e2e pass + 1 skipped (a new theme test).

## Review round 2 (2026-10-25, pushed)

- The home page has only the calls to action. The how-to, form fields, templates, saving and privacy text moved to a Help dialog (`src/components/help.tsx`), opened from the header on every step.
- The two demo buttons became one highlighted "▶ Try a demo" banner, which opens a picker for Depth/Pool and 1 or 2 days/starts (`src/components/demo-picker.tsx`, `loadSample(kind, starts)`). Help and the picker share `src/components/modal.tsx`.
- Checks: typecheck clean, 167 unit tests, 21 e2e pass + 1 skipped.

## Launch (2026-10-26)

- Before going public, the history was rewritten so every commit uses `christophwong@users.noreply.github.com` (it had used the user's Gmail). The trees are unchanged, and the rewrite was force-pushed while the repo was still private. The hashes before that point (for example aa7845c) no longer exist.
- The repo https://github.com/christophwong/startlistmaker is **public**, with Pages on and GitHub Actions as the source.
- **Live at https://ctophw.xyz/startlistmaker/**. The user's account site owns the `ctophw.xyz` domain, so the project URL is a sub-path, and `vite.config.ts` uses `base: "./"`. The user said not to bother with DNS for now, so the Pages custom domain is unset. A local smoke test served `dist/` under `/startlistmaker/`, and the demo, PDF and Excel worked with no errors.

## Next up

1. When the user wants the custom domain: verify `startlistmaker.online` on the account, replace Namecheap's parking records with the README's DNS records, set the Pages custom domain, and enforce HTTPS. No rebuild is needed (relative base).
2. Ask the organizer to fix `Dicipline` → `Discipline` in the Google Form. If there's a real **pool** export, anonymize it and replace `src/samples/pool.csv`, which is currently from pnwapnea's synthetic fixture.
3. Backlog (PLAN.md): a page per discipline block, a Unicode font for the jsPDF download, undo, and keyboard drag.

## Notes

- `tmp/` (pre-existing, empty) is gitignored, along with `*.xlsx`, so real exports dropped there won't be committed.
- `src/lib/demo.ts` (`draftsToStarts`) is used only by the ported pipeline tests. The app uses `rowsToStarts`.
- Playwright 1.64 needs its own Chromium (`npx playwright install chromium`). CI installs it.
