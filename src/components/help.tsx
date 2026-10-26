import type { ReactNode } from "react";
import { Modal } from "~/components/modal";
import { SampleDownloads } from "~/components/sample-downloads";
import { FIELDS } from "~/lib/import/columns";

/** The full how-to; opened from the header on any step, or from "How it works" on the Upload step. */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base">{title}</h3>
      <div className="space-y-2 text-sm text-ink-2">{children}</div>
    </section>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Modal open={open} onClose={onClose} title="Help">
      <Section title="How it works">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Upload:</strong> choose or drop your Google Forms export, paste it from Google Sheets, open a saved project,
            or enter athletes by hand.
          </li>
          <li>
            <strong>Columns:</strong> check which column holds what, and fix any match the app got wrong under “Use as”.
          </li>
          <li>
            <strong>Athletes:</strong> fix the data in the spreadsheet. Red cells keep a start off the list, and amber ones are
            only warnings.
          </li>
          <li>
            <strong>Start list:</strong> set the event, first OT, interval or dive time + buffer, lanes or zones, breaks and
            order. Drag rows or sort by a column. A start's ⋯ menu (Move on a phone) moves it to a position, adds a break after
            it, or removes this start only. “Put back” on the Athletes step returns it to its place.
          </li>
          <li>
            <strong>Print & export:</strong> add logos if you like (competition and AIDA beside the title, sponsors after the list),
            then print or save as PDF, or download CSV or Excel.
          </li>
        </ol>
      </Section>

      <Section title="Getting your Google Forms export">
        <p>
          <strong>Google Forms:</strong> open Responses → ⋮ → Download responses (.csv), then choose that file on the Upload
          step. Excel files (.xlsx) work too.
        </p>
        <p>
          <strong>Google Sheets:</strong> in the form's linked sheet, select everything (Ctrl/⌘ + A), copy, and use “Paste
          from Sheets”.
        </p>
      </Section>

      <Section title="What your file needs">
        <p>
          One row per athlete. Columns are matched by their question titles (for example “Start 1 - Discipline” or
          “Discipline | Day 1”), and you can fix the matching on the Columns step. Only name, discipline and AP are required.
        </p>
        <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <li key={f.key}>{f.label}</li>
          ))}
        </ul>
        <p>
          Sample files to use as a template:{" "}
          <SampleDownloads />
          . The athletes in them are made up.
        </p>
      </Section>

      <Section title="Saving your work">
        <p>
          <strong>Save project</strong> on the Print & export step downloads a .json file with everything: athletes,
          settings, the order and logos. To carry on later, use “Open a project” on the Upload step.
        </p>
        <p>
          Your work is kept in this tab until you close it. In the “Your data” menu, check “Remember on this device” to keep it
          after the tab closes, and use “Clear all data” to remove it at once.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          Files are read and start lists are built entirely on your device. There is no server, no account and no analytics,
          and the page is set up so it cannot send data anywhere. To check, open your browser's developer tools → Network:
          using the app makes no requests.
        </p>
      </Section>
    </Modal>
  );
}
