import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import { raceStatus } from "./status";
import type { Race } from "./trends";

import spGov from "./__fixtures__/sp-c0003-e006259-u.json";
import spSen from "./__fixtures__/sp-c0005-e006259-u.json";
import pref2024 from "./__fixtures__/sp71072-c0011-e000619-u.json";

function race(
  key: string,
  raw: unknown,
  votes: (ids: string[]) => Record<string, number>,
  opts: { progress: number; electorate?: number; electorateCounted?: number },
): Race {
  const { meta, data } = normalizeResult(key, raw as RawResult);
  const v = votes(meta.candidates.map((c) => c.id));
  const rows = data.votes.map(([id, , s]): [string, number, string] => [id, v[id] ?? 0, s]);
  const valid = rows.reduce((a, [, n]) => a + n, 0);
  return {
    meta,
    data: { ...data, votes: rows, valid, ...opts, electorate: opts.electorate ?? valid * 2 },
    colors: {},
    history: [],
  };
}

describe("raceStatus", () => {
  it("waits while nothing is counted", () => {
    const r = race("sp-c0003-e006259", spGov, () => ({}), { progress: 0 });
    expect(raceStatus(r).state).toBe("aguardando");
    expect(raceStatus(r).leader).toBeNull();
  });

  it("calls a Governador elected when it is mathematically settled", () => {
    const r = race("sp-c0003-e006259", spGov, ([a, b]) => ({ [a!]: 800, [b!]: 200 }), {
      progress: 90,
      electorate: 1100,
      electorateCounted: 1000,
    });
    const st = raceStatus(r);
    expect(st.state).toBe("eleito");
    expect(st.decided).toHaveLength(1);
    expect(st.leader?.share).toBeCloseTo(80, 5);
  });

  it("reports one settled Senate seat out of two", () => {
    const r = race(
      "sp-c0005-e006259",
      spSen,
      ([a, b, c]) => ({ [a!]: 500_000, [b!]: 260_000, [c!]: 240_000 }),
      { progress: 90, electorate: 1_100_000, electorateCounted: 1_000_000 },
    );
    expect(raceStatus(r).state).toBe("parcial");
  });

  it("trusts a runoff published by the TSE", () => {
    const { meta, data } = normalizeResult(
      "sp71072-c0011-e000619",
      pref2024 as unknown as RawResult,
    );
    const st = raceStatus({
      meta: { ...meta, cargo: 3, abr: "sp" },
      data,
      colors: {},
      history: [],
    });
    expect(st.state).toBe("segundo-turno");
  });
});
