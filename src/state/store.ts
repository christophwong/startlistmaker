import type { CompetitionType } from "~/lib/disciplines";
import type { Logo } from "~/lib/export/logos";
import { emptyCrew, type Crew } from "~/lib/export/crew";
import type { SheetKind } from "~/lib/export/table";
import { autoMap, dayLabels, hasStart2, selectStart, type Mapping } from "~/lib/import/columns";
import { detectCompetitionType, detectMaxStarts } from "~/lib/import/detect";
import type { NamedSheet, SheetTable } from "~/lib/import/file";
import { parseRows, type ParsedRow } from "~/lib/import/rows";
import { emptyRow, emptyStart, removeStart, rowsFromDays, rowsFromImport, rowsToStarts, type Day, type RegRow } from "~/lib/registrations";
import {
  defaultSettings,
  DEFAULT_TIME_FORMAT,
  generateEntries,
  sortEntriesBy,
  unscheduledEntries,
  type ColumnKey,
  type Entry,
  type EntryInput,
  type StartListSettings,
} from "~/lib/startlist";
import type { TimeFormat } from "~/lib/time";

export type { Day };

/**
 * All app state, in one reducer. Starts and times are derived: registrations
 * are the source of truth for athletes, `entries` hold only the order and
 * breaks, and schedule() computes every time.
 */

/** "officials" is a screen inside Print & export (judge and safety names), not a stepper step. */
export type Step = "start" | "map" | "data" | "list" | "final" | "officials";

export type Settings = StartListSettings & { timeFormat: TimeFormat };

export interface EventInfo {
  name: string;
  /** YYYY-MM-DD, or "" */
  date: string;
  location: string;
  notes: string;
}

export interface PrintOptions {
  /** The sheet shown on Print & export and used by the downloads. */
  sheet: SheetKind;
  showWarmup: boolean;
  showCheckIn: boolean;
  showStartNumber: boolean;
  /** Each BREAK starts a new page. */
  pageBreakAtBreaks: boolean;
}

export interface Source {
  filename: string;
  table: SheetTable;
  /** Every sheet of an .xlsx; `sheet` is the one in use. */
  sheets?: NamedSheet[];
  sheet?: string;
}

/** The start list of the day that isn't on screen (two-day forms). */
export interface DayList {
  settings: Settings;
  entries: Entry[];
  manualOrder: boolean;
  /** YYYY-MM-DD, or "" */
  date: string;
  crew: Crew;
}

export interface AppState {
  step: Step;
  demo: boolean;
  source: Source | null;
  mapping: Mapping;
  /**
   * A form with one section per day: two start lists from one set of
   * athletes, Day 1 in starts[0] and Day 2 in starts[1].
   */
  twoDay: boolean;
  /** The day on screen. `settings`, `entries`, `manualOrder` and `event.date` are that day's. */
  day: Day;
  /** The other day's list, swapped in by the day tabs. Null unless `twoDay`. */
  otherDay: DayList | null;
  maxStarts: 1 | 2;
  registrations: RegRow[];
  /** importKey() of the file read that built `registrations`, so Continue on Columns re-reads only when it changed. */
  importedKey: string | null;
  /** Rows changed, added or deleted on Athletes since that read. */
  editedRows: string[];
  event: EventInfo;
  settings: Settings;
  entries: Entry[];
  /** The day's judge and safety names, by OT group and zone. */
  crew: Crew;
  nextId: number;
  /** Order changed by hand since the last generate or sort. */
  manualOrder: boolean;
  print: PrintOptions;
  /** Header and sponsor logos; kept, like the event details, when a new file is loaded. */
  logos: Logo[];
}

export const initialState: AppState = {
  step: "start",
  demo: false,
  source: null,
  mapping: {},
  twoDay: false,
  day: 1,
  otherDay: null,
  maxStarts: 1,
  registrations: [],
  importedKey: null,
  editedRows: [],
  event: { name: "", date: "", location: "", notes: "" },
  settings: { ...defaultSettings("POOL"), timeFormat: DEFAULT_TIME_FORMAT },
  entries: [],
  crew: emptyCrew(),
  nextId: 1,
  manualOrder: false,
  print: { sheet: "ATHLETES", showWarmup: true, showCheckIn: true, showStartNumber: false, pageBreakAtBreaks: false },
  logos: [],
};

export type Action =
  | { type: "load"; filename: string; table: SheetTable; sheets?: NamedSheet[]; sheet?: string }
  | { type: "sheet"; name: string }
  | { type: "mapping"; mapping: Mapping }
  | { type: "day"; day: Day }
  | { type: "competition"; competition: CompetitionType }
  | { type: "confirmMapping" }
  | { type: "updateRow"; id: string; patch: Partial<RegRow> }
  | { type: "addRow" }
  | { type: "blank" }
  | { type: "deleteRow"; id: string }
  | { type: "removeStart"; startId: string }
  | { type: "maxStarts"; maxStarts: 1 | 2 }
  | { type: "generate" }
  | { type: "append" }
  | { type: "settings"; settings: Settings }
  | { type: "entries"; edit: (entries: Entry[], newId: string) => Entry[] }
  | { type: "sortColumn"; column: ColumnKey; dir: "ASC" | "DESC" }
  | { type: "event"; patch: Partial<EventInfo> }
  | { type: "print"; patch: Partial<PrintOptions> }
  /** `newId` is free for a new section row. */
  | { type: "crew"; edit: (crew: Crew, newId: string) => Crew }
  | { type: "addLogos"; logos: Omit<Logo, "id">[] }
  | { type: "updateLogo"; id: string; patch: Partial<Pick<Logo, "place" | "size">> }
  | { type: "moveLogo"; id: string; by: -1 | 1 }
  | { type: "removeLogo"; id: string }
  | { type: "step"; step: Step }
  | { type: "demo"; filename: string; table: SheetTable; event: EventInfo }
  | { type: "restore"; state: AppState }
  | { type: "reset" };

/**
 * "Day 1" / "Day 2" when the form has one section per day: each day is its
 * own start list. Other two-start files stay two starts on one list.
 */
export function formDays(source: Source | null): [string, string] | null {
  const headers = source?.table.headers ?? [];
  return hasStart2(autoMap(headers)) ? dayLabels(headers) : null;
}

/** One day's columns of a two-day form, read as start 1; otherwise the whole mapping. */
export const dayMapping = (state: Pick<AppState, "source" | "mapping">, day: Day): Mapping =>
  formDays(state.source) ? selectStart(state.mapping, day) : state.mapping;

/** The file's rows, parsed for `day` on a two-day form. */
export function parsedRows(state: Pick<AppState, "source" | "mapping" | "settings">, day: Day = 1): ParsedRow[] {
  if (!state.source) return [];
  const mapping = dayMapping(state, day);
  return parseRows(state.source.table.rows, mapping, {
    type: state.settings.type,
    maxStarts: detectMaxStarts(mapping),
    selectedLabel: formDays(state.source)?.[day - 1],
  });
}

/** What a re-read of the file depends on: sheet, columns and competition type. */
export function importKey(state: Pick<AppState, "source" | "mapping" | "settings">): string | null {
  if (!state.source) return null;
  const { filename, sheet } = state.source;
  return JSON.stringify([filename, sheet ?? null, state.mapping, state.settings.type]);
}

const edited = (state: AppState, id: string) =>
  state.editedRows.includes(id) ? state.editedRows : [...state.editedRows, id];

/** The starts on screen: the current day's on a two-day form. */
export const startsOf = (state: Pick<AppState, "registrations" | "settings" | "maxStarts" | "twoDay" | "day">) =>
  rowsToStarts(state.registrations, state.settings.type, state.maxStarts, state.twoDay ? state.day : undefined);

export const otherOf = (day: Day): Day => (day === 1 ? 2 : 1);

/** A day's list, whether it's on screen or not. */
export function dayList(state: AppState, day: Day): DayList | null {
  if (day === state.day) {
    return { settings: state.settings, entries: state.entries, manualOrder: state.manualOrder, date: state.event.date, crew: state.crew };
  }
  return state.otherDay;
}

/** The day after a YYYY-MM-DD date, or "" for no date. */
export function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (!date || Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function switchDay(state: AppState, day: Day): AppState {
  const other = state.otherDay;
  if (!other || day === state.day) return state;
  return {
    ...state,
    day,
    settings: other.settings,
    entries: other.entries,
    manualOrder: other.manualOrder,
    crew: other.crew,
    event: { ...state.event, date: other.date },
    otherDay: dayList(state, state.day),
  };
}

function withIds(nextId: number, list: EntryInput[]): { entries: Entry[]; nextId: number } {
  return { entries: list.map((e) => ({ ...e, id: String(nextId++) })), nextId };
}

/** New type: that type's ordering defaults, keeping the user's timing basics. */
function settingsForType(s: Settings, type: CompetitionType): Settings {
  if (s.type === type) return s;
  return { ...defaultSettings(type), startTime: s.startTime, timeFormat: s.timeFormat };
}

/** Both days share the competition type. */
function withType(state: AppState, type: CompetitionType): AppState {
  const other = state.otherDay;
  return {
    ...state,
    settings: settingsForType(state.settings, type),
    otherDay: other && { ...other, settings: settingsForType(other.settings, type) },
  };
}

function loadSource(state: AppState, source: Source): AppState {
  const mapping = autoMap(source.table.headers);
  const type = detectCompetitionType(source.table.rows, dayMapping({ source, mapping }, 1));
  const settings = { ...defaultSettings(type), startTime: state.settings.startTime, timeFormat: state.settings.timeFormat };
  const twoDay = !!formDays(source);
  return {
    ...initialState,
    print: state.print,
    event: state.event,
    logos: state.logos,
    settings,
    twoDay,
    otherDay: twoDay ? { settings, entries: [], manualOrder: false, date: nextDate(state.event.date), crew: emptyCrew() } : null,
    step: "map",
    source,
    mapping,
  };
}

/** Re-reads the file only if the import changed, so edits on Athletes survive a look at Columns. */
function confirmMapping(state: AppState): AppState {
  const key = importKey(state);
  if (key === state.importedKey && state.registrations.length) return { ...state, step: "data" };
  const table = state.source?.table.rows ?? [];
  const read = { step: "data" as const, importedKey: key, editedRows: [] };
  if (state.twoDay) {
    const registrations = rowsFromDays([parsedRows(state, 1), parsedRows(state, 2)], table, [dayMapping(state, 1), dayMapping(state, 2)]);
    // New athletes: both days' lists are generated again.
    return { ...state, ...read, maxStarts: 1, registrations, otherDay: state.otherDay && { ...state.otherDay, entries: [] } };
  }
  const maxStarts = detectMaxStarts(state.mapping);
  const registrations = rowsFromImport(parsedRows(state), table, state.mapping, maxStarts);
  return { ...state, ...read, maxStarts, registrations };
}

/** The list on screen; on a two-day form the other day too, the first time. */
function generate(state: AppState): AppState {
  const ids = withIds(state.nextId, generateEntries(startsOf(state), state.settings));
  const next: AppState = { ...state, step: "list", ...ids, manualOrder: false };
  const other = state.otherDay;
  if (!other || other.entries.length) return next;
  const more = withIds(next.nextId, generateEntries(startsOf({ ...state, day: otherOf(state.day) }), other.settings));
  return { ...next, nextId: more.nextId, otherDay: { ...other, entries: more.entries, manualOrder: false } };
}

/**
 * A save from when a two-day form was built one day at a time (`use`): the
 * saved day keeps its athlete edits, order and breaks, and the other day is
 * read from the file and generated.
 */
export function upgradeOneDaySave(state: AppState, use: Day): AppState {
  const fresh = confirmMapping({ ...state, twoDay: true, importedKey: null, otherDay: null });
  const saved = new Map(state.registrations.map((r) => [r.id, r]));
  const moved = (r: RegRow, base: RegRow["starts"]): RegRow => {
    const starts: RegRow["starts"] = [...base];
    starts[use - 1] = r.starts[0];
    const dayOff: [boolean, boolean] = [false, false];
    dayOff[use - 1] = r.excluded;
    return { ...r, starts, excluded: false, dayOff };
  };
  const fromFile = new Set(fresh.registrations.map((r) => r.id));
  const registrations = [
    ...fresh.registrations.map((r) => (saved.has(r.id) ? moved(saved.get(r.id)!, r.starts) : r)),
    ...state.registrations.filter((r) => !fromFile.has(r.id)).map((r) => moved(r, [emptyStart(), emptyStart()])),
  ];
  const entries = state.entries.map((e) => (e.kind === "START" ? { ...e, startId: e.startId.replace(/-s1$/, `-s${use}`) } : e));
  const upgraded: AppState = {
    ...state,
    twoDay: true,
    day: use,
    maxStarts: 1,
    registrations,
    entries,
    importedKey: fresh.importedKey,
    otherDay: {
      settings: state.settings,
      entries: [],
      manualOrder: false,
      date: use === 1 ? nextDate(state.event.date) : "",
      crew: emptyCrew(),
    },
  };
  const other = otherOf(use);
  const more = withIds(upgraded.nextId, generateEntries(startsOf({ ...upgraded, day: other }), state.settings));
  return { ...upgraded, nextId: more.nextId, otherDay: { ...upgraded.otherDay!, entries: more.entries } };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "load":
      return loadSource(state, {
        filename: action.filename,
        table: action.table,
        sheets: action.sheets,
        sheet: action.sheet,
      });
    case "sheet": {
      const sheet = state.source?.sheets?.find((s) => s.name === action.name);
      if (!state.source || !sheet) return state;
      return loadSource(state, { ...state.source, table: sheet.table, sheet: sheet.name });
    }
    case "mapping": {
      const next = { ...state, mapping: action.mapping };
      // Detect pool/depth once a discipline column is picked by hand.
      const before = dayMapping(state, 1).s1Discipline;
      const after = dayMapping(next, 1).s1Discipline;
      if (before !== undefined || after === undefined || !state.source) return next;
      return withType(next, detectCompetitionType(state.source.table.rows, dayMapping(next, 1)));
    }
    case "day":
      return switchDay(state, action.day);
    case "competition":
      return withType(state, action.competition);
    case "confirmMapping":
      return confirmMapping(state);
    case "updateRow":
      return {
        ...state,
        registrations: state.registrations.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
        editedRows: edited(state, action.id),
      };
    case "addRow":
      return {
        ...state,
        registrations: [...state.registrations, emptyRow(`n${state.nextId}`)],
        editedRows: edited(state, `n${state.nextId}`),
        nextId: state.nextId + 1,
      };
    case "blank":
      // No file: type athletes in by hand.
      return {
        ...initialState,
        settings: state.settings,
        event: state.event,
        print: state.print,
        logos: state.logos,
        step: "data",
        maxStarts: 1,
        registrations: [emptyRow("n1")],
        nextId: 2,
      };
    case "deleteRow":
      return {
        ...state,
        registrations: state.registrations.filter((r) => r.id !== action.id),
        editedRows: edited(state, action.id),
      };
    case "removeStart": {
      // Only the registration changes: its entry is skipped while the start is
      // off the list, and comes back in the same place when it's put back.
      const [, id, n] = /^(.+)-s([12])$/.exec(action.startId) ?? [];
      if (!id) return state;
      const day = state.twoDay ? state.day : undefined;
      return {
        ...state,
        registrations: state.registrations.map((r) =>
          r.id === id ? removeStart(r, Number(n) as 1 | 2, state.settings.type, state.maxStarts, day) : r,
        ),
        editedRows: edited(state, id),
      };
    }
    case "maxStarts":
      return { ...state, maxStarts: action.maxStarts };
    case "generate":
      return generate(state);
    case "append": {
      const scheduled = state.entries.map((e) => (e.kind === "START" ? e.startId : null));
      const added = withIds(state.nextId, unscheduledEntries(scheduled, startsOf(state), state.settings));
      return { ...state, entries: [...state.entries, ...added.entries], nextId: added.nextId };
    }
    case "settings":
      return { ...state, settings: action.settings };
    case "entries":
      return {
        ...state,
        entries: action.edit(state.entries, String(state.nextId)),
        nextId: state.nextId + 1,
        manualOrder: true,
      };
    case "sortColumn": {
      const byId = new Map(startsOf(state).map((s) => [s.id, s]));
      return {
        ...state,
        entries: sortEntriesBy(state.entries, byId, action.column, action.dir, state.settings),
        manualOrder: false,
      };
    }
    case "event": {
      const event = { ...state.event, ...action.patch };
      // Day 2 is the day after Day 1 until it's given a date of its own.
      const other = state.otherDay;
      const follows = other && state.day === 1 && action.patch.date !== undefined;
      if (!follows || (other.date && other.date !== nextDate(state.event.date))) return { ...state, event };
      return { ...state, event, otherDay: { ...other, date: nextDate(event.date) } };
    }
    case "print":
      return { ...state, print: { ...state.print, ...action.patch } };
    case "crew":
      return { ...state, crew: action.edit(state.crew, `c${state.nextId}`), nextId: state.nextId + 1 };
    case "addLogos": {
      let nextId = state.nextId;
      const added = action.logos.map((l) => ({ ...l, id: `l${nextId++}` }));
      return { ...state, logos: [...state.logos, ...added], nextId };
    }
    case "updateLogo": {
      const updated = state.logos.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l));
      // A logo moved to another place goes to the end of that place.
      const moved = updated.find((l) => l.id === action.id);
      const before = state.logos.find((l) => l.id === action.id);
      if (!moved || moved.place === before?.place) return { ...state, logos: updated };
      return { ...state, logos: [...updated.filter((l) => l.id !== action.id), moved] };
    }
    case "moveLogo":
      return { ...state, logos: moveWithinPlace(state.logos, action.id, action.by) };
    case "removeLogo":
      return { ...state, logos: state.logos.filter((l) => l.id !== action.id) };
    case "step":
      return { ...state, step: action.step };
    case "demo": {
      const loaded = loadSource({ ...initialState, settings: state.settings, event: action.event }, { filename: action.filename, table: action.table });
      return { ...generate(confirmMapping(loaded)), demo: true };
    }
    case "restore":
      return action.state;
    case "reset":
      return { ...initialState, settings: { ...initialState.settings, timeFormat: state.settings.timeFormat } };
  }
}

/** Swaps a logo with its neighbour in the same place (left to right). */
function moveWithinPlace(logos: Logo[], id: string, by: -1 | 1): Logo[] {
  const i = logos.findIndex((l) => l.id === id);
  if (i < 0) return logos;
  let j = i + by;
  while (j >= 0 && j < logos.length && logos[j].place !== logos[i].place) j += by;
  if (j < 0 || j >= logos.length) return logos;
  const out = [...logos];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Which steps the stepper can jump to. */
export function reachable(state: AppState, step: Step): boolean {
  switch (step) {
    case "start":
      return true;
    case "map":
      return !!state.source;
    case "data":
      return state.registrations.length > 0;
    case "list":
    case "final":
    case "officials":
      return state.entries.length > 0 || !!state.otherDay?.entries.length;
  }
}
