import { useState, type FormEvent } from "react";
import { Button, cx, Field, RadioGroup, SelectField } from "~/components/ui";
import { DISCIPLINE_NAMES, disciplinesFor, type Discipline } from "~/lib/disciplines";
import type { StartListSettings } from "~/lib/startlist";
import { formatClock, toTimeInput, type TimeFormat } from "~/lib/time";
import type { FieldErrors } from "~/lib/validation";

export type SettingsValues = StartListSettings & { timeFormat: TimeFormat };

interface Props {
  values: SettingsValues;
  maxStarts: number;
  errors: FieldErrors;
  /** Form fields match settingsSchema in lib/validation.ts. */
  onSubmit(form: FormData, regenerate: boolean): void;
}

/** The current type's disciplines in block order, with ↑↓ to rearrange. */
function BlockOrder({
  order,
  type,
  onChange,
}: {
  order: Discipline[];
  type: SettingsValues["type"];
  onChange(order: Discipline[]): void;
}) {
  const mine = disciplinesFor(type);
  const visible = [...order.filter((d) => mine.includes(d)), ...mine.filter((d) => !order.includes(d))];
  const move = (i: number, j: number) => {
    const next = [...visible];
    [next[i], next[j]] = [next[j], next[i]];
    // Keep the other competition type's order as it was.
    onChange([...next, ...order.filter((d) => !mine.includes(d))]);
  };
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Discipline order</legend>
      <ol className="max-w-sm divide-y divide-line rounded-lg ring-1 ring-line-strong">
        {visible.map((d, i) => (
          <li key={d} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
            <span className="flex-1">
              <strong>{d}</strong> <span className="text-muted">{DISCIPLINE_NAMES[d]}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" aria-label={`Move ${d} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Move ${d} later`}
              disabled={i === visible.length - 1}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </Button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

function SettingsForm({ values, maxStarts, errors, onSubmit }: Props) {
  const pool = values.type === "POOL";
  const [spacing, setSpacing] = useState(values.spacingMode);
  const [groupBy, setGroupBy] = useState(values.groupBy);
  const [blockOrder, setBlockOrder] = useState(values.blockOrder);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    onSubmit(new FormData(e.currentTarget), submitter?.value === "regenerate");
  };
  const hidden = (name: keyof SettingsValues) => <input type="hidden" name={name} value={String(values[name])} />;

  return (
    <form onSubmit={submit} className="space-y-6">
      <section>
        <h3 className="mb-1 font-medium">Timing</h3>
        <p className="mb-3 text-xs text-muted">Times are recalculated from the current order; the order itself doesn't change.</p>
        <div className="space-y-4">
          <RadioGroup
            label="Time between OTs"
            name="spacingMode"
            defaultValue={values.spacingMode}
            onChange={(v) => setSpacing(v as SettingsValues["spacingMode"])}
            options={[
              { value: "FIXED", label: "Fixed interval", description: "Every OT group the same number of minutes apart." },
              {
                value: "DIVE_TIME",
                label: "Dive time + buffer",
                description: "Longest announced dive time in the group plus a buffer.",
              },
            ]}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="First OT" name="startTime" type="time" defaultValue={toTimeInput(values.startTime)} error={errors.startTime} />
            <Field
              label={spacing === "DIVE_TIME" ? "Interval without dive time" : "Minutes between OTs"}
              name="intervalMin"
              type="number"
              min={1}
              defaultValue={values.intervalMin}
              error={errors.intervalMin}
            />
            {pool ? (
              <Field
                label={spacing === "DIVE_TIME" ? "STA interval without time" : "STA minutes between OTs"}
                name="staIntervalMin"
                type="number"
                min={1}
                defaultValue={values.staIntervalMin}
                error={errors.staIntervalMin}
              />
            ) : (
              hidden("staIntervalMin")
            )}
            {spacing === "DIVE_TIME" ? (
              <>
                <Field label="Buffer (minutes)" name="bufferMin" type="number" min={0} defaultValue={values.bufferMin} error={errors.bufferMin} />
                <SelectField label="Round up to" name="roundToMin" defaultValue={values.roundToMin}>
                  <option value={1}>1 minute</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                </SelectField>
              </>
            ) : (
              <>
                {hidden("bufferMin")}
                {hidden("roundToMin")}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field
              label={pool ? "Parallel dynamic starts (lanes)" : "Parallel starts (zones / lines)"}
              name="lanes"
              type="number"
              min={1}
              max={10}
              defaultValue={values.lanes}
              error={errors.lanes}
            />
            {pool ? (
              <Field label="Parallel static starts (zones)" name="staLanes" type="number" min={1} max={10} defaultValue={values.staLanes} error={errors.staLanes} />
            ) : (
              hidden("staLanes")
            )}
            {maxStarts > 1 ? (
              <Field
                label="Min. recovery between starts"
                name="minRecoveryMin"
                type="number"
                min={0}
                defaultValue={values.minRecoveryMin}
                hint="minutes"
                error={errors.minRecoveryMin}
              />
            ) : (
              hidden("minRecoveryMin")
            )}
          </div>
          <RadioGroup
            label="Clock"
            name="timeFormat"
            defaultValue={values.timeFormat}
            options={[
              { value: "24h", label: "24-hour (13:30)" },
              { value: "12h", label: "12-hour (1:30 PM)" },
            ]}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-medium">Order and breaks</h3>
        <p className="mb-3 text-xs text-muted">Used when the start list is (re)generated. Manual changes are replaced.</p>
        <div className="space-y-4">
          {maxStarts > 1 ? (
            <>
              <RadioGroup
                label="Second starts"
                name="scheduleMode"
                defaultValue={values.scheduleMode}
                options={[
                  { value: "ROUNDS", label: "Two rounds", description: "All first starts, a break, then all second starts." },
                  { value: "SINGLE", label: "Single list", description: "All starts sorted together; recovery time enforced." },
                ]}
              />
              <RadioGroup
                label="Round 2 order (two rounds)"
                name="round2Order"
                defaultValue={values.round2Order}
                options={[
                  { value: "ROUND1_ORDER", label: "Same athlete order as round 1", description: "Everyone gets about the same rest." },
                  { value: "SORTED", label: "Re-sort by the rules below" },
                ]}
              />
              <Field
                label="Break between rounds"
                name="roundBreakMin"
                type="number"
                min={0}
                defaultValue={values.roundBreakMin}
                hint="minutes, lengthened if needed to give everyone the minimum recovery"
                error={errors.roundBreakMin}
                className="max-w-xs"
              />
            </>
          ) : (
            <>
              {hidden("scheduleMode")}
              {hidden("round2Order")}
              {hidden("roundBreakMin")}
            </>
          )}
          <Field
            label="Half-time break"
            name="halftimeBreakMin"
            type="number"
            min={0}
            defaultValue={values.halftimeBreakMin}
            hint="minutes, 0 = none. Added near the middle when the list has no other break."
            error={errors.halftimeBreakMin}
            className="max-w-xs"
          />
          <RadioGroup
            label="Group starts"
            name="groupBy"
            defaultValue={values.groupBy}
            onChange={(v) => setGroupBy(v as SettingsValues["groupBy"])}
            options={[
              { value: "DISCIPLINE", label: "By discipline", description: "One block per discipline, in the order below." },
              {
                value: "MIXED",
                label: "Mixed",
                description: pool ? "Static apart (first or last, as below), dynamic disciplines together." : "All disciplines sorted together.",
              },
            ]}
          />
          <input type="hidden" name="blockOrder" value={blockOrder.join(",")} />
          {(groupBy === "DISCIPLINE" || pool) && <BlockOrder order={blockOrder} type={values.type} onChange={setBlockOrder} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Within a block, sort by" name="sortBy" defaultValue={values.sortBy}>
              <option value="AP">AP (announced performance)</option>
              <option value="DIVE_TIME">Announced dive time</option>
              <option value="NAME">Last name</option>
              <option value="REGISTRATION">Registration order</option>
            </SelectField>
            <SelectField label="Direction" name="sortDir" defaultValue={values.sortDir}>
              <option value="ASC">Ascending (shortest / A first)</option>
              <option value="DESC">Descending (deepest / Z first)</option>
            </SelectField>
            <SelectField label="Gender" name="genderOrder" defaultValue={values.genderOrder}>
              <option value="NONE">Not grouped</option>
              <option value="F_FIRST">Women first</option>
              <option value="M_FIRST">Men first</option>
            </SelectField>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" value="regenerate">
          Save and regenerate order
        </Button>
        <Button type="submit" value="save" variant="secondary">
          Save, keep current order
        </Button>
      </div>
    </form>
  );
}

/** Collapsible settings card with a one-line summary. */
export function SettingsPanel(props: Props & { open: boolean }) {
  const { values, maxStarts, open } = props;
  const spacing =
    values.spacingMode === "DIVE_TIME" ? `dive time + ${values.bufferMin} min` : `every ${values.intervalMin} min`;
  return (
    <details
      className={cx("rounded-xl bg-surface ring-1 ring-line")}
      open={open}
    >
      <summary className="cursor-pointer p-4 font-medium">
        Settings{" "}
        <span className="text-sm font-normal text-muted">
          · first OT {formatClock(values.startTime, values.timeFormat)} · {spacing} · {values.lanes}{" "}
          {values.type === "POOL" ? "lane" : "zone"}
          {values.lanes > 1 ? "s" : ""}
          {maxStarts > 1 && ` · ${values.scheduleMode === "ROUNDS" ? "two rounds" : "single list"}`}
        </span>
      </summary>
      <div className="border-t border-line p-4">
        <SettingsForm {...props} />
      </div>
    </details>
  );
}
