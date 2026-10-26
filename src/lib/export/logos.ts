/**
 * Logos on the printed sheet: the competition and AIDA logos beside the
 * title on the first page, and a sponsor strip after the list on the last
 * page (as on the ECAC sheets). Sizes are in points, the unit of the
 * printed page.
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
