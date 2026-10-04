import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import { projectNational, trendsFor, type Race } from "./trends";

import brPres from "./__fixtures__/br-c0001-e006257-u.json";
import spSen from "./__fixtures__/sp-c0005-e006259-u.json";
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
