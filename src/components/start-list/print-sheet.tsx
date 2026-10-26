import type { CompetitionType } from "~/lib/disciplines";
import { LEGEND, titleLines } from "~/lib/export/files";
import type { ExportTable } from "~/lib/export/table";
import { cx } from "../ui";

/** Printable start list, laid out like the ECAC sheets. */
export function PrintSheet({
  type,
  name,
  date,
  location,
  notes,
  table,
  pageBreakAtBreaks,
}: {
  type: CompetitionType;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  location: string;
  notes: string;
  table: ExportTable;
  pageBreakAtBreaks: boolean;
}) {
  const [title, ...sub] = titleLines({ type, name, date, location, notes });
  const accent = type === "POOL" ? "bg-[#2a5ea8]" : "bg-[#3c7a2a]";
  const nameCol = table.header.indexOf("Diver Name");

  return (
    <div className="bg-white text-black">
      <header className="mb-4 text-center">
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
    </div>
  );
}
