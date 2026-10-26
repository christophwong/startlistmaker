import { blockRank, byName, generateEntries } from "./generate";
import type { EngineStart, EngineStartWithAthlete, EntryInput, StartListSettings } from "./types";

/**
 * Immutable edits on an ordered entry list. Entries carry an `id` so the
 * editor can address them; times are never stored, see schedule().
 */
export type Entry = EntryInput & { id: string };

export function moveEntry<E extends Entry>(list: E[], id: string, direction: "up" | "down"): E[] {
  const i = list.findIndex((e) => e.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Moves an entry to position `to` (0-based, in the list without it). Used by drag and drop. */
export function moveEntryTo<E extends Entry>(list: E[], id: string, to: number): E[] {
  const i = list.findIndex((e) => e.id === id);
  if (i === -1) return list;
  const next = [...list];
  const [item] = next.splice(i, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export type ColumnKey = "name" | "gender" | "country" | "discipline" | "ap" | "diveTime" | "startNumber";

/**
 * Sorts the starts by one column, separately within each stretch between
 * breaks, so rounds and breaks stay where they are. The sort is stable.
 */
export function sortEntriesBy<E extends Entry>(
  list: E[],
  startsById: Map<string, EngineStartWithAthlete>,
  column: ColumnKey,
  dir: "ASC" | "DESC",
  settings: StartListSettings,
): E[] {
  const d = dir === "DESC" ? -1 : 1;
  const text = (a: string | null, b: string | null) =>
    (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
  const cmp = (a: EngineStartWithAthlete, b: EngineStartWithAthlete): number => {
    switch (column) {
      case "name": return byName(a, b);
      case "gender": return text(a.gender, b.gender);
      case "country": return text(a.country, b.country);
      case "discipline":
        return blockRank(a, { ...settings, groupBy: "DISCIPLINE" }) - blockRank(b, { ...settings, groupBy: "DISCIPLINE" });
      case "ap": return a.ap - b.ap;
      case "diveTime": return (a.diveTimeSec ?? Infinity) - (b.diveTimeSec ?? Infinity) || 0;
      case "startNumber": return a.startNumber - b.startNumber;
    }
  };
  const out: E[] = [];
  let section: E[] = [];
  const flush = () => {
    section.sort((x, y) => {
      const a = x.kind === "START" ? startsById.get(x.startId) : undefined;
      const b = y.kind === "START" ? startsById.get(y.startId) : undefined;
      return a && b ? d * cmp(a, b) : 0;
    });
    out.push(...section);
    section = [];
  };
  for (const e of list) {
    if (e.kind === "BREAK") {
      flush();
      out.push(e);
    } else section.push(e);
  }
  flush();
  return out;
}

export function insertBreakAfter(list: Entry[], afterId: string, id: string, breakMin: number): Entry[] {
  const i = list.findIndex((e) => e.id === afterId);
  if (i === -1) return list;
  const next = [...list];
  next.splice(i + 1, 0, { id, kind: "BREAK", breakMin, resumeAt: null });
  return next;
}

export function updateBreak(
  list: Entry[],
  id: string,
  values: { breakMin: number | null; resumeAt: number | null },
): Entry[] {
  return list.map((e) => (e.id === id && e.kind === "BREAK" ? { ...e, ...values } : e));
}

export function removeBreak(list: Entry[], id: string): Entry[] {
  return list.filter((e) => !(e.id === id && e.kind === "BREAK"));
}

/** Starts not yet on the list, in default sort order (no breaks). */
export function unscheduledEntries(
  scheduledStartIds: Iterable<string | null>,
  starts: EngineStart[],
  settings: StartListSettings,
): EntryInput[] {
  const scheduled = new Set(scheduledStartIds);
  const missing = starts.filter((s) => !scheduled.has(s.id));
  if (!missing.length) return [];
  return generateEntries(missing, { ...settings, scheduleMode: "ROUNDS" }).filter(
    (e) => e.kind === "START",
  );
}
