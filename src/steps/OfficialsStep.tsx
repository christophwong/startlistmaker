import { useState, type MouseEvent, type ReactNode } from "react";
import { DayBadge } from "~/components/day-tabs";
import { DisciplineChip } from "~/components/discipline-chip";
import { ArrowIcon, TrashIcon } from "~/components/icons";
import { laneLabel, type EditorRow } from "~/components/start-list/rows";
import { Alert, Button, cx } from "~/components/ui";
import { formatPerformance, type Discipline } from "~/lib/disciplines";
import {
  crewAt,
  crewNames,
  crewOutOfDate,
  defaultSections,
  setCrew,
  shapeOf,
  type Crew,
  type CrewField,
  type CrewNames,
  type CrewSection,
  type Slot,
} from "~/lib/export/crew";
import type { SheetKind } from "~/lib/export/table";
import { formatClock } from "~/lib/time";
import { useStartList } from "~/state/derived";
import type { Action, AppState } from "~/state/store";

/**
 * Judge and safety names for the judge and safety sheets, entered by
 * selecting rows and applying names to all of them at once. Names belong to
 * the slot (OT group and zone), not the diver; see lib/export/crew.ts.
 */

type StartRow = Extract<EditorRow, { kind: "START" }>;

const FIELDS: { key: CrewField; label: string; hint: string }[] = [
  { key: "judge", label: "Judge", hint: "per zone" },
  { key: "safety", label: "Safety", hint: "per zone" },
  { key: "deck", label: "Deck", hint: "per OT" },
  { key: "warmUp", label: "Warm up", hint: "per OT" },
];
const NAMES_LIST = "crew-names";
const noNames: CrewNames = { judge: "", safety: "", deck: "", warmUp: "" };

const cellInput =
  "block h-9 w-full min-w-24 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-muted/60 focus:bg-field focus:ring-2 focus:ring-accent focus:ring-inset";
const grid = "border-b border-line";

interface Filters {
  parts: Set<number>;
  disciplines: Set<Discipline>;
  zones: Set<number>;
}
const noFilters = (): Filters => ({ parts: new Set(), disciplines: new Set(), zones: new Set() });

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** A text cell that saves when it loses focus (or on Enter). Remounted when the stored value changes. */
function NameInput({ value, label, onSave, className }: { value: string; label: string; onSave(v: string): void; className?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      aria-label={label}
      list={NAMES_LIST}
      maxLength={80}
      className={cx(cellInput, className)}
      onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-9 items-center rounded-full px-3 text-sm ring-1 ring-inset sm:min-h-8",
        pressed ? "bg-accent font-semibold text-on-accent ring-accent" : "bg-surface text-ink-2 ring-line-strong hover:bg-sunken",
      )}
    >
      {children}
    </button>
  );
}

export function OfficialsStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { rows } = useStartList(state);
  const { settings, crew } = state;
  const zone = laneLabel(settings);
  const shape = shapeOf(rows);
  const fmt = (t: number) => formatClock(t, settings.timeFormat);

  // Which stretch between breaks each start is in.
  const part = new Map<string, number>();
  let breaks = 0;
  for (const r of rows) {
    if (r.kind === "BREAK") breaks++;
    else part.set(r.entryId, breaks);
  }
  const starts = rows.filter((r): r is StartRow => r.kind === "START");
  const disciplines = [...new Set(starts.map((r) => r.start.discipline))];
  const parts = new Set(part.values()).size;
  const sectionAt = new Map(crew.sections.map((s) => [s.beforeGroup, s]));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [draft, setDraft] = useState<CrewNames>(noNames);
  const [undo, setUndo] = useState<{ crew: Crew; message: string } | null>(null);

  const edit = (fn: (c: Crew, newId: string) => Crew, message?: string) => {
    setUndo(message ? { crew, message } : null);
    dispatch({ type: "crew", edit: fn });
  };
  const saveCell = (slot: Slot, field: CrewField, value: string) => edit((c) => setCrew(c, [slot], { [field]: value }, shape));
  const saveSection = (id: string, patch: Partial<CrewSection>) =>
    edit((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const chosen = starts.filter((r) => selected.has(r.entryId));
  const filled = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim())) as Partial<CrewNames>;
  const plural = (n: number) => `${n} start${n === 1 ? "" : "s"}`;

  // Chips replace the selection with the starts that match every kind of chip pressed.
  const select = (next: Filters) => {
    setFilters(next);
    const any = next.parts.size || next.disciplines.size || next.zones.size;
    const match = (r: StartRow) =>
      (!next.parts.size || next.parts.has(part.get(r.entryId)!)) &&
      (!next.disciplines.size || next.disciplines.has(r.start.discipline)) &&
      (!next.zones.size || next.zones.has(r.lane));
    setSelected(new Set(any ? starts.filter(match).map((r) => r.entryId) : []));
  };

  // Shift-click selects the range from the last row clicked, like a spreadsheet.
  const toggleRow = (id: string, e: MouseEvent<HTMLInputElement>) => {
    const next = new Set(selected);
    const on = !selected.has(id);
    const from = anchor ? starts.findIndex((r) => r.entryId === anchor) : -1;
    const to = starts.findIndex((r) => r.entryId === id);
    const range = e.shiftKey && from >= 0 ? starts.slice(Math.min(from, to), Math.max(from, to) + 1) : [starts[to]];
    for (const r of range) {
      if (on) next.add(r.entryId);
      else next.delete(r.entryId);
    }
    setSelected(next);
    setAnchor(id);
  };

  const apply = () => {
    edit((c) => setCrew(c, chosen, filled, shape), `Names set on ${plural(chosen.length)}.`);
    setDraft(noNames);
  };
  const clear = () => edit((c) => setCrew(c, chosen, noNames, shape), `Names cleared on ${plural(chosen.length)}.`);
  const firstGroup = chosen[0]?.group;
  const addSection = (beforeGroup: number) =>
    edit((c, id) => ({
      ...c,
      sections: [...c.sections, { id, beforeGroup, label: "WARM UP", note: "" }].sort((a, b) => a.beforeGroup - b.beforeGroup),
    }));
  const preview = (sheet: SheetKind) => {
    dispatch({ type: "print", patch: { sheet } });
    dispatch({ type: "step", step: "final" });
  };

  const sectionRow = (s: CrewSection, r: StartRow, phone?: boolean) => (
    <div className={cx("flex flex-wrap items-center gap-2 bg-sunken px-3 py-2", phone && "rounded-lg")}>
      <span className="text-xs font-bold tracking-wider text-muted uppercase">Warm-up row · {fmt(r.wt)}</span>
      <input
        key={`l${s.label}`}
        defaultValue={s.label}
        aria-label={`Warm-up row label before ${fmt(r.ot)}`}
        maxLength={80}
        className="min-h-9 min-w-40 flex-1 rounded-md bg-field px-2 text-sm font-semibold uppercase ring-1 ring-line-strong ring-inset"
        onBlur={(e) => e.target.value !== s.label && saveSection(s.id, { label: e.target.value.slice(0, 80) })}
      />
      <input
        key={`n${s.note}`}
        defaultValue={s.note}
        placeholder="Note (names, lanes)"
        aria-label={`Warm-up row note before ${fmt(r.ot)}`}
        maxLength={80}
        list={NAMES_LIST}
        className="min-h-9 min-w-40 flex-[2] rounded-md bg-field px-2 text-sm ring-1 ring-line-strong ring-inset"
        onBlur={(e) => e.target.value !== s.note && saveSection(s.id, { note: e.target.value.slice(0, 80) })}
      />
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove the warm-up row before ${fmt(r.ot)}`}
        onClick={() => edit((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }))}
      >
        <TrashIcon />
      </Button>
    </div>
  );

  // The first start of each OT group gets the group's section row, if any.
  const firstOfGroup = new Set<string>();
  {
    let last = 0;
    for (const r of starts) {
      if (r.group !== last) firstOfGroup.add(r.entryId);
      last = r.group;
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-[28px]">
            Judge & safety names {state.twoDay && <DayBadge day={state.day} />}
          </h2>
          <p className="mt-1 max-w-2xl text-muted">
            Select starts, then set names for all of them at once. Names stay with the {zone.toLowerCase()} and time, not the
            diver, so reordering the list moves divers under them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => dispatch({ type: "step", step: "final" })}>
            <ArrowIcon dir="left" /> Back to print & export
          </Button>
          <Button variant="secondary" onClick={() => preview("JUDGES")}>
            Judge sheet
          </Button>
          <Button onClick={() => preview("SAFETY")}>Safety sheet</Button>
        </div>
      </div>

      {crewOutOfDate(crew, rows) && (
        <Alert tone="warning">
          The start list has changed since names were set (a different number of OTs or {zone.toLowerCase()}s). Names stay on
          their OT and {zone.toLowerCase()}, so check them below.
        </Alert>
      )}

      <datalist id={NAMES_LIST}>
        {crewNames(crew).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <section aria-label="Select starts" className="space-y-2 rounded-xl bg-surface p-4 ring-1 ring-line">
        <p className="text-sm font-medium">Select</p>
        <div className="flex flex-wrap items-center gap-2">
          {parts > 1 &&
            Array.from({ length: parts }, (_, i) => (
              <Chip key={i} pressed={filters.parts.has(i)} onClick={() => select({ ...filters, parts: toggled(filters.parts, i) })}>
                {i === 0 ? "Before break" : parts === 2 ? "After break" : `After break ${i}`}
              </Chip>
            ))}
          {disciplines.map((d) => (
            <Chip key={d} pressed={filters.disciplines.has(d)} onClick={() => select({ ...filters, disciplines: toggled(filters.disciplines, d) })}>
              {d}
            </Chip>
          ))}
          {Array.from({ length: shape.lanes }, (_, i) => i + 1).map((l) => (
            <Chip key={l} pressed={filters.zones.has(l)} onClick={() => select({ ...filters, zones: toggled(filters.zones, l) })}>
              {zone} {l}
            </Chip>
          ))}
          <span className="mx-1 h-6 w-px bg-line" />
          <Button variant="ghost" size="sm" onClick={() => (setFilters(noFilters()), setSelected(new Set(starts.map((r) => r.entryId))))}>
            All
          </Button>
          <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => select(noFilters())}>
            None
          </Button>
        </div>
        <p className="text-xs text-muted">
          Chips combine: “After break” and “{zone} 2” selects {zone.toLowerCase()} 2 after the break. Shift-click a checkbox to
          select a range.
          {crew.sections.length === 0 && " "}
          {crew.sections.length === 0 && (
            <button
              type="button"
              className="font-medium text-accent underline"
              onClick={() =>
                edit((c, id) => {
                  let n = 0;
                  return { ...c, sections: defaultSections(rows, () => `${id}-${n++}`) };
                })
              }
            >
              Add warm-up rows for the safety sheet
            </button>
          )}
        </p>
      </section>

      {/* Desktop: a spreadsheet of the list with editable name cells. */}
      <div className="hidden overflow-x-auto rounded-xl bg-surface ring-1 ring-line md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sunken text-left text-xs font-medium text-ink-2 [&_th]:px-2 [&_th]:py-2 [&_th]:whitespace-nowrap">
              <th className="w-10">
                <span className="sr-only">Selected</span>
              </th>
              <th>OT</th>
              <th>{zone}</th>
              <th>Diver</th>
              <th>Disc.</th>
              <th className="text-right">AP</th>
              {FIELDS.map((f) => (
                <th key={f.key} title={f.hint} className="border-l border-line">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === "BREAK") {
                return (
                  <tr key={r.entryId} className="bg-break-bg text-break-fg">
                    <td colSpan={10} className="px-3 py-1.5 text-center text-xs font-semibold tracking-widest">
                      BREAK{r.breakMin ? ` · ${r.breakMin} min` : ""} · resumes {fmt(r.nextOt)}
                    </td>
                  </tr>
                );
              }
              const names = crewAt(crew, r);
              const who = `${r.start.firstName} ${r.start.lastName}`;
              const section = firstOfGroup.has(r.entryId) ? sectionAt.get(r.group) : undefined;
              const on = selected.has(r.entryId);
              return [
                section && (
                  <tr key={`s${section.id}`}>
                    <td colSpan={10} className={grid}>
                      {sectionRow(section, r)}
                    </td>
                  </tr>
                ),
                <tr key={r.entryId} className={cx(on && "bg-accent/10", firstOfGroup.has(r.entryId) && "border-t-2 border-line")}>
                  <td className={cx(grid, "px-2")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {}}
                      onClick={(e) => toggleRow(r.entryId, e)}
                      aria-label={`Select ${who}, ${fmt(r.ot)} ${zone} ${r.lane}`}
                      className="size-4 accent-accent"
                    />
                  </td>
                  <td className={cx(grid, "px-2 font-semibold tabular-nums")}>{fmt(r.ot)}</td>
                  <td className={cx(grid, "px-2 tabular-nums")}>{r.lane}</td>
                  <td className={cx(grid, "px-2 whitespace-nowrap")}>{who}</td>
                  <td className={cx(grid, "px-2")}>
                    <DisciplineChip discipline={r.start.discipline} />
                  </td>
                  <td className={cx(grid, "px-2 text-right tabular-nums")}>{formatPerformance(r.start.discipline, r.start.ap)}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className={cx(grid, "border-l p-0")}>
                      <NameInput value={names[f.key]} label={`${f.label}, ${fmt(r.ot)} ${zone} ${r.lane}`} onSave={(v) => saveCell(r, f.key, v)} />
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: a card per start; names are set with the bar below. */}
      <ol className="space-y-2 md:hidden">
        {rows.map((r) => {
          if (r.kind === "BREAK") {
            return (
              <li key={r.entryId} className="rounded-lg bg-break-bg px-3 py-2 text-center text-xs font-semibold tracking-widest text-break-fg">
                BREAK · resumes {fmt(r.nextOt)}
              </li>
            );
          }
          const names = crewAt(crew, r);
          const section = firstOfGroup.has(r.entryId) ? sectionAt.get(r.group) : undefined;
          const on = selected.has(r.entryId);
          return (
            <li key={r.entryId} className="space-y-2">
              {section && sectionRow(section, r, true)}
              <label className={cx("flex gap-3 rounded-lg bg-surface p-3 ring-1 ring-line", on && "ring-2 ring-accent")}>
                <input type="checkbox" checked={on} onChange={() => {}} onClick={(e) => toggleRow(r.entryId, e)} className="mt-1 size-5 accent-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {r.start.firstName} {r.start.lastName}
                    </span>
                    <span className="text-sm tabular-nums">
                      {fmt(r.ot)} · {zone} {r.lane}
                    </span>
                  </span>
                  <span className="block text-sm text-muted">
                    {r.start.discipline} {formatPerformance(r.start.discipline, r.start.ap)}
                  </span>
                  <span className="mt-1 block text-sm text-ink-2">
                    {FIELDS.filter((f) => names[f.key])
                      .map((f) => `${f.label}: ${names[f.key]}`)
                      .join(" · ") || "No names yet"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ol>

      {/* The apply bar: only the fields with text are applied, so one apply can set Deck and Warm up together. */}
      <div className="no-print sticky bottom-0 z-30 -mx-4 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
        {/* On a phone the fields only show once something is selected, so the bar doesn't hide the list. */}
        {!chosen.length && <p className="text-sm font-medium md:hidden">Select starts to set names</p>}
        <form
          aria-label="Set names on the selected starts"
          className={cx("flex-wrap items-end gap-2", chosen.length ? "flex" : "hidden md:flex")}
          onSubmit={(e) => {
            e.preventDefault();
            if (chosen.length && Object.keys(filled).length) apply();
          }}
        >
          <p className="w-full text-sm font-medium md:w-auto md:self-center">
            {chosen.length ? `${plural(chosen.length)} selected` : "Select starts to set names"}
          </p>
          {FIELDS.map((f) => (
            <label key={f.key} className="min-w-[calc(50%-0.25rem)] flex-1 text-xs text-muted md:min-w-28">
              {f.label}
              <input
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                list={NAMES_LIST}
                maxLength={80}
                placeholder={f.hint}
                className="mt-0.5 block min-h-10 w-full rounded-lg bg-field px-2 text-sm text-ink ring-1 ring-line-strong ring-inset placeholder:text-muted/70 focus:ring-2 focus:ring-accent"
              />
            </label>
          ))}
          <Button type="submit" className="flex-1 whitespace-nowrap md:flex-none" disabled={!chosen.length || !Object.keys(filled).length}>
            Apply
          </Button>
          <Button type="button" variant="secondary" className="flex-1 whitespace-nowrap md:flex-none" disabled={!chosen.length} onClick={clear}>
            Clear names
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="flex-1 whitespace-nowrap md:flex-none"
            disabled={firstGroup === undefined || sectionAt.has(firstGroup)}
            title="A labelled row on the safety sheet before the first selected OT"
            onClick={() => firstGroup !== undefined && addSection(firstGroup)}
          >
            + Warm-up row
          </Button>
        </form>
        {undo && (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm">
            {undo.message}
            <button
              type="button"
              className="font-medium text-accent underline"
              onClick={() => {
                const before = undo.crew;
                edit(() => before);
              }}
            >
              Undo
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
