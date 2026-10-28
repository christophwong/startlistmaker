/** The app mark: three lane lines on the accent square (the favicon's shape). */
export function LogoMark() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden className="size-7 shrink-0">
      <rect width="28" height="28" rx="7" className="fill-accent" />
      <path d="M6 10h16M6 14h16M6 18h16" strokeWidth="1.6" className="stroke-on-accent opacity-35" />
      <path
        d="M6 10h16M6 14h16M6 18h16"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="0.1 3.4"
        className="stroke-on-accent"
      />
    </svg>
  );
}

/** Tooltip for Save project buttons. */
export const SAVE_PROJECT_HINT = "Downloads a file you can open on this site later to carry on";

/** What "Local only" means, in the header's privacy popover. */
export function PrivacyText() {
  return (
    <div className="space-y-2 text-ink-2">
      <p className="font-semibold text-ink">Athlete data stays in this browser</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Files are read on your device.</li>
        <li>Start lists and athlete data are never uploaded or shared.</li>
        <li>No account.</li>
      </ul>
    </div>
  );
}
