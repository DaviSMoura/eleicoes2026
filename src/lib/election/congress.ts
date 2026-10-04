// Seats per party in the Câmara, the Assembleias and the Senado, per state and summed over the
// 27 states, for the status column's maps and pie charts.
import { colorsForParties } from "./colors";
import { distributeSeats, qeInputFor } from "./quociente";
import { trendsFor, type Race } from "./trends";

export type PartySeats = { party: string; seats: number; settled: number; votes: number };

export type Chamber = {
  parties: PartySeats[]; // most seats first; ties go to the most voted party
  seats: number; // seats in play across the races received
  settled: number; // seats already final (TSE result or mathematically decided)
  states: number; // races received
  final: number; // races whose result is official
};

const ELECTED = /^eleito/i;

type RaceSeats = { race: Race; ids: string[]; settledIds: Set<string>; final: boolean };

function sum(byRace: RaceSeats[]): Chamber {
  const parties = new Map<string, PartySeats>();
  const votes = new Map<string, number>();
  let seats = 0;
  let settled = 0;
  for (const { race, ids, settledIds } of byRace) {
    seats += race.meta.seats;
    const partyOf = new Map(race.meta.candidates.map((c) => [c.id, c.party]));
    for (const [id, v] of race.data.votes) {
      const party = partyOf.get(id);
      if (party) votes.set(party, (votes.get(party) ?? 0) + v);
    }
    for (const id of ids) {
      const party = partyOf.get(id);
      if (!party) continue;
      const row = parties.get(party) ?? { party, seats: 0, settled: 0, votes: 0 };
      row.seats++;
      if (settledIds.has(id)) {
        row.settled++;
        settled++;
      }
      parties.set(party, row);
    }
  }
  for (const row of parties.values()) row.votes = votes.get(row.party) ?? 0;
  return {
    parties: [...parties.values()].sort(
      (a, b) => b.seats - a.seats || b.votes - a.votes || a.party.localeCompare(b.party),
    ),
    seats,
    settled,
    states: byRace.length,
    final: byRace.filter((r) => r.final).length,
  };
}

// Proportional races (deputados): the TSE's elected once the count is final, otherwise the
// quociente simulation over the votes counted so far (same rules as the Quociente section).
function proportional(race: Race): RaceSeats {
  const official =
    race.data.progress >= 100
      ? race.data.votes.filter(([, , st]) => ELECTED.test(st)).map(([id]) => id)
      : [];
  if (official.length > 0)
    return { race, ids: official, settledIds: new Set(official), final: true };
  const ids = distributeSeats(qeInputFor(race.meta, race.data)).groups.flatMap((g) => g.elected);
  return { race, ids, settledIds: new Set<string>(), final: false };
}

export const chamberSeats = (races: Race[]): Chamber => sum(races.map(proportional));

// One state's proportional race on its own (the per-state map and list).
export const stateSeats = (race: Race): Chamber => sum([proportional(race)]);

// Senado: in each state the seats go to the most voted; the decided ones (TSE status or
// mathematically settled, as in the Senador tab) count as settled.
export function senateSeats(races: Race[]): Chamber {
  return sum(
    races.map((race) => {
      const ids = [...race.data.votes]
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, race.meta.seats)
        .map(([id]) => id);
      const settledIds = new Set(race.data.progress > 0 ? trendsFor(race).decided : []);
      return { race, ids, settledIds, final: settledIds.size >= race.meta.seats };
    }),
  );
}

// Colors for a chamber's pie and map: the biggest parties get one each, the rest are gray (they
// fold into "Outros" in the pie), so no color repeats.
export const CHAMBER_COLORED = 9;

export function chamberColors(chamber: Chamber): (party: string) => number {
  const top = chamber.parties.filter((p) => p.seats > 0).slice(0, CHAMBER_COLORED);
  const colors = colorsForParties(top.map((p) => p.party));
  return (party) => colors.get(party) ?? 0;
}
