import type { Discipline } from "~/lib/disciplines";
import { cx } from "./ui";

// Full class names (not built from the code) so Tailwind finds them.
const chip: Record<Discipline, string> = {
  CWT: "bg-cwt-bg text-cwt-fg",
  CWTB: "bg-cwtb-bg text-cwtb-fg",
  CNF: "bg-cnf-bg text-cnf-fg",
  FIM: "bg-fim-bg text-fim-fg",
  STA: "bg-sta-bg text-sta-fg",
  DYN: "bg-dyn-bg text-dyn-fg",
  DYNB: "bg-dynb-bg text-dynb-fg",
  DNF: "bg-dnf-bg text-dnf-fg",
};

/** A discipline code on its own tint, in monospace (start list rows and block headers). */
export function DisciplineChip({ discipline, className }: { discipline: Discipline; className?: string }) {
  return (
    <span className={cx("inline-flex rounded-md px-1.5 py-0.5 font-mono text-xs font-bold", chip[discipline], className)}>
      {discipline}
    </span>
  );
}
