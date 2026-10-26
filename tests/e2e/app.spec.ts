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

test("demo: sample depth list → finalize → CSV download; PDF is through Print", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try a demo/ }).click();
  // Defaults: depth, 2 days.
  await page.getByRole("dialog", { name: "Try a demo" }).getByRole("button", { name: "Open the demo" }).click();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await expect(page.getByText(/This is a demo with made-up athletes/)).toBeVisible();
  await expect(page.getByText(/(\d+) of \1 starts on the list/)).toBeVisible();

  await page.getByRole("button", { name: "Print & export", exact: true }).click();
  await expect(page.getByText("Sample Depth Challenge · Day 1")).toBeVisible();
  await expect(page.locator(".print-area tbody tr").first()).toBeVisible();

  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const csvFile = await (await csv).path();
  const text = fs.readFileSync(csvFile, "utf8");
  expect(text).toContain("Diver Name,Gender,Country,Discipline,AP,Time,OT,WT,Check-in");
  expect(text.split("\n").length).toBeGreaterThan(10);

  // The jsPDF download garbled names outside Latin-1; the browser's print dialog makes the PDF.
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
});

test("a two-day form: both days on Columns, a tab per day after it", async ({ page }) => {
  await page.goto("/#demo");
  const tabs = page.getByRole("tablist", { name: "Competition day" });
  const day1 = tabs.getByRole("tab", { name: /Day 1/ });
  const day2 = tabs.getByRole("tab", { name: /Day 2/ });
  await expect(day1).toHaveAttribute("aria-selected", "true");
  const firstOt = page.getByRole("tabpanel").getByText(/^\d+:\d\d$/).first();
  const day1Ot = await firstOt.textContent();

  // Day 2 has its own list, settings and date; Day 1's come back unchanged.
  await day2.click();
  await expect(day2).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: /Start list.*Day 2/ })).toBeVisible();
  await page.getByText("Event").first().click();
  await expect(page.getByLabel("Date of Day 2")).toHaveValue("2026-09-06");
  await day1.focus();
  await page.keyboard.press("ArrowRight");
  await expect(day1).toHaveAttribute("aria-selected", "true");
  await expect(firstOt).toHaveText(day1Ot!);

  // Columns reads both days at once: no day picker.
  await page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: /Columns/ }).click();
  await expect(page.getByText("Build the list for")).toHaveCount(0);
  await expect(page.getByText(/start list for each day/)).toBeVisible();
  await expect(tabs).toHaveCount(0);

  // Athletes: one day's start columns at a time.
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await expect(page.getByRole("columnheader", { name: "Day 1" })).toBeVisible();
  await day2.click();
  await expect(page.getByRole("columnheader", { name: "Day 2" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Day 1" })).toHaveCount(0);

  // Print & export names the day on the sheet.
  await page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: /Print & export/ }).click();
  await expect(page.locator(".print-area").getByText("Sample Depth Challenge · Day 2")).toBeVisible();
});

test("#demo-pool link opens the pool sample with lanes", async ({ page }) => {
  await page.goto("/#demo-pool");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  if (!isMobile(page)) await expect(page.getByRole("columnheader", { name: "Lane" })).toBeVisible();
  await expect(page.getByText("BREAK", { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test("upload → fix a row → generate; reorder and sort", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Google Forms export file").setInputFiles("tests/fixtures/ecac-depth-day1.csv");
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
  // The form has no emergency-contact question: said once, not on all 18 rows.
  await expect(page.getByText("All 18 athletes: No emergency contact.")).toBeVisible();
  await expect(page.getByText("No emergency contact.", { exact: true })).toHaveCount(0);
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

test("revisiting Columns keeps athlete edits; a changed import asks before replacing them", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Google Forms export file").setInputFiles("tests/fixtures/ecac-depth-day1.csv");
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await page.getByRole("button", { name: "+ Add athlete" }).click();
  const added = page.getByLabel("First name").filter({ visible: true }).last();
  await added.fill("Kept");
  const kept = () => page.locator('input[aria-label="First name"]:visible[value="Kept"]');
  await expect(kept()).toHaveCount(1);

  // Same columns: Continue goes straight back, edits intact, no question.
  const columns = page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: "2. Columns" });
  await columns.click();
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
  await expect(kept()).toHaveCount(1);

  // Changed columns: asks first; cancelling stays on Columns.
  await columns.click();
  await page.getByText("Column mapping").click();
  await page.locator('select[name="m.country"]').selectOption("");
  const messages: string[] = [];
  page.once("dialog", (d) => (messages.push(d.message()), d.dismiss()));
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  expect(messages).toEqual(["Re-read the file? Your changes to 1 athlete will be replaced."]);
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
  await expect(kept()).toHaveCount(0);
});

test("paste from Google Sheets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste from Google Sheets" }).click();
  await page.getByLabel("Pasted cells").fill(
    "Name\tGender\tDiscipline\tAnnounced Performance (AP)\tDive Time\nAna Lima\tFemale\tCWT\t30\t1:10\nBo Chen\tMale\tFIM\t40\t1:30\n",
  );
  await page.getByRole("button", { name: "Read pasted data" }).click();
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await page.getByRole("button", { name: /Generate start list/ }).click();
  await expect(page.getByText("2 of 2 starts on the list")).toBeVisible();
});

test("Excel export, and a saved project reopens where it left off", async ({ page }) => {
  await page.goto("/#demo-pool");
  await page.getByRole("button", { name: "Print & export", exact: true }).click();

  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel" }).click();
  const x = await xlsx;
  expect(x.suggestedFilename()).toBe("Sample-Pool-Classic.xlsx");
  expect(fs.readFileSync(await x.path()).subarray(0, 2).toString()).toBe("PK"); // a zip

  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const projectPath = await (await json).path();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all data" }).click();
  await page.getByLabel("Google Forms export file").setInputFiles({
    name: "event.startlist.json",
    mimeType: "application/json",
    buffer: fs.readFileSync(projectPath),
  });
  await expect(page.getByRole("heading", { name: "Start list", exact: true })).toBeVisible();
  await expect(page.getByText("41 of 41 starts on the list")).toBeVisible();

  // The Excel reader runs under the CSP too (it unzips without a worker; worker-src is 'none').
  await page.getByRole("button", { name: "1. Upload" }).click();
  await page.getByLabel("Google Forms export file").setInputFiles({
    name: "start-list.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: fs.readFileSync(await x.path()),
  });
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
  await expect(page.getByText(/start-list\.xlsx · \d+ rows/)).toBeVisible();
});

/** A PNG drawn in the page, so no binary fixtures are needed. */
async function png(page: Page, width: number, height: number, color: string) {
  const b64 = await page.evaluate(
    ([w, h, c]) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = c as string;
      ctx.fillRect(0, 0, w as number, h as number);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height, color] as const,
  );
  return Buffer.from(b64, "base64");
}

test("logos: header and sponsors on the sheet and in a saved project", async ({ page }) => {
  await page.goto("/#demo");
  await page.getByRole("button", { name: "Print & export", exact: true }).click();

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#1e40af"/></svg>';
  await page.locator("label", { hasText: "+ Header logo" }).locator("input").setInputFiles([
    { name: "competition.png", mimeType: "image/png", buffer: await png(page, 400, 400, "#15803d") },
    { name: "aida.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) },
  ]);
  await page.locator("label", { hasText: "+ Sponsor logos" }).locator("input").setInputFiles([
    { name: "sponsor-a.png", mimeType: "image/png", buffer: await png(page, 500, 200, "#0e7490") },
    { name: "sponsor-b.png", mimeType: "image/png", buffer: await png(page, 200, 200, "#7c3aed") },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
  ]);
  await expect(page.getByRole("alert")).toContainText("notes.txt: use a PNG, JPEG, WebP, GIF or SVG image.");
  await expect(page.getByLabel("Place of competition.png")).toHaveValue("HEADER_LEFT");
  await expect(page.getByLabel("Place of aida.svg")).toHaveValue("HEADER_RIGHT");

  // The preview (also what prints): both header logos beside the title, sponsors after the list.
  const sheet = page.locator(".print-area");
  await expect(sheet.locator("header img")).toHaveCount(2);
  const sponsors = sheet.getByLabel("Sponsors").locator("img");
  await expect(sponsors).toHaveCount(2);
  await expect(sheet.locator("header img").nth(1)).toHaveAttribute("src", /^data:image\/png;base64,/);

  // Reorder and resize: sponsor-b goes first and grows.
  const widthOf = async (i: number) => Number(await sponsors.nth(i).getAttribute("width"));
  const before = await widthOf(1);
  await page.getByRole("button", { name: "Move sponsor-b.png left" }).click();
  await page.getByLabel("Size of sponsor-b.png").selectOption("L");
  expect(await widthOf(0)).toBeGreaterThan(before);

  // A saved project brings the logos back, in order.
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const projectPath = await (await json).path();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all data" }).click();
  await page.getByLabel("Google Forms export file").setInputFiles({
    name: "event.startlist.json",
    mimeType: "application/json",
    buffer: fs.readFileSync(projectPath),
  });
  await page.getByRole("button", { name: "Print & export", exact: true }).click();
  await expect(page.getByLabel("Size of sponsor-b.png")).toHaveValue("L");
  await expect(page.getByRole("button", { name: "Move sponsor-b.png left" })).toBeDisabled();
  await expect(sheet.locator("header img")).toHaveCount(2);
  await expect(sponsors).toHaveCount(2);
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

test("demo picker: pool with one start per athlete", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try a demo/ }).click();
  const picker = page.getByRole("dialog", { name: "Try a demo" });
  await picker.getByText("Pool", { exact: true }).click();
  await expect(picker.getByText("Starts per athlete")).toBeVisible();
  await picker.getByText("1 start", { exact: true }).click();
  await picker.getByRole("button", { name: "Open the demo" }).click();
  await expect(page.getByRole("heading", { name: "Start list", exact: true })).toBeVisible();
  await expect(page.getByText("Sample Pool Classic").first()).toBeVisible();
  await expect(page.getByText(/(\d+) of \1 starts on the list/)).toBeVisible();
  await expect(page.getByText("BREAK", { exact: true }).filter({ visible: true })).toHaveCount(0);
});

test("the home page shows what the file needs with an example; the full how-to is in Help", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What your file needs" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Jonah Ibarra")).toBeVisible();
  const homeDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "sample-depth-2day.csv" }).click();
  expect((await homeDownload).suggestedFilename()).toBe("sample-depth-2day.csv");
  await expect(page.getByRole("heading", { name: "Getting your Google Forms export" })).toBeHidden();
  await page.getByRole("button", { name: "How it works" }).click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.getByRole("heading", { name: "Getting your Google Forms export" })).toBeVisible();
  await expect(help.getByRole("heading", { name: "What your file needs" })).toBeVisible();
  const download = page.waitForEvent("download");
  await help.getByRole("button", { name: "sample-pool.csv" }).click();
  expect((await download).suggestedFilename()).toBe("sample-pool.csv");
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "Close help" }).click();
  await expect(help).toBeHidden();
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
