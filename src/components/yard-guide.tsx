import { SHEETS } from "~/lib/export/files";
import type { SheetKind } from "~/lib/export/table";
import type { GuidePlace, YardGuide } from "~/lib/export/yards";
import { Field, Segmented } from "./ui";

/** A whole number in [min, max] from an input, or undefined while it's being typed. */
function whole(value: string, min: number, max: number): number | undefined {
  const n = Number(value);
  return value.trim() && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/**
 * The yards → meters guide for a pool measured in yards: on or off for the
 * sheet being previewed, where it goes, and the rows it covers.
 */
export function YardGuideOptions({
  guide,
  sheet,
  autoUpTo,
  onChange,
}: {
  guide: YardGuide;
  sheet: SheetKind;
  /** "Up to" when it's left blank. */
  autoUpTo: number;
  onChange(guide: YardGuide): void;
}) {
  const on = guide.sheets.includes(sheet);
  const set = (patch: Partial<YardGuide>) => onChange({ ...guide, ...patch });
  return (
    <div className="space-y-3">
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => set({ sheets: e.target.checked ? [...guide.sheets, sheet] : guide.sheets.filter((s) => s !== sheet) })}
          className="size-4 accent-accent"
        />
        Yards → meters guide
      </label>
      {on ? (
        <>
          <Segmented
            label="Guide goes"
            name="guidePlace"
            value={guide.place}
            onChange={(v) => set({ place: v as GuidePlace })}
            options={[
              { value: "HEADER", label: "Beside the title" },
              { value: "AFTER", label: "After the list" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Pool length"
              name="guideLength"
              type="number"
              min={10}
              max={100}
              defaultValue={guide.lengthYd}
              hint="yards"
              onChange={(e) => {
                const n = whole(e.target.value, 10, 100);
                if (n !== undefined) set({ lengthYd: n });
              }}
            />
            <Field
              label="Up to"
              name="guideUpTo"
              type="number"
              min={10}
              max={5000}
              defaultValue={guide.upToYd ?? ""}
              placeholder={String(autoUpTo)}
              hint={guide.upToYd === null ? "yards; blank = past the longest AP" : "yards"}
              onChange={(e) => {
                if (!e.target.value.trim()) return set({ upToYd: null });
                const n = whole(e.target.value, 10, 5000);
                if (n !== undefined) set({ upToYd: n });
              }}
            />
          </div>
        </>
      ) : (
        <p className="-mt-2 text-xs text-muted">
          For a pool measured in yards: a table of lengths in meters on the {SHEETS[sheet].label.toLowerCase()} sheet, for judges.
        </p>
      )}
    </div>
  );
}
