import {
  DEPTH_DISCIPLINES,
  normalizeDiscipline,
  POOL_DISCIPLINES,
  type CompetitionType,
} from "../disciplines";
import { hasStart2, type Mapping } from "./columns";

/**
 * Guesses pool vs depth from the start-1 disciplines. Values that only make
 * sense with a known type ("no fins") don't count; ties go to pool.
 */
export function detectCompetitionType(rows: string[][], mapping: Mapping): CompetitionType {
  const col = mapping.s1Discipline;
  if (col === undefined) return "POOL";
  let pool = 0;
  let depth = 0;
  for (const row of rows) {
    const raw = row[col];
    const asPool = normalizeDiscipline(raw, "POOL");
    if (asPool !== normalizeDiscipline(raw, "DEPTH")) continue;
    if ((POOL_DISCIPLINES as readonly string[]).includes(asPool ?? "")) pool++;
    else if ((DEPTH_DISCIPLINES as readonly string[]).includes(asPool ?? "")) depth++;
  }
  return depth > pool ? "DEPTH" : "POOL";
}

/** Two starts per athlete when the file has start-2 columns. */
export const detectMaxStarts = (mapping: Mapping): 1 | 2 => (hasStart2(mapping) ? 2 : 1);
