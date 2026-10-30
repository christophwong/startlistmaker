# CLAUDE.md

Start List Maker (startlistmaker.online) is a static, client-only single-page app that builds AIDA freediving start lists from a Google Forms export. It has no server and no accounts, and start lists and athlete data never leave the browser. Product decisions and TODOs are in `tmp/docs/PLAN.md`, the design is in `tmp/docs/DESIGN.md`, resume notes are in `tmp/docs/HANDOFF.md`, and the QA report is in `tmp/docs/QA.md`. They're local only (`tmp/` is gitignored, because the repo is public). `tmp/docs` is its own local git repo with no remote, so use `git -C tmp/docs` for its history and never add a remote. Read them before changing behavior.

## Commands

Requires Node ≥ 24 (`.nvmrc`; CI reads it too).

```sh
npm run dev          # http://localhost:5173 (no CSP in dev, so HMR styles work)
npm run typecheck    # tsc (src + tests + configs)
npm test             # Vitest unit tests
npx vitest run src/lib/startlist/startlist.test.ts   # one file
npm run test:e2e     # Playwright on the production build (vite preview :4173), desktop + mobile
npx playwright test tests/e2e/app.spec.ts --project=desktop   # one spec, one project
npm run shots        # tests/e2e/visual.spec.ts only: overflow check + screenshots to tmp/shots/{desktop,mobile}/<screen>-<theme>.png
npm run build        # → dist/, what GitHub Pages serves
node scripts/anonymize.mjs <real.csv> <out.csv> [seed] [--fix-typos]   # make a shareable sample
node scripts/record-demo.mjs [out-dir] [--mobile]   # video of the main flow → tmp/demo-video/ (builds, serves :4174)
node scripts/make-icons.mjs   # re-render public/ PNG icons and og.jpg (link preview) after changing favicon.svg
```

There is no linter. Done means following "Verification" in `~/Developer/CLAUDE.md`; also run the full `npm run test:e2e` when the build or the CSP changes.

## Architecture

The stack is Vite, TypeScript, Tailwind v4 and React 19. `~/` maps to `src/`.

- **`src/lib/`** holds pure domain logic. `startlist/` is the engine (sort, generate, schedule, validate, edits) and `import/` covers CSV/XLSX/paste → mapped columns → parsed rows. `registrations.ts` has the editable athlete rows and per-cell validation. `export/` builds the shared table for print, CSV and XLSX. PDFs come only from the browser's Print / Save as PDF (the jsPDF download was dropped because its fonts garbled names outside Latin-1).
- **`src/state/`**: `store.ts` holds one reducer with all app state, `persist.ts` covers session/local storage and project files (zod/mini validated), and `derived.ts` has the `useStartList` hook.
- **`src/steps/`** has the home page (`StartStep`) and one component per workspace tab (Start list, Athletes, Print & export), plus `OfficialsStep.tsx`, the lazy-loaded judge & safety names screen under Print & export. Upload goes straight to a built start list: `lib/import/infer.ts` matches discipline columns by their values, athletes with errors wait in the Not-on-the-list tray, and Columns is a lazy side panel (`components/columns-drawer.tsx`). **`src/components/`** holds the shared UI (callback-driven).
- **Undo.** List-changing actions push a snapshot onto `history` in the reducer (`UNDOABLE` in `store.ts`) and set a `notice` shown by the toast; neither is saved. Use Undo instead of `confirm()` for order changes.
- **`src/app-info.ts`** has the build version (`__APP_VERSION__`, set in `vite.config.ts`) and the contact email. `components/error-boundary.tsx` wraps the app, so an error while drawing shows Save project / Reload / Report instead of a blank page.
- **Every automatic guess needs a manual fallback** (column matching, pool/depth, event name, order): keep it visible and correctable by hand.
- **`src/lib/export/`** also has the sheet presets (`table.ts`: athlete, judge, safety, results) and `crew.ts` (judge and safety names, keyed by OT-group slot so they stay put when divers are reordered).
- **`src/samples/`** holds the anonymized demo CSVs, bundled as `?raw` and loaded on demand.

Key points that span files:

- **The engine is two-phase.** `generateEntries()` produces order and breaks, and `schedule()` computes every time. State stores only `entries` (order + breaks). Times are never stored, so edits can't leave stale OTs.
- **Registrations are the source of truth for athletes.** Starts are derived with `rowsToStarts`, and start ids are `${rowId}-s{1|2}`, so fixing data keeps a start's place in the list.
- **Two-day forms** share one `RegRow` per athlete; each day has its own `DayList` (settings, entries, date, crew). State holds the shown day's list at the top level and the other in `otherDay`.
- **Settings shape.** `StartListSettings` lives in `lib/startlist/types.ts`. Adding a setting touches the type, `defaults.ts`, `settingsSchema` (`lib/validation.ts`), the stored-state schema in `state/persist.ts`, the settings form, and the engine.
- **Privacy/security is a feature.** The promise to users is that start lists and athlete data are never uploaded, stored or shared. Site traffic data (visits, browser type) isn't covered by it, so don't add copy claiming "no analytics" or "no requests". A CSP meta tag is injected at build time (`vite.config.ts`). The one exception to "nothing leaves the page" is the visit counter: GoatCounter's `count.js`, vendored in `public/` and served from our own origin, sends page views (path, title, referrer, screen width) to `STATS_ORIGIN` (`stats.startlistmaker.online`, the `beacon` repo), and the CSP opens `connect-src`/`img-src` to that host only. Never pass app state, file names or athlete data to it. Nothing else may fetch at runtime: no CDNs, web fonts, other analytics, or `fetch` of samples. Don't use `dangerouslySetInnerHTML`. Anything read from storage or a project file goes through `parseState`. Exported cells go through `safeCell` (formula injection). The e2e suite fails on any off-origin request or console error.
- **Heavy libraries are lazy.** `write-excel-file` and `read-excel-file` are dynamically imported. Keep them out of the main chunk, which must stay at or under 270 KB gzipped (most of it React DOM).
- **Real form exports never go in the repo.** They're kept outside the repo (location in `tmp/docs/HANDOFF.md`). Samples are made with `scripts/anonymize.mjs`, which refuses to write if a source name or email survives.

## Tests

- `src/**/*.test.ts` are unit tests. `tests/fixtures/ecac.ts` reproduces the real ECAC start sheets, and engine changes must keep those passing.
- `tests/unit/anonymize.test.ts` runs the anonymizer script.
- `tests/e2e/visual.spec.ts` lists the main screens (both themes). Add a screen there when you add a tab, dialog or major view.
- `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA) on every screen in both themes, desktop and mobile.
- `tests/e2e/app.spec.ts` covers the CSP, demo, upload → fix → generate, sort, drag and drop, paste, exports, logos, project save/open, storage clearing, two-day forms, and the judge, results and safety sheets. Test images are drawn on a canvas in the page, so there are no binary fixtures.
