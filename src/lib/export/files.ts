import type { CompetitionType } from "../disciplines";
import { formatEventDate } from "../format";
import { safeCell, type ExportTable } from "./table";

/**
 * File downloads, all generated in the browser. The PDF and Excel writers
 * are loaded on first use so the page itself stays small.
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

/** Header colours from the ECAC sheets: blue for pool, green for depth. */
export const accent = (type: CompetitionType): [number, number, number] =>
  type === "POOL" ? [42, 94, 168] : [60, 122, 42];

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

export async function toPdf(
  t: ExportTable,
  title: SheetTitle,
  { pageBreakAtBreaks }: { pageBreakAtBreaks: boolean },
): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const lines = titleLines(title);

  const drawTitle = () => {
    let y = margin + 8;
    doc.setFont("helvetica", "bold").setFontSize(16);
    doc.text(lines[0] ?? "", pageWidth / 2, y, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(11);
    for (const line of lines.slice(1)) {
      y += 16;
      doc.text(line, pageWidth / 2, y, { align: "center" });
    }
    return y + 14;
  };

  // One table per section when every break starts a new page.
  const sections: ExportTable["rows"][] = [[]];
  for (const r of t.rows) {
    sections.at(-1)!.push(r);
    if (pageBreakAtBreaks && r.kind === "BREAK") sections.push([]);
  }
  const width = t.header.length;
  const nameCol = t.header.indexOf("Diver Name");
  sections
    .filter((s) => s.length)
    .forEach((rows, i) => {
      if (i > 0) doc.addPage();
      autoTable(doc, {
        startY: i === 0 ? drawTitle() : margin,
        margin: { left: margin, right: margin, top: margin, bottom: margin + 12 },
        head: [t.header],
        body: rows.map((r) =>
          r.kind === "BREAK"
            ? [{ content: r.label, colSpan: width, styles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: "bold" } }]
            : r.cells,
        ),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3, halign: "center", lineColor: [200, 200, 200] },
        headStyles: { fillColor: accent(title.type), textColor: 255, fontStyle: "normal" },
        alternateRowStyles: { fillColor: [243, 244, 246] },
        columnStyles: nameCol >= 0 ? { [nameCol]: { halign: "left" } } : {},
        rowPageBreak: "avoid",
      });
    });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(110);
    const y = doc.internal.pageSize.getHeight() - margin + 8;
    // The built-in PDF fonts are Latin-1 only, so no "−" (U+2212).
    const legend = LEGEND.replace(/−/g, "-");
    doc.text(title.notes ? `${legend} · ${title.notes}`.slice(0, 160) : legend, margin, y);
    doc.text(`${p} / ${pages}`, pageWidth - margin, y, { align: "right" });
  }
  return doc.output("blob");
}
