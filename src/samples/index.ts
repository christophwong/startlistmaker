import { parseCsv, type SheetTable } from "~/lib/import/file";
import type { EventInfo } from "~/state/store";

/**
 * Demo data: anonymized form exports (scripts/anonymize.mjs), bundled as
 * text and loaded on demand. Nothing is fetched over the network.
 */

export type SampleKind = "depth" | "pool";
/** Starts per athlete. For depth, 2 means a 2-day form (one dive a day). */
export type SampleStarts = 1 | 2;

export const SAMPLES: { kind: SampleKind; filename: string }[] = [
  { kind: "depth", filename: "sample-depth-2day.csv" },
  { kind: "pool", filename: "sample-pool.csv" },
];

/**
 * The 1-start demos are the same files cut before this column, where the
 * form's second start (or second day) begins.
 */
const START2_FROM: Record<SampleKind, string> = {
  depth: "Discipline | Day 2",
  pool: "Would you like a second start?",
};

const ONE_START_FILENAME: Record<SampleKind, string> = {
  depth: "sample-depth-1day.csv",
  pool: "sample-pool-1start.csv",
};

const notes = "Demo data: athletes are fictional.";
const EVENTS: Record<SampleKind, Record<SampleStarts, EventInfo>> = {
  depth: {
    1: { name: "Sample Depth Challenge", date: "2026-09-05", location: "Sample Cove", notes },
    2: { name: "Sample Depth Challenge · Day 1", date: "2026-09-05", location: "Sample Cove", notes },
  },
  pool: {
    1: { name: "Sample Pool Classic", date: "2026-04-04", location: "Sample Aquatic Centre", notes },
    2: { name: "Sample Pool Classic", date: "2026-04-04", location: "Sample Aquatic Centre", notes },
  },
};

function firstStartOnly(table: SheetTable, kind: SampleKind): SheetTable {
  const cut = table.headers.indexOf(START2_FROM[kind]);
  if (cut === -1) return table;
  return { headers: table.headers.slice(0, cut), rows: table.rows.map((r) => r.slice(0, cut)) };
}

/** `csv` is always the full sample file (it doubles as the downloadable template). */
export async function loadSample(
  kind: SampleKind,
  starts: SampleStarts = 2,
): Promise<{ filename: string; csv: string; table: SheetTable; event: EventInfo }> {
  const csv =
    kind === "depth" ? (await import("./depth-2day.csv?raw")).default : (await import("./pool.csv?raw")).default;
  const full = parseCsv(csv);
  const filename = starts === 2 ? SAMPLES.find((s) => s.kind === kind)!.filename : ONE_START_FILENAME[kind];
  return { filename, csv, table: starts === 2 ? full : firstStartOnly(full, kind), event: EVENTS[kind][starts] };
}
