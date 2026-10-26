import { useEffect, useReducer, useRef, useState } from "react";
import { DAY_PANEL_ID, DayTabs, dayTabId } from "~/components/day-tabs";
import { HelpDialog } from "~/components/help";
import { LockIcon, MoonIcon, SunIcon } from "~/components/icons";
import { Button, cx } from "~/components/ui";
import { loadSample, type SampleKind } from "~/samples";
import { clearStorage, getRemember, loadState, saveState, setRemember } from "~/state/persist";
import { formatEventDate } from "~/lib/format";
import { dayList, initialState, reachable, reducer, startsOf, type Step } from "~/state/store";
import { DataStep } from "~/steps/DataStep";
import { FinalStep } from "~/steps/FinalStep";
import { ListStep } from "~/steps/ListStep";
import { MapStep } from "~/steps/MapStep";
import { StartStep } from "~/steps/StartStep";
import { applyTheme, getTheme } from "~/theme";

const STEPS: [Step, string][] = [
  ["start", "Upload"],
  ["map", "Columns"],
  ["data", "Athletes"],
  ["list", "Start list"],
  ["final", "Print & export"],
];

function PrivacyNote() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-ok-fg">
        <LockIcon className="mr-1 inline align-[-2px]" />
        Private: nothing leaves this browser
      </summary>
      <div className="mt-2 max-w-xl space-y-1 text-ink-2">
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
    </details>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState, () => loadState() ?? initialState);
  const [remember, setRememberState] = useState(getRemember);
  const [theme, setTheme] = useState(getTheme);
  const [help, setHelp] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => saveState(state, remember), [state, remember]);

  // startlistmaker.online/#demo (or #demo-pool) opens a sample start list.
  // On first load it never replaces real work; a later click on such a link asks.
  const hasWork = useRef(false);
  hasWork.current = !!state.source || state.registrations.length > 0;
  useEffect(() => {
    const open = (initial: boolean) => {
      const m = location.hash.match(/^#demo(?:-(pool|depth))?$/);
      if (!m) return;
      history.replaceState(null, "", location.pathname);
      if (hasWork.current && (initial || !confirm("Open the demo? This replaces your current start list."))) return;
      void loadSample((m[1] ?? "depth") as SampleKind).then((s) =>
        dispatch({ type: "demo", filename: s.filename, table: s.table, event: s.event }),
      );
    };
    open(true);
    const onHash = () => open(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Move focus to the new step so screen readers and keyboards follow along.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const toggleRemember = (value: boolean) => {
    setRememberState(value);
    setRemember(value, state);
  };
  const clearAll = () => {
    if (!confirm("Clear all data? This removes the athletes, the start list and anything remembered on this device.")) return;
    clearStorage();
    setRememberState(false);
    dispatch({ type: "reset" });
  };
  const hasData = !!state.source || state.registrations.length > 0;
  const showDayTabs = state.twoDay && (state.step === "data" || state.step === "list" || state.step === "final");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next, true);
    setTheme(next);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <button type="button" onClick={() => dispatch({ type: "step", step: "start" })} className="flex items-center gap-2 text-left">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          <span className="text-lg font-semibold tracking-tight">Start List Maker</span>
        </button>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {hasData && (
            <>
              <label className="flex items-center gap-1.5" title="Keep your work after the tab closes (stored only in this browser)">
                <input type="checkbox" checked={remember} onChange={(e) => toggleRemember(e.target.checked)} className="accent-accent" />
                Remember on this device
              </label>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear all data
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => setHelp(true)} aria-haspopup="dialog">
            Help
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleTheme} aria-pressed={theme === "dark"} title="Switch between light and dark">
            {theme === "dark" ? (
              <>
                <SunIcon /> Light
              </>
            ) : (
              <>
                <MoonIcon /> Dark
              </>
            )}
          </Button>
        </div>
      </header>

      <nav className="no-print my-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Steps">
        <ol className="flex flex-wrap gap-1.5 text-sm">
          {STEPS.map(([s, label], i) => (
            <li key={s}>
              <button
                type="button"
                disabled={!reachable(state, s)}
                aria-current={state.step === s ? "step" : undefined}
                onClick={() => dispatch({ type: "step", step: s })}
                className={cx(
                  "rounded-full px-3 py-1.5 font-medium ring-1 ring-inset",
                  state.step === s
                    ? "bg-accent text-on-accent ring-accent"
                    : "ring-line-strong enabled:hover:bg-sunken disabled:text-muted disabled:opacity-60",
                )}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
        <PrivacyNote />
      </nav>

      {showDayTabs && (
        <DayTabs
          value={state.day}
          onChange={(day) => dispatch({ type: "day", day })}
          tabs={([1, 2] as const).map((day) => {
            const date = dayList(state, day)?.date;
            return { day, date: date ? formatEventDate(date) : "", starts: startsOf({ ...state, day }).length };
          })}
        />
      )}

      <main
        ref={mainRef}
        tabIndex={-1}
        className="outline-none"
        {...(showDayTabs && { id: DAY_PANEL_ID, role: "tabpanel", "aria-labelledby": dayTabId(state.day) })}
      >
        {state.step === "start" && <StartStep dispatch={dispatch} onHelp={() => setHelp(true)} />}
        {state.step === "map" && state.source && <MapStep state={state} dispatch={dispatch} />}
        {/* Keyed by day: a day's sort column and open panels aren't the other day's. */}
        {state.step === "data" && <DataStep key={state.day} state={state} dispatch={dispatch} />}
        {state.step === "list" && <ListStep key={state.day} state={state} dispatch={dispatch} />}
        {state.step === "final" && <FinalStep key={state.day} state={state} dispatch={dispatch} />}
      </main>

      <HelpDialog open={help} onClose={() => setHelp(false)} />

      <footer className="no-print mt-16 border-t border-line pt-4 text-xs text-muted">
        Start List Maker · for AIDA-style freediving competitions · runs entirely in your browser
      </footer>
    </div>
  );
}
