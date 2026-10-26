/**
 * Logos on the printed sheet: the competition and AIDA logos beside the
 * title on the first page, and a sponsor strip after the list on the last
 * page (as on the ECAC sheets). Sizes are in points, so the print view
 * (CSS) and the PDF (jsPDF, unit "pt") lay them out the same way.
 */

export type LogoPlace = "HEADER_LEFT" | "HEADER_RIGHT" | "SPONSORS";
export type LogoSize = "S" | "M" | "L";

export interface Logo {
  id: string;
  /** The original file name, shown in the editor only. */
  name: string;
  /** A PNG or JPEG data URL, re-encoded in the browser when added. */
  src: string;
  /** Pixel size of `src`. */
  width: number;
  height: number;
  place: LogoPlace;
  size: LogoSize;
}

export const MAX_LOGOS = 12;
/** Longest side after re-encoding. Plenty for print at these sizes. */
export const MAX_LOGO_PX = 600;
/** Per logo and in total (characters of data URL), so state still fits in sessionStorage. */
export const MAX_LOGO_SRC = 400_000;
export const MAX_LOGOS_TOTAL = 2_000_000;
export const LOGO_SRC = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export const PLACE_LABELS: Record<LogoPlace, string> = {
  HEADER_LEFT: "Header, left",
  HEADER_RIGHT: "Header, right",
  SPONSORS: "Sponsors",
};
export const SIZE_LABELS: Record<LogoSize, string> = { S: "Small", M: "Medium", L: "Large" };

const HEIGHT_PT: Record<"HEADER" | "SPONSORS", Record<LogoSize, number>> = {
  HEADER: { S: 48, M: 72, L: 96 },
  SPONSORS: { S: 36, M: 54, L: 72 },
};
/** A very wide logo is capped at this many times its nominal height. */
const MAX_ASPECT = 3.5;
export const LOGO_GAP_PT = 18;

export interface Box {
  w: number;
  h: number;
}

/** The logo's printed size in points. */
export function logoBox(logo: Pick<Logo, "width" | "height" | "place" | "size">): Box {
  const h = HEIGHT_PT[logo.place === "SPONSORS" ? "SPONSORS" : "HEADER"][logo.size];
  const ratio = logo.width / logo.height;
  return ratio > MAX_ASPECT ? { w: h * MAX_ASPECT, h: (h * MAX_ASPECT) / ratio } : { w: h * ratio, h };
}

export const logosAt = (logos: Logo[], place: LogoPlace) => logos.filter((l) => l.place === place);

/**
 * Logos side by side, scaled down together if they don't fit `maxWidth`.
 * Returns each box and the row's size.
 */
export function fitRow(boxes: Box[], maxWidth: number, gap = LOGO_GAP_PT): { boxes: Box[]; w: number; h: number } {
  const total = boxes.reduce((sum, b) => sum + b.w, 0) + gap * Math.max(0, boxes.length - 1);
  const k = total > maxWidth ? maxWidth / total : 1;
  const out = boxes.map((b) => ({ w: b.w * k, h: b.h * k }));
  return { boxes: out, w: total * k, h: Math.max(0, ...out.map((b) => b.h)) };
}

export interface Placed extends Box {
  x: number;
  y: number;
}

/**
 * Wraps logos into centered rows within `width`, each row vertically
 * centered, like flex-wrap + justify-center. Positions are relative to the
 * strip's top left corner.
 */
export function layoutStrip(boxes: Box[], width: number, gap = LOGO_GAP_PT): { placed: Placed[]; h: number } {
  const rows: Box[][] = [];
  let rowW = 0;
  for (const b0 of boxes) {
    const b = b0.w > width ? { w: width, h: (b0.h * width) / b0.w } : b0;
    const row = rows.at(-1);
    if (row && rowW + gap + b.w <= width) {
      row.push(b);
      rowW += gap + b.w;
    } else {
      rows.push([b]);
      rowW = b.w;
    }
  }
  const placed: Placed[] = [];
  let y = 0;
  for (const row of rows) {
    const w = row.reduce((sum, b) => sum + b.w, 0) + gap * (row.length - 1);
    const h = Math.max(...row.map((b) => b.h));
    let x = (width - w) / 2;
    for (const b of row) {
      placed.push({ ...b, x, y: y + (h - b.h) / 2 });
      x += b.w + gap;
    }
    y += h + gap;
  }
  return { placed, h: rows.length ? y - gap : 0 };
}

/**
 * The first-page header in the PDF, matching the print sheet: equal side
 * columns (a quarter of `width` each) with the left logos from the left edge
 * and the right ones up to the right edge, the title in the middle half.
 * Everything is centred vertically in a header `h` tall. Positions are
 * relative to the header's top left corner.
 */
export function headerLayout(
  logos: Logo[],
  width: number,
  textH: number,
): { logos: (Placed & { logo: Logo })[]; h: number; textY: number; titleWidth: number } {
  const left = logosAt(logos, "HEADER_LEFT");
  const right = logosAt(logos, "HEADER_RIGHT");
  if (!left.length && !right.length) return { logos: [], h: textH, textY: 0, titleWidth: width };
  const gap = 9;
  const side = width / 4 - gap;
  const rows = [left, right].map((ls) => ({ ls, ...fitRow(ls.map(logoBox), side, gap) }));
  const h = Math.max(textH, ...rows.map((r) => r.h));
  const placed: (Placed & { logo: Logo })[] = [];
  rows.forEach((r, i) => {
    let x = i === 0 ? 0 : width - r.w;
    r.boxes.forEach((b, j) => {
      placed.push({ ...b, x, y: (h - b.h) / 2, logo: r.ls[j] });
      x += b.w + gap;
    });
  });
  return { logos: placed, h, textY: (h - textH) / 2, titleWidth: width / 2 - gap };
}

/** jsPDF's format name for a logo's data URL. */
export const imageFormat = (src: string) => (src.startsWith("data:image/png") ? "PNG" : "JPEG");
