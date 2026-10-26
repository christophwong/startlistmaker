# QA report

Last run: 2026-10-26, on `feature/sponsor-strip` with the uncommitted home-page change ("What your file needs" + `components/sample-downloads.tsx`). Proposed work coming out of this report is in [PLAN.md](./PLAN.md) → "QA/PM review".

## 1. Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 183 passed (10 files) |
| `npm run test:e2e` | 23 passed, 1 skipped (drag and drop on mobile, by design); production build with CSP, no off-origin requests, no console errors |

## 2. Exploratory pass

Driven with Playwright against the production build (`vite preview`), at 1280×800 and Pixel 7 (412 px), light and dark. Scripts and screenshots were kept out of the repo.

### Screens checked

Home (top and scrolled), demo picker, Columns, Athletes, Start list, Finalize and its preview, at both widths, plus the Start list in dark mode. No console errors on any screen.

### Inputs tried

| Input | Result | OK? |
|---|---|---|
| Empty `.csv` | "The file is empty." | ✅ |
| Header row only | "The file has a header row but no responses." | ✅ |
| Two lines of prose | Goes to Columns with "1 responses", 0 columns matched, and the missing-columns banner | ⚠️ grammar ("1 responses") |
| PNG bytes named `.csv` | "The file has a header row but no responses." | ⚠️ misleading; should say it isn't a spreadsheet |
| `Łukasz Żółć`, `王小明` | Fine on screen, in CSV and in Print | ✅ |
| Same names in **Download PDF** | `Łukasz Żółć` → `A u k a s z { B`; `王小明` → bytes of garbage. No warning | ❌ **bug** (see F2) |
| Name `=HYPERLINK("http://evil")` | CSV cell is `'=HYPERLINK(…)` | ✅ formula escaping |
| Gender `Other` | Amber warning `"Other" is not M / F` | ✅ |
| AP `abc` | Red error `AP "abc" is not meters`; start kept off the list | ✅ |
| STA in a depth file | Red error "STA is a pool discipline" | ✅ |
| Missing name | Red error "Name is missing" | ✅ |
| AP `0` | Accepted with no warning; scheduled | ⚠️ (F5) |
| AP `150` CWTB, 4:30 dive time | Accepted with no warning | ⚠️ minor (F5) |
| Same name, **different email** (`Ana Ruiz`, rows 5 and 9) | Row 5 silently "Superseded by row 9"; it only shows on the Columns step | ⚠️ product question (F3) |
| Very long surname | Wraps in the editor; fine | ✅ |

### Settings and editing

| Action | Result | OK? |
|---|---|---|
| Interval `-3` | Native validation: "Value must be greater than or equal to 1" | ✅ |
| First OT `23:50` | OTs wrap to `0:00`, `0:10`… with no warning | ⚠️ low (F7) |
| Edit an athlete, add a row, generate, then **2. Columns → Continue to athletes** | The edit and the added athlete are gone; no confirmation | ❌ **bug** (see F1) |
| Keyboard Tab from Home | Demo → file input → paste → by hand → how it works → sample downloads → header → stepper | ✅ logical order |

## 3. Findings

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | **High** | Revisiting Columns and pressing **Continue to athletes** rebuilds `registrations` from the file, so every fix, added athlete and "On list" untick is lost without warning. The stepper makes this easy to hit. In the real ECAC Day 2 run the organizer made four fixes and one untick on Athletes, so they would lose all of them | `confirmMapping` in `src/state/store.ts` |
| F2 | **High** | **Download PDF** silently garbles any letter outside Latin-1 (WinAnsi): Polish, Czech, Turkish, Baltic and Vietnamese names as well as non-Latin scripts. The hint on Finalize says "names in non-Latin scripts", which undersells it, and nothing tells the organizer that this list is affected | `lib/export/files.ts` (jsPDF standard fonts), `FinalStep.tsx` hint |
| F3 | Medium | A row with the same name but a **different** email is treated as a resubmission, and the earlier row is dropped. Two different athletes with the same name (parent and child, a common name) would lose one start. The note shows only on Columns, which many users will skip | `sameAthlete` / `parseRows` in `lib/import/rows.ts` (pnwapnea behaviour) |
| F4 | Medium | Warning noise: on the demo, Columns says "**18** rows will import with warnings" (every row: "No emergency contact"), while Athletes says "**1** with warnings". When every row is amber, organizers learn to ignore amber | `ErrorSummary` / `ImportRowList`, `components/import-preview.tsx` |
| F5 | Low | AP `0` is scheduled silently. An implausible AP (e.g. above the discipline's world record) is not flagged | `lib/import/rows.ts`, `lib/registrations.ts` |
| F6 | Low | "1 responses" (plural). A binary file reports "header row but no responses" instead of "not a CSV or Excel file" | `MapStep.tsx`, `lib/import/file.ts` |
| F7 | Low | OTs past midnight wrap to `0:00` with no warning (an unrealistic setting, so this is cheap insurance only) | `lib/startlist/schedule.ts` / `validate.ts` |
| F8 | Low | Mobile chrome: once there is data, the header wraps to three lines with a large gap before Help/Dark, and the stepper takes two lines. About 450 px of a 915 px screen is chrome before the step heading | `App.tsx` header and nav |
| F9 | Low | Wording drift: the button "Upload your Google Forms export" (decided 2026-10-26) sits under the subtitle "Upload your sign-up sheet and get a printable start list", so the same file has two names a few lines apart | `StartStep.tsx` |
| F10 | Info | The Finalize preview on mobile scrolls sideways (OT/WT/Check-in are off-screen). Acceptable, since the sheet is laid out for Letter paper | `print-sheet.tsx` |

## 4. Coverage gaps (tests to add with the fixes)

- e2e: edit an athlete, revisit Columns, continue → the edit survives (or a confirmation appears) (F1).
- Unit: the PDF export flags or handles a name outside WinAnsi (F2).
- Unit: same name with different non-empty emails → both rows kept, with a "possible duplicate" warning (F3, if accepted).
- e2e: a list with a break whose page break lands mid-OT-group (not covered today).
- e2e on mobile: the "move to #" flow on the card layout (desktop covers ↑↓ and drag only).

## 5. Manual regression checklist (before merging to `main`)

1. `#demo`: 18/18 scheduled; Finalize shows the event title; Download PDF opens.
2. Upload `src/samples/depth-2day.csv` → Day 2 → Continue → fix one cell → generate → add a break → drag one row → sort by AP.
3. Finalize: toggle WT / Check-in / Start numbers / page per break; Print preview (Cmd+P) matches the on-screen sheet.
4. Add a header logo and two sponsors; check the PDF on page 1 and the last page.
5. Save project → Clear all data → open the project → the same list, logos and settings.
6. Dark mode on every step; 390 px width on every step.
7. DevTools → Network: no requests after the first load.
