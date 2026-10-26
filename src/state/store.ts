import type { CompetitionType } from "~/lib/disciplines";
import type { Logo } from "~/lib/export/logos";
import { autoMap, dayLabels, hasStart2, selectStart, type Mapping } from "~/lib/import/columns";
import { detectCompetitionType, detectMaxStarts } from "~/lib/import/detect";
import type { NamedSheet, SheetTable } from "~/lib/import/file";
import { parseRows, type ParsedRow } from "~/lib/import/rows";
import { emptyRow, rowsFromImport, rowsToStarts, type RegRow } from "~/lib/registrations";
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

/**
 * All app state, in one reducer. Starts and times are derived: registrations
 * are the source of truth for athletes, `entries` hold only the order and
 * breaks, and schedule() computes every time.
 */

export type Step = "start" | "map" | "data" | "list" | "final";

export type Settings = StartListSettings & { timeFormat: TimeFormat };

export interface EventInfo {
  name: string;
  /** YYYY-MM-DD, or "" */
  date: string;
  location: string;
  notes: string;
}

export interface PrintOptions {
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

export interface AppState {
  step: Step;
  demo: boolean;
  source: Source | null;
  mapping: Mapping;
  /** Which day of a two-day form to build the list for. */
  use: 1 | 2;
  maxStarts: 1 | 2;
  registrations: RegRow[];
  /** importKey() of the file read that built `registrations`, so Continue on Columns re-reads only when it changed. */
  importedKey: string | null;
  /** Rows changed, added or deleted on Athletes since that read. */
  editedRows: string[];
  event: EventInfo;
  settings: Settings;
  entries: Entry[];
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
  use: 1,
  maxStarts: 1,
  registrations: [],
  importedKey: null,
  editedRows: [],
  event: { name: "", date: "", location: "", notes: "" },
  settings: { ...defaultSettings("POOL"), timeFormat: DEFAULT_TIME_FORMAT },
  entries: [],
  nextId: 1,
  manualOrder: false,
  print: { showWarmup: true, showCheckIn: true, showStartNumber: false, pageBreakAtBreaks: false },
  logos: [],
};

export type Action =
  | { type: "load"; filename: string; table: SheetTable; sheets?: NamedSheet[]; sheet?: string }
  | { type: "sheet"; name: string }
  | { type: "mapping"; mapping: Mapping }
  | { type: "use"; use: 1 | 2 }
  | { type: "competition"; competition: CompetitionType }
  | { type: "confirmMapping" }
  | { type: "updateRow"; id: string; patch: Partial<RegRow> }
  | { type: "addRow" }
  | { type: "blank" }
  | { type: "deleteRow"; id: string }
  | { type: "maxStarts"; maxStarts: 1 | 2 }
  | { type: "generate" }
  | { type: "append" }
  | { type: "settings"; settings: Settings }
  | { type: "entries"; edit: (entries: Entry[], newId: string) => Entry[] }
  | { type: "sortColumn"; column: ColumnKey; dir: "ASC" | "DESC" }
  | { type: "event"; patch: Partial<EventInfo> }
  | { type: "print"; patch: Partial<PrintOptions> }
  | { type: "addLogos"; logos: Omit<Logo, "id">[] }
  | { type: "updateLogo"; id: string; patch: Partial<Pick<Logo, "place" | "size">> }
  | { type: "moveLogo"; id: string; by: -1 | 1 }
  | { type: "removeLogo"; id: string }
  | { type: "step"; step: Step }
  | { type: "demo"; filename: string; table: SheetTable; event: EventInfo }
  | { type: "restore"; state: AppState }
  | { type: "reset" };

/**
 * A form with one section per day ("Day 1", "Day 2") is two start lists, so
 * one day is built at a time. Other two-start files stay two starts.
 */
export function dayImport(state: Pick<AppState, "source" | "mapping" | "use">) {
  const headers = state.source?.table.headers ?? [];
  const days = hasStart2(autoMap(headers)) ? dayLabels(headers) : null;
  return {
    days,
    mapping: days ? selectStart(state.mapping, state.use) : state.mapping,
    selectedLabel: days?.[state.use - 1],
  };
}

export function parsedRows(state: Pick<AppState, "source" | "mapping" | "use" | "settings">): ParsedRow[] {
  if (!state.source) return [];
  const { mapping, selectedLabel } = dayImport(state);
  return parseRows(state.source.table.rows, mapping, {
    type: state.settings.type,
    maxStarts: detectMaxStarts(mapping),
    selectedLabel,
  });
}

/** What a re-read of the file depends on: sheet, columns, day and competition type. */
export function importKey(state: Pick<AppState, "source" | "mapping" | "use" | "settings">): string | null {
  if (!state.source) return null;
  const { filename, sheet } = state.source;
  return JSON.stringify([filename, sheet ?? null, state.mapping, state.use, state.settings.type]);
}

const edited = (state: AppState, id: string) =>
  state.editedRows.includes(id) ? state.editedRows : [...state.editedRows, id];

export const startsOf = (state: Pick<AppState, "registrations" | "settings" | "maxStarts">) =>
  rowsToStarts(state.registrations, state.settings.type, state.maxStarts);

function withIds(nextId: number, list: EntryInput[]): { entries: Entry[]; nextId: number } {
  return { entries: list.map((e) => ({ ...e, id: String(nextId++) })), nextId };
}

/** New type: that type's ordering defaults, keeping the user's timing basics. */
function settingsForType(s: Settings, type: CompetitionType): Settings {
  if (s.type === type) return s;
  return { ...defaultSettings(type), startTime: s.startTime, timeFormat: s.timeFormat };
}

function loadSource(state: AppState, source: Source): AppState {
  const mapping = autoMap(source.table.headers);
  const day1 = dayImport({ source, mapping, use: 1 }).mapping;
  const type = detectCompetitionType(source.table.rows, day1);
  return {
    ...initialState,
    print: state.print,
    event: state.event,
    logos: state.logos,
    settings: { ...defaultSettings(type), startTime: state.settings.startTime, timeFormat: state.settings.timeFormat },
    step: "map",
    source,
    mapping,
  };
}

/** Re-reads the file only if the import changed, so edits on Athletes survive a look at Columns. */
function confirmMapping(state: AppState): AppState {
  const key = importKey(state);
  if (key === state.importedKey && state.registrations.length) return { ...state, step: "data" };
  const { mapping } = dayImport(state);
  const maxStarts = detectMaxStarts(mapping);
  const registrations = rowsFromImport(parsedRows(state), state.source?.table.rows ?? [], mapping, maxStarts);
  return { ...state, step: "data", maxStarts, registrations, importedKey: key, editedRows: [] };
}

function generate(state: AppState): AppState {
  const ids = withIds(state.nextId, generateEntries(startsOf(state), state.settings));
  return { ...state, step: "list", ...ids, manualOrder: false };
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
      const before = dayImport(state).mapping.s1Discipline;
      const after = dayImport(next).mapping.s1Discipline;
      if (before !== undefined || after === undefined || !state.source) return next;
      const type = detectCompetitionType(state.source.table.rows, dayImport(next).mapping);
      return { ...next, settings: settingsForType(state.settings, type) };
    }
    case "use":
      return { ...state, use: action.use };
    case "competition":
      return { ...state, settings: settingsForType(state.settings, action.competition) };
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
    case "event":
      return { ...state, event: { ...state.event, ...action.patch } };
    case "print":
      return { ...state, print: { ...state.print, ...action.patch } };
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
      const loaded = loadSource({ ...initialState, settings: state.settings }, { filename: action.filename, table: action.table });
      return { ...generate(confirmMapping(loaded)), demo: true, event: action.event };
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
      return state.entries.length > 0;
  }
}
