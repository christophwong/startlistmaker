import {
  DEPTH_DISCIPLINES,
  normalizeDiscipline,
  POOL_DISCIPLINES,
  type CompetitionType,
  type Discipline,
} from "../disciplines";
import { hasStart2, type Mapping } from "./columns";

/**
 * How often each discipline appears in the file's discipline columns (every
 * start or day). Values that only make sense with a known type ("no fins")
 * don't count.
 */
export function disciplineCounts(rows: string[][], mapping: Mapping): Partial<Record<Discipline, number>> {
  const counts: Partial<Record<Discipline, number>> = {};
  for (const col of [mapping.s1Discipline, mapping.s2Discipline]) {
    if (col === undefined) continue;
    for (const row of rows) {
      const raw = row[col];
      const d = normalizeDiscipline(raw, "POOL");
      if (!d || d !== normalizeDiscipline(raw, "DEPTH")) continue;
      counts[d] = (counts[d] ?? 0) + 1;
    }
  }
  return counts;
}

const total = (counts: Partial<Record<Discipline, number>>, of: readonly Discipline[]) =>
  of.reduce((n, d) => n + (counts[d] ?? 0), 0);

/** Pool vs depth from the disciplines in every start column; ties go to pool. */
export function detectCompetitionType(rows: string[][], mapping: Mapping): CompetitionType {
  const counts = disciplineCounts(rows, mapping);
  return total(counts, DEPTH_DISCIPLINES) > total(counts, POOL_DISCIPLINES) ? "DEPTH" : "POOL";
}

/** "CWTB 16, FIM 13, CNF 4", most common first. */
export function countsLine(counts: Partial<Record<Discipline, number>>): string {
  return (Object.entries(counts) as [Discipline, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d} ${n}`)
    .join(", ");
}

/** Two starts per athlete when the file has start-2 columns. */
export const detectMaxStarts = (mapping: Mapping): 1 | 2 => (hasStart2(mapping) ? 2 : 1);
