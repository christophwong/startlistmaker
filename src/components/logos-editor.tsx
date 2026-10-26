import { useState } from "react";
import {
  logosAt,
  MAX_LOGOS,
  MAX_LOGOS_TOTAL,
  PLACE_LABELS,
  SIZE_LABELS,
  type Logo,
  type LogoPlace,
  type LogoSize,
} from "~/lib/export/logos";
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

/**
 * Header logos (competition, AIDA) beside the title and sponsor logos after
 * the list. Images are read and re-encoded in this browser.
 */
export function LogosEditor({ logos, dispatch }: { logos: Logo[]; dispatch(a: Action): void }) {
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
        added.push({ ...image, place: place(added.length), size: "M" });
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
      <div>
        <h3 className="text-base font-medium">Logos</h3>
        <p className="text-sm text-muted">
          Competition and AIDA logos go beside the title. Sponsor logos go after the list, on the last page.
        </p>
      </div>
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
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 p-2">
                <img src={l.src} alt="" className="h-10 w-16 shrink-0 rounded bg-white object-contain ring-1 ring-line" />
                <span className="min-w-0 flex-1 basis-32 truncate text-sm" title={l.name}>
                  {l.name}
                </span>
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
                <select
                  aria-label={`Size of ${l.name}`}
                  className={selectClass}
                  value={l.size}
                  onChange={(e) => dispatch({ type: "updateLogo", id: l.id, patch: { size: e.target.value as LogoSize } })}
                >
                  {Object.entries(SIZE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
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
                  <Button variant="ghost" size="sm" aria-label={`Remove ${l.name}`} onClick={() => dispatch({ type: "removeLogo", id: l.id })}>
                    <TrashIcon />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
