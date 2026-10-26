import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "~/lib/import/file";
import { schedule } from "~/lib/startlist";
import { fromProjectJson, parseState, ProjectError, toProjectJson } from "./persist";
import { loadSample } from "~/samples";
import { dayImport, initialState, reachable, reducer, startsOf, type Action, type AppState } from "./store";

const run = (actions: Action[], state: AppState = initialState) => actions.reduce(reducer, state);
const sample = (name: string) => parseCsv(fs.readFileSync(`src/samples/${name}`, "utf8"));
const event = { name: "Test", date: "2026-09-05", location: "Cove", notes: "" };

describe("demo flow", () => {
  it("depth sample: day 1 of a two-day form, every athlete scheduled", () => {
    const s = run([{ type: "demo", filename: "d.csv", table: sample("depth-2day.csv"), event }]);
    expect(s).toMatchObject({ step: "list", demo: true, maxStarts: 1, use: 1 });
    expect(s.settings.type).toBe("DEPTH");
    const starts = startsOf(s);
    expect(starts.length).toBeGreaterThan(10);
    expect(s.entries.filter((e) => e.kind === "START")).toHaveLength(starts.length);
    // Depth default: deepest AP first.
    const aps = s.entries.flatMap((e) => (e.kind === "START" ? [starts.find((x) => x.id === e.startId)!.ap] : []));
    expect(aps).toEqual([...aps].sort((a, b) => b - a));
  });

  it("pool sample: two rounds with a break, lanes in use", () => {
    const s = run([{ type: "demo", filename: "p.csv", table: sample("pool.csv"), event }]);
    expect(s.settings.type).toBe("POOL");
    expect(s.maxStarts).toBe(2);
    expect(s.entries.filter((e) => e.kind === "BREAK")).toHaveLength(1);
    const rows = schedule(s.entries, new Map(startsOf(s).map((x) => [x.id, x])), s.settings);
    expect(rows.some((r) => r.kind === "START" && r.lane === 3)).toBe(true);
  });

  it("1-start demos cut the sample before its second start / second day", async () => {
    const pool = await loadSample("pool", 1);
    expect(pool.table.headers).not.toContain("Start 2 - Discipline");
    const p = run([{ type: "demo", filename: pool.filename, table: pool.table, event: pool.event }]);
    expect(p).toMatchObject({ maxStarts: 1, demo: true });
    expect(startsOf(p)).toHaveLength(p.registrations.length);
    expect(p.entries.filter((e) => e.kind === "BREAK")).toHaveLength(0);

    const depth = await loadSample("depth", 1);
    const d = run([{ type: "demo", filename: depth.filename, table: depth.table, event: depth.event }]);
    expect(dayImport(d).days).toBeNull(); // no Day 1 / Day 2 picker
    expect(d.entries.filter((e) => e.kind === "START")).toHaveLength(startsOf(d).length);
    expect(depth.event.name).toBe("Sample Depth Challenge");
    // The template download stays the full 2-day file.
    expect(depth.csv).toContain("Discipline | Day 2");
  });

  it("2-start demos are the sample files unchanged", async () => {
    for (const [kind, file] of [["pool", "pool.csv"], ["depth", "depth-2day.csv"]] as const) {
      expect((await loadSample(kind, 2)).table).toEqual(sample(file));
    }
  });
});

describe("editing", () => {
  const base = run([{ type: "demo", filename: "d.csv", table: sample("depth-2day.csv"), event }]);

  it("a data fix flows into the start list without regenerating", () => {
    const r = base.registrations[0];
    const s = run([{ type: "updateRow", id: r.id, patch: { firstName: "Renamed" } }], base);
    expect(startsOf(s).find((x) => x.athleteId === r.id)!.firstName).toBe("Renamed");
    expect(s.entries).toBe(base.entries);
  });

  it("added athletes are appended as unscheduled starts", () => {
    let s = run([{ type: "addRow" }], base);
    const added = s.registrations.at(-1)!;
    s = run(
      [
        {
          type: "updateRow",
          id: added.id,
          patch: { firstName: "New", lastName: "Diver", starts: [{ discipline: "CWT", ap: "12", pb: "", diveTime: "" }, added.starts[1]] },
        },
        { type: "append" },
      ],
      s,
    );
    expect(s.entries.at(-1)).toMatchObject({ kind: "START", startId: `${added.id}-s1` });
  });

  it("manual edits are tracked; sorting and regenerating reset them", () => {
    const moved = run([{ type: "entries", edit: (list) => [...list].reverse() }], base);
    expect(moved.manualOrder).toBe(true);
    const sorted = run([{ type: "sortColumn", column: "name", dir: "ASC" }], moved);
    expect(sorted.manualOrder).toBe(false);
    expect(run([{ type: "generate" }], moved).manualOrder).toBe(false);
  });

  it("switching competition type resets ordering defaults but keeps the first OT", () => {
    const s = run([{ type: "settings", settings: { ...base.settings, startTime: 600 } }, { type: "competition", competition: "POOL" }], base);
    expect(s.settings).toMatchObject({ type: "POOL", startTime: 600, lanes: 3, sortDir: "ASC" });
  });

  it("blank start: enter athletes by hand", () => {
    const s = run([{ type: "blank" }]);
    expect(s.step).toBe("data");
    expect(s.registrations).toHaveLength(1);
    expect(reachable(s, "list")).toBe(false);
    expect(reachable(s, "data")).toBe(true);
  });
});

describe("project files and stored state", () => {
  const s = run([{ type: "demo", filename: "p.csv", table: sample("pool.csv"), event }]);

  it("round-trips through a project file", () => {
    const back = fromProjectJson(toProjectJson(s));
    expect(back).toEqual({ ...s, step: "list" });
  });

  it("rejects other JSON, newer versions and tampered contents", () => {
    expect(() => fromProjectJson("{nope")).toThrow(ProjectError);
    expect(() => fromProjectJson(JSON.stringify({ app: "other", version: 1, state: s }))).toThrow(/isn't a Start List Maker/);
    expect(() => fromProjectJson(JSON.stringify({ app: "startlistmaker", version: 99, state: s }))).toThrow(/newer/);
    const bad = { ...s, settings: { ...s.settings, lanes: 500 } };
    expect(() => fromProjectJson(JSON.stringify({ app: "startlistmaker", version: 1, state: bad }))).toThrow(/damaged/);
    const html = { ...s, step: "<img src=x onerror=alert(1)>" };
    expect(parseState(html)).toBeNull();
  });

  it("fills in fields added later (older saves still open)", () => {
    const old = JSON.parse(JSON.stringify(s));
    delete old.print;
    delete old.settings.halftimeBreakMin;
    expect(parseState(old)).toMatchObject({ print: initialState.print, settings: { halftimeBreakMin: 0 } });
  });
});
