import type { CompetitionType } from "~/lib/disciplines";
import type { Logo } from "~/lib/export/logos";
import { emptyCrew, type Crew } from "~/lib/export/crew";
import type { SheetKind } from "~/lib/export/table";
import { autoMap, dayLabels, hasStart2, missingRequired, selectStart, type FieldKey, type Mapping } from "~/lib/import/columns";
import { detectCompetitionType, detectMaxStarts } from "~/lib/import/detect";
import type { NamedSheet, SheetTable } from "~/lib/import/file";
import { inferColumns, suggestEventName } from "~/lib/import/infer";
import { parseRows, type ParsedRow } from "~/lib/import/rows";
import {
  checkRows,
  emptyRow,
  emptyStart,
  onList,
  removeStart,
  rowsFromDays,
  rowsFromImport,
  rowsToStarts,
  type Day,
  type RegRow,
  type RowCheck,
} from "~/lib/registrations";
import {
  defaultSettings,
  DEFAULT_TIME_FORMAT,
  generateEntries,
  schedule,
  sortEntriesBy,
  unscheduledEntries,
  type ColumnKey,
  type Entry,
  type EntryInput,
  type StartListSettings,
} from "~/lib/startlist";
import { formatClock, type TimeFormat } from "~/lib/time";

export type { Day };

/**
 * All app state, in one reducer. Starts and times are derived: registrations
 * are the source of truth for athletes, `entries` hold only the order and
 * breaks, and schedule() computes every time.
 *
 * A file goes straight to a start list: it's read, its columns matched, and
 * each day's list built in one step. Columns, athletes and order can all be
 * changed afterwards, and the changes that move starts around can be undone.
 */

/** "officials" is a screen inside Print & export (judge and safety names), not a tab. */
export type Step = "start" | "data" | "list" | "final" | "officials";

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

/** What just happened, shown in a toast; `undo` offers to take it back. */
export interface Notice {
  text: string;
  undo: boolean;
}

export interface AppState {
  step: Step;
  demo: boolean;
  source: Source | null;
  mapping: Mapping;
  /** Fields whose column was found by its values, not its header. */
  inferred: FieldKey[];
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
  /** importKey() of the file read that built `registrations`. */
  importedKey: string | null;
  /** Rows changed, added or deleted by hand since the file was read; a re-read keeps them as they are. */
  editedRows: string[];
  event: EventInfo;
  /** The event name was taken from the file name and hasn't been edited. */
  nameFromFile: boolean;
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
  /** States before each undoable change, newest last. Not saved. */
  history: AppState[];
  /** Not saved. */
  notice: Notice | null;
}

export const initialState: AppState = {
  step: "start",
  demo: false,
  source: null,
  mapping: {},
  inferred: [],
  twoDay: false,
  day: 1,
  otherDay: null,
  maxStarts: 1,
  registrations: [],
  importedKey: null,
  editedRows: [],
  event: { name: "", date: "", location: "", notes: "" },
  nameFromFile: false,
  settings: { ...defaultSettings("POOL"), timeFormat: DEFAULT_TIME_FORMAT },
  entries: [],
  crew: emptyCrew(),
  nextId: 1,
  manualOrder: false,
  print: { sheet: "ATHLETES", showWarmup: true, showCheckIn: true, showStartNumber: false, pageBreakAtBreaks: false },
  logos: [],
  history: [],
  notice: null,
};

export type Action =
  | { type: "load"; filename: string; table: SheetTable; sheets?: NamedSheet[]; sheet?: string }
  | { type: "sheet"; name: string }
  /** Columns changed: the file is read again and the lists follow. */
  | { type: "mapping"; mapping: Mapping }
  | { type: "day"; day: Day }
  | { type: "competition"; competition: CompetitionType }
  | { type: "updateRow"; id: string; patch: Partial<RegRow> }
  | { type: "addRow" }
  | { type: "blank" }
  | { type: "deleteRow"; id: string }
  | { type: "removeStart"; startId: string }
  /** A fixed athlete from "Not on the list" goes on the shown day's list. */
  | { type: "place"; rowId: string }
  /** Left off the shown day's list. */
  | { type: "leaveOff"; rowId: string }
  /** AP typed on the start list; the start keeps its place until a re-sort. */
  | { type: "editAp"; startId: string; ap: string }
  | { type: "maxStarts"; maxStarts: 1 | 2 }
  /** Sort the shown day's list again, with new settings when given. */
  | { type: "generate"; settings?: Settings }
  | { type: "append" }
  /** Timing settings: times change, the order doesn't. */
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
  | { type: "undo" }
  | { type: "dismiss" }
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

/** What a read of the file depends on: sheet, columns and competition type. */
export function importKey(state: Pick<AppState, "source" | "mapping" | "settings">): string | null {
  if (!state.source) return null;
  const { filename, sheet } = state.source;
  return JSON.stringify([filename, sheet ?? null, state.mapping, state.settings.type]);
}

export interface MissingColumn {
  key: FieldKey;
  /** The field as the user sees it: "Day 2 discipline" on a two-day form. */
  label: string;
}

/** Required fields with no column. While any is missing, no list can be built. */
export function missingColumns(state: Pick<AppState, "source" | "mapping">): MissingColumn[] {
  if (!state.source) return [];
  const days = formDays(state.source);
  // "Name", "Discipline", "AP"; "Day 2 discipline" on a two-day form.
  const short = (key: FieldKey, label: string) => (key === "fullName" ? "Name" : label.replace("Start 1 – ", ""));
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!days) return missingRequired(state.mapping).map((f) => ({ key: f.key, label: capital(short(f.key, f.label)) }));
  return ([1, 2] as const).flatMap((d) =>
    missingRequired(dayMapping(state, d)).map((f) => ({
      // A day's own column: start 1's field read through selectStart is that day's.
      key: f.key.startsWith("s1") ? (f.key.replace("s1", `s${d}`) as FieldKey) : f.key,
      label: f.key.startsWith("s1") ? `${days[d - 1]} ${short(f.key, f.label)}` : capital(short(f.key, f.label)),
    })),
  ).filter((f, i, all) => all.findIndex((g) => g.key === f.key) === i);
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

/** `fn` on the shown day, then on the other day of a two-day form. */
function eachDay(state: AppState, fn: (s: AppState) => AppState): AppState {
  const shown = fn(state);
  if (!shown.otherDay) return shown;
  return switchDay(fn(switchDay(shown, otherOf(state.day))), state.day);
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
  const found = inferColumns(source.table.headers, source.table.rows, autoMap(source.table.headers));
  const type = detectCompetitionType(source.table.rows, found.mapping);
  const settings = { ...defaultSettings(type), startTime: state.settings.startTime, timeFormat: state.settings.timeFormat };
  const twoDay = !!formDays(source);
  // The name from the file, unless the user named the event (kept across uploads).
  const suggested = !state.event.name || state.nameFromFile ? suggestEventName(source.filename) : "";
  return {
    ...initialState,
    print: state.print,
    event: suggested ? { ...state.event, name: suggested } : state.event,
    nameFromFile: !!suggested || (state.nameFromFile && !state.event.name),
    logos: state.logos,
    settings,
    twoDay,
    otherDay: twoDay ? { settings, entries: [], manualOrder: false, date: nextDate(state.event.date), crew: emptyCrew() } : null,
    step: "list",
    source,
    mapping: found.mapping,
    inferred: found.inferred,
  };
}

/**
 * Reads the file into athletes. Rows edited by hand keep their edits, rows
 * deleted by hand stay deleted, and athletes added by hand stay.
 */
function readFile(state: AppState): AppState {
  const table = state.source?.table.rows ?? [];
  const maxStarts = state.twoDay ? 1 : detectMaxStarts(state.mapping);
  const read = state.twoDay
    ? rowsFromDays([parsedRows(state, 1), parsedRows(state, 2)], table, [dayMapping(state, 1), dayMapping(state, 2)])
    : rowsFromImport(parsedRows(state), table, state.mapping, maxStarts);
  const byHand = new Set(state.editedRows);
  const before = new Map(state.registrations.map((r) => [r.id, r]));
  const registrations = [
    ...read.filter((r) => !byHand.has(r.id) || before.has(r.id)).map((r) => (byHand.has(r.id) ? before.get(r.id)! : r)),
    ...state.registrations.filter((r) => byHand.has(r.id) && r.rowNumber === null),
  ];
  return { ...state, maxStarts, registrations, importedKey: importKey(state) };
}

/** The shown day's list sorted from scratch. */
function generateDay(state: AppState): AppState {
  const ids = withIds(state.nextId, generateEntries(startsOf(state), state.settings));
  return { ...state, ...ids, manualOrder: false };
}

/** Starts not on the shown day's list yet go at the end. */
function appendDay(state: AppState): AppState {
  const scheduled = state.entries.map((e) => (e.kind === "START" ? e.startId : null));
  const added = withIds(state.nextId, unscheduledEntries(scheduled, startsOf(state), state.settings));
  if (!added.entries.length) return state;
  return { ...state, entries: [...state.entries, ...added.entries], nextId: added.nextId };
}

/** Sorted again, unless the order was changed by hand: then new starts go at the end. */
const placeDay = (state: AppState) => (state.manualOrder && state.entries.length ? appendDay(state) : generateDay(state));

/** Reads the file and builds every day's list, once every required column is known. */
function build(state: AppState): AppState {
  if (!state.source || missingColumns(state).length) return state;
  return eachDay(readFile(state), placeDay);
}

export interface WaitingRow {
  row: RegRow;
  check: RowCheck;
  /** Nothing to fix: its starts can go on the list. */
  ready: boolean;
}

/**
 * Athletes on the shown day who aren't on its list: their data has an error,
 * or they were fixed or added after the list was built. Not while there's no
 * list yet.
 */
export function notOnList(state: AppState): WaitingRow[] {
  if (!state.entries.length) return [];
  const day = state.twoDay ? state.day : undefined;
  const checks = checkRows(state.registrations, state.settings.type, state.maxStarts, day);
  const listed = new Set(state.entries.flatMap((e) => (e.kind === "START" ? [e.startId] : [])));
  return state.registrations.flatMap((row) => {
    const check = checks.get(row.id)!;
    if (!onList(row, day) || check.notEntered) return [];
    const ready = !Object.keys(check.errors).length;
    const waiting = check.starts.some((s) => !listed.has(s.id));
    return !ready || waiting ? [{ row, check, ready }] : [];
  });
}

/** Position and OT of a start on the shown day's list, as the list shows it. */
function slotOf(state: AppState, startId: string): { n: number; ot: number } | null {
  const byId = new Map(startsOf(state).map((s) => [s.id, s]));
  const live = state.entries.filter((e) => e.kind === "BREAK" || byId.has(e.startId));
  const rows = schedule(live, byId, state.settings).filter((r) => r.kind === "START");
  const i = rows.findIndex((r) => r.start.id === startId);
  return i < 0 ? null : { n: i + 1, ot: rows[i].ot };
}

const rowName = (row: RegRow | undefined) => `${row?.firstName ?? ""} ${row?.lastName ?? ""}`.trim() || "The athlete";
const dayWord = (state: AppState) => (state.twoDay ? `the Day ${state.day} list` : "the list");

/** A fixed athlete's starts go where they belong on the shown day, or at the end of a list ordered by hand. */
function place(state: AppState, rowId: string): AppState {
  const ids = startsOf(state).filter((s) => s.athleteId === rowId).map((s) => s.id);
  if (!ids.length) return state;
  const next = placeDay(state);
  const slot = slotOf(next, ids[0]);
  const name = rowName(state.registrations.find((r) => r.id === rowId));
  const where = slot ? ` at #${slot.n}, OT ${formatClock(slot.ot, state.settings.timeFormat)}` : "";
  return { ...next, notice: { text: `${name} added${where}.`, undo: true } };
}

function leaveOff(state: AppState, rowId: string): AppState {
  const row = state.registrations.find((r) => r.id === rowId);
  if (!row) return state;
  const patch: Partial<RegRow> = state.twoDay
    ? { dayOff: state.day === 1 ? [true, !!row.dayOff?.[1]] : [!!row.dayOff?.[0], true] }
    : { excluded: true };
  return {
    ...state,
    registrations: state.registrations.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    editedRows: edited(state, rowId),
    notice: { text: `${rowName(row)} is off ${dayWord(state)}.`, undo: true },
  };
}

function editAp(state: AppState, startId: string, ap: string): AppState {
  const [, id, n] = /^(.+)-s([12])$/.exec(startId) ?? [];
  const row = state.registrations.find((r) => r.id === id);
  if (!row) return state;
  const starts: RegRow["starts"] = [...row.starts];
  starts[Number(n) - 1] = { ...starts[Number(n) - 1], ap };
  const unit = /:/.test(ap) ? "" : " m";
  return {
    ...state,
    registrations: state.registrations.map((r) => (r.id === id ? { ...r, starts } : r)),
    editedRows: edited(state, row.id),
    // The order no longer follows the sort: Re-sort list shows it.
    manualOrder: true,
    notice: { text: `${rowName(row)}: AP ${ap}${unit}. Their place stays until you re-sort.`, undo: true },
  };
}

/**
 * A save from when a two-day form was built one day at a time (`use`): the
 * saved day keeps its athlete edits, order and breaks, and the other day is
 * read from the file and generated.
 */
export function upgradeOneDaySave(state: AppState, use: Day): AppState {
  const fresh = readFile({ ...state, twoDay: true, importedKey: null, otherDay: null, registrations: [], editedRows: [] });
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

function apply(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "load": {
      const loaded = loadSource(state, {
        filename: action.filename,
        table: action.table,
        sheets: action.sheets,
        sheet: action.sheet,
      });
      const built = build(loaded);
      const n = action.table.rows.length;
      const rows = `Read ${n} row${n === 1 ? "" : "s"}`;
      const missing = missingColumns(built).length;
      const text = !n
        ? "The file has no rows."
        : missing
          ? `${rows}. One question before the start list.`
          : `${rows}: ${built.registrations.length} athletes${built.twoDay ? ", 2 days" : ""}. ${built.twoDay ? "Start lists" : "Start list"} built.`;
      return { ...built, notice: { text, undo: false } };
    }
    case "sheet": {
      const sheet = state.source?.sheets?.find((s) => s.name === action.name);
      if (!state.source || !sheet) return state;
      return build(loadSource(state, { ...state.source, table: sheet.table, sheet: sheet.name }));
    }
    case "mapping": {
      // A column picked by hand isn't "matched by its values" any more.
      const inferred = state.inferred.filter((k) => action.mapping[k] === state.mapping[k]);
      let next: AppState = { ...state, mapping: action.mapping, inferred };
      const discipline = (m: Mapping) => [m.s1Discipline, m.s2Discipline].join();
      if (state.source && discipline(action.mapping) !== discipline(state.mapping)) {
        next = withType(next, detectCompetitionType(state.source.table.rows, action.mapping));
      }
      const wasMissing = missingColumns(state).length > 0;
      const built = build(next);
      if (wasMissing && built !== next) {
        const starts = eachDayStarts(built);
        return { ...built, notice: { text: `Start list built: ${starts} starts.`, undo: false } };
      }
      return built;
    }
    case "day":
      return switchDay(state, action.day);
    case "competition": {
      // New ordering defaults: both days are sorted again.
      const typed = withType(state, action.competition);
      const fresh = eachDay(typed, (s) => ({ ...s, manualOrder: false }));
      const built = build(fresh);
      return { ...built, notice: { text: `Now a ${action.competition === "POOL" ? "pool" : "depth"} competition. Lists sorted again.`, undo: true } };
    }
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
    case "deleteRow": {
      const row = state.registrations.find((r) => r.id === action.id);
      return {
        ...state,
        registrations: state.registrations.filter((r) => r.id !== action.id),
        editedRows: edited(state, action.id),
        notice: { text: `${rowName(row)} deleted.`, undo: true },
      };
    }
    case "removeStart": {
      // Only the registration changes: its entry is skipped while the start is
      // off the list, and comes back in the same place when it's put back.
      const [, id, n] = /^(.+)-s([12])$/.exec(action.startId) ?? [];
      if (!id) return state;
      const day = state.twoDay ? state.day : undefined;
      const row = state.registrations.find((r) => r.id === id);
      return {
        ...state,
        registrations: state.registrations.map((r) =>
          r.id === id ? removeStart(r, Number(n) as 1 | 2, state.settings.type, state.maxStarts, day) : r,
        ),
        editedRows: edited(state, id),
        notice: { text: `${rowName(row)}: start off ${dayWord(state)}. Put it back on Athletes.`, undo: true },
      };
    }
    case "place":
      return place(state, action.rowId);
    case "leaveOff":
      return leaveOff(state, action.rowId);
    case "editAp":
      return editAp(state, action.startId, action.ap);
    case "maxStarts":
      return { ...state, maxStarts: action.maxStarts };
    case "generate": {
      const next = generateDay(action.settings ? { ...state, settings: action.settings } : state);
      return { ...next, notice: { text: "List sorted again.", undo: state.entries.length > 0 } };
    }
    case "append": {
      const next = appendDay(state);
      const n = next.entries.length - state.entries.length;
      return { ...next, notice: { text: `${n} start${n === 1 ? "" : "s"} added at the end.`, undo: true } };
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
        notice: { text: "Sorted between breaks.", undo: true },
      };
    }
    case "event": {
      const event = { ...state.event, ...action.patch };
      const nameFromFile = action.patch.name === undefined && state.nameFromFile;
      // Day 2 is the day after Day 1 until it's given a date of its own.
      const other = state.otherDay;
      const follows = other && state.day === 1 && action.patch.date !== undefined;
      if (!follows || (other.date && other.date !== nextDate(state.event.date))) return { ...state, event, nameFromFile };
      return { ...state, event, nameFromFile, otherDay: { ...other, date: nextDate(event.date) } };
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
      return { ...build({ ...loaded, nameFromFile: false }), demo: true };
    }
    case "restore":
      return { ...action.state, history: [], notice: null };
    case "dismiss":
      return state.notice ? { ...state, notice: null } : state;
    case "undo":
    case "reset":
      return state;
  }
}

const eachDayStarts = (state: AppState) =>
  ([1, 2] as const).slice(0, state.twoDay ? 2 : 1).reduce((n, d) => n + startsOf({ ...state, day: d }).length, 0);

/** Changes that move starts around (or rebuild the lists): they can be undone. */
const UNDOABLE = new Set<Action["type"]>([
  "mapping",
  "competition",
  "deleteRow",
  "removeStart",
  "place",
  "leaveOff",
  "editAp",
  "generate",
  "append",
  "sortColumn",
]);
/** These leave the undo history alone; any other change ends it, so Undo can't skip over newer work. */
const NEUTRAL = new Set<Action["type"]>(["step", "print", "dismiss", "event", "addLogos", "updateLogo", "moveLogo", "removeLogo"]);
const MAX_HISTORY = 20;

export function reducer(state: AppState, action: Action): AppState {
  if (action.type === "reset") {
    return { ...initialState, settings: { ...initialState.settings, timeFormat: state.settings.timeFormat } };
  }
  if (action.type === "undo") {
    const prev = state.history.at(-1);
    if (!prev) return state;
    const history = state.history.slice(0, -1);
    // The screen, event details, sheet options and logos stay as they are; the rest is as it was.
    const { step, event, nameFromFile, print, logos } = state;
    return { ...prev, step, event, nameFromFile, print, logos, history, notice: { text: "Undone.", undo: history.length > 0 } };
  }
  const next = apply(state, action);
  if (next === state) return state;
  if (UNDOABLE.has(action.type)) {
    const snapshot = { ...state, history: [], notice: null };
    const notice = next.notice !== state.notice ? next.notice : { text: "Done.", undo: true };
    return { ...next, history: [...state.history, snapshot].slice(-MAX_HISTORY), notice };
  }
  if (NEUTRAL.has(action.type)) return next;
  // Loading a file keeps its "read N rows" notice; anything else clears an old one.
  return { ...next, history: [], notice: next.notice !== state.notice ? next.notice : null };
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

/** Which tabs can be opened. */
export function reachable(state: AppState, step: Step): boolean {
  switch (step) {
    case "start":
      return true;
    case "data":
    case "list":
      return !!state.source || state.registrations.length > 0;
    case "final":
    case "officials":
      return state.entries.length > 0 || !!state.otherDay?.entries.length;
  }
}
