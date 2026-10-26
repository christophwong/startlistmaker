import { useId, type ComponentProps, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover focus-visible:outline-accent disabled:bg-muted",
  secondary:
    "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-sunken",
  danger: "bg-err-fg text-surface hover:opacity-90 focus-visible:outline-err-fg",
  ghost: "text-ink-2 hover:bg-sunken",
};

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed sm:min-h-10";

/** Button styles, for a <label> around a file input that should look like a button. */
export const buttonClass = (variant: Variant = "primary", size?: "sm") =>
  cx(buttonBase, variants[variant], size === "sm" && "min-h-9 px-2.5 sm:min-h-8");

export function Button({
  variant = "primary",
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"a"> & { variant?: Variant }) {
  return <a className={cx(buttonBase, variants[variant], className)} {...props} />;
}

const inputClass =
  "block w-full min-h-11 rounded-lg border-0 bg-field px-3 py-2 text-base ring-1 ring-inset ring-line-strong placeholder:text-muted focus:ring-2 focus:ring-accent sm:min-h-10 sm:text-sm";

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
}

export function Field({
  label,
  error,
  hint,
  className,
  ...input
}: FieldProps & ComponentProps<"input">) {
  const id = input.id ?? input.name;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(inputClass, error && "ring-err-fg")}
        {...input}
      />
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-err-fg">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...select
}: FieldProps & ComponentProps<"select">) {
  const id = select.id ?? select.name;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <select id={id} className={cx(inputClass, error && "ring-err-fg")} {...select}>
        {children}
      </select>
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-sm text-err-fg">{error}</p>}
    </div>
  );
}

export function RadioGroup({
  label,
  name,
  options,
  defaultValue,
  hint,
  stacked,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string;
  hint?: string;
  /** One option per line, for a narrow column. */
  stacked?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className={cx("grid gap-2", !stacked && "sm:grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-3 rounded-lg bg-surface p-3 ring-1 ring-line-strong has-checked:ring-2 has-checked:ring-accent"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              onChange={onChange && ((e) => onChange(e.target.value))}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              {o.description && (
                <span className="block text-xs text-muted">{o.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}

/** Radio buttons drawn as a segmented control (two or three short choices). */
export function Segmented({
  label,
  name,
  options,
  defaultValue,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-[9px] bg-sunken p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2 text-center text-sm text-ink-2 has-checked:bg-surface has-checked:font-semibold has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              onChange={onChange && ((e) => onChange(e.target.value))}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A card in a step's side column (Columns, Start list), with a small caps title. */
export function SideCard({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx("rounded-xl bg-surface p-4 ring-1 ring-line", className)}>
      <h3 id={id} className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-xl bg-surface p-4 shadow-sm ring-1 ring-line sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const alertTones = {
  error: "bg-err-bg text-err-fg ring-err-line",
  warning: "bg-warn-bg text-warn-fg ring-warn-line",
  info: "bg-accent-soft text-ink ring-line",
  success: "bg-ok-bg text-ok-fg ring-ok-line",
};

export function Alert({
  tone = "info",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof alertTones }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-lg p-3 text-sm ring-1", alertTones[tone], className)}
      {...props}
    />
  );
}

export function Badge({
  tone = "slate",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "slate" | "brand" | "amber" | "red" | "emerald" }) {
  const tones = {
    slate: "bg-sunken text-ink-2",
    brand: "bg-accent-soft text-accent",
    amber: "bg-warn-bg text-warn-fg",
    red: "bg-err-bg text-err-fg",
    emerald: "bg-ok-bg text-ok-fg",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
