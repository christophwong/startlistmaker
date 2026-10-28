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

/** What "Local only" means, in the header's privacy popover. */
export function PrivacyText() {
  return (
    <div className="space-y-2 text-ink-2">
      <p className="font-semibold text-ink">Athlete data stays in this browser</p>
      <p>
        Files are read and start lists are built entirely on your device. Your start lists and athletes' details are
        never uploaded, stored on a server or shared, and there's no account.
      </p>
      <p>
        While you work, your data is kept in this tab only and is gone when you close it, unless you choose “Remember on
        this device”. “Clear all data” removes it immediately.
      </p>
    </div>
  );
}
