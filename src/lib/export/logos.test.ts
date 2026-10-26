import { describe, expect, it } from "vitest";
import { logoBox } from "./logos";

describe("logoBox", () => {
  it("keeps the aspect ratio at the nominal height", () => {
    expect(logoBox({ width: 200, height: 100, place: "HEADER_LEFT", size: "M" })).toEqual({ w: 144, h: 72 });
    expect(logoBox({ width: 100, height: 100, place: "SPONSORS", size: "S" })).toEqual({ w: 36, h: 36 });
  });

  it("caps very wide logos", () => {
    const box = logoBox({ width: 700, height: 100, place: "SPONSORS", size: "M" });
    expect(box.w).toBeCloseTo(54 * 3.5);
    expect(box.h).toBeCloseTo((54 * 3.5) / 7);
  });
});
