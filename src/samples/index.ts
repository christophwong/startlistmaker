import { parseCsv, type SheetTable } from "~/lib/import/file";
import type { EventInfo } from "~/state/store";

/**
 * Demo data: anonymized form exports (scripts/anonymize.mjs), bundled as
 * text and loaded on demand. Nothing is fetched over the network.
 */

export type SampleKind = "depth" | "pool";

export const SAMPLES: { kind: SampleKind; label: string; filename: string }[] = [
  { kind: "depth", label: "Depth competition (2-day form)", filename: "sample-depth-2day.csv" },
  { kind: "pool", label: "Pool competition (2 starts)", filename: "sample-pool.csv" },
];

const EVENTS: Record<SampleKind, EventInfo> = {
  depth: { name: "Sample Depth Challenge · Day 1", date: "2026-09-05", location: "Sample Cove", notes: "Demo data: athletes are fictional." },
  pool: { name: "Sample Pool Classic", date: "2026-04-04", location: "Sample Aquatic Centre", notes: "Demo data: athletes are fictional." },
};

export async function loadSample(kind: SampleKind): Promise<{ filename: string; csv: string; table: SheetTable; event: EventInfo }> {
  const csv =
    kind === "depth" ? (await import("./depth-2day.csv?raw")).default : (await import("./pool.csv?raw")).default;
  const filename = SAMPLES.find((s) => s.kind === kind)!.filename;
  return { filename, csv, table: parseCsv(csv), event: EVENTS[kind] };
}
