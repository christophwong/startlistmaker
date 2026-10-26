import {
  isDiscipline,
  isTimedDiscipline,
  normalizeDiscipline,
  parsePerformance,
  type CompetitionType,
  type Discipline,
} from "../disciplines";
import { parseDuration } from "../time";
import type { FieldKey, Mapping } from "./columns";

export interface StartDraft {
  startNumber: 1 | 2;
  discipline: Discipline;
  ap: number;
  pb: number | null;
  diveTimeSec: number | null;
}

export interface RegistrationDraft {
  firstName: string;
  lastName: string;
  gender: "M" | "F" | null;
  country: string;
  email: string;
  emergencyName: string;
  emergencyPhone: string;
  starts: StartDraft[];
}

/**
 * Only what the scheduler can't work without is an error (name, discipline,
 * AP); everything else is a warning and the row still imports.
 */
export interface ParsedRow {
  /** 1-based spreadsheet row number (header is row 1) */
  rowNumber: number;
  draft: RegistrationDraft | null;
  errors: string[];
  warnings: string[];
  /** Start 1 left blank: a resubmission that only updates start 2. */
  partial: boolean;
}

export interface ImportContext {
  type: CompetitionType;
  maxStarts: number;
  /**
   * Set when one day/start of a multi-day form is imported ("Day 2"). Rows
   * with nothing in that day's columns are skipped instead of failing.
   */
  selectedLabel?: string;
}

const NO_START = /^(none|no|n\/?a|-+|no second start|just one|only one|0)$/i;

/** The note on a row with nothing in one day's columns ("Day 2"). */
export const noEntry = (label: string) => `No ${label} entry. This row is skipped.`;

export function parseGender(raw: string): "M" | "F" | null {
  const s = raw.trim().toLowerCase();
  if (/^(m|male|man|men|masculin[oe]?)$/.test(s)) return "M";
  if (/^(f|female|woman|women|feminin[oe]?)$/.test(s)) return "F";
  return null;
}

/** "Jane Doe (555) 123-4567" → name + phone when both share one column. */
function splitContact(raw: string): { name: string; phone: string } {
  const m = raw.match(/(\+?\(?\d[\d\s().-]{6,}\d)/);
  if (!m) return { name: raw.trim(), phone: "" };
  const name = raw.replace(m[1], "").replace(/[,;:/|-]+\s*$|^\s*[,;:/|-]+/g, "").trim();
  return { name, phone: m[1].trim() };
}

const startIsBlank = (n: 1 | 2, get: (k: FieldKey) => string) => {
  const d = get(`s${n}Discipline`);
  return !d || NO_START.test(d);
};

/** Returns null for a blank start without reporting it; the caller decides. */
function parseStart(
  n: 1 | 2,
  get: (k: FieldKey) => string,
  ctx: ImportContext,
  errors: string[],
  warnings: string[],
): StartDraft | null {
  // One day imported on its own reads that day's columns as start 1, so name the day.
  const p = ctx.selectedLabel ?? `Start ${n}`;
  const rawDiscipline = get(`s${n}Discipline`);
  const rawAp = get(`s${n}Ap`);
  const rawPb = get(`s${n}Pb`);
  const rawTime = get(`s${n}DiveTime`);

  if (startIsBlank(n, get)) {
    if (n === 2 && rawAp) warnings.push(`${p}: AP given without a discipline. The AP is ignored.`);
    return null;
  }

  const other: CompetitionType = ctx.type === "POOL" ? "DEPTH" : "POOL";
  const discipline = normalizeDiscipline(rawDiscipline, ctx.type);
  if (!discipline) {
    errors.push(`${p}: unknown discipline "${rawDiscipline}".`);
    return null;
  }
  if (!isDiscipline(discipline, ctx.type)) {
    errors.push(
      `${p}: ${discipline} is a ${other.toLowerCase()} discipline, not allowed in a ${ctx.type.toLowerCase()} competition.`,
    );
    return null;
  }

  const unit = isTimedDiscipline(discipline) ? "a time (m:ss)" : "in meters";
  const ap = parsePerformance(discipline, rawAp);
  if (ap === null) {
    errors.push(
      rawAp ? `${p}: AP "${rawAp}" isn't ${unit}.` : `${p}: AP is missing.`,
    );
  }
  const pb = parsePerformance(discipline, rawPb);
  if (rawPb && pb === null) warnings.push(`${p}: PB "${rawPb}" isn't ${unit}. It's ignored.`);

  let diveTimeSec = parseDuration(rawTime);
  if (diveTimeSec === null && isTimedDiscipline(discipline) && ap !== null) {
    diveTimeSec = ap; // a static's dive time is its AP
  }
  if (diveTimeSec === null) {
    warnings.push(
      rawTime ? `${p}: dive time "${rawTime}" isn't m:ss. It's ignored.` : `${p}: dive time is missing.`,
    );
  }

  if (ap === null) return null;
  return { startNumber: n, discipline, ap, pb, diveTimeSec };
}

/** "MEIRONG (MAY) TAN" → "Meirong (May) Tan"; mixed case is kept as typed. */
function fixAllCaps(name: string): string {
  if (!/\p{Lu}.*\p{Lu}/u.test(name) || name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s(\-'])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
}

export function parseRow(
  row: string[],
  rowNumber: number,
  mapping: Mapping,
  ctx: ImportContext,
): ParsedRow {
  const get = (k: FieldKey) => {
    const i = mapping[k];
    return i === undefined ? "" : String(row[i] ?? "").trim();
  };
  const errors: string[] = [];
  const warnings: string[] = [];

  const s1Blank = startIsBlank(1, get);
  if (ctx.selectedLabel && s1Blank && !get("s1Ap") && !get("s1DiveTime")) {
    return { rowNumber, draft: null, errors, warnings: [noEntry(ctx.selectedLabel)], partial: false };
  }

  let firstName = fixAllCaps(get("firstName"));
  let lastName = fixAllCaps(get("lastName"));
  const fullName = fixAllCaps(get("fullName"));
  if ((!firstName || !lastName) && fullName) {
    const parts = fullName.split(/\s+/);
    lastName ||= parts.length > 1 ? parts.pop()! : "";
    firstName ||= parts.join(" ");
  }
  if (!firstName && !lastName) errors.push("Name is missing.");
  else if (!lastName) warnings.push("Last name is missing.");

  const rawGender = get("gender");
  const gender = parseGender(rawGender);
  if (!gender) {
    warnings.push(rawGender ? `Gender "${rawGender}" isn't male or female. It's left blank.` : "Gender is missing.");
  }

  let emergencyName = get("emergencyName");
  let emergencyPhone = get("emergencyPhone");
  if (emergencyName && !emergencyPhone) {
    ({ name: emergencyName, phone: emergencyPhone } = splitContact(emergencyName));
  }
  if (!emergencyName && !emergencyPhone) warnings.push("No emergency contact.");

  const starts: StartDraft[] = [];
  const s1 = parseStart(1, get, ctx, errors, warnings);
  if (s1) starts.push(s1);
  const s2 = parseStart(2, get, ctx, errors, warnings);
  if (s2) {
    if (ctx.maxStarts < 2) warnings.push("Start 2 is ignored: this competition has one start per athlete.");
    else starts.push(s2);
  }

  const partial = s1Blank && !!s2 && ctx.maxStarts >= 2;
  if (s1Blank && !partial) errors.push(`${ctx.selectedLabel ?? "Start 1"}: discipline is missing.`);

  const draft: RegistrationDraft | null = errors.length
    ? null
    : {
        firstName,
        lastName,
        gender,
        country: get("country"),
        email: get("email"),
        emergencyName,
        emergencyPhone,
        starts,
      };
  return { rowNumber, draft, errors, warnings, partial };
}

type Identity = { firstName: string; lastName: string; email?: string };

export const athleteKey = (d: Identity) =>
  `${d.firstName} ${d.lastName}`.toLowerCase().replace(/\s+/g, " ").trim();

/** Name words without nicknames in parentheses: "Meirong (May) Tan" → [meirong, tan]. */
const nameWords = (d: Identity) =>
  `${d.firstName} ${d.lastName}`
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

const emailOf = (d: Identity) => d.email?.trim().toLowerCase() ?? "";

/**
 * Same name (case-insensitive) unless both rows give different emails (two
 * athletes who share a name), or the same email with a compatible name:
 * `Teodorvaskel` / `Teodor vaskel`, `Brannick` / `Rolf Brannick`. The name check keeps
 * two siblings registered with a parent's email apart.
 */
export function sameAthlete(a: Identity, b: Identity): boolean {
  const email = emailOf(a);
  if (athleteKey(a) === athleteKey(b)) return !email || !emailOf(b) || email === emailOf(b);
  if (!email || email !== emailOf(b)) return false;
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  if (x.join("") === y.join("")) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

/** A start-2-only resubmission: its starts replace those numbers, other fields fill in. */
function mergeDrafts(prev: RegistrationDraft, next: RegistrationDraft): RegistrationDraft {
  const replaced = new Set(next.starts.map((s) => s.startNumber));
  return {
    firstName: next.firstName,
    lastName: next.lastName,
    gender: next.gender ?? prev.gender,
    country: next.country || prev.country,
    email: next.email || prev.email,
    emergencyName: next.emergencyName || prev.emergencyName,
    emergencyPhone: next.emergencyPhone || prev.emergencyPhone,
    starts: [...prev.starts.filter((s) => !replaced.has(s.startNumber)), ...next.starts].sort(
      (a, b) => a.startNumber - b.startNumber,
    ),
  };
}

/**
 * Parses all data rows. Blank rows are skipped. When an athlete appears
 * twice, a later full row replaces the earlier one (a resubmitted form), and
 * a later row with only start 2 updates just that start. Rows with the same
 * name but different emails are both kept and flagged as possible duplicates.
 */
export function parseRows(rows: string[][], mapping: Mapping, ctx: ImportContext): ParsedRow[] {
  const parsed = rows
    .map((row, i) => ({ row, rowNumber: i + 2 }))
    .filter(({ row }) => row.some((c) => String(c ?? "").trim()))
    .map(({ row, rowNumber }) => parseRow(row, rowNumber, mapping, ctx));

  /** Index of the row currently holding each athlete's draft. */
  const holders: number[] = [];
  const replacedBy = new Map<number, { by: number; merged: boolean }>();
  parsed.forEach((p, i) => {
    if (!p.draft) return;
    const h = holders.findIndex((j) => sameAthlete(parsed[j].draft!, p.draft!));
    if (h === -1) {
      holders.push(i);
      return;
    }
    const prev = parsed[holders[h]];
    if (p.partial) p.draft = mergeDrafts(prev.draft!, p.draft);
    prev.draft = null;
    replacedBy.set(holders[h], { by: i, merged: p.partial });
    holders[h] = i;
  });
  for (const [i, { merged }] of replacedBy) {
    let last = replacedBy.get(i)!.by;
    while (replacedBy.has(last)) last = replacedBy.get(last)!.by;
    const row = parsed[last].rowNumber;
    parsed[i].warnings.push(
      merged ? `Merged into row ${row} (same athlete).` : `Replaced by row ${row} (same athlete).`,
    );
  }
  for (const i of holders) {
    const p = parsed[i];
    if (p.partial && !p.draft!.starts.some((s) => s.startNumber === 1)) {
      p.warnings.push("Start 1 is empty, so this athlete has only start 2.");
    }
    const twins = holders.filter((j) => j !== i && athleteKey(parsed[j].draft!) === athleteKey(p.draft!));
    if (twins.length) {
      const rows = twins.map((j) => parsed[j].rowNumber).join(", ");
      p.warnings.push(`Possible duplicate of row ${rows}: same name, different email. Both are kept.`);
    }
  }
  return parsed;
}

/**
 * Warnings that every imported athlete has, such as "No emergency contact."
 * when the form has no such question. They're shown once, not on every row,
 * so the row-specific ones stand out.
 */
export function commonWarnings(parsed: ParsedRow[]): string[] {
  const ready = parsed.filter((p) => p.draft);
  if (ready.length < 2) return [];
  return ready[0].warnings.filter((w) => ready.every((p) => p.warnings.includes(w)));
}
