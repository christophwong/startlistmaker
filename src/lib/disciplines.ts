import { formatDuration, parseDuration } from "./time";

export type CompetitionType = "POOL" | "DEPTH";

export const POOL_DISCIPLINES = ["STA", "DYN", "DYNB", "DNF"] as const;
export const DEPTH_DISCIPLINES = ["CWT", "CWTB", "CNF", "FIM"] as const;

export type PoolDiscipline = (typeof POOL_DISCIPLINES)[number];
export type DepthDiscipline = (typeof DEPTH_DISCIPLINES)[number];
export type Discipline = PoolDiscipline | DepthDiscipline;

export const DISCIPLINE_NAMES: Record<Discipline, string> = {
  STA: "Static",
  DYN: "Dynamic",
  DYNB: "Dynamic bi-fins",
  DNF: "Dynamic no-fins",
  CWT: "Constant weight",
  CWTB: "Constant weight bi-fins",
  CNF: "Constant weight no-fins",
  FIM: "Free immersion",
};

/** Default block order for pool dynamic disciplines (ECAC sheets). */
export const POOL_DYNAMIC_ORDER: PoolDiscipline[] = ["DNF", "DYNB", "DYN"];

export function disciplinesFor(type: CompetitionType): readonly Discipline[] {
  return type === "POOL" ? POOL_DISCIPLINES : DEPTH_DISCIPLINES;
}

export function isDiscipline(value: string, type?: CompetitionType): value is Discipline {
  const list: readonly string[] = type
    ? disciplinesFor(type)
    : [...POOL_DISCIPLINES, ...DEPTH_DISCIPLINES];
  return list.includes(value);
}

/** STA performances are durations; everything else is meters. */
export function isTimedDiscipline(d: string): boolean {
  return d === "STA";
}

/**
 * Maps free text such as "Static (STA)", "dynamic bi-fins", "Bifins (DYNB)"
 * or "No fins" to a discipline code. "No fins" is ambiguous between pool
 * and depth, so the competition type decides.
 */
export function normalizeDiscipline(
  raw: string | null | undefined,
  type: CompetitionType,
): Discipline | null {
  if (!raw) return null;
  const s = raw.toUpperCase();

  const code = s.match(/\b(DYNB|DYN-?BI|DNF|DYN|STA|CWTB|CWT-?BI|CWT|CNF|FIM)\b/);
  if (code) {
    const c = code[1].replace("-", "");
    if (c === "DYNBI") return "DYNB";
    if (c === "CWTBI") return "CWTB";
    return c as Discipline;
  }

  const t = s.toLowerCase().replace(/[^a-z]+/g, " ");
  const bifins = /\bbi ?fins?\b|\bbifin/.test(t);
  const nofins = /\bno ?fins?\b|\bnofins?\b|\bwithout fins\b/.test(t);

  if (/\bstatic\b/.test(t)) return "STA";
  if (/\bfree ?immersion\b/.test(t)) return "FIM";
  if (/\bdynamic\b/.test(t)) return nofins ? "DNF" : bifins ? "DYNB" : "DYN";
  if (/\bconstant\b/.test(t)) return nofins ? "CNF" : bifins ? "CWTB" : "CWT";
  if (nofins) return type === "POOL" ? "DNF" : "CNF";
  if (bifins) return type === "POOL" ? "DYNB" : "CWTB";
  if (/\bmono ?fin\b|\bwith fins\b/.test(t)) return type === "POOL" ? "DYN" : "CWT";
  return null;
}

/**
 * Parses an AP/PB value for a discipline: seconds for STA ("4:30"),
 * whole meters otherwise ("75", "75m", "75 meters").
 */
export function parsePerformance(
  discipline: string,
  raw: string | number | null | undefined,
): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  if (isTimedDiscipline(discipline)) return parseDuration(raw);
  const m = String(raw)
    .trim()
    .toLowerCase()
    .replace(",", ".")
    .match(/^(\d+(?:\.\d+)?)\s*(?:m|mt|mts|meters?|metres?)?\.?$/);
  if (!m) return null;
  return Math.round(Number(m[1]));
}

export function formatPerformance(
  discipline: string,
  value: number | null | undefined,
  { unit = true }: { unit?: boolean } = {},
): string {
  if (value === null || value === undefined) return "";
  if (isTimedDiscipline(discipline)) return formatDuration(value);
  return unit ? `${value} m` : String(value);
}
