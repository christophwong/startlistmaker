import {
  formatPerformance,
  isDiscipline,
  isTimedDiscipline,
  normalizeDiscipline,
  parsePerformance,
  type CompetitionType,
} from "./disciplines";
import type { FieldKey, Mapping } from "./import/columns";
import { athleteKey, parseGender, sameAthlete, type ParsedRow } from "./import/rows";
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
  /** Two-day form: left off one day's list ("On list" on that day's tab). */
  dayOff?: [boolean, boolean];
  /** One-day form: one start left off the list, the athlete's other start stays ("Remove this start"). */
  startOff?: [boolean, boolean];
}

/** Which day of a two-day form a check or list is for; starts[0] is Day 1, starts[1] Day 2. */
export type Day = 1 | 2;

export type CellKey =
  | "name"
  | "gender"
  | `s${1 | 2}.${keyof RegStart}`;

export interface RowCheck {
  errors: Partial<Record<CellKey, string>>;
  warnings: Partial<Record<CellKey, string>>;
  starts: EngineStartWithAthlete[];
  /** Checked for one day and nothing is entered for it: not diving that day, not an error. */
  notEntered?: boolean;
  /** Starts taken off the list on their own (one-day forms); not checked. */
  off?: (1 | 2)[];
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

/**
 * With `day`, only that day's start is checked (a two-day form) and a blank
 * day means the athlete isn't diving it.
 */
export function checkRow(row: RegRow, type: CompetitionType, maxStarts: 1 | 2, order = 0, day?: Day): RowCheck {
  const errors: RowCheck["errors"] = {};
  const warnings: RowCheck["warnings"] = {};
  const starts: EngineStartWithAthlete[] = [];
  const notEntered = day !== undefined && isBlank(row.starts[day - 1]) && !row.starts[day - 1].ap.trim();
  // Not diving this day: the athlete fields are checked on the day they dive.
  if (notEntered) return { errors, warnings, starts, notEntered };

  const firstName = row.firstName.trim();
  const lastName = row.lastName.trim();
  if (!firstName && !lastName) errors.name = "Name is missing.";
  const gender = parseGender(row.gender);
  if (!gender) warnings.gender = row.gender.trim() ? `Gender "${row.gender}" isn't M, F or X.` : "Gender is missing.";

  const other = type === "POOL" ? "depth" : "pool";
  const off: (1 | 2)[] = [];
  for (const n of day ? [day] : ([1, 2] as const)) {
    if (!day && n > maxStarts) break;
    // A two-day form takes a day off with dayOff (onList) instead.
    if (!day && row.startOff?.[n - 1]) {
      off.push(n);
      continue;
    }
    const s = row.starts[n - 1];
    const k = (f: keyof RegStart) => `s${n}.${f}` as CellKey;
    const p = day ? `Day ${n}` : `Start ${n}`;
    if (isBlank(s)) {
      if (!day && n === 1 && isBlank(row.starts[1]) && !row.startOff?.[1]) errors[k("discipline")] = `${p}: discipline is missing.`;
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
      // One day of a two-day form is a first start, not a second round, whichever slot it's in.
      startNumber: day ? 1 : n,
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
  return { errors, warnings, starts, ...(off.length > 0 && { off }) };
}

/** On that day's list: not unticked as a whole (one-day files) or for that day. */
export const onList = (row: RegRow, day?: Day) => !row.excluded && !(day && row.dayOff?.[day - 1]);

/**
 * "Remove this start": start `n` leaves the list and the athlete's other
 * start stays. On a two-day form that's the day (dayOff). When no start is
 * left, it's the same as unticking On list, so ticking it brings them back.
 */
export function removeStart(row: RegRow, n: 1 | 2, type: CompetitionType, maxStarts: 1 | 2, day?: Day): RegRow {
  if (day) {
    const dayOff: [boolean, boolean] = [...(row.dayOff ?? [false, false])];
    dayOff[day - 1] = true;
    return { ...row, dayOff };
  }
  const startOff: [boolean, boolean] = [...(row.startOff ?? [false, false])];
  startOff[n - 1] = true;
  const next = { ...row, startOff };
  return checkRow(next, type, maxStarts).starts.length ? next : { ...row, excluded: true, startOff: undefined };
}

/**
 * `checkRow` for every row, plus a name warning on included rows that share a
 * name: two athletes, or one athlete twice. Resubmissions were merged at import,
 * so a pair left here is for the organizer to decide.
 */
export function checkRows(rows: RegRow[], type: CompetitionType, maxStarts: 1 | 2, day?: Day): Map<string, RowCheck> {
  const checks = new Map(rows.map((r, i) => [r.id, checkRow(r, type, maxStarts, i, day)]));
  const byName = new Map<string, RegRow[]>();
  for (const r of rows) {
    const key = athleteKey(r);
    if (!onList(r, day) || checks.get(r.id)!.notEntered || !key) continue;
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  for (const same of byName.values()) {
    for (const r of same) {
      const others = same.filter((o) => o !== r).map((o) => (o.rowNumber ? `row ${o.rowNumber}` : "an added athlete"));
      if (!others.length) continue;
      checks.get(r.id)!.warnings.name ??=
        `Possible duplicate of ${others.join(", ")} (same name). If it's the same athlete, delete one or uncheck "On list".`;
    }
  }
  return checks;
}

/** Engine starts of every included row, in registration order (one day's, with `day`). */
export function rowsToStarts(rows: RegRow[], type: CompetitionType, maxStarts: 1 | 2, day?: Day): EngineStartWithAthlete[] {
  return rows.flatMap((r, i) => (onList(r, day) ? checkRow(r, type, maxStarts, i, day).starts : []));
}

const entered = (r: RegRow) => r.starts.map((s) => !isBlank(s) || !!s.ap.trim());

/**
 * One row per athlete from the two days of a form, each imported on its own
 * (`parsed[d]` read with day d's columns as start 1). Day 1 goes in starts[0]
 * and Day 2 in starts[1]. Athlete fields come from a clean read when there is
 * one. An athlete who sent one form per day (Day 1 only, then Day 2 only) is
 * merged into the later row, as resubmissions are.
 */
export function rowsFromDays(parsed: [ParsedRow[], ParsedRow[]], table: string[][], mappings: [Mapping, Mapping]): RegRow[] {
  const byRow = new Map<number, { row: RegRow; clean: boolean }>();
  ([0, 1] as const).forEach((d) => {
    const clean = new Set(parsed[d].filter((p) => p.draft).map((p) => p.rowNumber));
    for (const r of rowsFromImport(parsed[d], table, mappings[d], 1)) {
      const prev = byRow.get(r.rowNumber!);
      const starts: [RegStart, RegStart] = d === 0 ? [r.starts[0], emptyStart()] : [emptyStart(), r.starts[0]];
      if (!prev) byRow.set(r.rowNumber!, { row: { ...r, starts }, clean: clean.has(r.rowNumber!) });
      else {
        prev.row.starts[d] = r.starts[0];
        if (!prev.clean && clean.has(r.rowNumber!)) prev.row = { ...r, starts: prev.row.starts };
      }
    }
  });
  const rows = [...byRow.values()].map((x) => x.row).sort((a, b) => a.rowNumber! - b.rowNumber!);
  return rows.filter((r, i) => {
    const [d1, d2] = entered(r);
    if (d1 === d2) return true;
    const later = rows.slice(i + 1).find((q) => {
      const [q1, q2] = entered(q);
      return q1 === d2 && q2 === d1 && sameAthlete(q, r);
    });
    if (!later) return true;
    later.starts[d1 ? 0 : 1] = r.starts[d1 ? 0 : 1];
    return false;
  });
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
