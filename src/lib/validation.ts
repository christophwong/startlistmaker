import * as z from "zod/mini";
import { DEPTH_DISCIPLINES, POOL_DISCIPLINES } from "./disciplines";
import { parseClock } from "./time";

/** `{ field: "first message" }` for rendering next to inputs. */
export type FieldErrors = Record<string, string | undefined>;

export function fieldErrors(error: z.core.$ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    out[key] ??= issue.message;
  }
  return out;
}

const clockValue = (v: string, ctx: z.core.ParsePayload, msg: string) => {
  const t = parseClock(v);
  if (t === null) {
    ctx.issues.push({ code: "custom", message: msg, input: v });
    return z.NEVER;
  }
  return t;
};
const clock = (msg: string) => z.pipe(z.string(), z.transform((v: string, ctx) => clockValue(v, ctx, msg)));
const optionalClock = z.pipe(
  z.string(),
  z.transform((v: string, ctx) => (v.trim() ? clockValue(v, ctx, "Enter a time like 13:30.") : null)),
);
/** A whole number from a form field, with messages that name the field. */
const int = (min: number, max: number, label: string) =>
  z.pipe(
    z.string(),
    z.transform((v: string, ctx) => {
      const n = Number(v);
      const fail = (message: string) => {
        ctx.issues.push({ code: "custom", message, input: v });
        return z.NEVER;
      };
      if (v.trim() === "" || Number.isNaN(n)) return fail(`${label} must be a number.`);
      if (!Number.isInteger(n)) return fail(`${label} must be a whole number.`);
      if (n < min) return fail(`${label} must be at least ${min}.`);
      if (n > max) return fail(`${label} must be at most ${max}.`);
      return n;
    }),
  );

const disciplineList = z.pipe(
  z.string(),
  z.pipe(
    z.transform((v: string) => v.split(",").filter(Boolean)),
    z.array(z.enum([...POOL_DISCIPLINES, ...DEPTH_DISCIPLINES])).check(z.maxLength(8)),
  ),
);

export const settingsSchema = z.object({
  startTime: clock("Enter the first OT, e.g. 09:00."),
  spacingMode: z.enum(["FIXED", "DIVE_TIME"]),
  intervalMin: int(1, 120, "Interval"),
  staIntervalMin: int(1, 120, "STA interval"),
  bufferMin: int(0, 60, "Buffer"),
  roundToMin: int(1, 30, "Rounding"),
  lanes: int(1, 10, "Lanes"),
  staLanes: int(1, 10, "STA lanes"),
  scheduleMode: z.enum(["ROUNDS", "SINGLE"]),
  round2Order: z.enum(["SORTED", "ROUND1_ORDER"]),
  minRecoveryMin: int(0, 600, "Minimum recovery"),
  roundBreakMin: int(0, 600, "Round break"),
  halftimeBreakMin: int(0, 600, "Half-time break"),
  groupBy: z.enum(["DISCIPLINE", "MIXED"]),
  blockOrder: disciplineList,
  genderOrder: z.enum(["NONE", "F_FIRST", "M_FIRST"]),
  sortBy: z.enum(["AP", "DIVE_TIME", "NAME", "REGISTRATION"]),
  sortDir: z.enum(["ASC", "DESC"]),
  timeFormat: z.enum(["24h", "12h"]),
});

export const breakSchema = z.object({
  breakMin: z.pipe(
    z.string(),
    z.transform((v: string, ctx) => {
      if (v.trim() === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 600) {
        ctx.issues.push({ code: "custom", message: "Use whole minutes, 0–600.", input: v });
        return z.NEVER;
      }
      return n;
    }),
  ),
  resumeAt: optionalClock,
});
