import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, parseClock, parseDuration, toTimeInput } from "./time";

describe("parseDuration", () => {
  it.each([
    ["1:45", 105],
    ["01:45", 105],
    ["0:01:45", 105],
    ["1:45:00", 105], // spreadsheet turned m:ss into h:mm:ss
    ["1'45\"", 105],
    ["1’45", 105],
    ["1m45s", 105],
    ["1 min 45 sec", 105],
    ["4 min", 240],
    ["90s", 90],
    ["105", 105],
    ["4", 240],
    ["1.45", 105],
    ["1.5", 90],
    [6.5, 390],
  ])("%s → %i s", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "abc", "1:75", "1:2:3:4", null, undefined])("rejects %s", (input) => {
    expect(parseDuration(input as string)).toBeNull();
  });
});

describe("clock", () => {
  it("parses 24h and 12h input", () => {
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("21:05")).toBe(1265);
    expect(parseClock("9:30 pm")).toBe(1290);
    expect(parseClock("12:00 AM")).toBe(0);
    expect(parseClock("12:15 pm")).toBe(735);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("13:00 pm")).toBeNull();
  });

  it("formats like the printed start lists", () => {
    expect(formatClock(585)).toBe("9:45");
    expect(formatClock(780)).toBe("13:00");
    expect(formatClock(780, "12h")).toBe("1:00 PM");
    expect(formatClock(30, "12h")).toBe("12:30 AM");
    expect(formatClock(-15)).toBe("23:45");
    expect(toTimeInput(545)).toBe("09:05");
    expect(formatDuration(65)).toBe("1:05");
  });
});
