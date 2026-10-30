// Layout check and screenshots for each main screen, in both themes, on desktop and mobile.
// `npm run shots` runs only this file; images land in tmp/shots/<project>/<screen>-<theme>.png.
// The overflow check fails on anything that pokes out past the right edge of the viewport,
// so cut-off and overflowing UI is caught without anyone looking at the images.
import { expect, test, type Page } from "@playwright/test";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function openWorkspaceTab(page: Page, name: "Athletes" | "Print & export") {
  await page.goto("/#demo");
  await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

const screens: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: "home", open: (page) => page.goto("/").then(() => undefined) },
  {
    name: "start-list",
    open: async (page) => {
      await page.goto("/#demo");
      await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
    },
  },
  { name: "athletes", open: (page) => openWorkspaceTab(page, "Athletes") },
  { name: "print-export", open: (page) => openWorkspaceTab(page, "Print & export") },
  {
    name: "help",
    open: async (page) => {
      await page.goto("/#demo");
      await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
      if (isPhone(page)) await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("button", { name: "Help" }).click();
      await expect(page.getByRole("dialog", { name: "Help" })).toBeVisible();
    },
  },
];

// Elements whose right edge is past the viewport, ignoring ones inside a sideways-scrolling container.
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrolls = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === "auto" || x === "scroll" || x === "hidden" || x === "clip") return true;
      }
      return false;
    };
    const out: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= width + 1 || scrolls(el)) continue;
      const label = (el.textContent ?? "").trim().slice(0, 40);
      out.push(`<${el.tagName.toLowerCase()}> right=${Math.round(r.right)} > ${width}: "${label}"`);
    }
    if (document.documentElement.scrollWidth > width + 1) {
      out.unshift(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${width}`);
    }
    return out.slice(0, 10);
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const screen of screens) {
    test(`${screen.name} (${theme}) fits the viewport`, async ({ page }, info) => {
      await page.addInitScript((dark) => dark && localStorage.setItem("startlistmaker.theme", "dark"), theme === "dark");
      await screen.open(page);
      await page.screenshot({ path: `tmp/shots/${info.project.name}/${screen.name}-${theme}.png` });
      expect(await overflowing(page)).toEqual([]);
    });
  }
}
