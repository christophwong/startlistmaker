/**
 * Light by default; dark only when chosen with the header toggle. The choice
 * is a display preference (no athlete data), kept in localStorage once
 * toggled; "Clear all data" removes it too.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "startlistmaker.theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** `save` only for a toggle click, so a visit that never toggles stores nothing. */
export function applyTheme(theme: Theme, save = false) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (!save) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private window or blocked storage: the toggle still works for this page
  }
}
