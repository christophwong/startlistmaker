import { Fragment, type ReactNode } from "react";
import type { CompetitionType } from "~/lib/disciplines";
import { legend, titleLines, WIDE_BLANK } from "~/lib/export/files";
import { logoBox, logosOn, type Logo } from "~/lib/export/logos";
import type { ExportTable } from "~/lib/export/table";
import type { GuidePlace } from "~/lib/export/yards";
import { cx } from "../ui";

export interface SheetGuide {
  place: GuidePlace;
  rows: { yd: number; m: string }[];
}

/**
 * The yards → meters guide as Yards | Meters column pairs, filled down then
 * across, like the table judges used to paste onto the sheet.
 */
function YardTable({ rows, pairs }: { rows: SheetGuide["rows"]; pairs: number }) {
  const depth = Math.ceil(rows.length / pairs);
  const columns = Array.from({ length: Math.ceil(rows.length / depth) }, (_, c) => rows.slice(c * depth, (c + 1) * depth));
  return (
    <table aria-label="Yards to meters" className="border-collapse text-center tabular-nums [&_td]:border [&_td]:border-slate-300 [&_td]:px-1.5 [&_th]:border [&_th]:border-slate-300 [&_th]:px-1.5">
      <thead>
        <tr className="bg-slate-100">
          {columns.map((_, c) => (
            <Fragment key={c}>
              <th className="font-medium">Yards</th>
              <th className="font-semibold">Meters</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: depth }, (_, r) => (
          <tr key={r}>
            {columns.map((col, c) => (
              <Fragment key={c}>
                <td>{col[r]?.yd ?? ""}</td>
                <td className="font-semibold">{col[r]?.m ?? ""}</td>
              </Fragment>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** CSS px per pt. */
const PX = 4 / 3;

/**
 * Width/height attributes (not inline styles, which the CSP blocks). The
 * base img styles (max-width: 100%, height: auto) shrink it to fit while
 * keeping its shape.
 */
function LogoImg({ logo }: { logo: Logo }) {
  const box = logoBox(logo);
  return <img src={logo.src} alt="" width={Math.round(box.w * PX)} height={Math.round(box.h * PX)} />;
}

function LogoSide({ logos, end, children }: { logos: Logo[]; end?: boolean; children?: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 items-center gap-3", end && "justify-end")}>
      {logos.map((l) => (
        <LogoImg key={l.id} logo={l} />
      ))}
      {children}
    </div>
  );
}

/** Printable start list, laid out like the ECAC sheets. */
export function PrintSheet({
  type,
  name,
  date,
  location,
  notes,
  table,
  pageBreakAtBreaks,
  logos,
  guide,
}: {
  type: CompetitionType;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  location: string;
  notes: string;
  table: ExportTable;
  pageBreakAtBreaks: boolean;
  logos: Logo[];
  /** Yards → meters guide, when this sheet prints one. */
  guide?: SheetGuide | null;
}) {
  const [title, ...sub] = titleLines({ type, name, date, location, notes });
  // `!` beats the zebra stripe when the header repeats inside the body.
  const accent = type === "POOL" ? "!bg-[#2a5ea8]" : "!bg-[#3c7a2a]";
  const nameCol = table.ids.indexOf("name");
  const safety = table.sheet === "SAFETY";
  // Each logo prints on the sheets ticked for it (by default none on the safety schedule, no sponsors on the judge sheet).
  const left = logosOn(logos, "HEADER_LEFT", table.sheet);
  const right = logosOn(logos, "HEADER_RIGHT", table.sheet);
  const top = logosOn(logos, "TOP", table.sheet);
  const sponsors = logosOn(logos, "SPONSORS", table.sheet);
  const headerGuide = guide?.place === "HEADER" ? guide : null;
  const sides = left.length > 0 || right.length > 0 || !!headerGuide;
  // A section row puts its time under WT, as on the ECAC safety schedule.
  const wtCol = table.ids.indexOf("wt");
  // Forms with blank columns get taller rows to write in.
  const form = table.blank.some(Boolean);
  const headerRow = (
    <tr className={cx(accent, "text-white [&_th]:py-1 [&_th]:font-medium", form ? "[&_th]:px-1" : "[&_th]:px-1.5")}>
      {table.header.map((h, i) => (
        <th
          key={table.ids[i]}
          className={cx(i === nameCol && "text-left", table.blank[i] && (WIDE_BLANK.includes(table.ids[i]) ? "min-w-18" : "min-w-12"))}
        >
          {h}
        </th>
      ))}
    </tr>
  );
  const titleBlock = (
    <div className="min-w-0">
      <p className="text-xl font-semibold sm:text-2xl">{title}</p>
      {sub.map((line) => (
        <p key={line} className="text-base sm:text-lg">
          {line}
        </p>
      ))}
      {name && (
        <p className="mt-1 text-xs tracking-wide text-slate-600 uppercase">
          {type === "POOL" ? "Pool competition" : "Depth competition"}
        </p>
      )}
    </div>
  );

  return (
    // The safety schedule prints landscape (a named page in app.css), since it has a column per zone.
    <div className={cx("bg-white text-black", safety && "print-landscape")}>
      {/* Equal sides keep the title centred with a logo on one side only. */}
      {/* The title takes the width it needs (up to 60 %), so a one-line subtitle doesn't wrap beside big logos.
          Logos shrink to fit their side; the yards guide can't, so its side is at least as wide as the table. */}
      <header
        className={cx(
          "mb-4 text-center",
          sides && "grid grid-cols-[minmax(min-content,1fr)_fit-content(60%)_minmax(min-content,1fr)] items-center gap-3",
        )}
      >
        {sides ? (
          <>
            <LogoSide logos={left} />
            {titleBlock}
            <LogoSide logos={right} end>
              {headerGuide && (
                <div className="text-[10px] leading-tight">
                  <YardTable rows={headerGuide.rows} pairs={Math.min(3, Math.ceil(headerGuide.rows.length / 7))} />
                </div>
              )}
            </LogoSide>
          </>
        ) : (
          titleBlock
        )}
      </header>
      {top.length > 0 && (
        <div aria-label="Logos under the title" className="mb-4 flex flex-wrap items-center justify-center gap-6">
          {top.map((l) => (
            <LogoImg key={l.id} logo={l} />
          ))}
        </div>
      )}

      {/* Focusable so a keyboard can scroll the preview sideways on a phone. */}
      <div tabIndex={0} role="region" aria-label="Sheet preview" className="overflow-x-auto focus-visible:outline-2">
        <table
          className={cx(
            "w-full border-collapse text-center [&_td]:border [&_td]:border-slate-300",
            // Forms fit up to 12 columns on a portrait page, as on the ECAC judge sheet: smaller type, names on one line.
            form
              ? "text-[12px] [&_td]:h-8 [&_td]:px-1 [&_td]:py-1 [&_th]:whitespace-nowrap"
              : safety
                ? "text-[12px] [&_td]:px-1 [&_td]:py-0.5 [&_th]:whitespace-nowrap"
                : "text-[13px] [&_td]:px-1.5 [&_td]:py-0.5",
          )}
        >
          <thead className="[display:table-header-group]">{headerRow}</thead>
          <tbody className="[&_tr:nth-child(even)]:bg-slate-100">
            {table.rows.map((r, i) =>
              r.kind === "BREAK" ? (
                <Fragment key={i}>
                  <tr className={cx("!bg-black text-white", pageBreakAtBreaks && "print-break-after")}>
                    <td colSpan={table.header.length} className="font-medium tracking-widest">
                      {r.label}
                    </td>
                  </tr>
                  {/* The judge sheet repeats its header after a break (ECAC judge sheet). With a page per
                      break, the thead already repeats at the top of the next page. */}
                  {table.sheet === "JUDGES" && !pageBreakAtBreaks && i < table.rows.length - 1 && headerRow}
                </Fragment>
              ) : r.kind === "SECTION" ? (
                <tr key={i} className="break-after-avoid !bg-slate-200 font-semibold">
                  <td colSpan={Math.max(wtCol, 1)} className="text-left uppercase">
                    {r.label}
                  </td>
                  {wtCol > 0 && <td className="tabular-nums">{r.time}</td>}
                  <td colSpan={table.header.length - Math.max(wtCol, 1) - (wtCol > 0 ? 1 : 0)}>{r.note}</td>
                </tr>
              ) : (
                <tr key={i} className="break-inside-avoid">
                  {r.cells.map((c, j) => (
                    <td
                      key={j}
                      className={cx(
                        j === nameCol ? cx("text-left", (form || safety) && "whitespace-nowrap") : "tabular-nums",
                        r.greyed?.[j] && "!bg-slate-400",
                      )}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">{legend(table)}</p>
      {notes && <p className="mt-1 text-xs whitespace-pre-line text-slate-700">{notes}</p>}
      {guide?.place === "AFTER" && (
        <div className="mt-4 flex break-inside-avoid justify-center text-[11px]">
          <YardTable rows={guide.rows} pairs={Math.min(6, Math.ceil(guide.rows.length / 5))} />
        </div>
      )}
      {sponsors.length > 0 && (
        <div aria-label="Sponsors" className="mt-6 flex break-inside-avoid flex-wrap items-center justify-center gap-6">
          {sponsors.map((l) => (
            <LogoImg key={l.id} logo={l} />
          ))}
        </div>
      )}
    </div>
  );
}
