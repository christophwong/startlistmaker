import { useState } from "react";
import { DayBadge } from "~/components/day-tabs";
import { ArrowIcon } from "~/components/icons";
import { Alert, cx, SideCard } from "~/components/ui";
import { FIELDS, type FieldKey, type Mapping } from "~/lib/import/columns";
import type { ParsedRow } from "~/lib/import/rows";
import type { Day } from "~/lib/registrations";

/** How the file's columns are read, and what that gives, in the Columns panel. */

type RowStatus = "ready" | "error" | "skipped";

const rowStatus = (p: ParsedRow): RowStatus => (p.draft ? "ready" : p.errors.length ? "error" : "skipped");

/** "Start 2 – AP" → "Day 2 – AP" for forms with one section per day. */
const relabel = (label: string, days: [string, string] | null) =>
  days ? label.replace(/^Start ([12])/, (_, n: string) => days[Number(n) - 1]) : label;

/** Start-2 fields are hidden when the file and competition have one start. */
export const mappableFields = (maxStarts: number, days: [string, string] | null = null) =>
  FIELDS.filter((f) => maxStarts > 1 || !f.key.startsWith("s2")).map((f) => ({
    key: f.key,
    label: relabel(f.label, days),
  }));

/** Banner for required fields with no column: every row would fail. */
export function MissingColumns({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <Alert tone="error">
      No column is chosen for <strong>{labels.join(", ")}</strong>. No athlete can be read until you choose{" "}
      {labels.length === 1 ? "one" : "them"} under “Use as” below. Columns that aren't used are under “Show them”.
    </Alert>
  );
}

/**
 * One line per column in the file: its header, what it's used as (a select)
 * and its first value. Columns that aren't used are folded away until asked
 * for (or until a required field has no column).
 */
export function MappingTable({
  headers,
  rows,
  mapping,
  fields,
  required,
  showUnusedFirst,
  inferred,
  onChange,
}: {
  headers: string[];
  rows: string[][];
  mapping: Mapping;
  /** Fields whose column was found by its values (the header wasn't recognised). */
  inferred?: readonly FieldKey[];
  fields: readonly { key: FieldKey; label: string }[];
  /** Fields every row needs (labelled "Required" under the select). */
  required: ReadonlySet<FieldKey>;
  /** Start with the unused columns showing. */
  showUnusedFirst: boolean;
  /** `key` undefined means "Not used". */
  onChange(column: number, key: FieldKey | undefined): void;
}) {
  const [showUnused, setShowUnused] = useState(showUnusedFirst);
  const keyOf = (i: number) => fields.find((f) => mapping[f.key] === i)?.key;
  const firstValue = (i: number) => String(rows.find((r) => String(r[i] ?? "").trim())?.[i] ?? "").trim();
  const columns = headers.map((h, i) => ({ i, header: h.trim() || `Column ${i + 1}`, key: keyOf(i) }));
  const unused = columns.filter((c) => !c.key).length;
  const shown = showUnused ? columns : columns.filter((c) => c.key);
  // Grouped like the form: who the athlete is, then each start or day.
  const groups = [
    { label: "Athlete", fields: fields.filter((f) => !/^s[12]/.test(f.key)) },
    ...([1, 2] as const).map((n) => {
      const own = fields.filter((f) => f.key.startsWith(`s${n}`));
      return { label: own[0]?.label.split(" – ")[0] ?? `Start ${n}`, fields: own };
    }),
  ].filter((g) => g.fields.length);

  return (
    <section aria-label="Column mapping" className="rounded-xl bg-surface ring-1 ring-line">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_1rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
        <span>Column in your file</span>
        <span />
        <span>Use as</span>
        <span>First value</span>
      </div>
      <ul>
        {shown.map((c) => (
          <li
            key={c.i}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.3fr)_1rem_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <span className={cx("min-w-0 text-sm", c.key ? "font-medium" : "text-muted")}>
              <span className="block truncate" title={c.header}>
                {c.header}
              </span>
              <span className="block truncate text-xs font-normal text-muted sm:hidden">{firstValue(c.i) || "—"}</span>
            </span>
            <ArrowIcon className="hidden text-muted/70 sm:block" />
            <label className="min-w-0">
              <span className="sr-only">Use {c.header} as</span>
              <select
                name={`col.${c.i}`}
                value={c.key ?? ""}
                onChange={(e) => onChange(c.i, (e.target.value || undefined) as FieldKey | undefined)}
                className={cx(
                  "block min-h-10 w-full rounded-lg border-0 bg-field px-2 text-sm ring-1 ring-line-strong",
                  !c.key && "text-muted",
                )}
              >
                <option value="">Not used</option>
                {groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {c.key && inferred?.includes(c.key) ? (
                <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-px text-xs font-medium text-accent">
                  Matched by its values
                </span>
              ) : (
                c.key && required.has(c.key) && <span className="mt-0.5 block text-xs text-muted">Required</span>
              )}
            </label>
            <span className="hidden truncate text-sm text-ink-2 tabular-nums sm:block" title={firstValue(c.i)}>
              {firstValue(c.i) || <span className="text-muted">—</span>}
            </span>
          </li>
        ))}
      </ul>
      {unused > 0 && (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          {showUnused
            ? `${unused} column${unused === 1 ? " isn't" : "s aren't"} used.`
            : `${unused} more column${unused === 1 ? " isn't" : "s aren't"} used (timestamps, notes and the like).`}{" "}
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setShowUnused(!showUnused)}>
            {showUnused ? "Hide them" : "Show them"}
          </button>
        </p>
      )}
    </section>
  );
}

/** Row errors grouped by message ("18 rows: Start 1: AP is missing."). */
function errorGroups(rows: ParsedRow[]): { message: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const e of r.errors) {
      const message = e.replace(/"[^"]*"/g, "“…”");
      counts.set(message, (counts.get(message) ?? 0) + 1);
    }
  }
  return [...counts].map(([message, count]) => ({ message, count })).sort((a, b) => b.count - a.count);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What the import gives: athletes ready (and starts, when they differ), rows
 * that need fixing and rows skipped. Then why rows fail, so a blocker isn't
 * mistaken for a warning, and warnings every athlete shares (`common`) once.
 */
export function ResultCard({ rows, common, day }: { rows: ParsedRow[]; common: string[]; day?: Day }) {
  const ready = rows.filter((r) => r.draft);
  const fixing = rows.filter((r) => rowStatus(r) === "error").length;
  const skipped = rows.length - ready.length - fixing;
  const starts = ready.reduce((n, r) => n + r.draft!.starts.length, 0);
  const warned = ready.filter((r) => r.warnings.some((w) => !common.includes(w))).length;
  const groups = errorGroups(rows);
  const key = (dot: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cx("size-2 rounded-full", dot)} />
      {text}
    </span>
  );
  return (
    <SideCard title={day ? <>Result <DayBadge day={day} className="normal-case tracking-normal" /></> : "Result"}>
      <p className="flex items-baseline gap-2">
        <span className="text-[32px] leading-none font-bold tracking-tight tabular-nums">{ready.length}</span>
        <span className="text-sm text-ink-2">
          athlete{ready.length === 1 ? "" : "s"} ready{starts !== ready.length && ` · ${plural(starts, "start")}`}
        </span>
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        {key("bg-ok-fg", `${ready.length} ready`)}
        {key("bg-err-fg", `${fixing} need${fixing === 1 ? "s" : ""} fixing`)}
        {key("bg-muted", `${skipped} skipped`)}
      </p>
      {(groups.length > 0 || common.length > 0 || warned > 0) && (
        <div className="mt-3 space-y-1 border-t border-line-soft pt-3 text-sm">
          {groups.map((g) => (
            <p key={g.message} className="text-err-fg">
              <strong className="tabular-nums">{plural(g.count, "row")}</strong>: {g.message}
            </p>
          ))}
          {common.map((w) => (
            <p key={w} className="text-warn-fg">
              All <strong className="tabular-nums">{ready.length}</strong> athletes: {w}
            </p>
          ))}
          {warned > 0 && (
            <p className="text-warn-fg">
              <strong className="tabular-nums">{plural(warned, "row")}</strong> {warned === 1 ? "has" : "have"} warnings. Warnings don't keep
              anyone off the list; Athletes shows them.
            </p>
          )}
        </div>
      )}
    </SideCard>
  );
}
