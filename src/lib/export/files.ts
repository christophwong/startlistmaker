import type { CompetitionType } from "../disciplines";
import { formatEventDate } from "../format";
import { headerLayout, imageFormat, layoutStrip, logoBox, logosAt, type Box, type Logo } from "./logos";
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
  logos: Logo[] = [],
): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const contentWidth = pageWidth - 2 * margin;
  const lines = titleLines(title);
  // The alias lets jsPDF embed each image once; without compression it
  // stores PNGs as raw pixels (megabytes for a few logos).
  const addLogo = (logo: Logo, p: Box & { x: number; y: number }) =>
    doc.addImage(logo.src, imageFormat(logo.src), p.x, p.y, p.w, p.h, logo.id, "FAST");

  // Title (wrapped to the middle column when there are header logos) with
  // the header logos beside it, as on the print sheet.
  const drawTitle = () => {
    const maxWidth = headerLayout(logos, contentWidth, 0).titleWidth;
    doc.setFont("helvetica", "bold").setFontSize(16);
    const big: string[] = doc.splitTextToSize(lines[0] ?? "", maxWidth);
    doc.setFont("helvetica", "normal").setFontSize(11);
    const small: string[] = lines.slice(1).flatMap((l) => doc.splitTextToSize(l, maxWidth) as string[]);
    const header = headerLayout(logos, contentWidth, big.length * 19 + small.length * 16);
    for (const p of header.logos) addLogo(p.logo, { ...p, x: margin + p.x, y: margin + p.y });

    let y = margin + header.textY;
    doc.setFont("helvetica", "bold").setFontSize(16);
    for (const line of big) {
      y += 19;
      doc.text(line, pageWidth / 2, y - 5, { align: "center" });
    }
    doc.setFont("helvetica", "normal").setFontSize(11);
    for (const line of small) {
      y += 16;
      doc.text(line, pageWidth / 2, y - 4, { align: "center" });
    }
    return margin + header.h + 12;
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

  // Sponsors after the list, on a new page only if they don't fit above the footer.
  const sponsors = logosAt(logos, "SPONSORS");
  if (sponsors.length) {
    const strip = layoutStrip(sponsors.map(logoBox), contentWidth);
    const bottom = doc.internal.pageSize.getHeight() - margin - 16;
    let top = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin) + 24;
    if (top + strip.h > bottom) {
      doc.addPage();
      top = margin;
    }
    strip.placed.forEach((p, i) => addLogo(sponsors[i], { ...p, x: margin + p.x, y: top + p.y }));
  }

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
