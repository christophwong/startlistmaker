import { useState, type FormEvent } from "react";
import { ArrowIcon } from "~/components/icons";
import { Button, Field, RadioGroup, Segmented, SelectField, SideCard } from "~/components/ui";
import { DISCIPLINE_NAMES, disciplinesFor, type Discipline } from "~/lib/disciplines";
import type { StartListSettings } from "~/lib/startlist";
import { toTimeInput, type TimeFormat } from "~/lib/time";
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
      <ol className="divide-y divide-line rounded-lg ring-1 ring-line-strong">
        {visible.map((d, i) => (
          <li key={d} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
            <span className="flex-1">
              <strong>{d}</strong> <span className="text-muted">{DISCIPLINE_NAMES[d]}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" aria-label={`Move ${d} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
              <ArrowIcon dir="up" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Move ${d} later`}
              disabled={i === visible.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ArrowIcon dir="down" />
            </Button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

// Fields in "More settings" whose error should open it.
const MORE_FIELDS = ["staIntervalMin", "staLanes", "roundToMin", "minRecoveryMin", "roundBreakMin"];

/**
 * The Schedule card: the settings people change most (first OT, zones,
 * spacing, order, half-time break), then "More settings" for the rest.
 */
export function ScheduleCard({
  values,
  maxStarts,
  errors,
  onSubmit,
  moreOpen,
  onMoreToggle,
}: Props & { moreOpen: boolean; onMoreToggle(open: boolean): void }) {
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
  const moreError = MORE_FIELDS.some((f) => errors[f]);

  return (
    <SideCard title="Schedule">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First OT" name="startTime" type="time" defaultValue={toTimeInput(values.startTime)} error={errors.startTime} />
          <Field
            label={pool ? "Lanes" : "Zones"}
            name="lanes"
            type="number"
            min={1}
            max={10}
            defaultValue={values.lanes}
            error={errors.lanes}
            hint={pool ? "dynamic, in parallel" : "starts in parallel"}
          />
        </div>
        <Segmented
          label="Spacing"
          name="spacingMode"
          defaultValue={values.spacingMode}
          onChange={(v) => setSpacing(v as SettingsValues["spacingMode"])}
          options={[
            { value: "FIXED", label: "Fixed interval" },
            { value: "DIVE_TIME", label: "By dive time" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={spacing === "DIVE_TIME" ? "Without a time" : "Minutes apart"}
            name="intervalMin"
            type="number"
            min={1}
            defaultValue={values.intervalMin}
            error={errors.intervalMin}
            hint={spacing === "DIVE_TIME" ? "minutes" : undefined}
          />
          {spacing === "DIVE_TIME" ? (
            <Field label="Buffer" name="bufferMin" type="number" min={0} defaultValue={values.bufferMin} error={errors.bufferMin} hint="minutes after the longest dive time" />
          ) : (
            hidden("bufferMin")
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Sort within a block" name="sortBy" defaultValue={values.sortBy}>
            <option value="AP">AP</option>
            <option value="DIVE_TIME">Dive time</option>
            <option value="NAME">Last name</option>
            <option value="REGISTRATION">Sign-up order</option>
          </SelectField>
          <SelectField label="Direction" name="sortDir" defaultValue={values.sortDir}>
            <option value="ASC">Low to high</option>
            <option value="DESC">High to low</option>
          </SelectField>
        </div>
        <Field
          label="Half-time break"
          name="halftimeBreakMin"
          type="number"
          min={0}
          defaultValue={values.halftimeBreakMin}
          hint="minutes, 0 = none. Added near the middle when the list has no other break."
          error={errors.halftimeBreakMin}
        />

        <details
          open={moreOpen || moreError}
          onToggle={(e) => onMoreToggle(e.currentTarget.open)}
          className="rounded-lg ring-1 ring-line-strong"
        >
          <summary className="flex min-h-10 cursor-pointer items-center justify-center gap-1 px-3 text-sm font-semibold">
            More settings
          </summary>
          <div className="space-y-4 border-t border-line p-3">
            {pool ? (
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={spacing === "DIVE_TIME" ? "STA without a time" : "STA minutes apart"}
                  name="staIntervalMin"
                  type="number"
                  min={1}
                  defaultValue={values.staIntervalMin}
                  error={errors.staIntervalMin}
                />
                <Field label="STA zones" name="staLanes" type="number" min={1} max={10} defaultValue={values.staLanes} error={errors.staLanes} />
              </div>
            ) : (
              <>
                {hidden("staIntervalMin")}
                {hidden("staLanes")}
              </>
            )}
            {spacing === "DIVE_TIME" ? (
              <SelectField label="Round OTs up to" name="roundToMin" defaultValue={values.roundToMin}>
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
              </SelectField>
            ) : (
              hidden("roundToMin")
            )}
            {maxStarts > 1 ? (
              <>
                <RadioGroup
                  stacked
                  label="Second starts"
                  name="scheduleMode"
                  defaultValue={values.scheduleMode}
                  options={[
                    { value: "ROUNDS", label: "Two rounds", description: "All first starts, a break, then all second starts." },
                    { value: "SINGLE", label: "Single list", description: "All starts sorted together; recovery time enforced." },
                  ]}
                />
                <RadioGroup
                  stacked
                  label="Round 2 order (two rounds)"
                  name="round2Order"
                  defaultValue={values.round2Order}
                  options={[
                    { value: "ROUND1_ORDER", label: "Same athlete order as round 1", description: "Everyone gets about the same rest." },
                    { value: "SORTED", label: "Re-sort by the rules" },
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Round break"
                    name="roundBreakMin"
                    type="number"
                    min={0}
                    defaultValue={values.roundBreakMin}
                    hint="minutes, lengthened for recovery if needed"
                    error={errors.roundBreakMin}
                  />
                  <Field
                    label="Min. recovery"
                    name="minRecoveryMin"
                    type="number"
                    min={0}
                    defaultValue={values.minRecoveryMin}
                    hint="minutes between starts"
                    error={errors.minRecoveryMin}
                  />
                </div>
              </>
            ) : (
              <>
                {hidden("scheduleMode")}
                {hidden("round2Order")}
                {hidden("roundBreakMin")}
                {hidden("minRecoveryMin")}
              </>
            )}
            <RadioGroup
              stacked
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
            <SelectField label="Gender" name="genderOrder" defaultValue={values.genderOrder}>
              <option value="NONE">Not grouped</option>
              <option value="F_FIRST">Women first</option>
              <option value="M_FIRST">Men first</option>
            </SelectField>
            <Segmented
              label="Clock"
              name="timeFormat"
              defaultValue={values.timeFormat}
              options={[
                { value: "24h", label: "13:30" },
                { value: "12h", label: "1:30 PM" },
              ]}
            />
          </div>
        </details>

        <div className="grid gap-2">
          <Button type="submit" value="regenerate">
            Save and re-sort list
          </Button>
          <Button type="submit" value="save" variant="secondary">
            Save, keep the order
          </Button>
          <p className="text-xs text-muted">Re-sorting replaces moves and breaks you made by hand. Keeping the order only updates the times.</p>
        </div>
      </form>
    </SideCard>
  );
}
