import { describe, expect, it } from "vitest";
import type { Discipline } from "../disciplines";
import type { EngineStartWithAthlete, ScheduledRow } from "../startlist/types";
import { crewAt, crewNames, crewOutOfDate, defaultSections, emptyCrew, setCrew, shapeOf, unusedZones } from "./crew";
import { exportTable, toCsv, type ExportOptions } from "./table";

// Shaped like the ECAC pool day (4 April 2026), with made-up names: STA in
// zones 1–2, then DNF in zones 2–3, a break, then a mixed round in zones 1–3.
let n = 0;
function start(group: number, lane: number, discipline: Discipline): ScheduledRow<EngineStartWithAthlete> {
  n++;
  const ot = 9 * 60 + group * 10;
  return {
    kind: "START",
    index: n,
    group,
    lane,
    laneNo: lane,
    ot,
    wt: ot - 45,
    checkIn: ot - 60,
    start: {
      id: `a${n}-s1`,
      athleteId: `a${n}`,
      startNumber: 1,
      discipline,
      ap: 50,
      diveTimeSec: null,
      firstName: "Diver",
      lastName: `D${n}`,
      gender: "F",
      country: "CAN",
      pb: null,
    },
  };
}
const rows: ScheduledRow<EngineStartWithAthlete>[] = [
  start(1, 1, "STA"),
  start(1, 2, "STA"),
  start(2, 2, "DNF"),
  start(2, 3, "DNF"),
  { kind: "BREAK", index: 99, breakMin: 30, resumeAt: null, naturalOt: null, nextOt: 10 * 60 },
  start(3, 1, "DYN"),
  start(3, 2, "DNF"),
  start(3, 3, "DYNB"),
];
const shape = shapeOf(rows);
const opts: ExportOptions = {
  timeFormat: "24h",
  showLane: true,
  laneLabel: "Zone",
  showWarmup: true,
  showCheckIn: true,
  showStartNumber: false,
};

describe("crew names", () => {
  it("applies names to many slots at once; deck and warm up fill the whole OT", () => {
    const zone2 = [{ group: 1, lane: 2 }, { group: 2, lane: 2 }];
    const crew = setCrew(emptyCrew(), zone2, { safety: "Robin", judge: "Ana & Bo" }, shape);
    expect(crewAt(crew, { group: 2, lane: 2 })).toEqual({ judge: "Ana & Bo", safety: "Robin", deck: "", warmUp: "" });
    expect(crewAt(crew, { group: 2, lane: 3 }).safety).toBe("");

    const deck = setCrew(crew, [{ group: 1, lane: 1 }], { deck: "Kai", warmUp: "  Lee " }, shape);
    expect(crewAt(deck, { group: 1, lane: 2 })).toMatchObject({ deck: "Kai", warmUp: "Lee", safety: "Robin" });
  });

  it("only sets the fields given; an empty one clears, and cleared slots leave nothing", () => {
    const crew = setCrew(emptyCrew(), [{ group: 1, lane: 1 }], { judge: "Ana", safety: "Robin" }, shape);
    expect(crewAt(setCrew(crew, [{ group: 1, lane: 1 }], { judge: "Bo" }, shape), { group: 1, lane: 1 }).safety).toBe("Robin");
    const cleared = setCrew(crew, [{ group: 1, lane: 1 }], { judge: "", safety: "" }, shape);
    expect(cleared.zone).toEqual({});
  });

  it("names stay on the slot when divers are reordered", () => {
    const crew = setCrew(emptyCrew(), [{ group: 3, lane: 1 }], { judge: "Ana" }, shape);
    const swapped = rows.map((r) => (r.kind === "START" && r.group === 3 ? { ...r, start: { ...r.start, lastName: "Other" } } : r));
    expect(exportTable(swapped, { ...opts, sheet: "JUDGES", crew }).rows[5]).toMatchObject({
      cells: expect.arrayContaining(["Diver Other", "Ana"]),
    });
  });

  it("suggests every name used, and each name of a pair", () => {
    const crew = setCrew(emptyCrew(), [{ group: 1, lane: 1 }], { judge: "Jo&Ana", deck: "Kai" }, shape);
    expect(crewNames(crew)).toEqual(["Ana", "Jo", "Jo&Ana", "Kai"]);
  });

  it("notices a list with a different number of OTs or zones", () => {
    const crew = setCrew(emptyCrew(), [{ group: 1, lane: 1 }], { judge: "Ana" }, shape);
    expect(crewOutOfDate(crew, rows)).toBe(false);
    expect(crewOutOfDate(crew, rows.slice(0, 4))).toBe(true);
    expect(crewOutOfDate(emptyCrew(), rows.slice(0, 4))).toBe(false);
  });
});

describe("safety sheet", () => {
  it("greys zones with no start in each stretch between breaks and warm-up rows", () => {
    const unused = unusedZones(rows, emptyCrew());
    expect([...unused.get(1)!]).toEqual([]); // STA and DNF together use zones 1–3
    expect([...unused.get(3)!]).toEqual([]);
    // A warm-up row before the DNF splits the first stretch, as on the ECAC sheet.
    const split = unusedZones(rows, { ...emptyCrew(), sections: [{ id: "s", beforeGroup: 2, label: "DYN WARM UP", note: "" }] });
    expect([...split.get(1)!]).toEqual([3]);
    expect([...split.get(2)!]).toEqual([1]);
  });

  it("starts with a warm-up row before the first OT and after each break", () => {
    let id = 0;
    expect(defaultSections(rows, () => `w${id++}`)).toEqual([
      { id: "w0", beforeGroup: 1, label: "STA WARM UP", note: "" },
      { id: "w1", beforeGroup: 3, label: "DYN WARM UP", note: "" },
    ]);
  });

  it("puts each start's safety diver in its own zone's column, with deck, warm up and judge", () => {
    let crew = setCrew(emptyCrew(), [{ group: 1, lane: 1 }], { safety: "Keith", judge: "Jo & Ana", deck: "Andy", warmUp: "Sam" }, shape);
    crew = { ...crew, sections: [{ id: "s", beforeGroup: 2, label: "DYN WARM UP LANE 1", note: "Andy & Sam" }] };
    const t = exportTable(rows, { ...opts, sheet: "SAFETY", crew });
    expect(t.header).toEqual(["Diver Name", "Sex", "Disc", "AP", "OT", "WT", "Zone", "Deck", "Warm Up", "Zone 1", "Zone 2", "Zone 3", "Judge"]);
    expect(t.rows[0]).toMatchObject({
      cells: ["Diver D1", "F", "STA", "0:50", "9:10", "8:25", "1", "Andy", "Sam", "Keith", "", "", "Jo & Ana"],
      greyed: [...Array(11).fill(false), true, false],
    });
    // Deck and warm up are for the whole OT; safety only for its zone.
    expect(t.rows[1]).toMatchObject({ cells: expect.arrayContaining(["Andy", "Sam"]) });
    expect(t.rows[2]).toEqual({ kind: "SECTION", label: "DYN WARM UP LANE 1", time: "8:35", note: "Andy & Sam" });
    expect(toCsv(t)).toContain("DYN WARM UP LANE 1 · 8:35 · Andy & Sam");
    // Warm-up rows are for the safety sheet only.
    expect(exportTable(rows, { ...opts, crew }).rows.some((r) => r.kind === "SECTION")).toBe(false);
  });

  it("gives the safety sheet a column per lane number in use, with names in the printed lane", () => {
    // Dynamic after the break moved to lane 2 (first lane 2), STA still in zones 1–2.
    const moved = rows.map((r) => (r.kind === "START" && r.group === 3 ? { ...r, laneNo: r.lane + 4 } : r));
    const crew = setCrew(emptyCrew(), [{ group: 3, lane: 1 }], { safety: "Brett" }, shape);
    const t = exportTable(moved, { ...opts, sheet: "SAFETY", crew });
    expect(t.header.filter((h) => h.startsWith("Zone "))).toEqual(["Zone 1", "Zone 2", "Zone 3", "Zone 5", "Zone 6", "Zone 7"]);
    const dyn = t.rows.find((r) => r.kind === "START" && r.group === 3);
    const at = (h: string) => t.header.indexOf(h);
    expect(dyn).toMatchObject({ kind: "START" });
    if (dyn?.kind !== "START") return;
    expect(dyn.cells[at("Zone")]).toBe("5");
    expect(dyn.cells[at("Zone 5")]).toBe("Brett");
    // After the break only zones 5–7 are used, so 1–3 are greyed.
    expect([1, 2, 3, 5].map((z) => dyn.greyed![at(`Zone ${z}`)])).toEqual([true, true, true, false]);
  });

  it("the judge sheet's Judge column is writing space until names are set", () => {
    const blank = exportTable(rows, { ...opts, sheet: "JUDGES" });
    expect(blank.blank.at(-1)).toBe(true);
    const crew = setCrew(emptyCrew(), [{ group: 1, lane: 2 }], { judge: "Jo & Ana" }, shape);
    const named = exportTable(rows, { ...opts, sheet: "JUDGES", crew });
    expect(named.blank.at(-1)).toBe(false);
    expect(named.rows[1]).toMatchObject({ cells: expect.arrayContaining(["Jo & Ana"]) });
  });
});
