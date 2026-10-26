import { downloadText } from "~/lib/export/files";
import { SAMPLES, loadSample } from "~/samples";

/** Download buttons for the bundled sample files, which double as form templates. */
export function SampleDownloads() {
  return (
    <>
      {SAMPLES.map((s, i) => (
        <span key={s.kind}>
          {i > 0 && " · "}
          <button
            type="button"
            className="text-brand-700 underline dark:text-sky-300"
            onClick={async () => {
              const sample = await loadSample(s.kind);
              downloadText(sample.filename, sample.csv, "text/csv;charset=utf-8");
            }}
          >
            {s.filename}
          </button>
        </span>
      ))}
    </>
  );
}
