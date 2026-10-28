import type { SheetKind } from "./table";

/**
 * Logos on the printed sheet: the competition and AIDA logos beside the
 * title on the first page, an optional row under the title, and a sponsor
 * strip after the list on the last page (as on the ECAC sheets). Each logo
 * prints on the sheets ticked for it. Sizes are in points, the unit of the
 * printed page.
 */

export type LogoPlace = "HEADER_LEFT" | "HEADER_RIGHT" | "TOP" | "SPONSORS";

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
  /** Percent of the place's base height. */
  scale: number;
  /** The sheets it prints on. */
  sheets: SheetKind[];
}

export const MAX_LOGOS = 12;
/** Longest side after re-encoding. Plenty for print at these sizes. */
export const MAX_LOGO_PX = 600;
/** Per logo and in total (characters of data URL), so state still fits in sessionStorage. */
export const MAX_LOGO_SRC = 400_000;
export const MAX_LOGOS_TOTAL = 2_000_000;
export const LOGO_SRC = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export const MIN_SCALE = 25;
export const MAX_SCALE = 300;
/** The S / M / L sizes saved before the size became a percentage (were ⅔, 1, 4⁄3; on the slider's 5 % steps). */
export const LEGACY_SCALE = { S: 65, M: 100, L: 135 } as const;

export const PLACE_LABELS: Record<LogoPlace, string> = {
  HEADER_LEFT: "Header, left",
  HEADER_RIGHT: "Header, right",
  TOP: "Under the title",
  SPONSORS: "After the list",
};

/** As before logos could be set per sheet: no logos on the safety schedule, no sponsors on the judge sheet. */
export const defaultSheets = (place: LogoPlace): SheetKind[] =>
  place === "SPONSORS" ? ["ATHLETES", "RESULTS"] : ["ATHLETES", "JUDGES", "RESULTS"];

/** Height at 100 %, in points. */
const BASE_PT: Record<LogoPlace, number> = { HEADER_LEFT: 72, HEADER_RIGHT: 72, TOP: 54, SPONSORS: 54 };
/** A very wide logo is capped at this many times its height; a row of its own allows a banner. */
const MAX_ASPECT: Record<LogoPlace, number> = { HEADER_LEFT: 3.5, HEADER_RIGHT: 3.5, TOP: 10, SPONSORS: 3.5 };

export interface Box {
  w: number;
  h: number;
}

/** The logo's printed size in points. */
export function logoBox(logo: Pick<Logo, "width" | "height" | "place" | "scale">): Box {
  const h = (BASE_PT[logo.place] * logo.scale) / 100;
  const ratio = logo.width / logo.height;
  const max = MAX_ASPECT[logo.place];
  return ratio > max ? { w: h * max, h: (h * max) / ratio } : { w: h * ratio, h };
}

export const logosAt = (logos: Logo[], place: LogoPlace) => logos.filter((l) => l.place === place);

/** The logos that print on `sheet`, in `place`. */
export const logosOn = (logos: Logo[], place: LogoPlace, sheet: SheetKind) =>
  logos.filter((l) => l.place === place && l.sheets.includes(sheet));
