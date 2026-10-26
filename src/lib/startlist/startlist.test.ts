import { describe, expect, it } from "vitest";
import {
  depthPublishedOts,
  depthSettings,
  depthStarts,
  poolSettings,
  poolStarts,
  shuffled,
} from "../../../tests/fixtures/ecac";
import { formatClock, parseClock } from "../time";
import {
  generateEntries,
  schedule,
  sortStarts,
  validateStartList,
  type EngineStart,
  type EntryInput,
  type ScheduledStart,
  type StartListSettings,
} from ".";

const index = (starts: EngineStart[]) => new Map(starts.map((s) => [s.id, s]));
const startRows = (rows: ReturnType<typeof schedule>) =>
  rows.filter((r): r is ScheduledStart => r.kind === "START");
const ids = (entries: EntryInput[]) =>
  entries.flatMap((e) => (e.kind === "START" ? [e.startId] : ["BREAK"]));

describe("sortStarts", () => {
  it("depth: deepest AP first, ties by name", () => {
    const sorted = sortStarts(shuffled(depthStarts), depthSettings);
    expect(sorted.map((s) => s.id)).toEqual(depthStarts.map((s) => s.id));
  });

  it("pool: STA first (short → long), then DNF, DYNB, DYN blocks by AP", () => {
    const round1 = poolStarts.filter((s) => s.startNumber === 1);
    const sorted = sortStarts(shuffled(round1), poolSettings);
    expect(sorted.map((s) => s.id)).toEqual(round1.map((s) => s.id));
  });

  it("pool MIXED mode interleaves dynamic disciplines", () => {
    const round1 = poolStarts.filter((s) => s.startNumber === 1);
    const sorted = sortStarts(round1, { ...poolSettings, groupBy: "MIXED" });
    expect(sorted.slice(0, 6).every((s) => s.discipline === "STA")).toBe(true);
    const aps = sorted.slice(6).map((s) => s.ap);
    expect(aps).toEqual([...aps].sort((a, b) => a - b));
    expect(sorted[6]).toMatchObject({ discipline: "DNF", ap: 1 });
    expect(sorted[7]).toMatchObject({ discipline: "DYNB", ap: 5 });
  });

  it("pool DIVE_TIME mode sorts by dive time, AP breaks ties", () => {
    const mk = (id: string, ap: number, diveTimeSec: number): EngineStart => ({
      id, athleteId: id, startNumber: 1, discipline: "DYN", ap, diveTimeSec,
      firstName: id, lastName: id,
    });
    const starts = [mk("a", 100, 90), mk("b", 50, 120), mk("c", 75, 90)];
    const sorted = sortStarts(starts, {
      ...poolSettings,
      groupBy: "MIXED",
      sortBy: "DIVE_TIME",
    });
    expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("pool: unknown dive times sort after known ones, then by AP", () => {
    const mk = (id: string, ap: number, diveTimeSec: number | null): EngineStart => ({
      id, athleteId: id, startNumber: 1, discipline: "DYN", ap, diveTimeSec,
      firstName: id, lastName: id,
    });
    const starts = [mk("a", 100, null), mk("b", 50, 120), mk("c", 75, null), mk("d", 60, 90)];
    const byTime = sortStarts(starts, { ...poolSettings, groupBy: "MIXED", sortBy: "DIVE_TIME" });
    expect(byTime.map((s) => s.id)).toEqual(["d", "b", "c", "a"]);
    const byAp = sortStarts(starts, { ...poolSettings, groupBy: "MIXED", sortBy: "AP" });
    expect(byAp.map((s) => s.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("block order puts static after dynamic, in either grouping mode", () => {
    const round1 = poolStarts.filter((s) => s.startNumber === 1);
    const blockOrder = ["DNF", "DYNB", "DYN", "STA"] as const;
    const separate = sortStarts(round1, { ...poolSettings, blockOrder: [...blockOrder] });
    expect(separate.map((s) => s.discipline).slice(-6)).toEqual(Array(6).fill("STA"));
    expect(separate[0].discipline).toBe("DNF");
    const mixed = sortStarts(round1, { ...poolSettings, groupBy: "MIXED", blockOrder: [...blockOrder] });
    expect(mixed.slice(-6).every((s) => s.discipline === "STA")).toBe(true);
    expect(mixed[0]).toMatchObject({ discipline: "DNF", ap: 1 });
  });

  it("gender order and sort direction", () => {
    const mk = (id: string, ap: number, gender: "M" | "F" | null): EngineStart => ({
      id, athleteId: id, startNumber: 1, discipline: "CWT", ap, diveTimeSec: 60,
      firstName: id, lastName: id, gender,
    });
    const starts = [mk("a", 30, "M"), mk("b", 40, "F"), mk("c", 20, "F"), mk("d", 50, null)];
    const s = { ...depthSettings, genderOrder: "F_FIRST" } as const;
    expect(sortStarts(starts, s).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortStarts(starts, { ...s, sortDir: "ASC" }).map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("NAME and REGISTRATION sort keys", () => {
    const mk = (id: string, last: string, order: number): EngineStart => ({
      id, athleteId: id, startNumber: 1, discipline: "CWT", ap: 30, diveTimeSec: 60,
      firstName: "X", lastName: last, order,
    });
    const starts = [mk("a", "Cole", 2), mk("b", "Abe", 1), mk("c", "Bly", 0)];
    expect(sortStarts(starts, { ...depthSettings, sortBy: "NAME", sortDir: "ASC" }).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(sortStarts(starts, { ...depthSettings, sortBy: "REGISTRATION", sortDir: "ASC" }).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("spacing from dive time + buffer", () => {
  const mk = (id: string, diveTimeSec: number | null): EngineStart => ({
    id, athleteId: id, startNumber: 1, discipline: "CWT", ap: 30, diveTimeSec,
    firstName: id, lastName: id,
  });
  const starts = [mk("a", 110), mk("b", 61), mk("c", null), mk("d", 30)];
  const entries: EntryInput[] = starts.map((s) => ({ kind: "START", startId: s.id }));

  it("interval = longest dive in the group (rounded up to a minute) + buffer", () => {
    const s = { ...depthSettings, spacingMode: "DIVE_TIME", bufferMin: 4, roundToMin: 1 } as const;
    const ots = startRows(schedule(entries, index(starts), s)).map((r) => formatClock(r.ot));
    // a: 1:50 → 2 + 4 = 6; b: 1:01 → 2 + 4 = 6; c: unknown → fixed 10
    expect(ots).toEqual(["10:30", "10:36", "10:42", "10:52"]);
  });

  it("rounds up to whole steps and uses the longest dive across lanes", () => {
    const s = { ...depthSettings, spacingMode: "DIVE_TIME", bufferMin: 4, roundToMin: 5, lanes: 2 } as const;
    const ots = startRows(schedule(entries, index(starts), s)).map((r) => formatClock(r.ot));
    // group 1 (a, b): 2 + 4 = 6 → 10
    expect(ots).toEqual(["10:30", "10:30", "10:40", "10:40"]);
  });
});

describe("half-time break", () => {
  it("is inserted at the group boundary nearest the middle of a one-round list", () => {
    const entries = generateEntries(depthStarts, { ...depthSettings, halftimeBreakMin: 20 });
    const b = entries.findIndex((e) => e.kind === "BREAK");
    expect(b).toBe(8); // 17 starts: after 8 and after 9 tie, the earlier one wins
    expect(entries[b]).toEqual({ kind: "BREAK", breakMin: 20, resumeAt: null });
    expect(entries.filter((e) => e.kind === "BREAK")).toHaveLength(1);
  });

  it("is not added when the list already has a round break", () => {
    const entries = generateEntries(poolStarts, { ...poolSettings, halftimeBreakMin: 20 });
    expect(entries.filter((e) => e.kind === "BREAK")).toHaveLength(1);
  });

  it("respects lanes: never splits an OT group", () => {
    const round1 = poolStarts.filter((s) => s.startNumber === 1);
    const entries = generateEntries(round1, { ...poolSettings, halftimeBreakMin: 15 });
    const rows = schedule(entries, index(round1), poolSettings);
    const b = rows.findIndex((r) => r.kind === "BREAK");
    const before = rows[b - 1], after = rows[b + 1];
    expect(before.kind === "START" && after.kind === "START" && before.group !== after.group).toBe(true);
  });
});

describe("schedule", () => {
  it("reproduces the ECAC depth sheet OT / WT / check-in", () => {
    const entries: EntryInput[] = depthStarts.map((s) => ({ kind: "START", startId: s.id }));
    entries.splice(11, 0, { kind: "BREAK", breakMin: 10, resumeAt: null });
    entries.splice(6, 0, { kind: "BREAK", breakMin: 10, resumeAt: null });

    const rows = startRows(schedule(entries, index(depthStarts), depthSettings));
    expect(rows.map((r) => formatClock(r.ot))).toEqual(depthPublishedOts);
    expect(formatClock(rows[0].wt)).toBe("9:45");
    expect(formatClock(rows[0].checkIn)).toBe("9:30");
    expect(rows.every((r) => r.lane === 1)).toBe(true);
  });

  it("groups parallel starts into lanes with the same OT", () => {
    const round1 = poolStarts.filter((s) => s.startNumber === 1);
    const entries: EntryInput[] = round1.map((s) => ({ kind: "START", startId: s.id }));
    const rows = startRows(schedule(entries, index(poolStarts), poolSettings));

    // STA: 2 lanes, 12 min apart (14:00, 14:00, 14:12, 14:12, 14:24, 14:24)
    expect(rows.slice(0, 6).map((r) => formatClock(r.ot))).toEqual([
      "14:00", "14:00", "14:12", "14:12", "14:24", "14:24",
    ]);
    expect(rows.slice(0, 6).map((r) => r.lane)).toEqual([1, 2, 1, 2, 1, 2]);
    // Dynamic: new group after STA (+12), then 3 lanes, 9 min apart
    expect(rows.slice(6, 12).map((r) => formatClock(r.ot))).toEqual([
      "14:36", "14:36", "14:36", "14:45", "14:45", "14:45",
    ]);
    expect(rows.slice(6, 9).map((r) => r.lane)).toEqual([1, 2, 3]);
  });

  it("never puts STA and dynamic starts in the same group", () => {
    const entries: EntryInput[] = poolStarts
      .filter((s) => s.startNumber === 1)
      .slice(4, 8)
      .map((s) => ({ kind: "START", startId: s.id }));
    const rows = startRows(schedule(entries, index(poolStarts), poolSettings));
    expect(rows.map((r) => r.group)).toEqual([1, 1, 2, 2]);
  });

  it("break with a fixed resume time sets the next OT (pool round 2 at 5:00)", () => {
    const entries = generateEntries(poolStarts, poolSettings);
    const b = entries.findIndex((e) => e.kind === "BREAK");
    entries[b] = { kind: "BREAK", breakMin: null, resumeAt: parseClock("17:00") };
    const rows = schedule(entries, index(poolStarts), poolSettings);
    const round2 = startRows(rows).filter((r) => r.index > b);
    expect(round2.slice(0, 7).map((r) => formatClock(r.ot, "12h"))).toEqual([
      "5:00 PM", "5:00 PM", "5:00 PM", "5:09 PM", "5:09 PM", "5:09 PM", "5:18 PM",
    ]);
    const breakRow = rows[b];
    expect(breakRow.kind === "BREAK" && formatClock(breakRow.nextOt)).toBe("17:00");
  });

  it("consecutive breaks add up", () => {
    const [a, b] = depthStarts;
    const rows = startRows(
      schedule(
        [
          { kind: "START", startId: a.id },
          { kind: "BREAK", breakMin: 10, resumeAt: null },
          { kind: "BREAK", breakMin: 5, resumeAt: null },
          { kind: "START", startId: b.id },
        ],
        index(depthStarts),
        depthSettings,
      ),
    );
    expect(rows[1].ot - rows[0].ot).toBe(25);
  });
});

describe("generateEntries — rounds", () => {
  it("round 1 = first starts, break, round 2 in round-1 athlete order", () => {
    const entries = generateEntries(shuffled(poolStarts), poolSettings);
    const b = entries.findIndex((e) => e.kind === "BREAK");
    const round1 = ids(entries.slice(0, b));
    const round2 = ids(entries.slice(b + 1));
    expect(round1).toEqual(
      poolStarts.filter((s) => s.startNumber === 1).map((s) => s.id),
    );
    // Same as the ECAC sheet: athletes in round-1 order, athlete 14 absent
    expect(round2.map((id) => id.slice(0, 3))).toEqual(
      round1.map((id) => id.slice(0, 3)).filter((a) => a !== "a14"),
    );
  });

  it("round 2 SORTED re-applies the sort rules", () => {
    const entries = generateEntries(poolStarts, { ...poolSettings, round2Order: "SORTED" });
    const b = entries.findIndex((e) => e.kind === "BREAK");
    const byId = index(poolStarts);
    const round2 = ids(entries.slice(b + 1)).map((id) => byId.get(id)!);
    expect(round2.map((s) => s.discipline)).toEqual([
      ...Array(10).fill("DNF"),
      ...Array(5).fill("DYNB"),
      ...Array(5).fill("DYN"),
    ]);
  });

  it("extends the round break so everybody gets the minimum recovery", () => {
    const settings: StartListSettings = { ...poolSettings, minRecoveryMin: 240 };
    const entries = generateEntries(poolStarts, settings);
    const rows = schedule(entries, index(poolStarts), settings);
    const brk = entries.find((e) => e.kind === "BREAK");
    expect(brk && brk.kind === "BREAK" && brk.breakMin! > settings.roundBreakMin).toBe(true);
    expect(brk && brk.kind === "BREAK" && brk.breakMin! % 5).toBe(0);
    expect(
      validateStartList(rows, poolStarts, settings).filter((i) => i.code === "RECOVERY"),
    ).toEqual([]);
  });

  it("keeps the configured break when recovery is already satisfied", () => {
    const entries = generateEntries(poolStarts, { ...poolSettings, minRecoveryMin: 30 });
    expect(entries.find((e) => e.kind === "BREAK")).toEqual({
      kind: "BREAK", breakMin: 30, resumeAt: null,
    });
  });

  it("no break when nobody has a second start", () => {
    const entries = generateEntries(depthStarts, depthSettings);
    expect(entries.some((e) => e.kind === "BREAK")).toBe(false);
    expect(entries).toHaveLength(depthStarts.length);
  });
});

describe("generateEntries — single list", () => {
  const single: StartListSettings = {
    ...depthSettings,
    scheduleMode: "SINGLE",
    minRecoveryMin: 60,
  };
  const two = (athlete: string, ap1: number, ap2: number): EngineStart[] =>
    [ap1, ap2].map((ap, i) => ({
      id: `${athlete}-${i + 1}`,
      athleteId: athlete,
      startNumber: i + 1,
      discipline: "CWT",
      ap,
      diveTimeSec: 90,
      firstName: athlete,
      lastName: athlete,
    }));

  it("sorts all starts together and enforces minimum recovery", () => {
    const starts = [
      ...two("ann", 50, 48),
      ...two("bob", 40, 20),
      ...depthStarts.slice(6, 12), // 6 single starts, APs 35..25
    ];
    const entries = generateEntries(starts, single);
    const rows = schedule(entries, index(starts), single);
    const issues = validateStartList(rows, starts, single);
    expect(issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(issues).toEqual([]);
    // Ann's 48 m start had to wait: 50 → (others) → 48 at least 60 min later
    const ann = startRows(rows).filter((r) => r.start.athleteId === "ann");
    expect(ann[1].ot - ann[0].ot).toBeGreaterThanOrEqual(60);
  });

  it("inserts a break when nobody remaining has recovered", () => {
    const starts = two("ann", 50, 49);
    const entries = generateEntries(starts, single);
    expect(entries).toEqual([
      { kind: "START", startId: "ann-1" },
      { kind: "BREAK", breakMin: 50, resumeAt: null },
      { kind: "START", startId: "ann-2" },
    ]);
    const rows = startRows(schedule(entries, index(starts), single));
    expect(rows[1].ot - rows[0].ot).toBe(60);
  });

  it("never places the same athlete twice in a group even with no recovery", () => {
    const starts = two("ann", 50, 49);
    const settings = { ...single, lanes: 2, minRecoveryMin: 0 };
    const rows = startRows(schedule(generateEntries(starts, settings), index(starts), settings));
    expect(rows[0].group).not.toBe(rows[1].group);
  });
});

describe("validateStartList", () => {
  it("flags short recovery, same-group starts and unscheduled starts", () => {
    const starts = poolStarts.filter((s) => ["a01", "a02"].includes(s.athleteId));
    const settings = { ...poolSettings, lanes: 2, staLanes: 2, minRecoveryMin: 60 };
    const entries: EntryInput[] = [
      { kind: "START", startId: "a01-s1" }, // STA
      { kind: "START", startId: "a01-s2" }, // DYN, next group
      { kind: "START", startId: "a02-s2" }, // DNF, same group
    ];
    const issues = validateStartList(
      schedule(entries, index(starts), settings),
      starts,
      settings,
    );
    expect(issues.map((i) => i.code).sort()).toEqual(["RECOVERY", "UNSCHEDULED"]);

    const sameGroup: EntryInput[] = [
      { kind: "START", startId: "a01-s2" },
      { kind: "START", startId: "a02-s2" },
      { kind: "START", startId: "a01-s2" },
    ];
    const dup = validateStartList(
      schedule(sameGroup, index(starts), { ...settings, lanes: 3 }),
      starts,
      settings,
    );
    expect(dup.some((i) => i.code === "SAME_GROUP")).toBe(true);
  });

  it("warns when a fixed break resume time overlaps the previous group", () => {
    const entries: EntryInput[] = [
      { kind: "START", startId: depthStarts[0].id },
      { kind: "BREAK", breakMin: null, resumeAt: parseClock("10:35") },
      { kind: "START", startId: depthStarts[1].id },
    ];
    const issues = validateStartList(
      schedule(entries, index(depthStarts), depthSettings),
      depthStarts.slice(0, 2),
      depthSettings,
    );
    expect(issues.map((i) => i.code)).toEqual(["BREAK_OVERLAP"]);
  });
});
