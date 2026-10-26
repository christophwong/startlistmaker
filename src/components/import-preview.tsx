import { useState, type ReactNode } from "react";
import { DayBadge, DayChip } from "~/components/day-tabs";
import { ArrowIcon } from "~/components/icons";
import { Alert, Badge, cx, SideCard } from "~/components/ui";
import { formatPerformance } from "~/lib/disciplines";
import { FIELDS, type FieldKey, type Mapping } from "~/lib/import/columns";
import { noEntry, type ParsedRow } from "~/lib/import/rows";
import type { Day } from "~/lib/registrations";

/** Column mapping and the parsed rows on the Columns step. */

export type RowStatus = "ready" | "error" | "skipped";

export const rowStatus = (p: ParsedRow): RowStatus => (p.draft ? "ready" : p.errors.length ? "error" : "skipped");

const statusBadge: Record<RowStatus, ReactNode> = {
  ready: <Badge tone="emerald">Ready</Badge>,
  error: <Badge tone="red">Needs fixing</Badge>,
  skipped: <Badge>Skipped</Badge>,
};

/** "Start 2 – AP" → "Day 2 – AP" for forms with one section per day. */
export const relabel = (label: string, days: [string, string] | null) =>
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
  onChange,
}: {
  headers: string[];
  rows: string[][];
  mapping: Mapping;
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
              {c.key && required.has(c.key) && <span className="mt-0.5 block text-xs text-muted">Required</span>}
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
export function errorGroups(rows: ParsedRow[]): { message: string; count: number }[] {
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
              anyone off the list.
            </p>
          )}
        </div>
      )}
    </SideCard>
  );
}

function RowCard({
  rowNumber,
  status,
  draft,
  onFix,
  children,
}: {
  rowNumber: number;
  status: RowStatus;
  draft?: ParsedRow["draft"];
  onFix?: (rowNumber: number) => void;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface p-3 text-sm ring-1 ring-line sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 sm:w-24">{statusBadge[status]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="tabular-nums">Row {rowNumber}</span>
          {draft && (
            <>
              {" "}
              · {draft.firstName} {draft.lastName}{" "}
              <span className="font-normal text-muted">{[draft.gender, draft.country].filter(Boolean).join(" · ")}</span>
            </>
          )}
        </p>
        {children}
      </div>
      {status === "error" && onFix && (
        <button type="button" onClick={() => onFix(rowNumber)} className="shrink-0 text-left font-semibold text-accent hover:underline">
          Fix it on Athletes
        </button>
      )}
    </li>
  );
}

function Messages({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4">
      {errors.map((e) => (
        <li key={e} className="text-err-fg">
          {e}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={w} className="text-warn-fg">
          {w}
        </li>
      ))}
    </ul>
  );
}

/** Rows with an error, or a warning of their own (not one every athlete shares). */
export function importProblems(rows: ParsedRow[], common: string[]): Set<number> {
  return new Set(rows.filter((r) => rowStatus(r) === "error" || r.warnings.some((w) => !common.includes(w))).map((r) => r.rowNumber));
}

/** The same for a two-day form; "No Day 2 entry" is not a problem (the athlete isn't diving that day). */
export function dayProblems(days: [ParsedRow[], ParsedRow[]], labels: [string, string], common: string[]): Set<number> {
  const own = (p: ParsedRow | undefined, d: number) => (p?.warnings ?? []).some((w) => !common.includes(w) && w !== noEntry(labels[d]));
  return new Set(
    dayRows(days)
      .filter((r) => r.status === "error" || r.pair.some(own))
      .map((r) => r.rowNumber),
  );
}

/**
 * The rows, at first only the ones with problems. With none, the list is
 * folded away ("Show all rows"), since every card would just say Ready.
 */
export function RowsSection({
  total,
  problems,
  children,
}: {
  total: number;
  problems: number;
  /** `onlyProblems`: show just the rows with problems. */
  children(onlyProblems: boolean): ReactNode;
}) {
  const [filtered, setFiltered] = useState(true);
  return (
    <section aria-label="Rows" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold tracking-tight">Rows</h3>
        {problems > 0 ? (
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={filtered} onChange={(e) => setFiltered(e.target.checked)} className="accent-accent" />
            Only rows with problems ({problems} of {total})
          </label>
        ) : (
          <p className="text-sm text-muted">
            No row has a problem.{" "}
            <button type="button" className="font-semibold text-accent hover:underline" aria-expanded={!filtered} onClick={() => setFiltered(!filtered)}>
              {filtered ? `Show all ${total} rows` : "Hide them"}
            </button>
          </p>
        )}
      </div>
      {(problems > 0 || !filtered) && children(problems > 0 && filtered)}
    </section>
  );
}

/**
 * A two-day form's rows, each read once per day: one card per row with a
 * line per day. Messages both days share (name, gender, contact) are said
 * once; warnings every athlete has (`common`) are left to the summary.
 */
export function DayRowList({
  days,
  labels,
  common,
  only,
  onFix,
}: {
  days: [ParsedRow[], ParsedRow[]];
  labels: [string, string];
  common: string[];
  /** Show only these rows (by row number). */
  only?: Set<number>;
  onFix?: (rowNumber: number) => void;
}) {
  return (
    <ul className="space-y-2">
      {dayRows(days)
        .filter((r) => !only || only.has(r.rowNumber))
        .map(({ rowNumber, pair, status }) => {
          const draft = pair[0]?.draft ?? pair[1]?.draft;
          const shared = (pair[0]?.warnings ?? []).filter((w) => pair[1]?.warnings.includes(w) && !common.includes(w));
          return (
            <RowCard key={rowNumber} rowNumber={rowNumber} status={status} draft={draft} onFix={onFix}>
              <ul className="mt-1 space-y-1">
                {pair.map((p, d) => {
                  const day = (d + 1) as Day;
                  const notEntered = !p || p.warnings.includes(noEntry(labels[d]));
                  const own = (p?.warnings ?? []).filter((w) => !shared.includes(w) && !common.includes(w) && w !== noEntry(labels[d]));
                  return (
                    <li key={d} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <DayBadge day={day} className="!text-xs" />
                      {notEntered ? (
                        <span className="text-muted">Not entered</span>
                      ) : (
                        p.draft?.starts.map((s) => (
                          <span key={s.startNumber} className="text-ink-2">
                            <DayChip day={day}>{s.discipline}</DayChip> {formatPerformance(s.discipline, s.ap)}
                          </span>
                        ))
                      )}
                      {p?.errors.map((e) => (
                        <span key={e} className="text-err-fg">
                          {e}
                        </span>
                      ))}
                      {own.map((w) => (
                        <span key={w} className="text-warn-fg">
                          {w}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
              <Messages errors={[]} warnings={shared} />
            </RowCard>
          );
        })}
    </ul>
  );
}

/** A two-day form's rows paired by row number, with one status for both days. */
export function dayRows(days: [ParsedRow[], ParsedRow[]]) {
  const byRow = new Map<number, (ParsedRow | undefined)[]>();
  days.forEach((parsed, d) =>
    parsed.forEach((p) => {
      const pair = byRow.get(p.rowNumber) ?? [undefined, undefined];
      pair[d] = p;
      byRow.set(p.rowNumber, pair);
    }),
  );
  return [...byRow].map(([rowNumber, pair]) => {
    const statuses = pair.map((p) => (p ? rowStatus(p) : "skipped"));
    const status: RowStatus = statuses.includes("error") ? "error" : statuses.includes("ready") ? "ready" : "skipped";
    return { rowNumber, pair, status };
  });
}

export function ImportRowList({
  rows,
  common = [],
  only,
  onFix,
}: {
  rows: ParsedRow[];
  common?: string[];
  /** Show only these rows (by row number). */
  only?: Set<number>;
  onFix?: (rowNumber: number) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows
        .filter((r) => !only || only.has(r.rowNumber))
        .map((r) => ({ ...r, status: rowStatus(r), warnings: r.warnings.filter((w) => !common.includes(w)) }))
        .map((r) => (
          <RowCard key={r.rowNumber} rowNumber={r.rowNumber} status={r.status} draft={r.draft} onFix={onFix}>
            {r.draft && r.draft.starts.length > 0 && (
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-ink-2">
                {r.draft.starts.map((s) => (
                  <span key={s.startNumber}>
                    <Badge tone="brand">{s.discipline}</Badge> {formatPerformance(s.discipline, s.ap)}
                  </span>
                ))}
              </p>
            )}
            <Messages errors={r.errors} warnings={r.warnings} />
          </RowCard>
        ))}
    </ul>
  );
}
