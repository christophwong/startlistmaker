import * as z from "zod/mini";
import { DEPTH_DISCIPLINES, POOL_DISCIPLINES } from "~/lib/disciplines";
import { emptyCrew, MAX_NAME } from "~/lib/export/crew";
import {
  defaultSheets,
  LEGACY_SCALE,
  LOGO_SRC,
  MAX_LOGO_PX,
  MAX_LOGO_SRC,
  MAX_LOGOS,
  MAX_LOGOS_TOTAL,
  MAX_SCALE,
  MIN_SCALE,
  type Logo,
} from "~/lib/export/logos";
import { downloadText } from "~/lib/export/files";
import { fileBase, MAX_HEADER } from "~/lib/export/table";
import { FIELD_KEYS, type FieldKey } from "~/lib/import/columns";
import { MAX_ROWS } from "~/lib/import/file";
import { THEME_KEY } from "~/theme";
import { formDays, importKey, initialState, upgradeOneDaySave, type AppState } from "./store";

/**
 * Session persistence and project files. Everything stays in this browser:
 * sessionStorage by default (gone when the tab closes), localStorage only
 * when the user ticks "Remember on this device". Anything read back, from
 * storage or a project file, is validated before it becomes state.
 */

const STATE_KEY = "startlistmaker.state.v1";
const REMEMBER_KEY = "startlistmaker.remember";
export const PROJECT_APP = "startlistmaker";
/** 2: two-day forms keep both days (older versions can't open these). */
export const PROJECT_VERSION = 2;

const str = (max = 500) => z.string().check(z.maxLength(max));
const int = (min: number, max: number) => z.int().check(z.minimum(min), z.maximum(max));
const list = <T extends z.core.SomeType>(item: T, max: number) => z.array(item).check(z.maxLength(max));
const discipline = z.enum([...POOL_DISCIPLINES, ...DEPTH_DISCIPLINES]);
const sheetKind = z.enum(["ATHLETES", "JUDGES", "SAFETY", "RESULTS"]);
const table = z.object({
  headers: list(str(), 200),
  rows: list(list(str(5000), 200), MAX_ROWS),
});
const regStart = z.object({ discipline: str(), ap: str(), pb: str(), diveTime: str() });
const settings = z.object({
  type: z.enum(["POOL", "DEPTH"]),
  startTime: int(0, 24 * 60 - 1),
  spacingMode: z.enum(["FIXED", "DIVE_TIME"]),
  intervalMin: int(1, 120),
  staIntervalMin: int(1, 120),
  bufferMin: int(0, 60),
  roundToMin: int(1, 30),
  lanes: int(1, 10),
  staLanes: int(1, 10),
  firstLane: int(1, 10),
  staFirstLane: int(1, 10),
  scheduleMode: z.enum(["ROUNDS", "SINGLE"]),
  round2Order: z.enum(["SORTED", "ROUND1_ORDER"]),
  minRecoveryMin: int(0, 600),
  roundBreakMin: int(0, 600),
  halftimeBreakMin: int(0, 600),
  groupBy: z.enum(["DISCIPLINE", "MIXED"]),
  blockOrder: list(discipline, 8),
  genderOrder: z.enum(["NONE", "F_FIRST", "M_FIRST"]),
  sortBy: z.enum(["AP", "PB", "DIVE_TIME", "NAME", "REGISTRATION"]),
  sortDir: z.enum(["ASC", "DESC", "VALLEY", "HILL", "ALTERNATE"]),
  timeFormat: z.enum(["24h", "12h"]),
  countryFormat: z.enum(["CODE", "NAME"]),
});
const entries = list(
  z.union([
    z.object({ id: str(40), kind: z.literal("START"), startId: str(50) }),
    z.object({
      id: str(40),
      kind: z.literal("BREAK"),
      breakMin: z.nullable(int(0, 600)),
      resumeAt: z.nullable(int(0, 24 * 60 - 1)),
    }),
  ]),
  MAX_ROWS * 3,
);
const day = z.union([z.literal(1), z.literal(2)]);
// Only PNG/JPEG data URLs (what the app itself writes), bounded per logo and in total.
const logos = list(
  z.object({
    id: str(40),
    name: str(200),
    src: z.string().check(z.maxLength(MAX_LOGO_SRC), z.regex(LOGO_SRC)),
    width: int(1, MAX_LOGO_PX),
    height: int(1, MAX_LOGO_PX),
    place: z.enum(["HEADER_LEFT", "HEADER_RIGHT", "TOP", "SPONSORS"]),
    scale: int(MIN_SCALE, MAX_SCALE),
    sheets: list(sheetKind, 4),
  }),
  MAX_LOGOS,
).check(z.refine((l) => l.reduce((sum, x) => sum + x.src.length, 0) <= MAX_LOGOS_TOTAL));

// Judge and safety names: plain text, bounded per name and in count.
const name = z.optional(str(MAX_NAME));
const slots = <T extends z.core.SomeType>(key: RegExp, value: T) =>
  z.record(z.string().check(z.regex(key)), value).check(z.refine((r) => Object.keys(r).length <= MAX_ROWS * 4));
// A sheet's renamed and hidden columns, by column id.
const sheetColumns = z.optional(
  z
    .record(z.string().check(z.regex(/^[A-Za-z0-9]{1,20}$/)), z.object({ label: z.optional(str(MAX_HEADER)), hidden: z.optional(z.boolean()) }))
    .check(z.refine((r) => Object.keys(r).length <= 40)),
);
const crew = z.object({
  zone: slots(/^\d{1,5}:\d{1,2}$/, z.object({ judge: name, safety: name })),
  group: slots(/^\d{1,5}$/, z.object({ deck: name, warmUp: name })),
  sections: list(z.object({ id: str(40), beforeGroup: int(1, MAX_ROWS * 2), label: str(MAX_NAME), note: str(MAX_NAME) }), 200),
  shape: z.nullable(z.object({ groups: int(0, MAX_ROWS * 2), lanes: int(1, 10) })),
});

const fieldKey = z.enum(FIELD_KEYS as [FieldKey, ...FieldKey[]]);

const stateSchema = z.object({
  step: z.enum(["start", "data", "list", "final", "officials"]),
  demo: z.boolean(),
  source: z.nullable(
    z.object({
      filename: str(),
      table,
      sheets: z.optional(list(z.object({ name: str(), table }), 50)),
      sheet: z.optional(str()),
    }),
  ),
  mapping: z.record(z.string(), int(0, 199)),
  inferred: list(fieldKey, FIELD_KEYS.length),
  twoDay: z.boolean(),
  day,
  otherDay: z.nullable(z.object({ settings, entries, manualOrder: z.boolean(), date: str(20), crew })),
  maxStarts: z.union([z.literal(1), z.literal(2)]),
  registrations: list(
    z.object({
      id: str(40),
      rowNumber: z.nullable(int(0, MAX_ROWS + 1)),
      firstName: str(),
      lastName: str(),
      gender: str(),
      country: str(),
      email: str(),
      starts: z.tuple([regStart, regStart]),
      excluded: z.boolean(),
      dayOff: z.optional(z.tuple([z.boolean(), z.boolean()])),
      startOff: z.optional(z.tuple([z.boolean(), z.boolean()])),
    }),
    MAX_ROWS,
  ),
  importedKey: z.nullable(str(20000)),
  editedRows: list(str(40), MAX_ROWS * 2),
  event: z.object({ name: str(), date: str(20), location: str(), notes: str(2000) }),
  nameFromFile: z.boolean(),
  settings,
  entries,
  crew,
  nextId: int(1, Number.MAX_SAFE_INTEGER),
  manualOrder: z.boolean(),
  print: z.object({
    sheet: sheetKind,
    showWarmup: z.boolean(),
    showCheckIn: z.boolean(),
    showStartNumber: z.boolean(),
    pageBreakAtBreaks: z.boolean(),
    columns: z.object({ ATHLETES: sheetColumns, JUDGES: sheetColumns, SAFETY: sheetColumns, RESULTS: sheetColumns }),
    yardGuide: z.object({
      sheets: list(sheetKind, 4),
      place: z.enum(["HEADER", "AFTER"]),
      lengthYd: int(10, 100),
      upToYd: z.nullable(int(10, 5000)),
    }),
  }),
  logos,
});

/** A logo saved with an S/M/L size and no sheets prints as it did then. */
function upgradeLogo(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const { size, ...logo } = raw as Partial<Logo> & { size?: unknown };
  const legacy = typeof size === "string" && size in LEGACY_SCALE ? LEGACY_SCALE[size as keyof typeof LEGACY_SCALE] : 100;
  return {
    ...logo,
    scale: logo.scale ?? legacy,
    sheets: logo.sheets ?? (logo.place ? defaultSheets(logo.place) : undefined),
  };
}

/** Fills fields added in later versions with defaults, then validates. */
export function parseState(value: unknown): AppState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<AppState>;
  const merged = {
    ...initialState,
    ...v,
    // Saved when Columns was a step of its own: the start list shows the same.
    step: (v.step as string) === "map" ? "list" : v.step ?? initialState.step,
    event: { ...initialState.event, ...v.event },
    settings: { ...initialState.settings, ...v.settings },
    print: { ...initialState.print, ...v.print },
    logos: Array.isArray(v.logos) ? v.logos.map(upgradeLogo) : (v.logos ?? initialState.logos),
    // Saved before judge and safety names, or before later settings (country format, first lanes).
    otherDay: v.otherDay
      ? {
          ...v.otherDay,
          settings: { ...initialState.settings, ...v.otherDay.settings },
          crew: v.otherDay.crew ?? emptyCrew(),
        }
      : null,
  };
  // Saved before imports were tracked: treat the athletes as read with the current columns, so Continue keeps them.
  if (v.importedKey === undefined && merged.registrations.length) merged.importedKey = importKey(merged);
  const result = stateSchema.safeParse(merged);
  if (!result.success) return null;
  // Undo history and the last notice belong to the session that made them.
  const state = { ...result.data, history: [], notice: null } as AppState;
  // Saved when a two-day form was built one day at a time: open it with both days.
  if (v.twoDay !== undefined || !formDays(state.source)) return state;
  if (!state.registrations.length) {
    return {
      ...state,
      twoDay: true,
      otherDay: { settings: state.settings, entries: [], manualOrder: false, date: "", crew: emptyCrew() },
    };
  }
  const use = (value as { use?: unknown }).use === 2 ? 2 : 1;
  const upgraded = stateSchema.safeParse(upgradeOneDaySave(state, use));
  return upgraded.success ? ({ ...upgraded.data, history: [], notice: null } as AppState) : null;
}

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getRemember(): boolean {
  try {
    return storage("local")?.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRemember(remember: boolean, state: AppState) {
  try {
    const local = storage("local");
    if (remember) local?.setItem(REMEMBER_KEY, "1");
    else {
      local?.removeItem(REMEMBER_KEY);
      local?.removeItem(STATE_KEY);
    }
    saveState(state, remember);
  } catch {
    // Storage blocked: the app still works for this page load.
  }
}

export function loadState(): AppState | null {
  for (const kind of ["session", "local"] as const) {
    try {
      const raw = storage(kind)?.getItem(STATE_KEY);
      const state = raw ? parseState(JSON.parse(raw)) : null;
      if (state) return state;
    } catch {
      // Unreadable or blocked: try the next one.
    }
  }
  return null;
}

export function saveState(state: AppState, remember: boolean) {
  try {
    const json = state.step === "start" && !state.source && !state.registrations.length ? null : JSON.stringify(stored(state));
    for (const kind of ["session", "local"] as const) {
      const s = storage(kind);
      if (!s) continue;
      if (json && (kind === "session" || remember)) s.setItem(STATE_KEY, json);
      else s.removeItem(STATE_KEY);
    }
  } catch {
    // Quota exceeded or blocked: nothing is lost until the tab closes.
  }
}

/** Removes everything this app stored in the browser. */
export function clearStorage() {
  for (const kind of ["session", "local"] as const) {
    try {
      storage(kind)?.removeItem(STATE_KEY);
      storage(kind)?.removeItem(REMEMBER_KEY);
      storage(kind)?.removeItem(THEME_KEY);
    } catch {
      // ignore
    }
  }
}

/** What's kept: everything but the undo history and the toast. */
const stored = ({ history: _h, notice: _n, ...rest }: AppState) => rest;

export function toProjectJson(state: AppState): string {
  return JSON.stringify({ app: PROJECT_APP, version: PROJECT_VERSION, savedAt: new Date().toISOString(), state: stored(state) }, null, 1);
}

/** Save project: downloads the state as `<event name>.startlist.json`. */
export function downloadProject(state: AppState) {
  const name = state.event.name || state.source?.filename.replace(/\.[^.]+$/, "") || "start-list";
  downloadText(`${fileBase(name)}.startlist.json`, toProjectJson(state), "application/json");
}

export class ProjectError extends Error {}

export function fromProjectJson(text: string): AppState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectError("This isn't a Start List Maker project file (not JSON).");
  }
  const d = data as { app?: unknown; version?: unknown; state?: unknown };
  if (d?.app !== PROJECT_APP) throw new ProjectError("This isn't a Start List Maker project file.");
  if (typeof d.version !== "number" || d.version > PROJECT_VERSION) {
    throw new ProjectError("This project was saved by a newer version. Reload the page and try again.");
  }
  const state = parseState(d.state);
  if (!state) throw new ProjectError("The project file is damaged or incomplete.");
  const hasList = state.entries.length || state.otherDay?.entries.length;
  return { ...state, step: hasList || state.source ? "list" : state.registrations.length ? "data" : "start" };
}
