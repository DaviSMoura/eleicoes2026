// Seats per party in the Câmara and in the Senado, summed over the 27 states, for the status
// column's pie charts.
import { distributeSeats, qeInputFor } from "./quociente";
import { trendsFor, type Race } from "./trends";

export type PartySeats = { party: string; seats: number; settled: number };

export type Chamber = {
  parties: PartySeats[]; // most seats first
  seats: number; // seats in play across the races received
  settled: number; // seats already final (TSE result or mathematically decided)
  states: number; // races received
};

const ELECTED = /^eleito/i;

function sum(byRace: { race: Race; ids: string[]; settledIds: Set<string> }[]): Chamber {
  const parties = new Map<string, PartySeats>();
  let seats = 0;
  let settled = 0;
  for (const { race, ids, settledIds } of byRace) {
    seats += race.meta.seats;
    const partyOf = new Map(race.meta.candidates.map((c) => [c.id, c.party]));
    for (const id of ids) {
      const party = partyOf.get(id);
      if (!party) continue;
      const row = parties.get(party) ?? { party, seats: 0, settled: 0 };
      row.seats++;
      if (settledIds.has(id)) {
        row.settled++;
        settled++;
      }
      parties.set(party, row);
    }
  }
  return {
    parties: [...parties.values()].sort(
      (a, b) => b.seats - a.seats || a.party.localeCompare(b.party),
    ),
    seats,
    settled,
    states: byRace.length,
  };
}

// Câmara dos Deputados: the TSE's elected once a state is fully counted, otherwise the quociente
// simulation over the votes counted so far (same rules as the Quociente section).
export function chamberSeats(races: Race[]): Chamber {
  return sum(
    races.map((race) => {
      const official =
        race.data.progress >= 100
          ? race.data.votes.filter(([, , st]) => ELECTED.test(st)).map(([id]) => id)
          : [];
      if (official.length > 0) return { race, ids: official, settledIds: new Set(official) };
      const ids = distributeSeats(qeInputFor(race.meta, race.data)).groups.flatMap(
        (g) => g.elected,
      );
      return { race, ids, settledIds: new Set<string>() };
    }),
  );
}

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
      return { race, ids, settledIds };
    }),
  );
}
