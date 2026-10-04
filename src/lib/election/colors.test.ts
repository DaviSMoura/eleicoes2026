import { describe, expect, it } from "vitest";

import { normalizeResult, type RawResult } from "../../../supabase/functions/_shared/tse";
import { colorsForParties, partyColors } from "./colors";

import brPres from "./__fixtures__/br-c0001-e006257-u.json";

const meta = normalizeResult("br-c0001-e006257", brPres as unknown as RawResult).meta;
const colorOf = (colors: Record<string, number>, name: string) =>
  colors[meta.candidates.find((c) => c.name === name)!.id];

describe("partyColors", () => {
  it("gives the 2026 presidential candidates their party colors", () => {
    const colors = partyColors(meta);
    expect(colorOf(colors, "LULA")).toBe(1); // PT red
    expect(colorOf(colors, "FLAVIO BOLSONARO")).toBe(2); // PL blue
    expect(colorOf(colors, "RENAN SANTOS")).toBe(3); // Missão yellow
    expect(colorOf(colors, "ZEMA")).toBe(5); // NOVO orange
  });

  it("never repeats a color inside a race while there are free ones", () => {
    const colors = Object.values(partyColors(meta)).filter((c) => c > 0);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("does not depend on votes, so overtaking never repaints anyone", () => {
    const shuffled = { candidates: [...meta.candidates].reverse() };
    expect(partyColors(shuffled)).toEqual(partyColors(meta));
  });

  it("moves the second party wanting a color to its fallback", () => {
    const base = { id: "", name: "", number: "", born: "", group: "" };
    const colors = partyColors({
      candidates: [
        { ...base, id: "pdt", party: "PDT", seq: 1 },
        { ...base, id: "pt", party: "PT", seq: 2 },
      ],
    });
    expect(colors).toEqual({ pt: 1, pdt: 5 });
  });
});

describe("colorsForParties", () => {
  it("keeps parties that share a map apart", () => {
    const colors = colorsForParties(["PP", "PL", "UNIÃO", "PT", "PSD"]);
    expect(colors.get("PT")).toBe(1);
    expect(colors.get("PL")).toBe(2);
    expect(colors.get("PSD")).toBe(8);
    const slots = [...colors.values()];
    expect(new Set(slots).size).toBe(slots.length);
  });
});
