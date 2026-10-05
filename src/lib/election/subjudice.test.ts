import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import { annulledScenario } from "./subjudice";
import type { Race } from "./trends";

import rjDepFed from "./__fixtures__/rj-c0006-e006259-u.json";
import rjGov from "./__fixtures__/rj-c0003-e006259-u.json";
import spGov from "./__fixtures__/sp-c0003-e006259-u.json";

const raceOf = (key: string, raw: unknown): Race => {
  const { meta, data } = normalizeResult(key, raw as RawResult);
  return { meta, data, colors: {}, history: [] };
};

describe("annulledScenario", () => {
  // RJ 2026, 85% counted: Garotinho sub judice; Douglas Ruas has 49.92% with his votes in the
  // base (as the TSE shows it) and 51.55% without them.
  const rj = raceOf("rj-c0003-e006259", rjGov);

  it("takes every share over the valid votes and leaves the sub judice one out", () => {
    const s = annulledScenario(rj)!;
    expect(s.names).toEqual(["Garotinho"]);
    expect(s.share(s.ids[0]!)).toBeNull();
    const ruas = rj.meta.candidates.find((c) => c.name === "DOUGLAS RUAS")!.id;
    expect(s.share(ruas)).toBeCloseTo(51.55, 2);
  });

  it("says when the leader would win in the first round", () => {
    expect(annulledScenario(rj)!.outcome).toBe(
      "Douglas Ruas ficaria com 51,55% dos válidos, mais da metade: venceria no 1º turno.",
    );
  });

  it("tells that the quociente already leaves those votes out", () => {
    expect(annulledScenario(raceOf("rj-c0006-e006259", rjDepFed))!.outcome).toMatch(/quociente/);
  });

  it("does nothing without candidates sub judice", () => {
    expect(annulledScenario(raceOf("sp-c0003-e006259", spGov))).toBeNull();
  });
});
