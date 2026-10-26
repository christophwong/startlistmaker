import type { ComponentProps } from "react";
import { cx } from "./ui";

/**
 * Inline stroke icons (24 × 24, currentColor), so there's no icon font or
 * package to load and no emoji. They're decorative: the button or link around
 * them carries the accessible name. Size with a class (`size-5`); the default
 * is 16 px.
 */
type IconProps = ComponentProps<"svg">;
export type Direction = "up" | "down" | "left" | "right";

function Svg({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cx("size-4 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

// Arrow and chevron are drawn pointing right and rotated.
const rotate: Record<Direction, string> = { right: "", down: "rotate-90", left: "rotate-180", up: "-rotate-90" };

export const ArrowIcon = ({ dir = "right", className, ...p }: IconProps & { dir?: Direction }) => (
  <Svg className={cx(rotate[dir], className)} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const ChevronIcon = ({ dir = "right", className, ...p }: IconProps & { dir?: Direction }) => (
  <Svg className={cx(rotate[dir], className)} {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Svg>
);

export const HelpIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
    <path d="M12 17h.01" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

/** Six dots: drag to move. */
export const GripIcon = (p: IconProps) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    {[9, 15].flatMap((x) => [6, 12, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
  </Svg>
);

/** Three dots in a row: a menu of more actions. */
export const MoreIcon = (p: IconProps) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    {[5, 12, 19].map((x) => (
      <circle key={x} cx={x} cy="12" r="1.8" />
    ))}
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4M12 17h.01" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
);

/** Up and down chevrons: "move this start". */
export const MoveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m7 9 5-5 5 5M7 15l5 5 5-5" />
  </Svg>
);

/** Lines getting shorter, with a down arrow: "re-sort". */
export const SortIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h13M3 12h9M3 17h5M18 8v12M15 17l3 3 3-3" />
  </Svg>
);

/** A page with an up arrow: the drop zone. */
export const FileUploadIcon = (p: IconProps) => (
  <Svg strokeWidth={1.6} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 17v-6M9 13.5 12 11l3 2.5" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M7 9l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);
