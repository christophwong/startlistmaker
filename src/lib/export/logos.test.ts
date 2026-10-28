import { describe, expect, it } from "vitest";
import { defaultSheets, logoBox, logosOn, type Logo } from "./logos";

describe("logoBox", () => {
  it("keeps the aspect ratio at the nominal height", () => {
    expect(logoBox({ width: 200, height: 100, place: "HEADER_LEFT", scale: 100 })).toEqual({ w: 144, h: 72 });
    expect(logoBox({ width: 100, height: 100, place: "SPONSORS", scale: 50 })).toEqual({ w: 27, h: 27 });
  });

  it("caps very wide logos", () => {
    const box = logoBox({ width: 700, height: 100, place: "SPONSORS", scale: 100 });
    expect(box.w).toBeCloseTo(54 * 3.5);
    expect(box.h).toBeCloseTo((54 * 3.5) / 7);
  });

  it("lets a banner under the title be wider", () => {
    expect(logoBox({ width: 700, height: 100, place: "TOP", scale: 100 })).toEqual({ w: 378, h: 54 });
  });
});

describe("logosOn", () => {
  const logo = (id: string, place: Logo["place"], sheets = defaultSheets(place)): Logo => ({
    id,
    name: id,
    src: "",
    width: 1,
    height: 1,
    place,
    scale: 100,
    sheets,
  });

  it("keeps the old defaults: no sponsors on the judge sheet, nothing on safety", () => {
    const logos = [logo("ecac", "HEADER_LEFT"), logo("shop", "SPONSORS")];
    expect(logosOn(logos, "SPONSORS", "JUDGES")).toEqual([]);
    expect(logosOn(logos, "HEADER_LEFT", "JUDGES").map((l) => l.id)).toEqual(["ecac"]);
    expect(logosOn(logos, "HEADER_LEFT", "SAFETY")).toEqual([]);
  });

  it("follows the sheets ticked for each logo", () => {
    const logos = [logo("aida", "HEADER_RIGHT", ["ATHLETES", "RESULTS"]), logo("crew", "HEADER_RIGHT", ["SAFETY"])];
    expect(logosOn(logos, "HEADER_RIGHT", "JUDGES")).toEqual([]);
    expect(logosOn(logos, "HEADER_RIGHT", "SAFETY").map((l) => l.id)).toEqual(["crew"]);
  });
});
