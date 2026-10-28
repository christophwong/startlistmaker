import { schedule, ScheduleCursor } from "./schedule";
import type { EngineStart, EntryInput, StartListSettings } from "./types";

export const byName = (a: EngineStart, b: EngineStart) =>
  a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
  a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" }) ||
  a.startNumber - b.startNumber;

/** Pool static goes first unless a dynamic discipline is ahead of it in `blockOrder`. */
export function staticFirst(settings: StartListSettings): boolean {
  const i = settings.blockOrder.indexOf("STA");
  return i === -1 || !settings.blockOrder.slice(0, i).some((d) => d.startsWith("D"));
}

/** 0 for pool static, 1 for everything else, swapped when static goes last. */
function segmentRank(s: EngineStart, settings: StartListSettings): number {
  if (settings.type !== "POOL") return 0;
  const sta = s.discipline === "STA" ? 0 : 1;
  return staticFirst(settings) ? sta : 1 - sta;
}

export function blockRank(s: EngineStart, settings: StartListSettings): number {
  if (settings.groupBy === "MIXED") return segmentRank(s, settings);
  const i = settings.blockOrder.indexOf(s.discipline);
  return i === -1 ? settings.blockOrder.length : i;
}

function genderRank(s: EngineStart, settings: StartListSettings): number {
  if (settings.genderOrder === "NONE") return 0;
  const [first, second] = settings.genderOrder === "F_FIRST" ? ["F", "M"] : ["M", "F"];
  // Then X (unspecified / other), then blank.
  return s.gender === first ? 0 : s.gender === second ? 1 : s.gender ? 2 : 3;
}

/** Unknown dive times always sort after known ones. */
const byDiveTime = (a: EngineStart, b: EngineStart, dir: number) =>
  a.diveTimeSec === b.diveTimeSec
    ? 0
    : a.diveTimeSec === null
      ? 1
      : b.diveTimeSec === null
        ? -1
        : dir * (a.diveTimeSec - b.diveTimeSec);

/** Unknown PBs always sort after known ones. */
const byPb = (a: EngineStart, b: EngineStart, dir: number) =>
  (a.pb ?? null) === (b.pb ?? null)
    ? 0
    : a.pb == null
      ? 1
      : b.pb == null
        ? -1
        : dir * (a.pb - b.pb);

/**
 * Rearranges a group sorted from first-placed to last-placed into a shape.
 * Ends first: [60 50 40 30 20] → [60 40 20 30 50]. Alternate: → [60 20 50 30 40].
 */
function shape(sorted: EngineStart[], alternate: boolean): EngineStart[] {
  if (alternate) {
    const out: EngineStart[] = [];
    for (let lo = 0, hi = sorted.length - 1; lo <= hi; lo++, hi--) {
      out.push(sorted[lo]);
      if (lo < hi) out.push(sorted[hi]);
    }
    return out;
  }
  const front: EngineStart[] = [];
  const back: EngineStart[] = [];
  sorted.forEach((s, i) => (i % 2 ? back.unshift(s) : front.push(s)));
  return [...front, ...back];
}

/**
 * Orders starts by the competition rules (DESIGN.md §4.1): discipline block,
 * then gender (optional), then the sort key with its direction. AP ties go by
 * dive time in pool (short first), then by name. VALLEY, HILL and ALTERNATE
 * reshape each block and gender group after sorting.
 */
export function sortStarts(
  starts: EngineStart[],
  settings: StartListSettings,
): EngineStart[] {
  const dir = settings.sortDir === "ASC" || settings.sortDir === "HILL" ? 1 : -1;
  const pool = settings.type === "POOL";
  const key = (a: EngineStart, b: EngineStart): number => {
    switch (settings.sortBy) {
      case "AP":
        return dir * (a.ap - b.ap) || (pool ? byDiveTime(a, b, 1) : 0);
      case "PB":
        return byPb(a, b, dir) || dir * (a.ap - b.ap);
      case "DIVE_TIME":
        return byDiveTime(a, b, dir) || dir * (a.ap - b.ap);
      case "NAME":
        return dir * byName(a, b);
      case "REGISTRATION":
        return dir * ((a.order ?? 0) - (b.order ?? 0));
    }
  };
  // Starts without the sort value stay at the end of their group, outside the shape.
  const missing = (s: EngineStart) =>
    settings.sortBy === "PB" ? s.pb == null : settings.sortBy === "DIVE_TIME" && s.diveTimeSec === null;
  const group = (s: EngineStart) => `${blockRank(s, settings)}:${genderRank(s, settings)}`;
  const sorted = [...starts].sort(
    (a, b) =>
      blockRank(a, settings) - blockRank(b, settings) ||
      genderRank(a, settings) - genderRank(b, settings) ||
      key(a, b) ||
      byName(a, b),
  );
  if (settings.sortDir === "ASC" || settings.sortDir === "DESC") return sorted;

  const out: EngineStart[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && group(sorted[j]) === group(sorted[i])) j++;
    const part = sorted.slice(i, j);
    out.push(...shape(part.filter((s) => !missing(s)), settings.sortDir === "ALTERNATE"), ...part.filter(missing));
    i = j;
  }
  return out;
}

/** Round-2 starts in the order their athletes appeared in round 1. */
function orderByRound1(
  round2: EngineStart[],
  round1: EngineStart[],
  settings: StartListSettings,
): EngineStart[] {
  const pos = new Map(round1.map((s, i) => [s.athleteId, i]));
  const seg = (s: EngineStart) => segmentRank(s, settings);
  return [...round2].sort(
    (a, b) =>
      seg(a) - seg(b) ||
      (pos.get(a.athleteId) ?? Infinity) - (pos.get(b.athleteId) ?? Infinity) ||
      byName(a, b),
  );
}

const roundUpTo5 = (n: number) => Math.ceil(n / 5) * 5;

function generateRounds(starts: EngineStart[], s: StartListSettings): EntryInput[] {
  const round1 = sortStarts(
    starts.filter((x) => x.startNumber === 1),
    s,
  );
  const r2 = starts.filter((x) => x.startNumber !== 1);
  const round2 =
    s.round2Order === "SORTED" ? sortStarts(r2, s) : orderByRound1(r2, round1, s);

  const toEntries = (list: EngineStart[]): EntryInput[] =>
    list.map((x) => ({ kind: "START", startId: x.id }));
  if (!round2.length) return toEntries(round1);

  // Every round-2 OT shifts uniformly with the break length, so the break
  // can be stretched just enough to give everyone the minimum recovery.
  const probe = [
    ...toEntries(round1),
    { kind: "BREAK", breakMin: 0, resumeAt: null } as EntryInput,
    ...toEntries(round2),
  ];
  const rows = schedule(probe, new Map(starts.map((x) => [x.id, x])), s);
  const firstOt = new Map<string, number>();
  let minGap = Infinity;
  for (const r of rows) {
    if (r.kind !== "START") continue;
    const prev = firstOt.get(r.start.athleteId);
    if (prev === undefined) firstOt.set(r.start.athleteId, r.ot);
    else minGap = Math.min(minGap, r.ot - prev);
  }
  const needed = minGap === Infinity ? 0 : s.minRecoveryMin - minGap;
  const breakMin = Math.max(s.roundBreakMin, roundUpTo5(needed));

  return [
    ...toEntries(round1),
    { kind: "BREAK", breakMin, resumeAt: null },
    ...toEntries(round2),
  ];
}

function generateSingle(starts: EngineStart[], s: StartListSettings): EntryInput[] {
  const pending = sortStarts(starts, s);
  const cursor = new ScheduleCursor(s);
  const lastOt = new Map<string, number>();
  const out: EntryInput[] = [];

  const eligible = (x: EngineStart) => {
    const { ot, sharesGroupWithSelf } = cursor.peek(x);
    const prev = lastOt.get(x.athleteId);
    return !sharesGroupWithSelf && (prev === undefined || ot - prev >= s.minRecoveryMin);
  };

  while (pending.length) {
    const i = pending.findIndex(eligible);
    if (i === -1) {
      // Nobody left has recovered yet: pause until the first one has.
      const earliest = Math.min(
        ...pending.map((x) => (lastOt.get(x.athleteId) ?? 0) + s.minRecoveryMin),
      );
      const breakMin = Math.max(0, roundUpTo5(earliest - cursor.naturalNextOt()));
      out.push({ kind: "BREAK", breakMin, resumeAt: null });
      cursor.addBreak(breakMin, null);
      continue;
    }
    const [x] = pending.splice(i, 1);
    const { ot } = cursor.addStart(x);
    lastOt.set(x.athleteId, ot);
    out.push({ kind: "START", startId: x.id });
  }
  return out;
}

/**
 * Inserts a half-time break at the OT-group boundary closest to the middle
 * of the list. Only for lists without any break (one round, no recovery
 * pauses): there the existing break already splits the day.
 */
export function insertHalftime(
  entries: EntryInput[],
  starts: EngineStart[],
  settings: StartListSettings,
): EntryInput[] {
  if (settings.halftimeBreakMin <= 0 || entries.some((e) => e.kind === "BREAK")) return entries;
  const rows = schedule(entries, new Map(starts.map((s) => [s.id, s])), settings);
  const total = rows.length;
  let best = -1;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (r.kind !== "START" || prev?.kind !== "START" || prev.group === r.group) return;
    if (best === -1 || Math.abs(i - total / 2) < Math.abs(best - total / 2)) best = i;
  });
  if (best === -1) return entries;
  // rows and entries line up one-to-one: every entry is a start or a break.
  const index = rows[best].index;
  return [
    ...entries.slice(0, index),
    { kind: "BREAK", breakMin: settings.halftimeBreakMin, resumeAt: null },
    ...entries.slice(index),
  ];
}

/** Builds an ordered start list (starts + breaks) from registered starts. */
export function generateEntries(
  starts: EngineStart[],
  settings: StartListSettings,
): EntryInput[] {
  const entries =
    settings.scheduleMode === "SINGLE"
      ? generateSingle(starts, settings)
      : generateRounds(starts, settings);
  return insertHalftime(entries, starts, settings);
}
