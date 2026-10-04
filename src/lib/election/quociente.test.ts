import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import { distributeSeats, qeInputFor, quocienteEleitoral, type QeInput } from "./quociente";

import ver2024 from "./__fixtures__/sp71072-c0013-e000619-u.json";

// scripts/validate-quociente.ts runs the same check against every municipality of 2024
// (5,547 final counts: all seat counts and QEs match the TSE).

describe("quocienteEleitoral (art. 106)", () => {
  it("drops a fraction up to one half and rounds up above it", () => {
    expect(quocienteEleitoral(1000, 3)).toBe(333); // 333.33
    expect(quocienteEleitoral(1001, 2)).toBe(500); // 500.5
    expect(quocienteEleitoral(1003, 2)).toBe(501); // 501.5: exactly one half is dropped
    expect(quocienteEleitoral(1004, 3)).toBe(335); // 334.67: above one half rounds up
  });
});

describe("distributeSeats", () => {
  it("matches the official 2024 São Paulo city council (55 seats)", () => {
    const { meta, data } = normalizeResult(
      "sp71072-c0013-e000619",
      ver2024 as unknown as RawResult,
    );
    const res = distributeSeats(qeInputFor(meta, data));
    expect(res.qe).toBe(data.official!.qe);
    const ours = new Map(res.groups.map((g) => [g.id, g.seats]));
    for (const [group, seats] of data.official!.seats) expect(ours.get(group) ?? 0).toBe(seats);

    const elected = new Set(res.groups.flatMap((g) => g.elected));
    const official = data.votes.filter(([, , st]) => /^eleito/i.test(st)).map(([id]) => id);
    expect(official).toHaveLength(55);
    expect(official.every((id) => elected.has(id))).toBe(true);
  });

  it("treats a federation as a single agremiação", () => {
    const { meta } = normalizeResult("sp71072-c0013-e000619", ver2024 as unknown as RawResult);
    const fed = meta.groups.find((g) => g.label === "PSOL/REDE")!;
    expect(fed.federation).toBe(true);
    const parties = new Set(meta.candidates.filter((c) => c.group === fed.id).map((c) => c.party));
    expect(parties).toEqual(new Set(["PSOL", "REDE"]));
  });

  const input = (groups: [string, number, number[]][], seats: number): QeInput => ({
    seats,
    valid: groups.reduce((a, [, v]) => a + v, 0),
    groups: groups.map(([id, votes, cands]) => ({
      id,
      label: id,
      votes,
      candidates: cands.map((v, i) => ({ id: `${id}${i}`, votes: v })),
    })),
  });

  it("needs 10% of the QE for a QP seat and 80%/20% for the sobras", () => {
    // QE = 1000. A has QP 2 but only one candidate above 100 votes.
    // C (790 votes) is below 80% of the QE, so B takes the sobras while it qualifies.
    const res = distributeSeats(
      input(
        [
          ["A", 2210, [2000, 90, 80]],
          ["B", 1000, [700, 250, 50]],
          ["C", 790, [780, 10]],
        ],
        4,
      ),
    );
    const by = new Map(res.groups.map((g) => [g.id, g]));
    expect(res.qe).toBe(1000);
    expect(by.get("A")!.byQp).toBe(1);
    expect(by.get("B")!.byQp).toBe(1);
    expect(by.get("B")!.seats).toBe(2); // 250 >= 20% of QE
    // Nobody else meets 80%/20%: the last seat goes to the best average among everyone
    // (STF 2024), which is A (2210 / 2 = 1105) even though its next candidate has 90 votes.
    expect(by.get("A")!.seats).toBe(2);
    expect(by.get("C")!.seats).toBe(0);
  });

  it("elects the most voted candidates when no agremiação reaches the QE (art. 111)", () => {
    // 6 agremiações and 5 seats: QE = 1000 / 5 = 200 and every agremiação stays below it.
    const res = distributeSeats(
      input(
        [
          ["A", 190, [120, 70]],
          ["B", 170, [160, 10]],
          ["C", 160, [100, 60]],
          ["D", 160, [150, 10]],
          ["E", 160, [90, 70]],
          ["F", 160, [130, 30]],
        ],
        5,
      ),
    );
    expect(res.qe).toBe(200);
    expect(res.noGroupReachedQe).toBe(true);
    expect(res.groups.flatMap((g) => g.elected).sort()).toEqual(["A0", "B0", "C0", "D0", "F0"]);
  });

  it("breaks a tie in average and votes by the next candidate (Paraguaçu/MG 2024)", () => {
    // QE = 5096 / 3 = 1699. Both get one seat by QP and tie for the last one (2548 / 2 each);
    // as in the official result, it goes to the agremiação whose next candidate has more votes.
    const res = distributeSeats(
      input(
        [
          ["PDT", 2548, [1000, 350]],
          ["PP", 2548, [1000, 444]],
        ],
        3,
      ),
    );
    const by = new Map(res.groups.map((g) => [g.id, g]));
    expect(res.qe).toBe(1699);
    expect(by.get("PP")!.elected).toEqual(["PP0", "PP1"]);
    expect(by.get("PDT")!.seats).toBe(1);
  });

  it("gives equal votes to the older candidate (art. 110)", () => {
    const res = distributeSeats({
      seats: 1,
      valid: 1000,
      groups: [
        {
          id: "A",
          label: "A",
          votes: 1000,
          candidates: [
            { id: "young", votes: 500, born: "1990-01-01" },
            { id: "old", votes: 500, born: "1960-01-01" },
          ],
        },
      ],
    });
    expect(res.groups[0]!.elected).toEqual(["old"]);
  });
});
