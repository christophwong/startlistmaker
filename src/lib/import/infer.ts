import { isNoStart, normalizeDiscipline } from "../disciplines";
import { startNumberOf, type FieldKey, type Mapping } from "./columns";

/**
 * Columns found by what's in them rather than by their header, for a form
 * whose discipline question has a header we don't recognise ("Dicipline |
 * Day 1"). Only discipline: its values are a short list of codes, so a match
 * is safe. AP and names are too varied to recognise and are asked for.
 */

/** Share of non-empty values that must be discipline codes or names. */
const MIN_SHARE = 0.8;

/** True when most of the column's answers name one discipline ("CWTB", "Free immersion"). */
export function looksLikeDisciplines(rows: string[][], col: number): boolean {
  const values = rows.map((r) => String(r[col] ?? "").trim()).filter((v) => v && !isNoStart(v));
  if (!values.length) return false;
  const known = values.filter((v) => normalizeDiscipline(v, "DEPTH") ?? normalizeDiscipline(v, "POOL"));
  return known.length / values.length >= MIN_SHARE;
}

/**
 * Fills a missing start-1 / start-2 discipline with an unused column whose
 * values are disciplines. A header naming a start or day ("Day 2") picks that
 * start; otherwise columns fill start 1, then start 2, left to right.
 * Returns the new mapping and the fields matched this way.
 */
export function inferColumns(headers: string[], rows: string[][], mapping: Mapping): { mapping: Mapping; inferred: FieldKey[] } {
  const used = new Set(Object.values(mapping));
  const out: Mapping = { ...mapping };
  const inferred: FieldKey[] = [];
  const free = headers.map((h, i) => ({ h, i })).filter(({ i }) => !used.has(i) && looksLikeDisciplines(rows, i));
  // Columns that name their start first, so "Day 2" isn't taken as start 1.
  const numbered = free.filter(({ h }) => startNumberOf(h) !== null);
  const rest = free.filter(({ h }) => startNumberOf(h) === null);
  for (const { h, i } of [...numbered, ...rest]) {
    const n = startNumberOf(h);
    const key: FieldKey | undefined = n
      ? `s${n}Discipline`
      : out.s1Discipline === undefined
        ? "s1Discipline"
        : out.s2Discipline === undefined
          ? "s2Discipline"
          : undefined;
    if (!key || out[key] !== undefined) continue;
    out[key] = i;
    inferred.push(key);
  }
  return { mapping: out, inferred };
}

/**
 * The event's name from the export's file name: "7_5 & 7_6 Announcements_
 * Emerald City Challenge Depth (Responses) - DAY 1.csv" → "Emerald City
 * Challenge Depth". Google's and the form's own words are dropped. Empty
 * when nothing is left.
 */
export function suggestEventName(filename: string): string {
  const name = filename
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    // " - Form Responses 1", " - DAY 1": the sheet's name, added by Sheets.
    .split(/\s+-\s+/)[0]
    .replace(/_/g, " ")
    .replace(/\(responses?\)/gi, " ")
    .replace(/\b(athletes?|announcements?|responses?|sign[\s-]?ups?|registrations?|entry|entries|form)\b/gi, " ")
    // Leading dates and day numbers: "7 5 & 7 6", "11/01", "2026-09-06".
    .replace(/^[\s\d/.&,-]+(?=\D)/, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:·,&-]+|[\s:·,&-]+$/g, "");
  return /[a-z]/i.test(name) ? name : "";
}
