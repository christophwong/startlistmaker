import { formatClock, type TimeFormat } from "../time";
import type { EngineStart, ScheduledRow, ScheduledStart, StartListSettings } from "./types";

export interface Issue {
  severity: "error" | "warning" | "info";
  code: "RECOVERY" | "SAME_GROUP" | "UNSCHEDULED" | "BREAK_OVERLAP" | "PAST_MIDNIGHT";
  message: string;
  startIds: string[];
}

const fullName = (s: EngineStart) => `${s.firstName} ${s.lastName}`;

export function validateStartList(
  rows: ScheduledRow[],
  allStarts: EngineStart[],
  settings: StartListSettings,
  timeFormat: TimeFormat = "24h",
): Issue[] {
  const issues: Issue[] = [];
  const starts = rows.filter((r): r is ScheduledStart => r.kind === "START");

  const byAthlete = new Map<string, ScheduledStart[]>();
  for (const r of starts) {
    const list = byAthlete.get(r.start.athleteId) ?? [];
    list.push(r);
    byAthlete.set(r.start.athleteId, list);
  }

  for (const list of byAthlete.values()) {
    const sorted = [...list].sort((a, b) => a.ot - b.ot);
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      const ids = [a.start.id, b.start.id];
      if (a.group === b.group) {
        issues.push({
          severity: "error",
          code: "SAME_GROUP",
          message: `${fullName(a.start)} has two starts at the same OT (${formatClock(a.ot, timeFormat)}).`,
          startIds: ids,
        });
      } else if (b.ot - a.ot < settings.minRecoveryMin) {
        issues.push({
          severity: "warning",
          code: "RECOVERY",
          message: `${fullName(a.start)}: only ${b.ot - a.ot} min between starts (minimum ${settings.minRecoveryMin}).`,
          startIds: ids,
        });
      }
    }
  }

  for (const r of rows) {
    if (r.kind === "BREAK" && r.naturalOt !== null && r.nextOt < r.naturalOt) {
      issues.push({
        severity: "warning",
        code: "BREAK_OVERLAP",
        message: `Break resumes at ${formatClock(r.nextOt, timeFormat)}, before the previous group has finished (${formatClock(r.naturalOt, timeFormat)}).`,
        startIds: [],
      });
    }
  }

  // OTs are minutes from the day's midnight; the clock wraps them silently.
  const nextDay = starts.find((r) => r.ot >= 24 * 60);
  if (nextDay) {
    issues.push({
      severity: "warning",
      code: "PAST_MIDNIGHT",
      message: `The list runs past midnight from OT ${formatClock(nextDay.ot, timeFormat)}. Those OTs are on the next day.`,
      startIds: [nextDay.start.id],
    });
  }

  const scheduled = new Set(starts.map((r) => r.start.id));
  const missing = allStarts.filter((s) => !scheduled.has(s.id));
  if (missing.length) {
    issues.push({
      severity: "info",
      code: "UNSCHEDULED",
      message: `${missing.length} registered start${missing.length === 1 ? " is" : "s are"} not on the start list.`,
      startIds: missing.map((s) => s.id),
    });
  }
  return issues;
}
