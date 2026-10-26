import {
  formatPerformance,
  isDiscipline,
  isTimedDiscipline,
  normalizeDiscipline,
  parsePerformance,
  type CompetitionType,
} from "./disciplines";
import type { FieldKey, Mapping } from "./import/columns";
import { athleteKey, parseGender, type ParsedRow } from "./import/rows";
import type { EngineStartWithAthlete } from "./startlist/types";
import { formatDuration, parseDuration } from "./time";

/**
 * Editable registrations: the "Data" step's rows. Values are kept as typed
 * text so a bad cell can be shown and fixed; `checkRow` validates them with
 * the same rules as the import (only name, discipline and AP block a start).
 */

export interface RegStart {
  discipline: string;
  ap: string;
  pb: string;
  diveTime: string;
}

export interface RegRow {
  /** Stable id: engine start ids are `${id}-s1` / `${id}-s2`. */
  id: string;
  /** Spreadsheet row it came from, null when added by hand. */
  rowNumber: number | null;
  firstName: string;
  lastName: string;
  gender: string;
  country: string;
  email: string;
  starts: [RegStart, RegStart];
  /** Left out of the start list without deleting it. */
  excluded: boolean;
}

export type CellKey =
  | "name"
  | "gender"
  | `s${1 | 2}.${keyof RegStart}`;

export interface RowCheck {
  errors: Partial<Record<CellKey, string>>;
  warnings: Partial<Record<CellKey, string>>;
  starts: EngineStartWithAthlete[];
}

export const emptyStart = (): RegStart => ({ discipline: "", ap: "", pb: "", diveTime: "" });

export function emptyRow(id: string): RegRow {
  return {
    id,
    rowNumber: null,
    firstName: "",
    lastName: "",
    gender: "",
    country: "",
    email: "",
    starts: [emptyStart(), emptyStart()],
    excluded: false,
  };
}

const NO_START = /^(none|no|n\/?a|-+|no second start|just one|only one|0)$/i;

const isBlank = (s: RegStart) => !s.discipline.trim() || NO_START.test(s.discipline.trim());

export function checkRow(row: RegRow, type: CompetitionType, maxStarts: 1 | 2, order = 0): RowCheck {
  const errors: RowCheck["errors"] = {};
  const warnings: RowCheck["warnings"] = {};
  const starts: EngineStartWithAthlete[] = [];

  const firstName = row.firstName.trim();
  const lastName = row.lastName.trim();
  if (!firstName && !lastName) errors.name = "Name is missing.";
  const gender = parseGender(row.gender);
  if (!gender) warnings.gender = row.gender.trim() ? `Gender "${row.gender}" isn't M or F.` : "Gender is missing.";

  const other = type === "POOL" ? "depth" : "pool";
  for (const n of [1, 2] as const) {
    if (n > maxStarts) break;
    const s = row.starts[n - 1];
    const k = (f: keyof RegStart) => `s${n}.${f}` as CellKey;
    const p = `Start ${n}`;
    if (isBlank(s)) {
      if (n === 1 && isBlank(row.starts[1])) errors[k("discipline")] = `${p}: discipline is missing.`;
      if (s.ap.trim()) warnings[k("ap")] = `${p}: AP given without a discipline. The AP is ignored.`;
      continue;
    }
    const discipline = normalizeDiscipline(s.discipline, type);
    if (!discipline) {
      errors[k("discipline")] = `${p}: unknown discipline "${s.discipline}".`;
      continue;
    }
    if (!isDiscipline(discipline, type)) {
      errors[k("discipline")] = `${p}: ${discipline} is a ${other} discipline.`;
      continue;
    }
    const unit = isTimedDiscipline(discipline) ? "a time (m:ss)" : "in meters";
    const ap = parsePerformance(discipline, s.ap);
    if (ap === null) errors[k("ap")] = s.ap.trim() ? `${p}: AP isn't ${unit}.` : `${p}: AP is missing.`;
    const pb = parsePerformance(discipline, s.pb);
    if (s.pb.trim() && pb === null) warnings[k("pb")] = `${p}: PB isn't ${unit}. It's ignored.`;
    let diveTimeSec = parseDuration(s.diveTime);
    if (diveTimeSec === null && isTimedDiscipline(discipline) && ap !== null) diveTimeSec = ap;
    if (diveTimeSec === null) {
      warnings[k("diveTime")] = s.diveTime.trim() ? `${p}: dive time isn't m:ss. It's ignored.` : `${p}: dive time is missing.`;
    }
    if (ap === null || errors.name) continue;
    starts.push({
      id: `${row.id}-s${n}`,
      athleteId: row.id,
      startNumber: n,
      discipline,
      ap,
      pb,
      diveTimeSec,
      firstName,
      lastName,
      gender,
      country: row.country.trim(),
      order,
    });
  }
  return { errors, warnings, starts };
}

/**
 * `checkRow` for every row, plus a name warning on included rows that share a
 * name: two athletes, or one athlete twice. Resubmissions were merged at import,
 * so a pair left here is for the organizer to decide.
 */
export function checkRows(rows: RegRow[], type: CompetitionType, maxStarts: 1 | 2): Map<string, RowCheck> {
  const checks = new Map(rows.map((r, i) => [r.id, checkRow(r, type, maxStarts, i)]));
  const byName = new Map<string, RegRow[]>();
  for (const r of rows) {
    const key = athleteKey(r);
    if (r.excluded || !key) continue;
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  for (const same of byName.values()) {
    for (const r of same) {
      const others = same.filter((o) => o !== r).map((o) => (o.rowNumber ? `row ${o.rowNumber}` : "an added athlete"));
      if (!others.length) continue;
      checks.get(r.id)!.warnings.name ??=
        `Possible duplicate of ${others.join(", ")} (same name). If it's the same athlete, delete one or untick "On list".`;
    }
  }
  return checks;
}

/** Engine starts of every included row, in registration order. */
export function rowsToStarts(rows: RegRow[], type: CompetitionType, maxStarts: 1 | 2): EngineStartWithAthlete[] {
  return rows.flatMap((r, i) => (r.excluded ? [] : checkRow(r, type, maxStarts, i).starts));
}

/**
 * Builds editable rows from the import: parsed rows as their normalized
 * values, rows with errors as the raw cells so they can be fixed.
 * Superseded and "no entry for this day" rows are left out.
 */
export function rowsFromImport(
  parsed: ParsedRow[],
  table: string[][],
  mapping: Mapping,
  maxStarts: 1 | 2,
): RegRow[] {
  const out: RegRow[] = [];
  for (const p of parsed) {
    const id = `r${p.rowNumber}`;
    if (p.draft) {
      const d = p.draft;
      const starts: [RegStart, RegStart] = [emptyStart(), emptyStart()];
      for (const s of d.starts) {
        starts[s.startNumber - 1] = {
          discipline: s.discipline,
          ap: formatPerformance(s.discipline, s.ap, { unit: false }),
          pb: formatPerformance(s.discipline, s.pb, { unit: false }),
          diveTime: formatDuration(s.diveTimeSec),
        };
      }
      out.push({
        id,
        rowNumber: p.rowNumber,
        firstName: d.firstName,
        lastName: d.lastName,
        gender: d.gender ?? "",
        country: d.country,
        email: d.email,
        starts,
        excluded: false,
      });
    } else if (p.errors.length) {
      out.push(rawRow(id, p.rowNumber, table[p.rowNumber - 2] ?? [], mapping, maxStarts));
    }
  }
  return out;
}

function rawRow(id: string, rowNumber: number, cells: string[], mapping: Mapping, maxStarts: 1 | 2): RegRow {
  const get = (k: FieldKey) => {
    const i = mapping[k];
    return i === undefined ? "" : String(cells[i] ?? "").trim();
  };
  let firstName = get("firstName");
  let lastName = get("lastName");
  const full = get("fullName");
  if ((!firstName || !lastName) && full) {
    const parts = full.split(/\s+/);
    lastName ||= parts.length > 1 ? parts.pop()! : "";
    firstName ||= parts.join(" ");
  }
  const start = (n: 1 | 2): RegStart =>
    n > maxStarts
      ? emptyStart()
      : {
          discipline: get(`s${n}Discipline`),
          ap: get(`s${n}Ap`),
          pb: get(`s${n}Pb`),
          diveTime: get(`s${n}DiveTime`),
        };
  const g = parseGender(get("gender"));
  return {
    id,
    rowNumber,
    firstName,
    lastName,
    gender: g ?? get("gender"),
    country: get("country"),
    email: get("email"),
    starts: [start(1), start(2)],
    excluded: false,
  };
}
