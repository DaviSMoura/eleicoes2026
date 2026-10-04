import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import {
  mathDecided,
  projectNational,
  remainingVotes,
  roundShares,
  shareOf,
  trendPath,
  trendsFor,
  validOf,
  type Race,
} from "./trends";

import brPres from "./__fixtures__/br-c0001-e006257-u.json";
import rjDepFed from "./__fixtures__/rj-c0006-e006259-u.json";
import rjGov from "./__fixtures__/rj-c0003-e006259-u.json";
import spSen from "./__fixtures__/sp-c0005-e006259-u.json";
import spGovRaw from "./__fixtures__/sp-c0003-e006259-u.json";
import pref2024 from "./__fixtures__/sp71072-c0011-e000619-u.json";

function race(key: string, raw: unknown, votes: Record<string, number> = {}, progress = 0): Race {
  const { meta, data } = normalizeResult(key, raw as RawResult);
  const rows = data.votes.map(([id, , s]): [string, number, string] => [id, votes[id] ?? 0, s]);
  const valid = rows.reduce((a, [, v]) => a + v, 0);
  return {
    meta,
    data: {
      ...data,
      votes: rows,
      valid,
      progress,
      turnout: valid,
      electorate: valid * 1.25 || data.electorate,
    },
    colors: {},
    history: [],
  };
}

const idOf = (r: Race, name: string) => r.meta.candidates.find((c) => c.name === name)!.id;

describe("trendsFor", () => {
  it("waits for the first sections", () => {
    const tr = trendsFor(race("br-c0001-e006257", brPres));
    expect(tr.call.text).toBe("Aguardando as primeiras seções totalizadas.");
    expect(tr.items.every((t) => t.win === 0)).toBe(true);
  });

  it("calls a runoff when nobody gets close to 50%", () => {
    const base = race("br-c0001-e006257", brPres);
    const [a, b, c] = [
      idOf(base, "LULA"),
      idOf(base, "FLAVIO BOLSONARO"),
      idOf(base, "RONALDO CAIADO"),
    ];
    const r = race("br-c0001-e006257", brPres, { [a]: 4300, [b]: 4000, [c]: 1700 }, 60);
    const tr = trendsFor(r);
    expect(tr.call.kind).toBe("segundo-turno");
    expect(tr.runoffPair).toEqual([a, b]);
    expect(tr.winLabel).toBe("1º lugar");
  });

  it("names both senators when two seats are clear", () => {
    const base = race("sp-c0005-e006259", spSen);
    const [x, y, z] = base.meta.candidates.map((c) => c.id);
    const r = race("sp-c0005-e006259", spSen, { [x!]: 4500, [y!]: 4000, [z!]: 1500 }, 90);
    const tr = trendsFor(r);
    expect(tr.winLabel).toBe("Eleito");
    expect(tr.call.kind).toBe("vitoria");
    expect(tr.call.text).toContain(" e ");
    expect(tr.items.find((t) => t.id === z)!.win).toBeLessThan(0.1);
  });

  it("trusts the final TSE statuses (2024 São Paulo mayor went to a runoff)", () => {
    const { meta, data } = normalizeResult(
      "sp71072-c0011-e000619",
      pref2024 as unknown as RawResult,
    );
    const tr = trendsFor({ meta: { ...meta, cargo: 3 }, data, colors: {}, history: [] });
    expect(tr.call).toEqual({
      kind: "segundo-turno",
      text: "2º turno: Guilherme Boulos × Ricardo Nunes",
    });
  });
});

describe("projectNational", () => {
  it("weights each UF by its remaining votes and fills empty UFs with the national share", () => {
    const br = race("br-c0001-e006257", brPres);
    const [a, b] = [idOf(br, "LULA"), idOf(br, "FLAVIO BOLSONARO")];
    // UF X: half counted, A leads 70/30. UF Y: half counted, B leads 60/40 but twice the size.
    const ufX = race("ba-c0001-e006257", brPres, { [a]: 700, [b]: 300 }, 50);
    const ufY = race("sp-c0001-e006257", brPres, { [a]: 800, [b]: 1200 }, 50);
    const nat = race("br-c0001-e006257", brPres, { [a]: 1500, [b]: 1500 }, 50);
    const proj = projectNational(nat, [ufX, ufY]);
    // Remaining equals counted in both UFs, so the projection keeps each UF's split:
    // A = (1400 + 1600) / 6000 = 50%.
    expect(proj.get(a)).toBeCloseTo(50, 5);
    expect(proj.get(b)).toBeCloseTo(50, 5);

    // UF Y fully counted: only UF X still has votes to come, and A leads there.
    const ufYDone = race("sp-c0001-e006257", brPres, { [a]: 800, [b]: 1200 }, 100);
    const proj2 = projectNational(nat, [ufX, ufYDone]);
    expect(proj2.get(a)).toBeCloseTo(((1400 + 800) / 4000) * 100, 5);
  });
});

describe("mathDecided", () => {
  // Real numbers from Mato Grosso do Sul, 04/10 18:2x: Governador with 83.55% counted.
  const gov = (lead: number, second: number, valid: number, remaining: number): Race => {
    const r = race("ms-c0003-e006259", spGovRaw);
    const [a, b] = r.meta.candidates.map((c) => c.id);
    return {
      ...r,
      data: {
        ...r.data,
        progress: 83.55,
        valid,
        electorate: 2_000_000,
        electorateCounted: 2_000_000 - remaining,
        votes: r.data.votes.map(([id, , s]): [string, number, string] => [
          id,
          id === a ? lead : id === b ? second : 0,
          s,
        ]),
      },
    };
  };

  it("elects the Governador leader when even all remaining voters cannot pull him under 50%", () => {
    const r = gov(767_780, 263_244, 1_100_000, 337_260);
    expect(mathDecided(r)).toEqual([r.meta.candidates[0]!.id]);
    expect(trendsFor(r).call.text).toMatch(/já matematicamente definido/);
  });

  it("waits while the remaining voters could still force a runoff", () => {
    expect(mathDecided(gov(700_000, 400_000, 1_100_000, 337_260))).toEqual([]);
  });

  it("only decides where the election happens", () => {
    const state = gov(767_780, 263_244, 1_100_000, 337_260);
    // Same numbers in a city column: Governador is decided by the whole state.
    const city: Race = {
      ...state,
      meta: { ...state.meta, abr: "ms90514", key: "ms90514-c0003-e006259" },
    };
    expect(mathDecided(city)).toEqual([]);
    // Presidente counted in one state elects nobody, only Brasil does.
    const presUf: Race = { ...state, meta: { ...state.meta, cargo: 1, abr: "ms" } };
    expect(mathDecided(presUf)).toEqual([]);
    const presBr: Race = { ...state, meta: { ...state.meta, cargo: 1, abr: "br" } };
    expect(mathDecided(presBr)).toHaveLength(1);
  });

  it("needs the turnout base to decide anything", () => {
    const r = gov(767_780, 263_244, 1_100_000, 337_260);
    const { electorateCounted: _, ...data } = r.data;
    expect(mathDecided({ ...r, data })).toEqual([]);
  });

  it("settles one Senate seat and keeps the other open", () => {
    const base = race("sp-c0005-e006259", spSen);
    const [x, y, z] = base.meta.candidates.map((c) => c.id);
    const r: Race = {
      ...base,
      data: {
        ...base.data,
        progress: 90,
        valid: 1_000_000,
        electorate: 1_100_000,
        electorateCounted: 1_000_000,
        votes: base.data.votes.map(([id, , s]): [string, number, string] => [
          id,
          id === x ? 500_000 : id === y ? 260_000 : id === z ? 240_000 : 0,
          s,
        ]),
      },
    };
    expect(mathDecided(r)).toEqual([x]);
    const tr = trendsFor(r);
    expect(tr.items.find((t) => t.id === x)!.win).toBe(1);
    expect(tr.call.text).toMatch(/^Marina Silva já está eleito; /);
    expect(tr.call.text).not.toMatch(/Marina Silva.*Marina Silva/);
  });
});

describe("roundShares", () => {
  it("keeps the total at 100 instead of 101", () => {
    expect(roundShares([94.75, 5.5, 0, 0])).toEqual([95, 5, 0, 0]);
    expect(roundShares([33.4, 33.3, 33.3]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("keeps two-seat races at 200", () => {
    expect(roundShares([99.5, 60.5, 40]).reduce((a, b) => a + b, 0)).toBe(200);
  });
});

describe("trendPath", () => {
  // A has 50% with 40% counted, but only 40% of the votes counted since 20% (600 of 1000 then,
  // 1000 of 2000 now). 3000 valid votes are left (2000 / 0.4 * 0.6), so A should end at
  // (1000 + 0.4 * 3000) / (2000 + 3000) = 44%.
  function counting(): Race {
    const base = race("sp-c0003-e006259", spGovRaw);
    const [a, b] = base.meta.candidates.map((c) => c.id);
    const votes = (va: number, vb: number) => ({ [a!]: va, [b!]: vb });
    return {
      ...base,
      data: {
        ...base.data,
        progress: 40,
        valid: 2000,
        votes: base.data.votes.map(([id, , st]): [string, number, string] => [
          id,
          id === a ? 1000 : id === b ? 1000 : 0,
          st,
        ]),
      },
      history: [
        { sections: 1, progress: 20, tseAt: "", valid: 1000, votes: votes(600, 400) },
        { sections: 2, progress: 40, tseAt: "", valid: 2000, votes: votes(1000, 1000) },
      ],
    };
  }

  it("uses the marginal share of the votes counted last", () => {
    const r = counting();
    const rem = remainingVotes(r)!;
    expect(rem.votes).toBeCloseTo(3000, 5);
    expect(rem.shares.get(r.meta.candidates[0]!.id)).toBeCloseTo(0.4, 5);
  });

  it("goes from the current share to the projection, smoothly", () => {
    const r = counting();
    const a = r.meta.candidates[0]!.id;
    const path = trendPath(r);
    expect(path[0]!.p).toBe(40);
    expect(path[0]!.shares.get(a)).toBeCloseTo(50, 5);
    expect(path.at(-1)!.p).toBe(100);
    expect(path.at(-1)!.shares.get(a)).toBeCloseTo(44, 5);
    for (let i = 1; i < path.length; i++)
      expect(path[i]!.shares.get(a)!).toBeLessThanOrEqual(path[i - 1]!.shares.get(a)!);
  });

  it("makes the table's projection the end of the trend line", () => {
    const r = counting();
    const a = r.meta.candidates[0]!.id;
    expect(trendsFor(r).items.find((t) => t.id === a)!.projected).toBeCloseTo(44, 5);
  });

  it("ends the Brasil trend at the per-UF projection", () => {
    const br = race("br-c0001-e006257", brPres, {}, 50);
    const [a, b] = [idOf(br, "LULA"), idOf(br, "FLAVIO BOLSONARO")];
    const ufX = race("ba-c0001-e006257", brPres, { [a]: 700, [b]: 300 }, 50);
    const ufY = race("sp-c0001-e006257", brPres, { [a]: 800, [b]: 1200 }, 100);
    const nat = race("br-c0001-e006257", brPres, { [a]: 1500, [b]: 1500 }, 50);
    const end = trendPath(nat, [ufX, ufY]).at(-1)!;
    expect(end.shares.get(a)).toBeCloseTo(projectNational(nat, [ufX, ufY]).get(a)!, 1);
  });
});

describe("shares match the TSE", () => {
  // RJ 2026: Garotinho is "Anulado sub judice", so the TSE's base is valid + his votes (vvc).
  const cases = [
    ["rj-c0003-e006259", rjGov],
    ["rj-c0006-e006259", rjDepFed],
  ] as const;
  for (const [key, raw] of cases) {
    it(`uses the TSE's base (votos válidos computados) in ${key}`, () => {
      const { data } = normalizeResult(key, raw as unknown as RawResult);
      expect(data.blocked.length).toBeGreaterThan(0);
      const tse = raw as unknown as {
        carg: { agr: { par: { cand: { sqcand: string; pvapn: string }[] }[] }[] }[];
        v: { vvc: string };
      };
      expect(validOf(data)).toBe(Number(tse.v.vvc));
      // pvapn is the exact share (pvap shows at least 0,01 for anyone with a vote).
      for (const c of tse.carg[0]!.agr.flatMap((a) => a.par.flatMap((p) => p.cand)))
        expect(shareOf(data, c.sqcand)).toBeCloseTo(Number(c.pvapn.replace(",", ".")), 6);
    });
  }
});
