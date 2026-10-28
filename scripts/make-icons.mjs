#!/usr/bin/env node
/**
 * Renders the PNG icons and the link-preview image into public/ from the
 * favicon's design, with Playwright's Chromium:
 *
 *   node scripts/make-icons.mjs
 *
 * apple-touch-icon.png (180, square: iOS rounds the corners), icon-192.png and
 * icon-512.png (manifest.webmanifest), og.jpg (1200×630, for links shared in
 * chat apps and email). Rerun after changing public/favicon.svg.
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BLUE = "#1f5f8f";
const LINES = `<path d="M9 9h14M9 14h14M9 19h10M9 24h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="23" r="3.2" fill="none" stroke="#9fe3ff" stroke-width="1.8"/>`;
// Full-bleed square for the home-screen icons; the platform applies its own mask.
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BLUE}"/>${LINES}</svg>`;
const rounded = fs.readFileSync("public/favicon.svg", "utf8");

const og = `
<div style="width:1200px;height:630px;box-sizing:border-box;padding:88px 96px;display:flex;flex-direction:column;justify-content:space-between;
  background:linear-gradient(135deg,#0b3f5c,${BLUE});color:#fff;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="display:flex;align-items:center;gap:28px">
    <div style="width:104px;height:104px">${rounded.replace("<svg ", '<svg width="104" height="104" ')}</div>
    <div style="font-size:60px;font-weight:700;letter-spacing:-1px">Start List Maker</div>
  </div>
  <div style="font-size:52px;font-weight:700;line-height:1.12;letter-spacing:-1px;max-width:960px">
    Freediving start lists from your Google Forms export.
  </div>
  <div style="font-size:30px;color:#cfe9f7">AIDA-style · pool and depth · athlete data stays in your browser</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, html, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0">${html}</body>`);
  const jpeg = file.endsWith(".jpg");
  await page.screenshot({ path: `public/${file}`, clip: { x: 0, y: 0, width, height }, ...(jpeg && { type: "jpeg", quality: 88 }) });
  console.log(`public/${file}`);
}
const icon = (px) => square.replace("<svg ", `<svg width="${px}" height="${px}" style="display:block" `);
await render("apple-touch-icon.png", icon(180), 180, 180);
await render("icon-192.png", icon(192), 192, 192);
await render("icon-512.png", icon(512), 512, 512);
// JPEG: the gradient makes a PNG over 300 KB, and some chat apps skip previews that large.
await render("og.jpg", og, 1200, 630);
await browser.close();
