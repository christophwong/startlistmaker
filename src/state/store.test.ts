import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyCrew, setCrew } from "~/lib/export/crew";
import { MAX_LOGO_SRC, type Logo } from "~/lib/export/logos";
import { parseCsv } from "~/lib/import/file";
import { schedule } from "~/lib/startlist";
import { fromProjectJson, parseState, ProjectError, toProjectJson } from "./persist";
import { loadSample } from "~/samples";
import { checkRow, emptyRow, rowsFromImport, type RegRow } from "~/lib/registrations";
import {
  dayList,
  dayMapping,
  formDays,
  initialState,
  missingColumns,
  parsedRows,
  reachable,
  reducer,
  startsOf,
  type Action,
  type AppState,
} from "./store";

const run = (actions: Action[], state: AppState = initialState) => actions.reduce(reducer, state);
const sample = (name: string) => parseCsv(fs.readFileSync(`src/samples/${name}`, "utf8"));
const event = { name: "Test", date: "2026-09-05", location: "Cove", notes: "" };

describe("demo flow", () => {
  it("depth sample: a two-day form, Day 1 on screen, every athlete scheduled", () => {
    const s = run([{ type: "demo", filename: "d.csv", table: sample("depth-2day.csv"), event }]);
    expect(s).toMatchObject({ step: "list", demo: true, maxStarts: 1, twoDay: true, day: 1 });
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
    expect(formDays(d.source)).toBeNull(); // one list, no day tabs
    expect(d).toMatchObject({ twoDay: false, otherDay: null });
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

  it("a column change re-reads the file but keeps rows edited by hand (QA F1)", () => {
    const [r, other] = base.registrations;
    const fixed = run([{ type: "updateRow", id: r.id, patch: { firstName: "Fixed" } }, { type: "addRow" }], base);
    const added = fixed.registrations.at(-1)!;
    expect(fixed.editedRows).toEqual([r.id, added.id]);

    const { country: _, ...noCountry } = fixed.mapping;
    const reread = run([{ type: "mapping", mapping: noCountry }], fixed);
    expect(reread.importedKey).not.toBe(fixed.importedKey);
    // Edited and added rows as they were; the others read again, now without a country.
    expect(reread.registrations.find((x) => x.id === r.id)).toEqual(fixed.registrations.find((x) => x.id === r.id));
    expect(reread.registrations.at(-1)).toEqual(added);
    expect(reread.registrations.find((x) => x.id === other.id)!.country).toBe("");
    expect(reread.step).toBe(fixed.step);
  });

  it("Remove this start: off the list, and back in the same place when it's put back", () => {
    const pool = run([{ type: "demo", filename: "p.csv", table: sample("pool.csv"), event }]);
    const visible = (s: AppState) => {
      const live = new Set(startsOf(s).map((x) => x.id));
      return s.entries.flatMap((e) => (e.kind === "START" && live.has(e.startId) ? [e.startId] : []));
    };
    const target = visible(pool)[3];
    const rowId = target.replace(/-s[12]$/, "");
    const removed = run([{ type: "removeStart", startId: target }], pool);
    expect(visible(removed)).toEqual(visible(pool).filter((id) => id !== target));
    // The athlete's other start stays, and the order isn't touched.
    expect(startsOf(removed).some((x) => x.athleteId === rowId)).toBe(true);
    expect(removed.entries).toBe(pool.entries);
    expect(removed.editedRows).toContain(rowId);

    const row = removed.registrations.find((r) => r.id === rowId)!;
    const back = run([{ type: "updateRow", id: rowId, patch: { startOff: undefined } }], removed);
    expect(row.startOff).toBeDefined();
    expect(visible(back)).toEqual(visible(pool));
    // Saved and reopened, it's still off.
    expect(fromProjectJson(toProjectJson(removed)).registrations.find((r) => r.id === rowId)!.startOff).toEqual(row.startOff);
  });

  it("Remove this start on a two-day form takes that day off only", () => {
    const start = startsOf(base)[0];
    const s = run([{ type: "removeStart", startId: start.id }], base);
    expect(startsOf(s).some((x) => x.id === start.id)).toBe(false);
    expect(s.registrations.find((r) => r.id === start.athleteId)!.dayOff).toEqual([true, false]);
  });

  it("blank start: enter athletes by hand", () => {
    const s = run([{ type: "blank" }]);
    expect(s.step).toBe("data");
    expect(s.registrations).toHaveLength(1);
    // The Start list tab offers to build the list once there are starts.
    expect(reachable(s, "list")).toBe(true);
    expect(reachable(s, "final")).toBe(false);
  });
});

describe("upload straight to a start list", () => {
  const table = sample("depth-2day.csv");
  // The real ECAC form's typo: these headers aren't recognised, the values are.
  const typo = { ...table, headers: table.headers.map((h) => h.replace("Discipline", "Dicipline")) };
  const listed = (s: AppState) => s.entries.filter((e) => e.kind === "START").length;

  it("builds both days' lists on load, discipline columns matched by their values", () => {
    const s = run([{ type: "load", filename: "7_5 & 7_6 Announcements_ Emerald City Challenge Depth (Responses).csv", table: typo }]);
    expect(s).toMatchObject({ step: "list", twoDay: true, inferred: ["s1Discipline", "s2Discipline"] });
    expect(s.settings.type).toBe("DEPTH");
    expect(listed(s)).toBe(startsOf(s).length);
    expect(s.otherDay!.entries.length).toBe(startsOf({ ...s, day: 2 }).length);
    expect(s.event.name).toBe("Emerald City Challenge Depth");
    expect(s.nameFromFile).toBe(true);
    expect(s.notice).toMatchObject({ undo: false, text: expect.stringMatching(/^Read \d+ rows: 18 athletes, 2 days\. Start lists built\.$/) });
  });

  it("asks for a required column it can't find, then builds once it's chosen", () => {
    const headers = ["Name", "Which one?", "AP"];
    const loaded = run([{ type: "load", filename: "x.csv", table: { headers, rows: [["Ana Lima", "deep", "30"], ["Bo Chen", "deeper", "40"]] } }]);
    expect(missingColumns(loaded)).toEqual([{ key: "s1Discipline", label: "Discipline" }]);
    expect(loaded).toMatchObject({ step: "list", registrations: [], entries: [] });
    const fixed = { headers, rows: [["Ana Lima", "CWT", "30"], ["Bo Chen", "FIM", "40"]] };
    const picked = run([{ type: "load", filename: "x.csv", table: fixed }]);
    // (here the values are disciplines, so it's matched without asking)
    expect(listed(picked)).toBe(2);
    const answered = run([{ type: "mapping", mapping: { ...loaded.mapping, s1Discipline: 1 } }], loaded);
    expect(answered.registrations).toHaveLength(2);
    expect(answered.notice?.text).toMatch(/Start list built/);
  });

  it("an event name typed by the user is kept across uploads", () => {
    const named = run([{ type: "event", patch: { name: "Club Cup" } }]);
    expect(run([{ type: "load", filename: "Other Event (Responses).csv", table }], named).event.name).toBe("Club Cup");
    const fromFile = run([{ type: "load", filename: "First Event (Responses).csv", table }]);
    expect(run([{ type: "load", filename: "Second Event (Responses).csv", table }], fromFile).event.name).toBe("Second Event");
  });

  it("a fixed athlete from the tray goes where the sort puts them, with Undo", () => {
    const base = run([{ type: "load", filename: "d.csv", table }]);
    const broken = base.registrations.find((r) => !startsOf(base).some((s) => s.athleteId === r.id) && r.starts[0].ap);
    const row = broken ?? base.registrations[0];
    const fixedRow = { ...row, starts: [{ ...row.starts[0], discipline: "FIM", ap: row.starts[0].ap || "18" }, row.starts[1]] as RegRow["starts"] };
    const fixed = run([{ type: "updateRow", id: row.id, patch: { starts: fixedRow.starts, dayOff: [false, false] } }], base);
    const placed = run([{ type: "place", rowId: row.id }], fixed);
    expect(placed.entries.some((e) => e.kind === "START" && e.startId === `${row.id}-s1`)).toBe(true);
    expect(placed.notice).toMatchObject({ undo: true, text: expect.stringMatching(/added at #\d+, OT \d+:\d\d\./) });
    expect(placed.manualOrder).toBe(false);

    const undone = run([{ type: "undo" }], placed);
    expect(undone.entries).toEqual(fixed.entries);
    expect(undone.notice).toMatchObject({ text: "Undone." });
  });

  it("on a list ordered by hand, a placed athlete goes at the end", () => {
    const base = run([{ type: "load", filename: "d.csv", table }]);
    const moved = run([{ type: "entries", edit: (l) => [...l].reverse() }], base);
    const row = { ...emptyRow("x"), id: "n99" };
    const withRow = { ...moved, registrations: [...moved.registrations, { ...row, firstName: "Late", lastName: "Entry", starts: [{ discipline: "CWT", ap: "60", pb: "", diveTime: "" }, row.starts[1]] as RegRow["starts"] }] };
    const placed = run([{ type: "place", rowId: "n99" }], withRow);
    expect(placed.entries.at(-1)).toMatchObject({ kind: "START", startId: "n99-s1" });
  });

  it("leave off takes the athlete off the shown day only", () => {
    const base = run([{ type: "load", filename: "d.csv", table }]);
    const r = base.registrations[0];
    const off = run([{ type: "leaveOff", rowId: r.id }], base);
    expect(off.registrations[0].dayOff).toEqual([true, false]);
    expect(off.notice?.text).toMatch(/off the Day 1 list/);
  });

  it("an AP typed on the list keeps the start's place until a re-sort", () => {
    const base = run([{ type: "load", filename: "d.csv", table }]);
    const first = base.entries.find((e) => e.kind === "START")!;
    const startId = first.kind === "START" ? first.startId : "";
    const edited = run([{ type: "editAp", startId, ap: "3" }], base);
    expect(edited.entries).toBe(base.entries);
    expect(edited.manualOrder).toBe(true);
    expect(startsOf(edited).find((s) => s.id === startId)!.ap).toBe(3);
    const resorted = run([{ type: "generate" }], edited);
    const order = resorted.entries.flatMap((e) => (e.kind === "START" ? [e.startId] : []));
    expect(order.at(-1)).toBe(startId);
    expect(run([{ type: "undo" }], resorted).entries).toBe(base.entries);
  });

  it("undo goes back one change at a time, and any other edit ends it", () => {
    const base = run([{ type: "load", filename: "d.csv", table }]);
    const sorted = run([{ type: "sortColumn", column: "name", dir: "ASC" }, { type: "sortColumn", column: "name", dir: "DESC" }], base);
    expect(sorted.history).toHaveLength(2);
    const once = run([{ type: "undo" }], sorted);
    expect(once.notice).toEqual({ text: "Undone.", undo: true });
    expect(run([{ type: "undo" }], once).entries).toBe(base.entries);
    // Typing in Athletes after a sort: the sort can't be undone any more.
    const typed = run([{ type: "updateRow", id: base.registrations[0].id, patch: { country: "NZL" } }], sorted);
    expect(typed).toMatchObject({ history: [], notice: null });
    // Looking at another tab doesn't.
    expect(run([{ type: "step", step: "final" }], sorted).history).toHaveLength(2);
  });

  it("history and notices aren't saved", () => {
    const base = run([{ type: "load", filename: "d.csv", table }, { type: "sortColumn", column: "name", dir: "ASC" }]);
    const json = JSON.parse(toProjectJson(base));
    expect(json.state.history).toBeUndefined();
    expect(json.state.notice).toBeUndefined();
    expect(fromProjectJson(toProjectJson(base))).toMatchObject({ history: [], notice: null, step: "list" });
    // A save from when Columns was a step opens on the start list.
    expect(parseState({ ...json.state, step: "map" })?.step).toBe("list");
  });
});

describe("two-day forms", () => {
  const table = sample("depth-2day.csv");
  const base = run([{ type: "demo", filename: "d.csv", table, event }]);
  const ids = (entries: AppState["entries"]) => entries.flatMap((e) => (e.kind === "START" ? [e.startId] : []));

  it("generates both days' lists from one set of athletes", () => {
    expect(ids(base.entries).every((id) => id.endsWith("-s1"))).toBe(true);
    const day2 = base.otherDay!;
    expect(ids(day2.entries).length).toBe(startsOf({ ...base, day: 2 }).length);
    expect(ids(day2.entries).every((id) => id.endsWith("-s2"))).toBe(true);
    expect(day2.date).toBe("2026-09-06"); // the day after Day 1
    expect(base.registrations.length).toBe(18);
    // Day 2 is its own list, not a second round: no round break, no "(2nd)".
    expect(day2.entries.every((e) => e.kind === "START")).toBe(true);
    expect(startsOf({ ...base, day: 2 }).every((s) => s.startNumber === 1)).toBe(true);
  });

  it("the day tabs swap settings, order, breaks and date, and swap back", () => {
    const d2 = run([{ type: "day", day: 2 }], base);
    expect(d2).toMatchObject({ day: 2, entries: base.otherDay!.entries, event: { date: "2026-09-06", name: "Test" } });
    const edited = run([{ type: "settings", settings: { ...d2.settings, startTime: 600 } }], d2);
    const back = run([{ type: "day", day: 1 }], edited);
    expect(back.settings.startTime).toBe(base.settings.startTime);
    expect(back.entries).toBe(base.entries);
    expect(dayList(back, 2)?.settings.startTime).toBe(600);
  });

  it("a name fix shows on both days; On list is per day", () => {
    const r = base.registrations[0];
    const s = run([{ type: "updateRow", id: r.id, patch: { firstName: "Fixed", dayOff: [false, true] } }], base);
    expect(startsOf(s).find((x) => x.athleteId === r.id)!.firstName).toBe("Fixed");
    expect(startsOf({ ...s, day: 2 }).some((x) => x.athleteId === r.id)).toBe(false);
  });

  it("an athlete with nothing for a day isn't an error that day", () => {
    const row = { ...emptyRow("n1"), firstName: "Ana", lastName: "Solis", starts: [emptyRow("x").starts[0], { discipline: "CWT", ap: "30", pb: "", diveTime: "" }] as const };
    const day1 = checkRow({ ...row, starts: [...row.starts] }, "DEPTH", 1, 0, 1);
    expect(day1).toMatchObject({ errors: {}, starts: [], notEntered: true });
    expect(checkRow({ ...row, starts: [...row.starts] }, "DEPTH", 1, 0, 2).starts).toMatchObject([{ id: "n1-s2", startNumber: 1, ap: 30 }]);
  });

  it("one form per day from the same athlete becomes one row", () => {
    const blank = Array<string>(17).fill("");
    const d1 = [...blank];
    [d1[1], d1[2], d1[3], d1[5], d1[9]] = ["ana@example.com", "Ana Solis", "Female", "CWT", "30"];
    const d2 = [...blank];
    [d2[1], d2[2], d2[3], d2[11], d2[15]] = ["ana@example.com", "Ana Solis", "Female", "FIM", "25"];
    const s = run([{ type: "demo", filename: "d.csv", table: { ...table, rows: [...table.rows, d1, d2] }, event }]);
    const ana = s.registrations.filter((r) => r.firstName === "Ana");
    expect(ana).toHaveLength(1);
    expect(ana[0].starts.map((x) => x.discipline)).toEqual(["CWT", "FIM"]);
  });

  it("a save from the one-day-at-a-time picker opens with both days", () => {
    // What the old app stored for Day 2: that day's columns as start 1, ids ending -s1.
    const loaded = run([{ type: "load", filename: "d.csv", table }]);
    const registrations = rowsFromImport(parsedRows(loaded, 2), table.rows, dayMapping(loaded, 2), 1);
    registrations[0] = { ...registrations[0], firstName: "Edited" };
    const entries = registrations.map((r, i) => ({ id: String(i + 1), kind: "START" as const, startId: `${r.id}-s1` }));
    const { twoDay: _t, day: _d, otherDay: _o, ...rest } = { ...loaded, step: "list" as const, registrations, entries, nextId: 100 };
    const state = parseState({ ...rest, use: 2, importedKey: "old" })!;
    expect(state).toMatchObject({ twoDay: true, day: 2 });
    expect(ids(state.entries)).toEqual(registrations.map((r) => `${r.id}-s2`));
    expect(state.registrations.find((r) => r.id === registrations[0].id)!.firstName).toBe("Edited");
    expect(ids(state.otherDay!.entries).length).toBe(startsOf({ ...state, day: 1 }).length);
    expect(ids(state.otherDay!.entries).length).toBeGreaterThan(10);
  });

  it("round-trips through a project file", () => {
    const d2 = run([{ type: "day", day: 2 }], base);
    expect(fromProjectJson(toProjectJson(d2))).toEqual({ ...d2, step: "list" });
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
    delete old.logos;
    delete old.settings.halftimeBreakMin;
    expect(parseState(old)).toMatchObject({ print: initialState.print, logos: [], settings: { halftimeBreakMin: 0 } });
    // Saved before imports were tracked: the athletes count as read with the current columns.
    delete old.importedKey;
    delete old.editedRows;
    expect(parseState(old)).toMatchObject({ importedKey: s.importedKey, editedRows: [] });
    // Saved before the judge and results sheets: opens on the athlete sheet with its options kept.
    const noSheet = JSON.parse(JSON.stringify(s));
    noSheet.print = { ...noSheet.print, showWarmup: false };
    delete noSheet.print.sheet;
    expect(parseState(noSheet)?.print).toEqual({ ...s.print, sheet: "ATHLETES", showWarmup: false });
    expect(parseState({ ...s, print: { ...s.print, sheet: "SPONSORS" } })).toBeNull();
    // Saved before judge and safety names.
    const noCrew = JSON.parse(JSON.stringify(s));
    delete noCrew.crew;
    expect(parseState(noCrew)?.crew).toEqual(emptyCrew());
  });

  it("judge and safety names round-trip and are bounded", () => {
    const crew = setCrew(emptyCrew(), [{ group: 1, lane: 2 }], { judge: "Jo & Ana", deck: "Kai" }, { groups: 4, lanes: 3 });
    const withCrew = { ...s, crew: { ...crew, sections: [{ id: "c1", beforeGroup: 1, label: "STA WARM UP", note: "" }] } };
    expect(fromProjectJson(toProjectJson(withCrew)).crew).toEqual(withCrew.crew);
    expect(parseState({ ...s, crew: { ...crew, zone: { "<img>": { judge: "x" } } } })).toBeNull();
    expect(parseState({ ...s, crew: { ...crew, zone: { "1:1": { judge: "x".repeat(81) } } } })).toBeNull();
  });

  it("keeps logos in the project file and rejects anything but PNG/JPEG data URLs", () => {
    const withLogo = run([{ type: "addLogos", logos: [logo("HEADER_LEFT")] }], s);
    expect(fromProjectJson(toProjectJson(withLogo)).logos).toEqual(withLogo.logos);
    const swap = (src: string) => parseState({ ...withLogo, logos: [{ ...withLogo.logos[0], src }] });
    expect(swap("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(swap("https://example.com/logo.png")).toBeNull();
    expect(swap("data:image/png;base64,AAAA\" onerror=\"x")).toBeNull();
    expect(swap(`data:image/png;base64,${"A".repeat(MAX_LOGO_SRC)}`)).toBeNull();
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...withLogo.logos[0],
      id: `l${i}`,
      src: `data:image/png;base64,${"A".repeat(MAX_LOGO_SRC - 100)}`,
    }));
    expect(parseState({ ...withLogo, logos: many })).toBeNull(); // over the total
  });
});

const logo = (place: Logo["place"], name = "logo.png"): Omit<Logo, "id"> => ({
  name,
  src: "data:image/png;base64,iVBORw0KGgo=",
  width: 200,
  height: 100,
  place,
  size: "M",
});

describe("logos", () => {
  const base = run([
    { type: "addLogos", logos: [logo("HEADER_LEFT", "comp"), logo("SPONSORS", "a"), logo("HEADER_RIGHT", "aida")] },
    { type: "addLogos", logos: [logo("SPONSORS", "b"), logo("SPONSORS", "c")] },
  ]);
  const names = (s: AppState, place: Logo["place"]) => s.logos.filter((l) => l.place === place).map((l) => l.name);

  it("adds logos with unique ids", () => {
    expect(new Set(base.logos.map((l) => l.id)).size).toBe(5);
    expect(names(base, "SPONSORS")).toEqual(["a", "b", "c"]);
  });

  it("moves a logo within its place only", () => {
    const b = base.logos.find((l) => l.name === "b")!;
    expect(names(run([{ type: "moveLogo", id: b.id, by: -1 }], base), "SPONSORS")).toEqual(["b", "a", "c"]);
    expect(names(run([{ type: "moveLogo", id: b.id, by: 1 }], base), "SPONSORS")).toEqual(["a", "c", "b"]);
    const a = base.logos.find((l) => l.name === "a")!;
    expect(run([{ type: "moveLogo", id: a.id, by: -1 }], base).logos).toEqual(base.logos);
  });

  it("a logo moved to another place goes last there; size changes in place", () => {
    const comp = base.logos.find((l) => l.name === "comp")!;
    const s = run([{ type: "updateLogo", id: comp.id, patch: { place: "SPONSORS" } }], base);
    expect(names(s, "SPONSORS")).toEqual(["a", "b", "c", "comp"]);
    const sized = run([{ type: "updateLogo", id: comp.id, patch: { size: "L" } }], base);
    expect(sized.logos[0]).toMatchObject({ name: "comp", size: "L" });
  });

  it("are kept when a new file is loaded, and cleared by reset", () => {
    const loaded = run([{ type: "load", filename: "p.csv", table: sample("pool.csv") }], base);
    expect(loaded.logos).toEqual(base.logos);
    expect(run([{ type: "blank" }], base).logos).toEqual(base.logos);
    expect(run([{ type: "reset" }], base).logos).toEqual([]);
    const removed = run([{ type: "removeLogo", id: base.logos[0].id }], base);
    expect(removed.logos).toHaveLength(4);
  });
});
