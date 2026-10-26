# Start List Maker

**Freediving start lists in minutes, straight from your Google Forms export.**

Start List Maker turns competition registrations into a printable AIDA-style start list, with official tops (OT), warm-up and check-in times, lanes or zones, and breaks. It runs entirely in your browser: there's no account to create, and athlete data never leaves your device. You can confirm this in your browser's developer tools (the app makes no network requests), and your work stays in the current tab unless you turn on **Remember on this device**.

## Features

- **Pool** (STA, DYN, DYNB, DNF) with lanes, or **depth** (CWT, CWTB, CNF, FIM) with zones.
- Reads a Google Forms CSV, an Excel file or pasted cells, and handles two-day forms and resubmissions.
- Fixed or dive-time-based spacing, with sorting and drag-to-reorder. Times recalculate as you go.
- Print or save as PDF, or download CSV or Excel, with logos. Save the project to a file to reopen later.

## How to use it

In Google Forms, open **Responses → ⋮ → Download responses (.csv)**, or copy the cells from the linked Google Sheet. Upload or paste them on the home page, then follow the steps in the app. To see a finished start list with made-up athletes, open **Depth demo** or **Pool demo**.

**Required per start:** name (full, or first + last), discipline, AP.\
**Optional:** gender, country, personal best, announced dive time.

The column titles don't have to match exactly. Example files that also work as form templates are in [`src/samples/`](src/samples/).

## Development

Requires Node 24 or later (see `.nvmrc`). Built with Vite, TypeScript, Tailwind CSS and React.

```sh
npm install
npm run dev          # local dev server
npm run typecheck    # TypeScript
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright; run `npx playwright install chromium` once first)
npm run build        # static site in dist/
```

Bundled samples are anonymized with `scripts/anonymize.mjs`. Never commit real sign-up exports.

## License

[MIT](LICENSE)
