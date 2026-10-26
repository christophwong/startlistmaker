import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Runs against the production build (vite preview) with the CSP in place.
 * Every test also checks that the page made no request outside its own
 * origin and logged no errors (CSP violations are console errors).
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

test.beforeEach(async ({ page, baseURL }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(baseURL!) && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) external.push(r.url());
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  (page as Page & { checks?: () => void }).checks = () => {
    expect(external, "requests outside the site").toEqual([]);
    expect(errors.filter((e) => !e.includes("https://example.com")), "console errors").toEqual([]);
  };
});

test.afterEach(async ({ page }) => {
  (page as Page & { checks?: () => void }).checks?.();
});

test("has a strict CSP and no inline scripts", async ({ page }) => {
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(await page.locator("script:not([src])").count()).toBe(0);
  // fetch is blocked by the CSP: nothing can be sent anywhere. (The blocked
  // request is the one console error the checks ignore.)
  const blocked = await page.evaluate(() => fetch("https://example.com").then(() => false, () => true));
  expect(blocked).toBe(true);
});

test("demo: sample depth list → finalize → CSV and PDF downloads", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Depth competition \(2-day form\)/ }).click();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await expect(page.getByText(/demo data with fictional athletes/)).toBeVisible();
  await expect(page.getByText(/18\/18 starts scheduled|\d+\/\d+ starts scheduled/)).toBeVisible();

  await page.getByRole("button", { name: "Finalize →" }).click();
  await expect(page.getByText("Sample Depth Challenge · Day 1")).toBeVisible();
  await expect(page.locator(".print-area tbody tr").first()).toBeVisible();

  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const csvFile = await (await csv).path();
  const text = fs.readFileSync(csvFile, "utf8");
  expect(text).toContain("Diver Name,Gender,Country,Discipline,AP,Time,OT,WT,Check-in");
  expect(text.split("\n").length).toBeGreaterThan(10);

  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await pdf;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(fs.readFileSync(await download.path()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("#demo-pool link opens the pool sample with lanes", async ({ page }) => {
  await page.goto("/#demo-pool");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  if (!isMobile(page)) await expect(page.getByRole("columnheader", { name: "Lane" })).toBeVisible();
  await expect(page.getByText("BREAK", { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test("upload → fix a row → generate; reorder and sort", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Form responses file").setInputFiles("tests/fixtures/ecac-depth-day1.csv");
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();

  // Add an athlete by hand.
  await page.getByRole("button", { name: "+ Add athlete" }).click();
  const scope = page.locator("table tbody tr").filter({ has: page.locator('input[aria-label="First name"]') }).last();
  await scope.getByLabel("First name").fill("Test");
  await scope.getByLabel("Last name").fill("Diver");
  await scope.getByLabel(/Start 1 discipline/).selectOption("CWT");
  await scope.getByLabel(/Start 1 AP/).fill("33");

  await page.getByRole("button", { name: /Generate start list/ }).click();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await expect(page.getByText("Test Diver").filter({ visible: true }).first()).toBeVisible();

  // Move the first start down one place.
  const firstMove = page.getByRole("button", { name: "Move down" }).filter({ visible: true }).first();
  await firstMove.click();

  if (!isMobile(page)) {
    // Sort by name (after a manual move, this asks first), then reverse it.
    page.once("dialog", (d) => d.accept());
    const header = page.getByRole("button", { name: /^Athlete/ });
    await header.click();
    await expect(page.getByRole("columnheader", { name: /Athlete/ })).toHaveAttribute("aria-sort", "ascending");
    const names = () => page.locator("tbody tr td:nth-child(2)").allInnerTexts();
    const asc = await names();
    await header.click();
    await expect(page.getByRole("columnheader", { name: /Athlete/ })).toHaveAttribute("aria-sort", "descending");
    expect(await names()).toEqual([...asc].reverse());
  }
});

test("paste from Google Sheets", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Or paste cells from Google Sheets").click();
  await page.getByLabel("Pasted responses").fill(
    "Name\tGender\tDiscipline\tAnnounced Performance (AP)\tDive Time\nAna Lima\tFemale\tCWT\t30\t1:10\nBo Chen\tMale\tFIM\t40\t1:30\n",
  );
  await page.getByRole("button", { name: "Use pasted data" }).click();
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await page.getByRole("button", { name: /Generate start list/ }).click();
  await expect(page.getByText("2/2 starts scheduled")).toBeVisible();
});

test("Excel export, and a saved project reopens where it left off", async ({ page }) => {
  await page.goto("/#demo-pool");
  await page.getByRole("button", { name: "Finalize →" }).click();

  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel (.xlsx)" }).click();
  const x = await xlsx;
  expect(x.suggestedFilename()).toBe("Sample-Pool-Classic.xlsx");
  expect(fs.readFileSync(await x.path()).subarray(0, 2).toString()).toBe("PK"); // a zip

  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const projectPath = await (await json).path();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all data" }).click();
  await page.getByLabel("Form responses file").setInputFiles({
    name: "event.startlist.json",
    mimeType: "application/json",
    buffer: fs.readFileSync(projectPath),
  });
  await expect(page.getByRole("heading", { name: "Start list", exact: true })).toBeVisible();
  await expect(page.getByText("41/41 starts scheduled")).toBeVisible();
});

test("drag a start onto another row to move it", async ({ page }) => {
  test.skip(isMobile(page), "drag and drop is the desktop table; mobile uses ↑ ↓ and position numbers");
  await page.goto("/#demo");
  const rows = page.locator("tbody tr[draggable=true]");
  const first = await rows.nth(0).locator("td").nth(1).innerText();
  await rows.nth(0).dragTo(rows.nth(3));
  await expect(rows.nth(3).locator("td").nth(1)).toHaveText(first);
});

test("work survives a reload in the same tab, and Clear all data removes it", async ({ page }) => {
  await page.goto("/#demo");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all data" }).click();
  await expect(page.getByRole("heading", { name: /Freediving start lists/ })).toBeVisible();
  const stored = await page.evaluate(() => [sessionStorage.length, localStorage.length]);
  expect(stored).toEqual([0, 0]);
});

test("opens light; the dark toggle sticks across reloads until Clear all data", async ({ page }) => {
  await page.goto("/#demo");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all data" }).click();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
