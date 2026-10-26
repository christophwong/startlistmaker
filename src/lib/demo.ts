import type { RegistrationDraft } from "./import/rows";
import type { EngineStartWithAthlete } from "./startlist/types";

/**
 * Turns parsed registrations into engine starts for the client-side demo,
 * where there are no database ids: athletes are `a{n}`, starts `a{n}-s{1|2}`.
 */
export function draftsToStarts(drafts: RegistrationDraft[]): EngineStartWithAthlete[] {
  return drafts.flatMap((d, n) =>
    d.starts.map((s) => ({
      id: `a${n}-s${s.startNumber}`,
      athleteId: `a${n}`,
      startNumber: s.startNumber,
      discipline: s.discipline,
      ap: s.ap,
      pb: s.pb,
      diveTimeSec: s.diveTimeSec,
      firstName: d.firstName,
      lastName: d.lastName,
      gender: d.gender,
      country: d.country,
    })),
  );
}
