import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Runs against the production build (vite preview) with the CSP in place.
 * Every test also checks that the page made no request outside its own
 * origin and logged no errors (CSP violations are console errors).
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

// The header keeps Help, the theme and "Your data" in menus on a phone, and
// the stepper lists the steps under "All steps" there.
async function openMenu(page: Page, desktop: "Your data" | null) {
  if (isMobile(page)) await page.getByRole("button", { name: "Menu" }).click();
  else if (desktop) await page.getByRole("button", { name: /^Your data/ }).click();
}

async function clearAllData(page: Page) {
  await openMenu(page, "Your data");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all data" }).click();
}

async function goToStep(page: Page, name: RegExp) {
  const steps = page.getByRole("navigation", { name: "Steps" });
  if (isMobile(page)) await steps.getByRole("button", { name: "All steps" }).click();
  await steps.getByRole("button", { name }).click();
}

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
  await page.getByRole("button", { name: "Depth demo" }).click();
  // Defaults: depth, 2 days.
  await page.getByRole("dialog", { name: "Try a demo" }).getByRole("button", { name: "Open the demo" }).click();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await expect(page.getByText(/This is a demo with made-up athletes/)).toBeVisible();
  await expect(page.getByText(/^\d+ starts · \d+ disciplines · first OT/)).toBeVisible();

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

test("judge and results sheets: blank forms from the same list, with their own downloads", async ({ page }) => {
  await page.goto("/#demo-pool");
  await page.getByRole("button", { name: "Print & export", exact: true }).click();
  const sheet = page.locator(".print-area");
  const names = async () => sheet.locator("tbody td:first-child").allTextContents();
  const athleteNames = await names();

  await page.getByText("Judge", { exact: true }).click();
  await expect(sheet.locator("thead th")).toHaveText(["Diver Name", "Sex", "Country", "Disc", "AP", "OT", "Lane", "RP", "RESULT", "Remarks", "Points", "Judge"]);
  await expect(page.getByText(/RESULT = card/)).toBeVisible();
  // Same starts in the same order; a header row comes back after each break.
  expect((await names()).filter((n) => !n.startsWith("BREAK") && n !== "Diver Name")).toEqual(athleteNames.filter((n) => !n.startsWith("BREAK")));
  const breaks = await sheet.locator("tbody td", { hasText: /^BREAK/ }).count();
  await expect(sheet.locator("tbody th", { hasText: "Diver Name" })).toHaveCount(breaks);
  await expect(page.getByRole("checkbox", { name: "Warm-up (WT) column" })).toHaveCount(0);

  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const judgeCsv = await csv;
  expect(judgeCsv.suggestedFilename()).toMatch(/-judge\.csv$/);
  expect(fs.readFileSync(await judgeCsv.path(), "utf8")).toContain("Diver Name,Sex,Country,Disc,AP,OT,Lane,RP,RESULT,Remarks,Points,Judge");

  await page.getByText("Results", { exact: true }).click();
  await expect(sheet.locator("thead th")).toHaveText(["Diver Name", "Gender", "Country", "Discipline", "AP", "RP", "Card", "Notes", "Points", "Rank"]);
  // Stays on the picked sheet after a reload.
  await page.reload();
  await expect(sheet.locator("thead th").last()).toHaveText("Rank");
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
  if (isMobile(page)) await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await expect(page.getByLabel("Date of Day 2")).toHaveValue("2026-09-06");
  if (isMobile(page)) await page.getByRole("button", { name: "Close settings" }).click();
  await day1.focus();
  await page.keyboard.press("ArrowRight");
  await expect(day1).toHaveAttribute("aria-selected", "true");
  await expect(firstOt).toHaveText(day1Ot!);

  // Columns reads both days at once: no day picker.
  await goToStep(page, /Columns/);
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
  await goToStep(page, /Print & export/);
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
  await expect(scope.getByLabel("First name")).toBeFocused();
  await expect(page.getByText("1 to fix")).toBeVisible();
  await scope.getByLabel("First name").fill("Test");
  await scope.getByLabel("Last name").fill("Diver");
  await scope.getByLabel("Email, Test Diver").fill("test.diver@example.com");
  await scope.getByLabel(/Start 1 discipline/).selectOption("CWT");
  await scope.getByLabel(/Start 1 AP/).fill("33");

  await page.getByRole("button", { name: /Generate start list/ }).click();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await expect(page.getByText("Test Diver").filter({ visible: true }).first()).toBeVisible();

  // Move the first start down one place (on a phone, from the start's move menu).
  if (isMobile(page)) await page.getByRole("button", { name: /^Move / }).first().click();
  const firstMove = page.getByRole("button", { name: "Move down" }).filter({ visible: true }).first();
  await firstMove.click();

  if (!isMobile(page)) {
    // Sort by name (after a manual move, this asks first), then reverse it.
    page.once("dialog", (d) => d.accept());
    const header = page.getByRole("button", { name: /^Athlete/ });
    await header.click();
    await expect(page.getByRole("columnheader", { name: /Athlete/ })).toHaveAttribute("aria-sort", "ascending");
    const names = () => page.locator("tbody tr[draggable=true] td:nth-child(4)").allInnerTexts();
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
  await goToStep(page, /^2 Columns$/);
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
  await expect(kept()).toHaveCount(1);

  // Changed columns: asks first; cancelling stays on Columns.
  await goToStep(page, /^2 Columns$/);
  await page.getByLabel("Use Country as").selectOption("");
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
  await page.getByRole("button", { name: "Paste from Sheets" }).click();
  await page.getByLabel("Pasted cells").fill(
    "Name\tGender\tDiscipline\tAnnounced Performance (AP)\tDive Time\nAna Lima\tFemale\tCWT\t30\t1:10\nBo Chen\tMale\tFIM\t40\t1:30\n",
  );
  await page.getByRole("button", { name: "Read pasted data" }).click();
  await page.getByRole("button", { name: "Continue to athletes" }).click();
  await page.getByRole("button", { name: /Generate start list/ }).click();
  await expect(page.getByText(/^2 starts · \d+ discipline/)).toBeVisible();
});

test("Columns: rows that need fixing are shown first, with a link to the row on Athletes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste from Sheets" }).click();
  await page.getByLabel("Pasted cells").fill(
    "Name\tGender\tDiscipline\tAnnounced Performance (AP)\nAna Lima\tFemale\tCWT\t30\nBo Chen\tMale\tFIM\t\nCy Park\tMale\tCWT\t25\n",
  );
  await page.getByRole("button", { name: "Read pasted data" }).click();
  await expect(page.getByLabel("Use Name as")).toHaveValue("fullName");
  const filter = page.getByLabel(/Only rows with problems/);
  await expect(filter).toBeChecked();
  await expect(page.getByText(/Row 3/)).toBeVisible();
  await expect(page.getByText(/Row 2/)).toHaveCount(0);
  await filter.uncheck();
  await expect(page.getByText(/Row 2 · Ana Lima/)).toBeVisible();

  await page.getByRole("button", { name: "Fix it on Athletes" }).click();
  await expect(page.getByRole("heading", { name: "Athletes" })).toBeVisible();
  await expect(page.locator('[data-row="r3"] :focus')).toHaveCount(1);
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

  await clearAllData(page);
  await page.getByLabel("Google Forms export file").setInputFiles({
    name: "event.startlist.json",
    mimeType: "application/json",
    buffer: fs.readFileSync(projectPath),
  });
  await expect(page.getByRole("heading", { name: "Start list", exact: true })).toBeVisible();
  await expect(page.getByText(/^41 starts · \d+ discipline/)).toBeVisible();

  // The Excel reader runs under the CSP too (it unzips without a worker; worker-src is 'none').
  await goToStep(page, /^1 Upload$/);
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
  await clearAllData(page);
  // This time through "Open a project" (the upload box takes projects too, above).
  await page.getByLabel("Project file (.json)").setInputFiles({
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
  const athlete = (n: number) => rows.nth(n).locator("td").nth(3);
  const first = await athlete(0).innerText();
  await rows.nth(0).dragTo(rows.nth(3));
  await expect(athlete(3)).toHaveText(first);
});

test("work survives a reload in the same tab, and Clear all data removes it", async ({ page }) => {
  await page.goto("/#demo");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await clearAllData(page);
  await expect(page.getByRole("heading", { name: /From Google Form to official start list/ })).toBeVisible();
  const stored = await page.evaluate(() => [sessionStorage.length, localStorage.length]);
  expect(stored).toEqual([0, 0]);
});

test("start list: row actions stay in view when the table scrolls sideways", async ({ page }) => {
  test.skip(isMobile(page), "the phone list is cards, with a move menu on each");
  // 1024: the settings column is beside a narrow list, and the pool lanes make the table overflow.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/#demo-pool");
  const box = page.locator("table").locator("..");
  const overflow = await box.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeGreaterThan(0);
  const more = page.getByRole("button", { name: /^More actions for / }).first();
  const [b, m] = [await box.boundingBox(), await more.boundingBox()];
  expect(m!.x + m!.width).toBeLessThanOrEqual(b!.x + b!.width);
  await more.click();
  await expect(page.getByRole("button", { name: "Add break after" })).toBeVisible();
});

test("start list: Remove this start takes one start off; Put back on Athletes returns it", async ({ page }) => {
  await page.goto("/#demo-pool");
  const summary = page.getByText(/^\d+ starts · \d+ discipline/);
  const count = async () => Number((await summary.textContent())!.match(/^(\d+)/)![1]);
  const before = await count();
  // The first start's menu: ⋯ on desktop, the move menu on a phone.
  const menu = page.getByRole("button", { name: isMobile(page) ? /^Move (?!break )/ : /^More actions for / }).first();
  const name = (await menu.getAttribute("aria-label"))!.replace(/^(Move|More actions for) /, "");
  await menu.click();
  await page.getByRole("button", { name: "Remove this start" }).click();
  await expect(summary).toHaveText(new RegExp(`^${before - 1} starts`));
  // Pool athletes have two starts: the other one stays on the list.
  await expect(page.locator("[data-start]").filter({ hasText: name }).filter({ visible: true })).toHaveCount(1);

  await goToStep(page, /Athletes/);
  await expect(page.getByText(/^Start [12] is off the list\./)).toHaveCount(1);
  await page.getByRole("button", { name: "Put back" }).click();
  await expect(page.getByText(/is off the list\./)).toHaveCount(0);
  await page.getByRole("button", { name: "Back to start list" }).click();
  await expect(summary).toHaveText(new RegExp(`^${before} starts`));
});

test("demo picker: pool with one start per athlete", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pool demo" }).click();
  const picker = page.getByRole("dialog", { name: "Try a demo" });
  // Opened from Pool demo: pool is already chosen.
  await expect(picker.getByLabel("Pool")).toBeChecked();
  await expect(picker.getByText("Starts per athlete")).toBeVisible();
  await picker.getByText("1 start", { exact: true }).click();
  await picker.getByRole("button", { name: "Open the demo" }).click();
  await expect(page.getByRole("heading", { name: "Start list", exact: true })).toBeVisible();
  // The event card is in the Settings dialog on a phone.
  if (isMobile(page)) await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Sample Pool Classic").first()).toBeVisible();
  if (isMobile(page)) await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByText(/^\d+ starts · \d+ disciplines/)).toBeVisible();
  // Pool is grouped by discipline: a header before each block.
  await expect(page.getByText(/^\d+ starts · \d+:\d\d–\d+:\d\d$/).first()).toBeVisible();
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
  await openMenu(page, null);
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
  await openMenu(page, null);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await clearAllData(page);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("start list: a start's menu moves it to a position and adds a break; the break bar edits and removes it", async ({ page }) => {
  await page.goto("/#demo");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  // ⋯ on the table, the move button on a phone card; their names carry the athlete.
  const menus = page.getByRole("button", { name: isMobile(page) ? /^Move (?!break )/ : /^More actions for / });
  const label = (await menus.first().getAttribute("aria-label"))!;

  await menus.first().click();
  await page.getByRole("button", { name: "Move to position…" }).click();
  await page.getByLabel("Move to position").fill("3");
  await page.getByLabel("Move to position").press("Enter");
  await expect(menus.nth(2)).toHaveAttribute("aria-label", label);

  const bars = page.getByText("BREAK", { exact: true }).filter({ visible: true });
  const before = await bars.count();
  await menus.first().click();
  await page.getByRole("button", { name: "Add break after" }).click();
  await expect(bars).toHaveCount(before + 1);
  await page.getByRole("button", { name: "Edit", exact: true }).filter({ visible: true }).first().click();
  await page.getByLabel("Break length in minutes").fill("20");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^20 min · /).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove break" }).filter({ visible: true }).first().click();
  await expect(bars).toHaveCount(before);
});

test("header: the privacy note and Your data menu open and close", async ({ page }) => {
  await page.goto("/#demo");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  const lock = page.getByRole("button", { name: /^Local only/ });
  const note = page.getByText("Nothing leaves this browser", { exact: true });
  await lock.click();
  await expect(note).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(note).toBeHidden();
  await expect(lock).toBeFocused();

  if (!isMobile(page)) await expect(page.getByRole("button", { name: "Your data · this tab only" })).toBeVisible();
  await openMenu(page, "Your data");
  await page.getByLabel("Remember on this device").check();
  expect(await page.evaluate(() => localStorage.length)).toBeGreaterThan(0);
  await page.getByRole("contentinfo").click(); // a click outside closes it
  await expect(page.getByLabel("Remember on this device")).toBeHidden();
  if (!isMobile(page)) await expect(page.getByRole("button", { name: "Your data · remembered" })).toBeVisible();
});
