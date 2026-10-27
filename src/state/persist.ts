import * as z from "zod/mini";
import { DEPTH_DISCIPLINES, POOL_DISCIPLINES } from "~/lib/disciplines";
import { LOGO_SRC, MAX_LOGO_PX, MAX_LOGO_SRC, MAX_LOGOS, MAX_LOGOS_TOTAL } from "~/lib/export/logos";
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
  scheduleMode: z.enum(["ROUNDS", "SINGLE"]),
  round2Order: z.enum(["SORTED", "ROUND1_ORDER"]),
  minRecoveryMin: int(0, 600),
  roundBreakMin: int(0, 600),
  halftimeBreakMin: int(0, 600),
  groupBy: z.enum(["DISCIPLINE", "MIXED"]),
  blockOrder: list(discipline, 8),
  genderOrder: z.enum(["NONE", "F_FIRST", "M_FIRST"]),
  sortBy: z.enum(["AP", "DIVE_TIME", "NAME", "REGISTRATION"]),
  sortDir: z.enum(["ASC", "DESC"]),
  timeFormat: z.enum(["24h", "12h"]),
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
    place: z.enum(["HEADER_LEFT", "HEADER_RIGHT", "SPONSORS"]),
    size: z.enum(["S", "M", "L"]),
  }),
  MAX_LOGOS,
).check(z.refine((l) => l.reduce((sum, x) => sum + x.src.length, 0) <= MAX_LOGOS_TOTAL));

const stateSchema = z.object({
  step: z.enum(["start", "map", "data", "list", "final"]),
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
  twoDay: z.boolean(),
  day,
  otherDay: z.nullable(z.object({ settings, entries, manualOrder: z.boolean(), date: str(20) })),
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
  settings,
  entries,
  nextId: int(1, Number.MAX_SAFE_INTEGER),
  manualOrder: z.boolean(),
  print: z.object({
    sheet: z.enum(["ATHLETES", "JUDGES", "RESULTS"]),
    showWarmup: z.boolean(),
    showCheckIn: z.boolean(),
    showStartNumber: z.boolean(),
    pageBreakAtBreaks: z.boolean(),
  }),
  logos,
});

/** Fills fields added in later versions with defaults, then validates. */
export function parseState(value: unknown): AppState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<AppState>;
  const merged = {
    ...initialState,
    ...v,
    event: { ...initialState.event, ...v.event },
    settings: { ...initialState.settings, ...v.settings },
    print: { ...initialState.print, ...v.print },
  };
  // Saved before imports were tracked: treat the athletes as read with the current columns, so Continue keeps them.
  if (v.importedKey === undefined && merged.registrations.length) merged.importedKey = importKey(merged);
  const result = stateSchema.safeParse(merged);
  if (!result.success) return null;
  const state = result.data as AppState;
  // Saved when a two-day form was built one day at a time: open it with both days.
  if (v.twoDay !== undefined || !formDays(state.source)) return state;
  if (!state.registrations.length) {
    return { ...state, twoDay: true, otherDay: { settings: state.settings, entries: [], manualOrder: false, date: "" } };
  }
  const use = (value as { use?: unknown }).use === 2 ? 2 : 1;
  const upgraded = stateSchema.safeParse(upgradeOneDaySave(state, use));
  return upgraded.success ? (upgraded.data as AppState) : null;
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
    const json = state.step === "start" && !state.source && !state.registrations.length ? null : JSON.stringify(state);
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

export function toProjectJson(state: AppState): string {
  return JSON.stringify({ app: PROJECT_APP, version: PROJECT_VERSION, savedAt: new Date().toISOString(), state }, null, 1);
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
  return { ...state, step: hasList ? "list" : state.registrations.length ? "data" : "start" };
}
