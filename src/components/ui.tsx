import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 focus-visible:outline-brand-700 disabled:bg-slate-400",
  secondary:
    "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  ghost:
    "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
};

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed sm:min-h-10";

export function Button({
  variant = "primary",
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" }) {
  return (
    <button
      className={cx(
        buttonBase,
        variants[variant],
        size === "sm" && "min-h-9 px-2.5 sm:min-h-8",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"a"> & { variant?: Variant }) {
  return <a className={cx(buttonBase, variants[variant], className)} {...props} />;
}

const inputClass =
  "block w-full min-h-11 rounded-lg border-0 bg-white px-3 py-2 text-base ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 sm:min-h-10 sm:text-sm dark:bg-slate-900 dark:ring-slate-700";

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
        className={cx(inputClass, error && "ring-red-500")}
        {...input}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
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
      <select id={id} className={cx(inputClass, error && "ring-red-500")} {...select}>
        {children}
      </select>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function RadioGroup({
  label,
  name,
  options,
  defaultValue,
  hint,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string;
  hint?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-300 has-checked:ring-2 has-checked:ring-brand-600 dark:bg-slate-900 dark:ring-slate-700"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              onChange={onChange && ((e) => onChange(e.target.value))}
              className="mt-0.5 accent-brand-700"
            />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              {o.description && (
                <span className="block text-xs text-slate-500">{o.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </fieldset>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6 dark:bg-slate-900 dark:ring-slate-800",
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
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const alertTones = {
  error: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900",
  warning:
    "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900",
  info: "bg-brand-50 text-brand-800 ring-brand-100 dark:bg-slate-900 dark:text-sky-200 dark:ring-slate-700",
  success:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900",
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
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    brand: "bg-brand-100 text-brand-800 dark:bg-sky-950 dark:text-sky-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
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
