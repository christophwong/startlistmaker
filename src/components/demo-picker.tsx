import { useState, type ReactNode } from "react";
import { Modal } from "~/components/modal";
import { Button, cx } from "~/components/ui";
import type { SampleKind, SampleStarts } from "~/samples";

/** Pick which sample start list to open: pool or depth, one or two starts. */

function Choice<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; description: ReactNode }[];
  onChange(v: T): void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "flex cursor-pointer gap-3 rounded-lg p-3 ring-1",
              o.value === value
                ? "bg-brand-50 ring-2 ring-brand-600 dark:bg-slate-800"
                : "bg-white ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-700 dark:hover:bg-slate-800",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 accent-brand-700"
            />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DemoPicker({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose(): void;
  onOpen(kind: SampleKind, starts: SampleStarts): void;
}) {
  const [kind, setKind] = useState<SampleKind>("depth");
  const [starts, setStarts] = useState<SampleStarts>(2);
  const depth = kind === "depth";

  return (
    <Modal open={open} onClose={onClose} title="Try a demo" className="w-[min(34rem,calc(100vw-2rem))]">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Opens a finished start list built from made-up athletes, in the same format as real form responses. Change anything
        you like.
      </p>
      <Choice<SampleKind>
        legend="Competition"
        name="demo-kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "depth", label: "Depth", description: "CWT, FIM, CNF … on lines" },
          { value: "pool", label: "Pool", description: "Static and dynamic in lanes" },
        ]}
      />
      <Choice<SampleStarts>
        legend={depth ? "Days" : "Starts per athlete"}
        name="demo-starts"
        value={starts}
        onChange={setStarts}
        options={
          depth
            ? [
                { value: 1, label: "1 day", description: "One dive per athlete" },
                { value: 2, label: "2 days", description: "A 2-day form: build Day 1, then switch to Day 2" },
              ]
            : [
                { value: 1, label: "1 start", description: "One start per athlete" },
                { value: 2, label: "2 starts", description: "A static and a dynamic on the same day" },
              ]
        }
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onOpen(kind, starts)}>Open the demo</Button>
      </div>
    </Modal>
  );
}
