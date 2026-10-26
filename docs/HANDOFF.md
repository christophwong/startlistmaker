# Handoff

Last updated: 2026-10-26 (custom domain live)

## State

**Live at https://startlistmaker.online** (HTTPS enforced; `www`, plain http and the old `ctophw.xyz/startlistmaker/` all redirect there). The public repo is https://github.com/christophwong/startlistmaker. Phases 1 to 3 of `docs/PLAN.md`, two rounds of review feedback, the launch and the custom domain are all done. Every push to `main` runs the checks and then deploys to Pages (`.github/workflows/pages.yml`); the deploy is skipped while the repo is private.

Checks run on 2026-10-26:

- `npm run typecheck`: clean.
- `npm test`: 167 Vitest tests pass.
- `npm run test:e2e`: 21 pass and 1 is skipped (drag and drop on mobile, by design). They run against the production build with the CSP active, and they fail on any off-origin request or console error.
- `npm run build`: the main JS chunk is about 158 KB (52 KB gzipped). jsPDF, autotable and the Excel reader/writer load only on demand.
- **Live smoke test** at desktop and mobile widths: the CSP is present, the home page, demo picker and demo list load, Download PDF works, there are no console errors or failed requests, and every request goes to `ctophw.xyz` only.

The real ECAC depth exports (`../pnwapnea/temp/data/form_responses/*.csv`) were run through the reducer pipeline, with counts printed and no names. Every file gives 18/18 starts and no errors **once the `Dicipline` column is mapped by hand**. Without that, the Columns step shows the "no column mapped to Start 1 – discipline" banner, as agreed.

## Decisions to keep

These are recorded in PLAN.md → Decisions. Don't re-ask them.

- The app is a static SPA on GitHub Pages with no server and no accounts. Data stays in the browser, and the CSP has `connect-src 'none'`.
- The code is written against React's API but **runs on Preact** (`preact/compat` aliases in `vite.config.ts`). Validation uses `zod/mini`, because the full zod and React DOM were too heavy.
- pnwapnea's libs are **copied**, not shared.
- Inputs are CSV, paste from Sheets, XLSX, and project JSON. There's no Google API.
- PDF comes from Print / Save as PDF plus a lazy jsPDF download.
- Storage is `sessionStorage` by default, with opt-in "Remember on this device" (`localStorage`) and "Clear all data". "Clear all data" also removes the saved theme.
- Header typos are still not guessed. Only the demo sample is fixed, with `anonymize.mjs --fix-typos`.
- The half-time break is added only when the list has no other break.
- Column sort works within the stretches between breaks.
- **UI, from the user's review:**
  - The app opens light, whatever the OS setting, with a dark toggle in the header.
  - The Athletes step is a spreadsheet at every width.
  - The home page shows only the calls to action. The guidelines are in a Help dialog.
  - There's one prominent "Try a demo" button, which opens a picker: Depth or Pool, then 1 or 2 days/starts.
- **Hosting, from the user:**
  - The repo is public, and the site is served at `startlistmaker.online` (the user asked for DNS on 2026-10-26).
  - Commits use `christophwong@users.noreply.github.com`, never the user's Gmail.
  - No `Co-Authored-By: Claude` or "Generated with Claude Code" lines in commits or PRs.

## Changes vs pnwapnea's engine

- `poolDisciplineMode` + `poolSortBy` were replaced by `groupBy`, `blockOrder`, `genderOrder`, `sortBy` and `sortDir`. The ECAC fixture tests were updated and still reproduce the published sheets.
- New settings: `spacingMode` / `bufferMin` / `roundToMin` (dive time + buffer) and `halftimeBreakMin`.
- New edits: `moveEntryTo` and `sortEntriesBy`. `EngineStart` gained optional `gender` and `order`.

## Review feedback (2026-10-25)

- **Round 1:**
  - Light by default, with a ☾ Dark / ☀ Light toggle (`src/theme.ts`, Tailwind `@custom-variant dark` on `html.dark`). The theme is saved only once toggled.
  - The Athletes step is a gridded spreadsheet (`src/steps/DataStep.tsx`): borderless cells, pinned row number and first name, tinted error and warning cells with corner markers, and a Notes column. The mobile cards are gone.
- **Round 2:**
  - The home page (`src/steps/StartStep.tsx`) keeps only the headline, a "New here? ▶ Try a demo" banner, the drop zone, and the links for paste, by hand, and how it works.
  - The Help dialog is `src/components/help.tsx`.
  - The demo picker is `src/components/demo-picker.tsx`. The 1-start demos cut the same samples before the second start or day (`src/samples/index.ts`, `START2_FROM`).
  - Both dialogs share `src/components/modal.tsx`, which is a native `<dialog>`.

## Launch (2026-10-26)

- **History rewrite.** Before going public, every commit was rewritten to use the no-reply email (they had used the Gmail), and force-pushed while the repo was still private. The trees are unchanged. The old hashes no longer exist.
- **Pages.** The repo was made public and Pages turned on (build type: workflow), using `gh`, which is now installed and logged in on this machine.
- **The URL is a sub-path.** The user's account site `christophwong.github.io` owns the custom domain `ctophw.xyz`, so this project is served at `ctophw.xyz/startlistmaker/`, and `christophwong.github.io/startlistmaker/` redirects there. `vite.config.ts` uses `base: "./"` (relative asset URLs), and the header logo uses `import.meta.env.BASE_URL`. The same build therefore works at the sub-path and at a domain root.
- **HTTPS** is enforced on both this repo and `christophwong.github.io` (that one was done at the user's request). Plain http now redirects to https.

## Domain and second history rewrite (2026-10-26)

- **The repo had gone private** (Pages unpublished, the project URL 404'd). Before the user made it public again, every commit message was rewritten to drop the `Co-Authored-By: Claude` trailer (`git filter-branch --msg-filter`; trees, authors and dates unchanged) and force-pushed. All 12 old workflow runs and the 3 old Pages deployment records were deleted, since they linked to the old hashes (some from before the first rewrite, with the Gmail). The two Dependabot PRs had already been closed.
- **Custom domain.** `startlistmaker.online` is verified on the account (TXT `_github-pages-challenge-christophwong`, keep it), Namecheap has the README's A/AAAA/`www` CNAME records (parking records removed), and it's set on the repo. The first Let's Encrypt request stalled for 30 minutes; removing and re-setting the custom domain fixed it. The certificate covers the apex and `www` and expires 2027-01-24 (GitHub renews it). `public/CNAME` matches but Actions deploys ignore it.
- **Live smoke test** (desktop and Pixel 7): demo 18/18 scheduled, Download PDF works, CSP present, no console errors, no off-site requests.

## Next up

1. **Form data:**
   - Ask the organizer to fix `Dicipline` → `Discipline` in the Google Form.
   - If there's a real **pool** export, anonymize it and replace `src/samples/pool.csv`, which currently comes from pnwapnea's synthetic fixture.
2. **Try a real form export end to end** and compare against the organizer's sheet (PLAN.md TODO).
3. **Backlog (PLAN.md):** a page per discipline block, a Unicode font for the jsPDF download, undo, and keyboard drag.

## Notes

- `tmp/` (pre-existing, empty) is gitignored, along with `*.xlsx`, so real exports dropped there won't be committed.
- `src/lib/demo.ts` (`draftsToStarts`) is used only by the ported pipeline tests. The app uses `rowsToStarts`.
- Playwright 1.64 needs its own Chromium (`npx playwright install chromium`). CI installs it.
- `npm run test:e2e` starts its own server on port 4173, so stop any `vite preview` that's running there first.
- CI annotation: `ubuntu-latest` is moving to Ubuntu 26 (from 2026-10-19). Nothing has broken yet. Pin `ubuntu-24.04` if a run starts failing on the runner image.
