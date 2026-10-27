import type { ScheduledRow } from "../startlist/types";

/**
 * Judge and safety names for the judge and safety sheets. Names belong to a
 * zone at a time, not to a diver: they're keyed by slot, the OT group's
 * ordinal (`ScheduledStart.group`) and the zone (`lane`). Reordering moves
 * divers under the names, and changing the first OT or the spacing keeps
 * every name in place, since ordinals aren't times.
 *
 * Values are plain text kept as typed ("Jana", "Jana & Lucy").
 */

export interface ZoneCrew {
  judge?: string;
  /** Safety diver(s) for this zone; printed in that zone's column. */
  safety?: string;
}

/** One deck and one warm-up person per OT. */
export interface GroupCrew {
  deck?: string;
  warmUp?: string;
}

/** A labelled row on the safety sheet ("STA WARM UP LANE 1"), before an OT group. */
export interface CrewSection {
  id: string;
  beforeGroup: number;
  label: string;
  note: string;
}

export interface Crew {
  /** `${group}:${lane}` → names */
  zone: Record<string, ZoneCrew>;
  /** `${group}` → names */
  group: Record<string, GroupCrew>;
  sections: CrewSection[];
  /** Groups and zones when the names were last set, to notice a list that changed under them. */
  shape: CrewShape | null;
}

export interface CrewShape {
  groups: number;
  lanes: number;
}

export type CrewField = "judge" | "safety" | "deck" | "warmUp";
export type CrewNames = Record<CrewField, string>;
export interface Slot {
  group: number;
  lane: number;
}

export const CREW_FIELDS: CrewField[] = ["judge", "safety", "deck", "warmUp"];
export const MAX_NAME = 80;

export const emptyCrew = (): Crew => ({ zone: {}, group: {}, sections: [], shape: null });

const zoneKey = (s: Slot) => `${s.group}:${s.lane}`;
const isZoneField = (f: CrewField): f is keyof ZoneCrew => f === "judge" || f === "safety";

export function crewAt(crew: Crew, slot: Slot): CrewNames {
  const z = crew.zone[zoneKey(slot)] ?? {};
  const g = crew.group[String(slot.group)] ?? {};
  return { judge: z.judge ?? "", safety: z.safety ?? "", deck: g.deck ?? "", warmUp: g.warmUp ?? "" };
}

/** Drops empty values and records, so a cleared slot leaves nothing behind. */
function tidy<T extends object>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    const kept = Object.fromEntries(Object.entries(v).filter(([, s]) => s)) as T;
    if (Object.keys(kept).length) out[k] = kept;
  }
  return out;
}

/**
 * Sets `names` on every slot. A field that's undefined is left alone; "" clears
 * it. Deck and warm up are per OT group, so they fill the slot's whole group.
 */
export function setCrew(crew: Crew, slots: Slot[], names: Partial<CrewNames>, shape: CrewShape): Crew {
  const zone = { ...crew.zone };
  const group = { ...crew.group };
  for (const slot of slots) {
    for (const field of CREW_FIELDS) {
      const raw = names[field];
      if (raw === undefined) continue;
      const value = raw.trim().slice(0, MAX_NAME);
      if (isZoneField(field)) zone[zoneKey(slot)] = { ...zone[zoneKey(slot)], [field]: value };
      else group[String(slot.group)] = { ...group[String(slot.group)], [field]: value };
    }
  }
  return { ...crew, zone: tidy(zone), group: tidy(group), shape };
}

export const hasNames = (crew: Crew) => Object.keys(crew.zone).length > 0 || Object.keys(crew.group).length > 0;

/**
 * Names typed so far, for suggestions: every value as typed, plus each name
 * inside a pair ("Jana & Lucy" → "Jana", "Lucy"), sorted.
 */
export function crewNames(crew: Crew): string[] {
  const values = [...Object.values(crew.zone), ...Object.values(crew.group)].flatMap((v) => Object.values(v) as string[]);
  const parts = values.flatMap((v) => v.split("&").map((p) => p.trim()));
  return [...new Set([...values, ...parts].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function shapeOf(rows: ScheduledRow[]): CrewShape {
  let groups = 0;
  let lanes = 1;
  for (const r of rows) {
    if (r.kind !== "START") continue;
    groups = Math.max(groups, r.group);
    lanes = Math.max(lanes, r.lane);
  }
  return { groups, lanes };
}

/** True when names were set on a list with a different number of OT groups or zones. */
export const crewOutOfDate = (crew: Crew, rows: ScheduledRow[]) => {
  if (!crew.shape || !hasNames(crew)) return false;
  const now = shapeOf(rows);
  return now.groups !== crew.shape.groups || now.lanes !== crew.shape.lanes;
};

/**
 * Zones with no start in each stretch of the list, keyed by group. A stretch
 * runs between breaks and section rows; the safety sheet greys those zones,
 * as on the ECAC safety schedule.
 */
export function unusedZones(rows: ScheduledRow[], crew: Crew): Map<number, Set<number>> {
  const { lanes } = shapeOf(rows);
  const sectionAt = new Set(crew.sections.map((s) => s.beforeGroup));
  const out = new Map<number, Set<number>>();
  let stretch: number[] = [];
  let used = new Set<number>();
  const close = () => {
    const unused = new Set(Array.from({ length: lanes }, (_, i) => i + 1).filter((l) => !used.has(l)));
    for (const g of stretch) out.set(g, unused);
    stretch = [];
    used = new Set();
  };
  let last = 0;
  for (const r of rows) {
    if (r.kind === "BREAK") {
      close();
      continue;
    }
    if (r.group !== last && sectionAt.has(r.group)) close();
    last = r.group;
    if (!stretch.includes(r.group)) stretch.push(r.group);
    used.add(r.lane);
  }
  close();
  return out;
}

/**
 * Warm-up rows to start from: one before the first OT and one after each
 * break, named after the stretch's first discipline ("STA WARM UP").
 */
export function defaultSections(rows: ScheduledRow[], newId: () => string): CrewSection[] {
  const out: CrewSection[] = [];
  let open = true;
  for (const r of rows) {
    if (r.kind === "BREAK") {
      open = true;
    } else if (open) {
      out.push({ id: newId(), beforeGroup: r.group, label: `${r.start.discipline} WARM UP`, note: "" });
      open = false;
    }
  }
  return out;
}
