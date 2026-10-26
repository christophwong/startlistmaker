import { useRef, type KeyboardEvent } from "react";
import type { Day } from "~/lib/registrations";
import { cx } from "./ui";

/**
 * Two-day forms: one tab per day above Athletes, Start list and Print &
 * export. Each day keeps its own colour (Day 1 the accent, Day 2 plum) on
 * its tab, the bar under the tabs and the badge in the step title, so the
 * day on screen is clear at a glance.
 */

const tone: Record<Day, { dot: string; active: string; bar: string; badge: string }> = {
  1: { dot: "bg-day1", active: "bg-day1-soft border-day1", bar: "bg-day1", badge: "bg-day1-soft text-day1" },
  2: { dot: "bg-day2", active: "bg-day2-soft border-day2", bar: "bg-day2", badge: "bg-day2-soft text-day2" },
};

export const DAY_PANEL_ID = "day-panel";
export const dayTabId = (day: Day) => `day-tab-${day}`;

/** A small chip (a discipline code) in a day's colour, as in the Columns row cards. */
export function DayChip({ day, children }: { day: Day; children: string }) {
  return <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", tone[day].badge)}>{children}</span>;
}

export function DayBadge({ day, className }: { day: Day; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold", tone[day].badge, className)}>
      <span aria-hidden className={cx("size-2 rounded-full", tone[day].dot)} />
      Day {day}
    </span>
  );
}

export interface DayTab {
  day: Day;
  /** e.g. "Sat, Sep 5, 2026", or "" */
  date: string;
  starts: number;
}

export function DayTabs({ tabs, value, onChange }: { tabs: DayTab[]; value: Day; onChange(day: Day): void }) {
  const refs = useRef<Partial<Record<Day, HTMLButtonElement | null>>>({});
  // Arrow keys move between the tabs (and select), as in any tab list.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Day = value === 1 ? 2 : 1;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="no-print mb-6">
      <div role="tablist" aria-label="Competition day" className="grid grid-cols-2 gap-2">
        {tabs.map((t) => {
          const selected = t.day === value;
          return (
            <button
              key={t.day}
              ref={(el) => {
                refs.current[t.day] = el;
              }}
              type="button"
              role="tab"
              id={dayTabId(t.day)}
              aria-selected={selected}
              aria-controls={DAY_PANEL_ID}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.day)}
              onKeyDown={onKeyDown}
              className={cx(
                "flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected ? tone[t.day].active : "border-transparent bg-surface ring-1 ring-line hover:bg-sunken",
              )}
            >
              <span aria-hidden className={cx("size-3 shrink-0 rounded-full", tone[t.day].dot)} />
              <span className="min-w-0">
                <span className="block font-semibold">Day {t.day}</span>
                <span className="block truncate text-xs text-muted">
                  {[`${t.starts} start${t.starts === 1 ? "" : "s"}`, t.date].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div aria-hidden className={cx("mt-2 h-1 rounded-full", tone[value].bar)} />
    </div>
  );
}
