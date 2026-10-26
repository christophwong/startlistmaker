/**
 * Durations are whole seconds; clock times are minutes since midnight.
 */

/**
 * Parses an athlete-entered duration such as `1:45`, `0:01:45`, `1'45"`,
 * `1m45s`, `4 min`, `105`, or `1.45`. Returns seconds or null.
 *
 * Bare numbers below 20 are minutes (`4` → 4:00), larger ones are seconds
 * (`105` → 1:45). Spreadsheets often store a typed `1:45` as 1h45m
 * (`1:45:00`); since no freedive lasts hours, `h:mm:00` with h < 20 is
 * read as `m:ss`.
 */
export function parseDuration(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/[’′]/g, "'").replace(/[″"]/g, "");
  s = s.replace(/'/g, ":").replace(/:$/, "");

  let m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const [h, mm, ss] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mm >= 60 || ss >= 60) return null;
    if (h > 0 && h < 20 && ss === 0) return h * 60 + mm;
    return h * 3600 + mm * 60 + ss;
  }

  m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const ss = Number(m[2]);
    return ss < 60 ? Number(m[1]) * 60 + ss : null;
  }

  m = s.match(/^(\d+)\.(\d{2})$/);
  if (m) {
    const ss = Number(m[2]);
    return ss < 60 ? Number(m[1]) * 60 + ss : null;
  }

  m = s.match(
    /^(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?))?\s*(?:(\d+)\s*(?:s|sec|secs|seconds?))?$/,
  );
  if (m && (m[1] || m[2])) {
    return Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0);
  }

  m = s.match(/^\d+(?:\.\d+)?$/);
  if (m) {
    const n = Number(s);
    return n < 20 ? Math.round(n * 60) : Math.round(n);
  }
  return null;
}

/** 105 → "1:45"; null (not given) → "" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type TimeFormat = "24h" | "12h";

const DAY = 24 * 60;

/** Parses `09:30`, `9:30`, `9:30 pm`, `21:30`. Returns minutes since midnight. */
export function parseClock(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = String(input)
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.[0];
  if (min >= 60) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (h === 12) h = 0;
    if (ampm === "p") h += 12;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

/** Formats minutes since midnight: 24h → "9:45", 12h → "9:45 AM". */
export function formatClock(minutes: number, format: TimeFormat = "24h"): string {
  const t = ((Math.round(minutes) % DAY) + DAY) % DAY;
  const h = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, "0");
  if (format === "24h") return `${h}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/** Value for `<input type="time">`: "09:05". */
export function toTimeInput(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const t = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
