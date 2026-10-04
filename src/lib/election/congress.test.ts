import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import { chamberSeats, senateSeats, stateSeats } from "./congress";
import type { Race } from "./trends";

import spSen from "./__fixtures__/sp-c0005-e006259-u.json";
import ver2024 from "./__fixtures__/sp71072-c0013-e000619-u.json";

const raceOf = (key: string, raw: unknown, patch: Partial<Race["data"]> = {}): Race => {
  const { meta, data } = normalizeResult(key, raw as RawResult);
  return { meta, data: { ...data, ...patch }, colors: {}, history: [] };
};

describe("chamberSeats", () => {
  // The 2024 São Paulo city council: a finished proportional count with the TSE's elected.
  const final = raceOf("sp71072-c0013-e000619", ver2024);

  it("uses the TSE's elected once the count is final", () => {
    const res = chamberSeats([final]);
    expect(res.seats).toBe(55);
    expect(res.settled).toBe(55);
    expect(res.final).toBe(1);
    expect(res.parties.reduce((n, p) => n + p.seats, 0)).toBe(55);
    // Counted per party, not per federation: PSOL and REDE each keep their own seats.
    const party = new Map(final.meta.candidates.map((c) => [c.id, c.party]));
    const psol = final.data.votes.filter(
      ([id, , st]) => /^eleito/i.test(st) && party.get(id) === "PSOL",
    ).length;
    expect(res.parties.find((p) => p.party === "PSOL")?.seats).toBe(psol);
  });

  it("simulates with the quociente while counting, and the simulation matches the final", () => {
    const counting = { ...final, data: { ...final.data, progress: 99.9 } };
    const sim = chamberSeats([counting]);
    expect(sim.settled).toBe(0);
    expect(sim.parties).toEqual(chamberSeats([final]).parties.map((p) => ({ ...p, settled: 0 })));
  });
});

describe("stateSeats", () => {
  it("breaks a tie in seats with the party's votes", () => {
    const race = raceOf("sp71072-c0013-e000619", ver2024);
    const res = stateSeats(race);
    for (let i = 1; i < res.parties.length; i++) {
      const [a, b] = [res.parties[i - 1]!, res.parties[i]!];
      expect(a.seats > b.seats || (a.seats === b.seats && a.votes >= b.votes)).toBe(true);
    }
  });
});

describe("senateSeats", () => {
  it("gives a state's two seats to its two most voted", () => {
    const race = raceOf("sp-c0005-e006259", spSen);
    const [a, b, c] = race.meta.candidates;
    const votes: [string, number, string][] = [
      [a!.id, 500, ""],
      [b!.id, 300, ""],
      [c!.id, 400, ""],
    ];
    const res = senateSeats([
      { ...race, data: { ...race.data, votes, valid: 1200, progress: 10 } },
    ]);
    expect(res.seats).toBe(2);
    const parties = [a!.party, c!.party];
    expect(res.parties.flatMap((p) => Array(p.seats).fill(p.party)).sort()).toEqual(parties.sort());
  });
});
