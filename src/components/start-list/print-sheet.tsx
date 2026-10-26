import type { CompetitionType } from "~/lib/disciplines";
import { LEGEND, titleLines } from "~/lib/export/files";
import { logoBox, logosAt, type Logo } from "~/lib/export/logos";
import type { ExportTable } from "~/lib/export/table";
import { cx } from "../ui";

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

function LogoSide({ logos, end }: { logos: Logo[]; end?: boolean }) {
  return (
    <div className={cx("flex min-w-0 items-center gap-3", end && "justify-end")}>
      {logos.map((l) => (
        <LogoImg key={l.id} logo={l} />
      ))}
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
}) {
  const [title, ...sub] = titleLines({ type, name, date, location, notes });
  const accent = type === "POOL" ? "bg-[#2a5ea8]" : "bg-[#3c7a2a]";
  const nameCol = table.header.indexOf("Diver Name");
  const left = logosAt(logos, "HEADER_LEFT");
  const right = logosAt(logos, "HEADER_RIGHT");
  const sponsors = logosAt(logos, "SPONSORS");
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
    <div className="bg-white text-black">
      {/* Equal sides keep the title centred with a logo on one side only. */}
      <header
        className={cx(
          "mb-4 text-center",
          (left.length > 0 || right.length > 0) && "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3",
        )}
      >
        {left.length > 0 || right.length > 0 ? (
          <>
            <LogoSide logos={left} />
            {titleBlock}
            <LogoSide logos={right} end />
          </>
        ) : (
          titleBlock
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-[13px] [&_td]:border [&_td]:border-slate-300 [&_td]:px-1.5 [&_td]:py-0.5">
          <thead className="[display:table-header-group]">
            <tr className={`${accent} text-white [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-medium`}>
              {table.header.map((h, i) => (
                <th key={h} className={i === nameCol ? "text-left" : ""}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:nth-child(even)]:bg-slate-100">
            {table.rows.map((r, i) =>
              r.kind === "BREAK" ? (
                <tr key={i} className={cx("!bg-black text-white", pageBreakAtBreaks && "print-break-after")}>
                  <td colSpan={table.header.length} className="font-medium tracking-widest">
                    {r.label}
                  </td>
                </tr>
              ) : (
                <tr key={i} className="break-inside-avoid">
                  {r.cells.map((c, j) => (
                    <td key={j} className={j === nameCol ? "text-left" : "tabular-nums"}>
                      {c}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">{LEGEND}</p>
      {notes && <p className="mt-1 text-xs whitespace-pre-line text-slate-700">{notes}</p>}
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
