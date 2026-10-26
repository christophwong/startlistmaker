# Start List Maker

**Freediving start lists in minutes, straight from your Google Forms export.**

Start List Maker turns competition registrations into a printable AIDA-style start list, with official tops (OT), warm-up and check-in times, lanes or zones, and breaks. It runs entirely in your browser: there's no account to create, and athlete data never leaves your device.

## Features

- **Pool and depth.** STA, DYN, DYNB and DNF with parallel lanes, or CWT, CWTB, CNF and FIM with zones. The competition type is detected from the file.
- **Reads what you already have.** Upload the Google Forms CSV, an Excel workbook, or paste cells straight from Google Sheets. Columns are matched automatically, and you can change the matching. Two-day forms and two starts per athlete are supported, and resubmitted forms are merged.
- **Fix data in place.** A spreadsheet-style athletes table marks problems (a missing AP, the wrong discipline for the competition) and keeps those starts off the list until they're fixed.
- **Flexible scheduling.** Fixed intervals, or each athlete's announced dive time plus a buffer. Group by discipline or mix them, put women or men first, and sort by AP, dive time, name or registration order. Optional half-time break.
- **Hand-tune the order.** Drag rows, use ↑ ↓, or type a position. Add or edit breaks. Click a column title to re-sort. Times recalculate as you go, and recovery-time and same-OT conflicts are flagged.
- **Ready to post.** Print or save as PDF, download a PDF, CSV or Excel file, and add competition, federation and sponsor logos to the sheet.
- **Pick up where you left off.** Save the whole project to a file and reopen it later, or let the browser remember it on your device.

## Privacy

Everything happens on your device. The page has no server, no analytics, no fonts or scripts from other sites, and a Content Security Policy that blocks it from sending data anywhere. You can check this in your browser's developer tools: using the app makes no network requests.

Your work stays in the current tab until you close it, unless you turn on **Remember on this device**. **Clear all data** removes everything immediately.

## How to use it

1. **Get your Google Forms export.** In Google Forms, open **Responses → ⋮ → Download responses (.csv)**. Or select the cells in the linked Google Sheet and copy them.
2. **Upload or paste** them on the home page, then check the column matching.
3. **Fix anything flagged** in the athletes table.
4. **Set the schedule:** first OT, spacing, lanes or zones, breaks and order. Then adjust by hand.
5. **Print & export:** add logos, then print or download.

New to it? Open **Try a demo** on the home page to see a finished start list with made-up athletes.

### What the form needs

One row per athlete, with the form's questions as the header row. Each start needs:

| Required | Optional |
|---|---|
| Name (full, or first + last) | Gender, country |
| Discipline | Personal best |
| Announced performance (AP) | Announced dive time |

The column titles don't have to match exactly. Example files that also work as form templates are in [`src/samples/`](src/samples/), and you can download them from the app.

## Development

Requires Node 22 or later.

```sh
npm install
npm run dev          # local dev server
npm run typecheck    # TypeScript
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests on the production build (Playwright)
npm run build        # static site in dist/
```

Run `npx playwright install chromium` once before the end-to-end tests.

**Stack:** Vite, TypeScript, Tailwind CSS and Preact, through `preact/compat`, so the code is written against React's API. The scheduling engine and the import and export code are pure TypeScript in `src/lib/`, with no browser dependencies, so they're unit-tested on their own. App state is a single reducer in `src/state/`, and each step of the flow is a component in `src/steps/`. The PDF and Excel libraries load only when you use them.

The build is a static site with no backend, so any static host can serve it.

### Sample data

The bundled samples are anonymized. To make one from a real export:

```sh
node scripts/anonymize.mjs path/to/real-responses.csv src/samples/new-sample.csv 11 --fix-typos
```

The script replaces names, emails and contact details, and exits with an error if any original name or email would end up in the output. Never commit real sign-up exports.

## License

[MIT](LICENSE)
