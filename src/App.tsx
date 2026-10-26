import { useEffect, useReducer, useRef, useState } from "react";
import { DAY_PANEL_ID, DayTabs, dayTabId } from "~/components/day-tabs";
import { HelpDialog } from "~/components/help";
import { ChevronIcon, HelpIcon, LockIcon, MoonIcon, MoreIcon, SunIcon, TrashIcon } from "~/components/icons";
import { Popover } from "~/components/popover";
import { LogoMark, PrivacyText, Stepper } from "~/components/shell";
import { Button, buttonClass, cx } from "~/components/ui";
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

  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const ThemeIcon = theme === "dark" ? SunIcon : MoonIcon;
  const dataItems = (close: () => void) => (
    <div className="space-y-3">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => toggleRemember(e.target.checked)}
          className="mt-1 accent-accent"
        />
        <span>
          <span className="block font-medium">Remember on this device</span>
          <span className="block text-xs text-muted">
            {remember ? "Your work is kept in this browser after the tab closes." : "Off: your work is gone when this tab closes."}
          </span>
        </span>
      </label>
      <Button
        variant="secondary"
        size="sm"
        className="w-full text-err-fg"
        onClick={() => {
          close();
          clearAll();
        }}
      >
        <TrashIcon /> Clear all data
      </Button>
    </div>
  );
  const iconButton =
    "inline-flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-10";

  return (
    <div className="pb-16">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => dispatch({ type: "step", step: "start" })}
            className="flex min-w-0 items-center gap-2.5 text-left"
          >
            <LogoMark />
            <span className="truncate text-lg font-semibold tracking-tight">Start List Maker</span>
          </button>

          <div className="hidden items-center gap-1 text-sm sm:flex">
            <Popover
              className="mr-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-ok-bg px-3 text-xs font-medium text-ok-fg ring-1 ring-inset ring-ok-line"
              label={
                <>
                  <LockIcon className="size-3.5" /> Local only · nothing leaves this browser
                </>
              }
              panelClassName="w-80"
            >
              {() => <PrivacyText />}
            </Popover>
            <button type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel} className={iconButton}>
              <ThemeIcon />
            </button>
            <Button variant="ghost" size="sm" onClick={() => setHelp(true)} aria-haspopup="dialog">
              Help
            </Button>
            {hasData && (
              <Popover
                className={buttonClass("ghost", "sm")}
                label={
                  <>
                    Your data{" "}
                    <span className="font-normal text-muted">· {remember ? "remembered" : "this tab only"}</span>
                    <ChevronIcon dir="down" className="size-3.5" />
                  </>
                }
              >
                {dataItems}
              </Popover>
            )}
          </div>

          <div className="flex items-center gap-1 sm:hidden">
            <Popover
              ariaLabel="Local only: nothing leaves this browser"
              className={cx(iconButton, "text-ok-fg")}
              label={<LockIcon />}
              panelClassName="w-80"
            >
              {() => <PrivacyText />}
            </Popover>
            <Popover ariaLabel="Menu" className={iconButton} label={<MoreIcon />}>
              {(close) => (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setHelp(true);
                    }}
                    aria-haspopup="dialog"
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 font-medium hover:bg-sunken"
                  >
                    <HelpIcon /> Help
                  </button>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 font-medium hover:bg-sunken"
                  >
                    <ThemeIcon /> {themeLabel}
                  </button>
                  {hasData && (
                    <div className="mt-1 border-t border-line-soft px-2 pt-3">
                      <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Your data</p>
                      {dataItems(close)}
                    </div>
                  )}
                </div>
              )}
            </Popover>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Stepper
          current={state.step}
          onStep={(step) => dispatch({ type: "step", step })}
          steps={STEPS.map(([step, label]) => ({ step, label, enabled: reachable(state, step) }))}
        />

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
    </div>
  );
}
