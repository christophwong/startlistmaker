import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { autoMap } from "~/lib/import/columns";
import { parseCsv } from "~/lib/import/file";

const script = path.resolve("scripts/anonymize.mjs");

function anonymize(input: string, ...flags: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slm-anon-"));
  const out = path.join(dir, "out.csv");
  execFileSync(process.execPath, [script, input, out, "3", ...flags], { stdio: "pipe" });
  return fs.readFileSync(out, "utf8");
}

describe("scripts/anonymize.mjs", () => {
  const source = "tests/fixtures/google-form-pool.csv";
  const original = parseCsv(fs.readFileSync(source, "utf8"));

  it("replaces every name, email and emergency contact", () => {
    const out = anonymize(source);
    const anon = parseCsv(out);
    const m = autoMap(anon.headers);
    expect(anon.headers).toEqual(original.headers);
    expect(anon.rows).toHaveLength(original.rows.length);
    for (const row of original.rows) {
      const last = row[m.lastName!];
      const email = row[m.email!];
      expect(out).not.toContain(email);
      expect(anon.rows.some((r) => r[m.lastName!] === last && r[m.firstName!] === row[m.firstName!])).toBe(false);
    }
    expect(anon.rows.every((r) => /^athlete\d+@example\.com$/.test(r[m.email!]))).toBe(true);
  });

  it("keeps the structure the import needs (disciplines, formats)", () => {
    const anon = parseCsv(anonymize(source));
    const m = autoMap(anon.headers);
    original.rows.forEach((row, i) => {
      expect(anon.rows[i][m.s1Discipline!]).toBe(row[m.s1Discipline!]);
      expect(/:/.test(anon.rows[i][m.s1Ap!])).toBe(/:/.test(row[m.s1Ap!]));
    });
  });

  it("--fix-typos corrects the Dicipline header", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slm-anon-"));
    const input = path.join(dir, "in.csv");
    fs.writeFileSync(input, "Name,Gender,Dicipline | Day 1\nZed Quorvath,Male,CWT\n");
    const out = anonymize(input, "--fix-typos");
    expect(out.split("\n")[0]).toBe("Name,Gender,Discipline | Day 1");
    expect(out).not.toMatch(/Quorvath/i);
  });

  it("the bundled samples contain no source emails", () => {
    for (const f of ["src/samples/depth-2day.csv", "src/samples/pool.csv"]) {
      const t = parseCsv(fs.readFileSync(f, "utf8"));
      const col = autoMap(t.headers).email!;
      expect(t.rows.every((r) => !r[col] || /^athlete\d+@example\.com$/.test(r[col]))).toBe(true);
    }
  });
});
