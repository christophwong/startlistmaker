import { CheckIcon, ChevronIcon } from "./icons";
import { Popover } from "./popover";
import { cx } from "./ui";

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
      <p className="font-semibold text-ink">Nothing leaves this browser</p>
      <p>
        Files are read and start lists are built entirely on your device. There is no server, no account, no analytics,
        and the page is set up so it cannot send data anywhere.
      </p>
      <p>
        While you work, your data is kept in this tab only and is gone when you close it, unless you choose “Remember on
        this device”. “Clear all data” removes it immediately.
      </p>
      <p>To check: open your browser's developer tools → Network. Using the app makes no requests.</p>
    </div>
  );
}

export interface StepItem<S extends string> {
  step: S;
  label: string;
  enabled: boolean;
}

/**
 * Progress-bar stepper: on wide screens a bar and a label per step; on a
 * phone the bars, "Step n of 5" and an "All steps" list to jump between them.
 */
export function Stepper<S extends string>({ steps, current, onStep }: { steps: StepItem<S>[]; current: S; onStep(step: S): void }) {
  const at = steps.findIndex((s) => s.step === current);
  const bar = (i: number) => cx("h-1 rounded-full", i <= at ? "bg-accent" : "bg-line");

  return (
    <nav className="no-print my-5" aria-label="Steps">
      <ol className="hidden grid-cols-5 gap-2 sm:grid">
        {steps.map((s, i) => (
          <li key={s.step}>
            <button
              type="button"
              disabled={!s.enabled}
              aria-current={i === at ? "step" : undefined}
              onClick={() => onStep(s.step)}
              className="group block w-full rounded-md pb-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
            >
              <span aria-hidden className={cx("block", bar(i))} />
              <span
                className={cx(
                  "mt-2 flex items-center gap-1.5 text-[13px] font-semibold",
                  i === at ? "text-accent" : s.enabled ? "text-ink-2 group-hover:text-ink" : "text-muted",
                )}
              >
                {i < at ? (
                  <>
                    <CheckIcon className="size-3.5" />
                    <span className="sr-only">{i + 1}</span>
                  </>
                ) : (
                  <span>{i + 1}</span>
                )}
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="sm:hidden">
        <div aria-hidden className="grid grid-cols-5 gap-1.5">
          {steps.map((s, i) => (
            <span key={s.step} className={bar(i)} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-muted">
              Step {at + 1} of {steps.length}
            </span>{" "}
            <span className="font-semibold">{steps[at]?.label}</span>
          </p>
          <Popover
            align="right"
            panelClassName="w-56 p-1.5"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent hover:bg-sunken"
            label={
              <>
                All steps <ChevronIcon dir="down" className="size-3.5" />
              </>
            }
          >
            {(close) => (
              <ol>
                {steps.map((s, i) => (
                  <li key={s.step}>
                    <button
                      type="button"
                      disabled={!s.enabled}
                      aria-current={i === at ? "step" : undefined}
                      onClick={() => {
                        close();
                        onStep(s.step);
                      }}
                      className={cx(
                        "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left font-medium disabled:cursor-not-allowed disabled:text-muted",
                        i === at ? "bg-accent-soft text-accent" : "enabled:hover:bg-sunken",
                      )}
                    >
                      <span className="w-4 text-center">
                        {i < at ? (
                          <>
                            <CheckIcon className="size-3.5" />
                            <span className="sr-only">{i + 1}</span>
                          </>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {s.label}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Popover>
        </div>
      </div>
    </nav>
  );
}
