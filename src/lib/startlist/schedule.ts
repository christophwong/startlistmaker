import {
  CHECKIN_BEFORE_OT,
  WARMUP_BEFORE_OT,
  type EngineStart,
  type EntryInput,
  type ScheduledBreak,
  type ScheduledRow,
  type Segment,
  type StartListSettings,
} from "./types";

interface Group {
  segment: Segment;
  ot: number;
  capacity: number;
  athleteIds: string[];
  /** longest known dive time in the group, seconds */
  maxDiveSec: number | null;
}

const roundUp = (n: number, step: number) => Math.ceil(n / Math.max(1, step)) * Math.max(1, step);

interface PendingBreak {
  breakMin: number;
  resumeAt: number | null;
}

/**
 * Walks a start list entry by entry and assigns OT groups. `schedule()`
 * and the generator share this so that a generated list and a replayed one
 * always get identical times.
 */
export class ScheduleCursor {
  private group: Group | null = null;
  private pendingBreak: PendingBreak | null = null;
  groupCount = 0;

  constructor(private readonly s: StartListSettings) {}

  segmentOf(start: Pick<EngineStart, "discipline">): Segment {
    return this.s.type === "POOL" && start.discipline === "STA" ? "STA" : "MAIN";
  }

  private capacity(seg: Segment) {
    const n = seg === "STA" ? this.s.staLanes : this.s.lanes;
    return Math.max(1, n);
  }

  /** Minutes from this group's OT to the next one's. */
  interval(g: Pick<Group, "segment" | "maxDiveSec">): number {
    const fixed = g.segment === "STA" ? this.s.staIntervalMin : this.s.intervalMin;
    if (this.s.spacingMode !== "DIVE_TIME" || g.maxDiveSec === null) return fixed;
    return roundUp(Math.ceil(g.maxDiveSec / 60) + this.s.bufferMin, this.s.roundToMin);
  }

  /** OT the next group would get if no break were pending. */
  naturalNextOt(): number {
    return this.group ? this.group.ot + this.interval(this.group) : this.s.startTime;
  }

  /** OT of the next new group, honouring a pending break. */
  nextGroupOt(): number {
    const b = this.pendingBreak;
    if (!b) return this.naturalNextOt();
    if (b.resumeAt !== null) return b.resumeAt;
    return this.naturalNextOt() + b.breakMin;
  }

  private joinsCurrent(start: EngineStart): boolean {
    const g = this.group;
    return (
      !!g &&
      !this.pendingBreak &&
      g.segment === this.segmentOf(start) &&
      g.athleteIds.length < g.capacity
    );
  }

  /** What appending `start` now would produce, without appending it. */
  peek(start: EngineStart): { ot: number; sharesGroupWithSelf: boolean } {
    if (this.joinsCurrent(start)) {
      return {
        ot: this.group!.ot,
        sharesGroupWithSelf: this.group!.athleteIds.includes(start.athleteId),
      };
    }
    return { ot: this.nextGroupOt(), sharesGroupWithSelf: false };
  }

  addStart(start: EngineStart): { ot: number; lane: number; group: number } {
    if (!this.joinsCurrent(start)) {
      const seg = this.segmentOf(start);
      this.group = {
        segment: seg,
        ot: this.nextGroupOt(),
        capacity: this.capacity(seg),
        athleteIds: [],
        maxDiveSec: null,
      };
      this.pendingBreak = null;
      this.groupCount++;
    }
    const g = this.group!;
    g.athleteIds.push(start.athleteId);
    if (start.diveTimeSec !== null) g.maxDiveSec = Math.max(g.maxDiveSec ?? 0, start.diveTimeSec);
    return { ot: g.ot, lane: g.athleteIds.length, group: this.groupCount };
  }

  /** Consecutive breaks merge: durations add up, the last fixed time wins. */
  addBreak(breakMin: number | null, resumeAt: number | null) {
    const prev = this.pendingBreak;
    this.pendingBreak = {
      breakMin: (prev?.breakMin ?? 0) + (breakMin ?? 0),
      resumeAt: resumeAt ?? prev?.resumeAt ?? null,
    };
  }
}

/** Computes OT / WT / check-in and lanes for an ordered entry list. */
export function schedule<S extends EngineStart>(
  entries: EntryInput[],
  startsById: Map<string, S>,
  settings: StartListSettings,
): ScheduledRow<S>[] {
  const cursor = new ScheduleCursor(settings);
  const rows: ScheduledRow<S>[] = [];
  const openBreaks: ScheduledBreak[] = [];

  entries.forEach((entry, index) => {
    if (entry.kind === "BREAK") {
      const row = {
        kind: "BREAK" as const,
        index,
        breakMin: entry.breakMin,
        resumeAt: entry.resumeAt,
        naturalOt: null as number | null,
        nextOt: 0,
      };
      cursor.addBreak(entry.breakMin, entry.resumeAt);
      rows.push(row);
      openBreaks.push(row);
      return;
    }
    const start = startsById.get(entry.startId);
    if (!start) return;
    if (openBreaks.length) {
      // Fill in break rows now that we know where the next group lands.
      const nextOt = cursor.nextGroupOt();
      for (const b of openBreaks) {
        b.nextOt = nextOt;
        b.naturalOt = cursor.naturalNextOt();
      }
      openBreaks.length = 0;
    }
    const { ot, lane, group } = cursor.addStart(start);
    const first = cursor.segmentOf(start) === "STA" ? settings.staFirstLane : settings.firstLane;
    rows.push({
      kind: "START",
      index,
      start,
      group,
      lane,
      laneNo: lane + first - 1,
      ot,
      wt: ot - WARMUP_BEFORE_OT,
      checkIn: ot - CHECKIN_BEFORE_OT,
    });
  });

  // Trailing breaks: show where a following start would begin.
  for (const b of openBreaks) {
    b.nextOt = cursor.nextGroupOt();
    b.naturalOt = cursor.naturalNextOt();
  }
  return rows;
}
