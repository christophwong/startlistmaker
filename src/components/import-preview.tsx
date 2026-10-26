import { Alert, Badge } from "~/components/ui";
import { formatPerformance } from "~/lib/disciplines";
import { FIELDS, type FieldKey, type Mapping } from "~/lib/import/columns";
import type { ParsedRow } from "~/lib/import/rows";

/**
 * Column mapping and parsed-row preview, shared by the event import review
 * (server) and the client-side demo.
 */

export type RowStatus = "new" | "update" | "error" | "skipped";

export const rowStatus = (p: ParsedRow, isUpdate = false): RowStatus =>
  !p.draft ? (p.errors.length ? "error" : "skipped") : isUpdate ? "update" : "new";

const statusBadge: Record<RowStatus, React.ReactNode> = {
  new: <Badge tone="emerald">New</Badge>,
  update: <Badge tone="brand">Update</Badge>,
  error: <Badge tone="red">Error</Badge>,
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
      No column is mapped to <strong>{labels.join(", ")}</strong>. Every row will fail until you pick{" "}
      {labels.length === 1 ? "one" : "them"} under Column mapping.
    </Alert>
  );
}

/** One select to choose which day of a two-day form to import. */
export function DayPicker({
  labels,
  value,
  onChange,
}: {
  labels: [string, string];
  value: 1 | 2;
  onChange(n: 1 | 2): void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Import columns for</span>
      <select
        name="use"
        value={value}
        onChange={(e) => onChange(e.target.value === "2" ? 2 : 1)}
        className="min-h-10 rounded-lg border-0 bg-white px-2 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
      >
        <option value={1}>{labels[0]}</option>
        <option value={2}>{labels[1]}</option>
      </select>
    </label>
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

/** Why rows fail, so a blocker isn't mistaken for one of the warnings. */
export function ErrorSummary({ rows }: { rows: ParsedRow[] }) {
  const groups = errorGroups(rows);
  const warned = rows.filter((r) => r.draft && r.warnings.length).length;
  if (!groups.length && !warned) return null;
  return (
    <div className="space-y-1 text-sm">
      {groups.map((g) => (
        <p key={g.message} className="text-red-600">
          <strong className="tabular-nums">{g.count}</strong> row{g.count === 1 ? "" : "s"}: {g.message}
        </p>
      ))}
      {warned > 0 && (
        <p className="text-amber-700 dark:text-amber-300">
          <strong className="tabular-nums">{warned}</strong> row{warned === 1 ? "" : "s"} will import with
          warnings (shown below); warnings don't block the import.
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
            className="block min-h-10 w-full rounded-lg border-0 bg-white px-2 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
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

export function ImportRowList({ rows }: { rows: (ParsedRow & { status: RowStatus })[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.rowNumber}
          className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 tabular-nums">Row {r.rowNumber}</span>
            {statusBadge[r.status]}
            {r.draft && (
              <span className="font-medium">
                {r.draft.firstName} {r.draft.lastName}{" "}
                <span className="font-normal text-slate-500">
                  {[r.draft.gender, r.draft.country].filter(Boolean).join(" · ")}
                </span>
              </span>
            )}
            {r.draft?.starts.map((s) => (
              <span key={s.startNumber} className="text-slate-600 dark:text-slate-400">
                <Badge tone="brand">{s.discipline}</Badge> {formatPerformance(s.discipline, s.ap)}
              </span>
            ))}
          </div>
          {(r.errors.length > 0 || r.warnings.length > 0) && (
            <ul className="mt-1 space-y-0.5">
              {r.errors.map((e) => (
                <li key={e} className="text-red-600">
                  {e}
                </li>
              ))}
              {r.warnings.map((w) => (
                <li key={w} className="text-amber-700 dark:text-amber-300">
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
