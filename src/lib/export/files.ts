import type { CompetitionType } from "../disciplines";
import { formatEventDate } from "../format";
import { safeCell, type ExportTable } from "./table";

/**
 * File downloads, all generated in the browser. The Excel writer is loaded
 * on first use so the page itself stays small. PDFs come from the browser's
 * Print / Save as PDF, which handles every script.
 */

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadText = (filename: string, text: string, type: string) =>
  downloadBlob(filename, new Blob([text], { type }));

export interface SheetTitle {
  type: CompetitionType;
  name: string;
  date: string;
  location: string;
  notes: string;
}

export function titleLines(t: SheetTitle): string[] {
  return [
    t.name || (t.type === "POOL" ? "Pool competition" : "Depth competition"),
    [t.date && formatEventDate(t.date), t.location].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

export const LEGEND = "OT = official top · WT = warm-up time (OT − 45 min) · Check-in = OT − 60 min";

export async function toXlsx(t: ExportTable, title: SheetTitle): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const width = t.header.length;
  const text = (value: string, extra: object = {}) => ({ value: safeCell(value), type: String, ...extra });
  const data = [
    ...titleLines(title).map((line, i) => [text(line, { fontWeight: i === 0 ? "bold" : undefined, span: width })]),
    [],
    t.header.map((h) => text(h, { fontWeight: "bold" })),
    ...t.rows.map((r) =>
      r.kind === "BREAK" ? [text(r.label, { fontWeight: "bold", span: width })] : r.cells.map((c) => text(c)),
    ),
  ];
  return writeXlsxFile(data as never, { columns: t.header.map((h) => ({ width: h === "Diver Name" ? 28 : 11 })) }).toBlob();
}
