import { DayBadge, DayChip } from "~/components/day-tabs";
import { Alert, Badge } from "~/components/ui";
import { formatPerformance } from "~/lib/disciplines";
import { FIELDS, type FieldKey, type Mapping } from "~/lib/import/columns";
import { noEntry, type ParsedRow } from "~/lib/import/rows";

/**
 * Column mapping and parsed-row preview, shared by the event import review
 * (server) and the client-side demo.
 */

export type RowStatus = "ready" | "error" | "skipped";

export const rowStatus = (p: ParsedRow): RowStatus => (p.draft ? "ready" : p.errors.length ? "error" : "skipped");

const statusBadge: Record<RowStatus, React.ReactNode> = {
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
      {labels.length === 1 ? "one" : "them"} under Column mapping.
    </Alert>
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
}: {
  days: [ParsedRow[], ParsedRow[]];
  labels: [string, string];
  common: string[];
}) {
  const byRow = new Map<number, (ParsedRow | undefined)[]>();
  days.forEach((parsed, d) =>
    parsed.forEach((p) => {
      const pair = byRow.get(p.rowNumber) ?? [undefined, undefined];
      pair[d] = p;
      byRow.set(p.rowNumber, pair);
    }),
  );
  return (
    <ul className="space-y-2">
      {[...byRow].map(([rowNumber, pair]) => {
        const draft = pair[0]?.draft ?? pair[1]?.draft;
        const statuses = pair.map((p) => (p ? rowStatus(p) : "skipped"));
        const status: RowStatus = statuses.includes("error") ? "error" : statuses.includes("ready") ? "ready" : "skipped";
        const shared = (pair[0]?.warnings ?? []).filter((w) => pair[1]?.warnings.includes(w) && !common.includes(w));
        return (
          <li key={rowNumber} className="rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted tabular-nums">Row {rowNumber}</span>
              {statusBadge[status]}
              {draft && (
                <span className="font-medium">
                  {draft.firstName} {draft.lastName}{" "}
                  <span className="font-normal text-muted">{[draft.gender, draft.country].filter(Boolean).join(" · ")}</span>
                </span>
              )}
            </div>
            <ul className="mt-1 space-y-1">
              {pair.map((p, d) => {
                const day = (d + 1) as 1 | 2;
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
              {shared.map((w) => (
                <li key={w} className="text-warn-fg">
                  {w}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
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

/**
 * Why rows fail, so a blocker isn't mistaken for one of the warnings.
 * Warnings every athlete shares (`common`) get one line here instead of one per row.
 */
export function ErrorSummary({ rows, common }: { rows: ParsedRow[]; common: string[] }) {
  const groups = errorGroups(rows);
  const ready = rows.filter((r) => r.draft).length;
  const warned = rows.filter((r) => r.draft && r.warnings.some((w) => !common.includes(w))).length;
  if (!groups.length && !warned && !common.length) return null;
  return (
    <div className="space-y-1 text-sm">
      {groups.map((g) => (
        <p key={g.message} className="text-err-fg">
          <strong className="tabular-nums">{g.count}</strong> row{g.count === 1 ? "" : "s"}: {g.message}
        </p>
      ))}
      {common.map((w) => (
        <p key={w} className="text-warn-fg">
          All <strong className="tabular-nums">{ready}</strong> athletes: {w}
        </p>
      ))}
      {warned > 0 && (
        <p className="text-warn-fg">
          <strong className="tabular-nums">{warned}</strong> row{warned === 1 ? " has" : "s have"} warnings (shown below).
          Warnings don't keep anyone off the list.
        </p>
      )}
    </div>
  );
}

export function MappingSelects({
  headers,
  mapping,
  fields = FIELDS,
  onChange,
}: {
  headers: string[];
  mapping: Mapping;
  fields?: readonly { key: FieldKey; label: string }[];
  /** Called with the column index, or undefined for "not in file". */
  onChange(key: FieldKey, column: number | undefined): void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="mb-1 block font-medium">{f.label}</span>
          <select
            name={`m.${f.key}`}
            defaultValue={mapping[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value === "" ? undefined : Number(e.target.value))}
            className="block min-h-10 w-full rounded-lg border-0 bg-field px-2 ring-1 ring-line-strong"
          >
            <option value="">— not in file —</option>
            {headers.map((h, i) => (
              <option key={i} value={i}>
                {h || `Column ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function ImportRowList({ rows, common = [] }: { rows: (ParsedRow & { status: RowStatus })[]; common?: string[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => ({ ...row, warnings: row.warnings.filter((w) => !common.includes(w)) })).map((r) => (
        <li
          key={r.rowNumber}
          className="rounded-xl bg-surface p-3 text-sm ring-1 ring-line"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted tabular-nums">Row {r.rowNumber}</span>
            {statusBadge[r.status]}
            {r.draft && (
              <span className="font-medium">
                {r.draft.firstName} {r.draft.lastName}{" "}
                <span className="font-normal text-muted">
                  {[r.draft.gender, r.draft.country].filter(Boolean).join(" · ")}
                </span>
              </span>
            )}
            {r.draft?.starts.map((s) => (
              <span key={s.startNumber} className="text-ink-2">
                <Badge tone="brand">{s.discipline}</Badge> {formatPerformance(s.discipline, s.ap)}
              </span>
            ))}
          </div>
          {(r.errors.length > 0 || r.warnings.length > 0) && (
            <ul className="mt-1 space-y-0.5">
              {r.errors.map((e) => (
                <li key={e} className="text-err-fg">
                  {e}
                </li>
              ))}
              {r.warnings.map((w) => (
                <li key={w} className="text-warn-fg">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
