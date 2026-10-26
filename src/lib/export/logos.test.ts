import { describe, expect, it } from "vitest";
import { fitRow, headerLayout, imageFormat, layoutStrip, logoBox, type Logo } from "./logos";

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

describe("fitRow", () => {
  it("leaves a row that fits alone", () => {
    expect(fitRow([{ w: 50, h: 40 }, { w: 30, h: 60 }], 200, 10)).toEqual({
      boxes: [{ w: 50, h: 40 }, { w: 30, h: 60 }],
      w: 90,
      h: 60,
    });
  });

  it("scales the whole row down to fit", () => {
    const row = fitRow([{ w: 100, h: 50 }, { w: 100, h: 50 }], 105, 10);
    expect(row.w).toBeCloseTo(105);
    expect(row.boxes[0].w).toBeCloseTo(50);
    expect(row.h).toBeCloseTo(25);
  });
});

describe("layoutStrip", () => {
  it("is empty without logos", () => {
    expect(layoutStrip([], 500)).toEqual({ placed: [], h: 0 });
  });

  it("centers one row and centers each logo vertically", () => {
    const { placed, h } = layoutStrip([{ w: 100, h: 40 }, { w: 80, h: 60 }], 300, 20);
    expect(h).toBe(60);
    expect(placed).toEqual([
      { w: 100, h: 40, x: 50, y: 10 },
      { w: 80, h: 60, x: 170, y: 0 },
    ]);
  });

  it("wraps onto centered rows", () => {
    const { placed, h } = layoutStrip([{ w: 120, h: 50 }, { w: 120, h: 50 }, { w: 120, h: 30 }], 300, 20);
    expect(placed.map((p) => [p.x, p.y])).toEqual([
      [20, 0],
      [160, 0],
      [90, 70],
    ]);
    expect(h).toBe(100);
  });

  it("shrinks a logo wider than the strip", () => {
    const { placed } = layoutStrip([{ w: 600, h: 100 }], 300);
    expect(placed[0]).toEqual({ w: 300, h: 50, x: 0, y: 0 });
  });
});

describe("headerLayout", () => {
  const logo = (id: string, place: Logo["place"], width: number, height: number): Logo => ({
    id,
    name: id,
    src: "data:image/png;base64,AAAA",
    width,
    height,
    place,
    size: "M",
  });

  it("is just the title without header logos", () => {
    expect(headerLayout([logo("s", "SPONSORS", 10, 10)], 540, 40)).toEqual({ logos: [], h: 40, textY: 0, titleWidth: 540 });
  });

  it("puts left logos at the left edge and right ones at the right edge, centred vertically", () => {
    const { logos, h, textY, titleWidth } = headerLayout(
      [logo("comp", "HEADER_LEFT", 100, 100), logo("aida", "HEADER_RIGHT", 300, 100)],
      540,
      40,
    );
    expect(h).toBe(72);
    expect(textY).toBe(16);
    expect(titleWidth).toBe(261);
    const [comp, aida] = logos;
    expect(comp).toMatchObject({ x: 0, y: 0, w: 72, h: 72 });
    // 216 pt wide doesn't fit the 126 pt side: scaled down and centred.
    expect(aida.w).toBeCloseTo(126);
    expect(aida.x + aida.w).toBeCloseTo(540);
    expect(aida.y).toBeCloseTo((72 - aida.h) / 2);
  });
});

it("imageFormat", () => {
  expect(imageFormat("data:image/png;base64,AAAA")).toBe("PNG");
  expect(imageFormat("data:image/jpeg;base64,AAAA")).toBe("JPEG");
});
