import { useState } from "react";
import {
  defaultSheets,
  logosAt,
  MAX_LOGOS,
  MAX_LOGOS_TOTAL,
  MAX_SCALE,
  MIN_SCALE,
  PLACE_LABELS,
  type Logo,
  type LogoPlace,
} from "~/lib/export/logos";
import { SHEETS } from "~/lib/export/files";
import type { SheetKind } from "~/lib/export/table";
import { LOGO_ACCEPT, LogoError, readLogo } from "~/lib/import/image";
import type { Action } from "~/state/store";
import { ArrowIcon, TrashIcon } from "./icons";
import { Alert, Button, buttonClass, cx } from "./ui";

const PLACES = Object.keys(PLACE_LABELS) as LogoPlace[];

const selectClass =
  "min-h-9 cursor-pointer rounded-md border-0 bg-field px-1.5 text-sm ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-accent";

function AddButton({ label, multiple, onFiles }: { label: string; multiple?: boolean; onFiles(files: File[]): void }) {
  return (
    <label className={cx(buttonClass("secondary", "sm"), "cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-accent")}>
      {label}
      <input
        type="file"
        accept={LOGO_ACCEPT}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Removing a logo takes it off every sheet; unticking leaves it off just this one. */
function removeMessage(logo: Logo, sheet: SheetKind): string {
  const on = SHEET_ORDER.filter((s) => logo.sheets.includes(s)).map((s) => SHEETS[s].label);
  const where = on.length ? `every sheet (${on.join(", ")})` : "every sheet";
  const label = SHEETS[sheet].label.toLowerCase();
  return `Remove ${logo.name}? It comes off ${where}. To leave it off only the ${label} sheet, untick “On ${label} sheet” instead.`;
}

const SHEET_ORDER = Object.keys(SHEETS) as SheetKind[];

/**
 * Header logos (competition, AIDA) beside the title and sponsor logos after
 * the list, each ticked for the sheets it prints on (the one previewed is
 * `sheet`). Images are read and re-encoded in this browser.
 */
export function LogosEditor({ logos, sheet, dispatch }: { logos: Logo[]; sheet: SheetKind; dispatch(a: Action): void }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const add = async (files: File[], place: (i: number) => LogoPlace) => {
    if (!files.length) return;
    setBusy(true);
    const problems: string[] = [];
    const added: Omit<Logo, "id">[] = [];
    let total = logos.reduce((sum, l) => sum + l.src.length, 0);
    for (const file of files) {
      if (logos.length + added.length >= MAX_LOGOS) {
        problems.push(`Up to ${MAX_LOGOS} logos fit on a sheet; ${file.name} wasn't added.`);
        continue;
      }
      try {
        const image = await readLogo(file);
        if (total + image.src.length > MAX_LOGOS_TOTAL) {
          problems.push(`${file.name} wasn't added: the logos together are too large to keep. Use smaller images.`);
          continue;
        }
        total += image.src.length;
        const at = place(added.length);
        // Added while another sheet is previewed: it shows there too, so it doesn't seem to vanish.
        const sheets = defaultSheets(at);
        added.push({ ...image, place: at, scale: 100, sheets: sheets.includes(sheet) ? sheets : [...sheets, sheet] });
      } catch (e) {
        problems.push(e instanceof LogoError ? e.message : `${file.name} couldn't be read as an image.`);
      }
    }
    if (added.length) dispatch({ type: "addLogos", logos: added });
    setErrors(problems);
    setBusy(false);
  };

  // The first header logo goes left of the title, the next ones right.
  const hasLeft = logos.some((l) => l.place === "HEADER_LEFT");
  const headerPlace = (i: number): LogoPlace => (!hasLeft && i === 0 ? "HEADER_LEFT" : "HEADER_RIGHT");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Competition and AIDA logos go beside the title. Sponsor logos go after the list, on the last page. Tick “On{" "}
        {SHEETS[sheet].label.toLowerCase()} sheet” for the logos this sheet prints.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <AddButton label="+ Header logo" multiple onFiles={(f) => void add(f, headerPlace)} />
        <AddButton label="+ Sponsor logos" multiple onFiles={(f) => void add(f, () => "SPONSORS")} />
        {busy && <span className="text-sm text-muted">Adding…</span>}
      </div>
      {errors.length > 0 && (
        <Alert tone="error">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </Alert>
      )}
      {logos.length > 0 && (
        <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
          {PLACES.flatMap((p) => logosAt(logos, p)).map((l) => {
            const same = logosAt(logos, l.place);
            const i = same.indexOf(l);
            const on = l.sheets.includes(sheet);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 p-2">
                <img
                  src={l.src}
                  alt=""
                  className={cx("h-10 w-16 shrink-0 rounded bg-white object-contain ring-1 ring-line", !on && "opacity-40")}
                />
                <span className="min-w-0 flex-1 truncate text-sm" title={l.name}>
                  {l.name}
                </span>
                <span className="flex">
                  <Button variant="ghost" size="sm" aria-label={`Move ${l.name} left`} disabled={i === 0} onClick={() => dispatch({ type: "moveLogo", id: l.id, by: -1 })}>
                    <ArrowIcon dir="left" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${l.name} right`}
                    disabled={i === same.length - 1}
                    onClick={() => dispatch({ type: "moveLogo", id: l.id, by: 1 })}
                  >
                    <ArrowIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${l.name}`}
                    onClick={() => confirm(removeMessage(l, sheet)) && dispatch({ type: "removeLogo", id: l.id })}
                  >
                    <TrashIcon />
                  </Button>
                </span>
                {/* Settings on a line of their own under the name. */}
                <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="flex min-h-9 items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-accent"
                      aria-label={`On ${SHEETS[sheet].label.toLowerCase()} sheet: ${l.name}`}
                      checked={on}
                      onChange={(e) =>
                        dispatch({
                          type: "updateLogo",
                          id: l.id,
                          patch: { sheets: e.target.checked ? [...l.sheets, sheet] : l.sheets.filter((s) => s !== sheet) },
                        })
                      }
                    />
                    On {SHEETS[sheet].label.toLowerCase()} sheet
                  </label>
                  <select
                    aria-label={`Place of ${l.name}`}
                    className={selectClass}
                    value={l.place}
                    onChange={(e) => dispatch({ type: "updateLogo", id: l.id, patch: { place: e.target.value as LogoPlace } })}
                  >
                    {Object.entries(PLACE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label className="flex min-h-9 items-center gap-2 text-sm">
                    Size
                    <input
                      type="range"
                      aria-label={`Size of ${l.name}`}
                      className="w-24 accent-accent"
                      min={MIN_SCALE}
                      max={MAX_SCALE}
                      step={5}
                      value={l.scale}
                      onChange={(e) => dispatch({ type: "updateLogo", id: l.id, patch: { scale: Number(e.target.value) } })}
                    />
                    <span className="w-10 text-right text-muted tabular-nums">{l.scale}%</span>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
