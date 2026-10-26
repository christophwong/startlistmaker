/**
 * Maps spreadsheet headers (e.g. a Google Forms export) to registration
 * fields by fuzzy matching. See docs/DESIGN.md §5 for the assumed form.
 */

export const FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "fullName", label: "Full name (if no first/last)" },
  { key: "gender", label: "Gender" },
  { key: "country", label: "Country" },
  { key: "email", label: "Email" },
  { key: "emergencyName", label: "Emergency contact name" },
  { key: "emergencyPhone", label: "Emergency contact phone" },
  { key: "s1Discipline", label: "Start 1 – discipline" },
  { key: "s1Ap", label: "Start 1 – AP" },
  { key: "s1Pb", label: "Start 1 – PB" },
  { key: "s1DiveTime", label: "Start 1 – dive time" },
  { key: "s2Discipline", label: "Start 2 – discipline" },
  { key: "s2Ap", label: "Start 2 – AP" },
  { key: "s2Pb", label: "Start 2 – PB" },
  { key: "s2DiveTime", label: "Start 2 – dive time" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
/** Field → column index */
export type Mapping = Partial<Record<FieldKey, number>>;

export const FIELD_KEYS: FieldKey[] = FIELDS.map((f) => f.key);

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();

/** "Start 2", "Day 2", "Second dive" → 2. Also used for the day picker. */
export function startNumberOf(header: string): 1 | 2 | null {
  const h = norm(header);
  if (/\b(start|dive|attempt|discipline|day)\s*(no|number|#)?\s*(2|two)\b|\b(2nd|second)\b/.test(h)) return 2;
  if (/\b(start|dive|attempt|discipline|day)\s*(no|number|#)?\s*(1|one)\b|\b(1st|first)\s+(start|dive|attempt|discipline|day)\b/.test(h)) return 1;
  return null;
}

type StartField = "Discipline" | "Ap" | "Pb" | "DiveTime";
type PersonField = Exclude<FieldKey, `s${1 | 2}${StartField}`>;

/** The field a header names, with start fields left unnumbered. */
function headerField(h: string): PersonField | StartField | null {
  if (!h || /^timestamp$|\bsubmitted\b/.test(h)) return null;

  if (/\bemergency\b|\bice\b/.test(h)) {
    return !/\bname\b/.test(h) && /\b(phone|number|tel|telephone|mobile|cell)\b/.test(h)
      ? "emergencyPhone"
      : "emergencyName";
  }

  // "Personal Best Date", "Conditions of Personal Best": not the PB itself.
  if (/\b(date|conditions?|location|where|notes?)\b/.test(h)) return null;

  if (/\bpb\b|personal best|\bpersonal record\b/.test(h)) return "Pb";
  if (/\bap\b|\bannounce(d|ment)?\b/.test(h)) return "Ap";
  if (/\bdiscipline\b/.test(h)) return "Discipline";
  if (/\bdive time\b|\bduration\b|\btime\b/.test(h)) return "DiveTime";

  if (/\bfirst name\b|\bfirstname\b|\bgiven name\b/.test(h)) return "firstName";
  if (/\blast name\b|\blastname\b|\bsurname\b|\bfamily name\b/.test(h)) return "lastName";
  if (/\be ?mail\b/.test(h)) return "email";
  if (/\bgender\b|\bsex\b/.test(h)) return "gender";
  if (/\bcountry\b|\bnationality\b|\bnation\b/.test(h)) return "country";
  if (/\bname\b/.test(h) && !/\b(club|team|coach|instructor)\b/.test(h)) return "fullName";
  return null;
}

const isStartField = (f: string): f is StartField =>
  f === "Discipline" || f === "Ap" || f === "Pb" || f === "DiveTime";

/** Classifies one header on its own, or returns null when it isn't a known field. */
export function classifyHeader(header: string): FieldKey | null {
  const field = headerField(norm(header));
  if (!field || !isStartField(field)) return field;
  return `s${startNumberOf(header) ?? 1}${field}`;
}

/**
 * First matching column wins for each field. A header that names a start
 * ("Start 2", "Day 2") opens that start's section, even when its field isn't
 * recognised, and unnumbered start columns after it belong to that section:
 * `Day 2 Discipline, Personal Best, Dive Time` all map to start 2.
 */
export function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  let section: 1 | 2 = 1;
  headers.forEach((header, i) => {
    section = startNumberOf(header) ?? section;
    const field = headerField(norm(header));
    if (!field) return;
    const key: FieldKey = isStartField(field) ? `s${section}${field}` : field;
    if (mapping[key] === undefined) mapping[key] = i;
  });
  // A file with only the second section (e.g. a "Day 2" tab) is one start.
  if (!START_FIELDS.some((f) => mapping[`s1${f}`] !== undefined)) {
    for (const f of START_FIELDS) {
      if (mapping[`s2${f}`] === undefined) continue;
      mapping[`s1${f}`] = mapping[`s2${f}`];
      delete mapping[`s2${f}`];
    }
  }
  if (mapping.firstName !== undefined && mapping.lastName !== undefined) {
    delete mapping.fullName;
  }
  return mapping;
}

/** Fields every row needs; when one has no column, every row fails. */
export function missingRequired(mapping: Mapping): { key: FieldKey; label: string }[] {
  const has = (k: FieldKey) => mapping[k] !== undefined;
  const missing: FieldKey[] = [];
  if (!has("fullName") && !has("firstName") && !has("lastName")) missing.push("fullName");
  if (!has("s1Discipline")) missing.push("s1Discipline");
  if (!has("s1Ap")) missing.push("s1Ap");
  return FIELDS.filter((f) => missing.includes(f.key));
}

const START_FIELDS = ["Discipline", "Ap", "Pb", "DiveTime"] as const;

/** True when any start-2 column is mapped. */
export const hasStart2 = (mapping: Mapping) =>
  START_FIELDS.some((f) => mapping[`s2${f}`] !== undefined);

/**
 * "Day 1" / "Day 2" when the form numbers its sections by day (one start
 * list per day), otherwise null and the starts are two starts on one day.
 */
export function dayLabels(headers: string[]): [string, string] | null {
  return headers.some((h) => /\bday\s*(1|2|one|two)\b/i.test(h)) ? ["Day 1", "Day 2"] : null;
}

/** Keeps one start's columns as start 1, for importing one day of a two-day form. */
export function selectStart(mapping: Mapping, n: 1 | 2): Mapping {
  const out: Mapping = { ...mapping };
  for (const f of START_FIELDS) {
    if (n === 2) {
      if (mapping[`s2${f}`] === undefined) delete out[`s1${f}`];
      else out[`s1${f}`] = mapping[`s2${f}`];
    }
    delete out[`s2${f}`];
  }
  return out;
}

/** Mapping ↔ URL search params (`m.firstName=2`), so the preview is GET-able. */
export function mappingFromParams(params: URLSearchParams, columnCount: number): Mapping | null {
  if (!params.has("mapped")) return null;
  const mapping: Mapping = {};
  for (const key of FIELD_KEYS) {
    const raw = params.get(`m.${key}`);
    if (raw === null || raw === "") continue;
    const i = Number(raw);
    if (Number.isInteger(i) && i >= 0 && i < columnCount) mapping[key] = i;
  }
  return mapping;
}
