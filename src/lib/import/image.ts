import { LOGO_SRC, MAX_LOGO_PX, MAX_LOGO_SRC, type Logo } from "../export/logos";

/**
 * Reads a logo the user picked. The file is decoded by the browser and
 * redrawn on a canvas, so whatever came in (SVG, WebP, a PNG with metadata)
 * leaves as a plain PNG, or a JPEG when it has no transparency and the PNG
 * is too big. Only that re-encoded image reaches state, project files and
 * jsPDF.
 */

export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
const MAX_LOGO_FILE = 10 * 1024 * 1024;
/** Smaller sizes to try when the image doesn't fit MAX_LOGO_SRC. */
const SIDES = [MAX_LOGO_PX, 400, 250];

export class LogoError extends Error {}

export type LogoImage = Pick<Logo, "name" | "src" | "width" | "height">;

export async function readLogo(file: File): Promise<LogoImage> {
  if (!LOGO_ACCEPT.split(",").includes(file.type)) {
    throw new LogoError(`${file.name}: use a PNG, JPEG, WebP, GIF or SVG image.`);
  }
  if (file.size > MAX_LOGO_FILE) throw new LogoError(`${file.name} is over 10 MB.`);

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new LogoError(`${file.name} couldn't be read as an image.`);
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new LogoError(`${file.name} has no size. Export the SVG with a width and height, or use a PNG.`);
    }
    for (const side of SIDES) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * k));
      const height = Math.max(1, Math.round(img.naturalHeight * k));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new LogoError("This browser can't process images.");
      ctx.drawImage(img, 0, 0, width, height);
      let src = canvas.toDataURL("image/png");
      if (src.length > MAX_LOGO_SRC && isOpaque(ctx.getImageData(0, 0, width, height).data)) {
        src = canvas.toDataURL("image/jpeg", 0.9);
      }
      if (src.length <= MAX_LOGO_SRC && LOGO_SRC.test(src)) {
        return { name: file.name.slice(0, 200), src, width, height };
      }
    }
    throw new LogoError(`${file.name} is too detailed to store. Try a simpler or smaller version.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isOpaque(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return false;
  return true;
}
