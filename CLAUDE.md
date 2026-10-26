# CLAUDE.md

Start List Maker (startlistmaker.online) is a static, client-only single-page app that builds AIDA freediving start lists from Google Form responses. It's a light fork of `../pnwapnea` (accounts, SQLite, SSR): it has no server and no accounts, and athlete data never leaves the browser. Product decisions and TODOs are in `docs/PLAN.md`, the design is in `docs/DESIGN.md`, and resume notes are in `docs/HANDOFF.md`. Read them before changing behavior.

## Commands

Requires Node ≥ 22.

```sh
npm run dev          # http://localhost:5173 (no CSP in dev, so HMR styles work)
npm run typecheck    # tsc (src + tests + configs)
npm test             # Vitest unit tests
npx vitest run src/lib/startlist/startlist.test.ts   # one file
npm run test:e2e     # Playwright on the production build (vite preview :4173), desktop + mobile
npm run build        # → dist/, what GitHub Pages serves
node scripts/anonymize.mjs <real.csv> <out.csv> [seed] [--fix-typos]   # make a shareable sample
node scripts/record-demo.mjs [out-dir] [--mobile]   # video of the main flow → tmp/demo-video/ (builds, serves :4174)
```

There is no linter. Done means `npm run typecheck && npm test` pass, plus `npm run test:e2e` when UI, the build, or the CSP changes.

## Architecture

The stack is Vite, TypeScript, Tailwind v4 and **Preact via `preact/compat`**. Code is written and type-checked against React's API (`@types/react`), and `vite.config.ts` aliases `react`/`react-dom` to Preact. Don't add React-only libraries. `~/` maps to `src/`.

- **`src/lib/`** holds pure domain logic, mostly copied from pnwapnea. `startlist/` is the engine (sort, generate, schedule, validate, edits) and `import/` covers CSV/XLSX/paste → mapped columns → parsed rows. `registrations.ts` has the editable athlete rows and per-cell validation. `export/` builds the shared table for print, CSV, XLSX and PDF.
- **`src/state/`**: `store.ts` holds one reducer with all app state, `persist.ts` covers session/local storage and project files (zod/mini validated), and `derived.ts` has the `useStartList` hook.
- **`src/steps/`** has one component per step (Input → Columns → Athletes → Start list → Finalize). **`src/components/`** holds the shared UI copied from pnwapnea (callback-driven).
- **`src/samples/`** holds the anonymized demo CSVs, bundled as `?raw` and loaded on demand.

Key points that span files:

- **The engine is two-phase (same as pnwapnea).** `generateEntries()` produces order and breaks, and `schedule()` computes every time. State stores only `entries` (order + breaks). Times are never stored, so edits can't leave stale OTs.
- **Registrations are the source of truth for athletes.** Starts are derived with `rowsToStarts`, and start ids are `${rowId}-s{1|2}`, so fixing data keeps a start's place in the list.
- **Settings shape.** `StartListSettings` lives in `lib/startlist/types.ts`. Adding a setting touches the type, `defaults.ts`, `settingsSchema` (`lib/validation.ts`), the stored-state schema in `state/persist.ts`, the settings form, and the engine.
- **Privacy/security is a feature.** A CSP meta tag is injected at build time (`vite.config.ts`, `connect-src 'none'`). Nothing may fetch at runtime: no CDNs, web fonts, analytics, or `fetch` of samples. Don't use `dangerouslySetInnerHTML`. Anything read from storage or a project file goes through `parseState`. Exported cells go through `safeCell` (formula injection). The e2e suite fails on any off-origin request or console error.
- **Heavy libraries are lazy.** `jspdf`/`jspdf-autotable`, `write-excel-file` and `read-excel-file` are dynamically imported. Keep them out of the main chunk (about 51 KB gzipped).
- **Real form exports never go in the repo.** They live in `../pnwapnea/temp/data/`. Samples are made with `scripts/anonymize.mjs`, which refuses to write if a source name or email survives.

## Tests

- `src/**/*.test.ts` are unit tests. `tests/fixtures/ecac.ts` reproduces the real ECAC start sheets, and engine changes must keep those passing.
- `tests/unit/anonymize.test.ts` runs the anonymizer script.
- `tests/e2e/app.spec.ts` covers the CSP, demo, upload → fix → generate, sort, drag and drop, paste, exports, logos, project save/open, and storage clearing. Test images are drawn on a canvas in the page, so there are no binary fixtures.
