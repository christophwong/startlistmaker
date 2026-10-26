#!/usr/bin/env node
/**
 * Records a video walkthrough of the main flow on the production build:
 * upload the anonymized depth sample → columns → athletes → start list
 * (move a start, sort by athlete) → print & export preview.
 *
 *   node scripts/record-demo.mjs [out-dir] [--mobile]
 *
 * Builds the app, serves it with `vite preview` on port 4174, and writes
 * startlistmaker-demo[-mobile].webm plus a screenshot per step to out-dir
 * (default tmp/demo-video, which is gitignored). The .webm plays in Chrome
 * and Firefox; convert it with ffmpeg for QuickTime.
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2);
const mobile = args.includes("--mobile");
const [outDir = "tmp/demo-video"] = args.filter((a) => !a.startsWith("--"));
const PORT = 4174;
const BASE = `http://localhost:${PORT}/`;
const SIZE = { width: 1280, height: 800 };
const suffix = mobile ? "-mobile" : "";

fs.mkdirSync(outDir, { recursive: true });
execSync("npm run build", { stdio: "inherit" });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start on ${BASE}`);
}

async function record() {
  await waitForServer();
  const browser = await chromium.launch({ slowMo: 250 });
  const device = mobile ? devices["Pixel 7"] : { viewport: SIZE };
  const context = await browser.newContext({ ...device, recordVideo: { dir: outDir, size: device.viewport } });
  const page = await context.newPage();
  const pause = (ms = 1200) => page.waitForTimeout(ms);
  const smoothScroll = async (y) => {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
    await pause(1200);
  };
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}${suffix}.png`) });

  // 1. Input: upload the anonymized sample.
  await page.goto(BASE);
  await pause(1800);
  await shot("1-input");
  await page.getByLabel("Google Forms export file").setInputFiles("src/samples/depth-2day.csv");

  // 2. Columns.
  await page.getByRole("heading", { name: "Match the columns" }).waitFor();
  await pause(1500);
  await shot("2-columns");
  await smoothScroll(500);
  await page.getByRole("button", { name: "Continue to athletes" }).click();

  // 3. Athletes.
  await page.getByRole("heading", { name: "Athletes" }).waitFor();
  await pause(1800);
  await shot("3-athletes");
  await smoothScroll(400);
  await page.getByRole("button", { name: /Generate start list/ }).click();

  // 4. Start list: move a start (on a phone, from its move menu), then sort by
  // athlete (the sort headers are desktop only).
  await page.getByRole("heading", { name: "Start list" }).waitFor();
  await pause(1500);
  await smoothScroll(600);
  if (mobile) {
    await page.getByRole("button", { name: /^Move (?!break )/ }).first().click();
    await pause(800);
  }
  await page.getByRole("button", { name: "Move down" }).first().click();
  await pause();
  if (!mobile) {
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Athlete/ }).click();
    await pause(1500);
  }
  await shot("4-startlist");
  await smoothScroll(0);

  // 5. Print & export: preview the sheet.
  await page.getByRole("button", { name: "Print & export", exact: true }).click();
  await page.locator(".print-area tbody tr").first().waitFor();
  await pause(1500);
  await smoothScroll(500);
  await pause(2000);
  await shot("5-finalize");

  const video = page.video();
  await context.close();
  await browser.close();
  const out = path.join(outDir, `startlistmaker-demo${suffix}.webm`);
  fs.renameSync(await video.path(), out);
  console.log(out);
}

try {
  await record();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.kill();
}
