import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * axe-core (WCAG 2.1 A and AA) on each screen, in both themes. axe runs inside
 * the page, so it makes no requests of its own.
 */

async function violations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.map((v) => `${screen}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

for (const theme of ["light", "dark"] as const) {
  test(`no accessibility violations on any screen (${theme})`, async ({ page }) => {
    await page.addInitScript((dark) => dark && localStorage.setItem("startlistmaker.theme", "dark"), theme === "dark");
    const found: string[] = [];

    await page.goto("/");
    found.push(...(await violations(page, "home")));

    await page.goto("/#demo");
    await expect(page.getByRole("heading", { name: "Start list" })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    found.push(...(await violations(page, "start list")));

    for (const name of ["Athletes", "Print & export"] as const) {
      await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
      found.push(...(await violations(page, name)));
    }

    if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Help" }).click();
    await expect(page.getByRole("dialog", { name: "Help" })).toBeVisible();
    found.push(...(await violations(page, "help")));

    expect(found).toEqual([]);
  });
}
