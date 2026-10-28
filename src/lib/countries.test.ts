import { describe, expect, it } from "vitest";
import { countryCode, countryForList } from "./countries";

describe("countryCode", () => {
  it("maps names, spellings and codes to IOC codes", () => {
    // Every value in the real ECAC exports.
    expect(["USA", "Usa", "United States", "ALASKA", "Canada", "China", "Germany", "Australia"].map(countryCode)).toEqual([
      "USA", "USA", "USA", "USA", "CAN", "CHN", "GER", "AUS",
    ]);
    expect(countryCode("the Netherlands")).toBe("NED");
    expect(countryCode("  côte d’ivoire ")).toBe("CIV");
    expect(countryCode("U.S.A.")).toBe("USA");
    expect(countryCode("Trinidad & Tobago")).toBe("TTO");
    expect(countryCode("uk")).toBe("GBR");
  });

  it("takes IOC codes as they are and the ISO codes that differ", () => {
    expect(countryCode("sui")).toBe("SUI");
    expect(countryCode("CHE")).toBe("SUI");
    expect(countryCode("DEU")).toBe("GER");
    expect(countryCode("PHL")).toBe("PHI");
  });

  it("returns null for what it doesn't know", () => {
    expect(countryCode("Tahiti")).toBeNull();
    expect(countryCode("")).toBeNull();
  });
});

describe("countryForList", () => {
  it("shows the code, or the value as typed when unknown", () => {
    expect(countryForList("Canada")).toBe("CAN");
    expect(countryForList(" Tahiti ")).toBe("Tahiti");
    expect(countryForList("")).toBe("");
  });
});
