import { useState } from "react";
import { Button } from "~/components/ui";
import type { FieldKey, Mapping } from "~/lib/import/columns";
import { missingColumns, type Action, type AppState } from "~/state/store";

/** "Dicipline | Day 1 — CWTB, CWTB, CNF…": a column and the first answers in it. */
function columnOption(header: string, rows: string[][], i: number) {
  const values = rows.map((r) => String(r[i] ?? "").trim()).filter(Boolean);
  const sample = values.slice(0, 3).join(", ") + (values.length > 3 ? "…" : "");
  return `${header.trim() || `Column ${i + 1}`}${sample ? ` — ${sample}` : ""}`;
}

/**
 * In place of the list while a required column (name, discipline, AP) has no
 * column: one question per field, and the list appears once they're answered.
 */
export function MissingColumnsCard({ state, dispatch, onColumns }: { state: AppState; dispatch(a: Action): void; onColumns(): void }) {
  const source = state.source!;
  const missing = missingColumns(state);
  const [picks, setPicks] = useState<Partial<Record<FieldKey, string>>>({});
  const used = new Set(Object.values(state.mapping));
  const columns = source.table.headers.map((h, i) => ({ i, label: columnOption(h, source.table.rows, i) }));
  const answered = missing.every((m) => picks[m.key]);

  const build = () => {
    const mapping: Mapping = { ...state.mapping };
    for (const m of missing) {
      const col = Number(picks[m.key]);
      for (const k of Object.keys(mapping) as FieldKey[]) if (mapping[k] === col) delete mapping[k];
      mapping[m.key] = col;
    }
    dispatch({ type: "mapping", mapping });
  };

  const what = missing.map((m) => m.label.toLowerCase()).join(", ");
  return (
    <section aria-labelledby="missing-title" className="space-y-4 rounded-xl bg-surface p-5 shadow-[inset_4px_0_0_var(--accent)] ring-1 ring-line">
      <div>
        <h2 id="missing-title" className="text-xl font-bold tracking-tight">
          {missing.length === 1 ? "Which column has this?" : "Which columns have these?"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          No column header names the {what}, and no column's answers look like it, so the start list can't be built yet. Pick{" "}
          {missing.length === 1 ? "it" : "them"} and the list appears here.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {missing.map((m) => (
          <label key={m.key} className="block text-sm">
            <span className="mb-1 block font-medium">{m.label}</span>
            <select
              value={picks[m.key] ?? ""}
              onChange={(e) => setPicks({ ...picks, [m.key]: e.target.value })}
              className="block min-h-11 w-full rounded-lg border-0 bg-field px-2 ring-1 ring-line-strong sm:min-h-10"
            >
              <option value="">Choose a column…</option>
              {columns.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.label}
                  {used.has(c.i) ? " (in use)" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={build} disabled={!answered}>
          Build the start list
        </Button>
        <button type="button" onClick={onColumns} className="min-h-10 text-sm font-semibold text-accent hover:underline">
          Match all the columns instead
        </button>
      </div>
    </section>
  );
}
