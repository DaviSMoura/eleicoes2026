import { describe, expect, it } from "vitest";

import {
  abEntries,
  abUrl,
  assignColors,
  diffAb,
  keyFor,
  normalizeResult,
  parseKey,
  photoUrl,
  resultUrl,
  summarizeAb,
  tseTime,
  type RawAb,
  type RawResult,
} from "../../../supabase/functions/_shared/tse";

import brPres from "./__fixtures__/br-c0001-e006257-u.json";
import spGov from "./__fixtures__/sp-c0003-e006259-u.json";
import spSen from "./__fixtures__/sp-c0005-e006259-u.json";
import capDepFed from "./__fixtures__/sp71072-c0006-e006259-u.json";
import ver2024 from "./__fixtures__/sp71072-c0013-e000619-u.json";
import brAb from "./__fixtures__/br-e006257-ab.json";
import spAb from "./__fixtures__/sp-e006259-ab.json";

const raw = (x: unknown) => x as RawResult;

describe("keys and urls", () => {
  it("builds keys with the right election per cargo", () => {
    expect(keyFor("br", 1)).toBe("br-c0001-e006257");
    expect(keyFor("sp", 3)).toBe("sp-c0003-e006259");
    expect(keyFor("sp71072", 6)).toBe("sp71072-c0006-e006259");
  });

  it("parses keys back", () => {
    expect(parseKey("sp71072-c0005-e006259")).toEqual({
      abr: "sp71072",
      uf: "sp",
      cargo: 5,
      ele: "6259",
    });
    expect(() => parseKey("sao-paulo")).toThrow();
  });

  it("builds the TSE urls validated against the live CDN", () => {
    expect(resultUrl("sp71072-c0003-e006259")).toBe(
      "https://resultados.tse.jus.br/oficial/ele2026/6259/dados/sp/sp71072-c0003-e006259-u.json",
    );
    expect(abUrl("6257", "br")).toBe(
      "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-e006257-ab.json",
    );
    expect(photoUrl("6257", "br", "280002542548")).toBe(
      "https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/280002542548.jpeg",
    );
  });
});

describe("normalizeResult", () => {
  it("normalizes the real 2026 presidential file before the count", () => {
    const { meta, data } = normalizeResult("br-c0001-e006257", raw(brPres));
    expect(meta.office).toBe("Presidente");
    expect(meta.seats).toBe(1);
    expect(meta.candidates).toHaveLength(12);
    expect(meta.candidates.map((c) => c.name)).toContain("LULA");
    expect(data.progress).toBe(0);
    expect(data.electorate).toBe(158745502);
    expect(data.votes.every(([, v]) => v === 0)).toBe(true);
    expect(data.tseAt).toBe("2026-10-03T17:47:37.000Z");
  });

  it("keeps two seats for senador", () => {
    expect(normalizeResult("sp-c0005-e006259", raw(spSen)).meta.seats).toBe(2);
  });

  it("handles a big deputados file", () => {
    const { meta, data } = normalizeResult("sp71072-c0006-e006259", raw(capDepFed));
    expect(meta.seats).toBe(70);
    expect(meta.candidates.length).toBeGreaterThan(1000);
    expect(data.votes).toHaveLength(meta.candidates.length);
  });

  it("reads votes, progress and elected status from a finished count (2024)", () => {
    const { data } = normalizeResult("sp71072-c0013-e000619", raw(ver2024));
    expect(data.progress).toBe(100);
    expect(data.valid).toBeGreaterThan(0);
    const statuses = new Set(data.votes.map(([, , s]) => s));
    expect(statuses).toContain("Eleito por QP");
    expect(statuses).toContain("Suplente");
    const top = [...data.votes].sort((a, b) => b[1] - a[1])[0]!;
    expect(top[1]).toBeGreaterThan(100000);
  });

  it("ignores an empty TSE time", () => {
    expect(tseTime("", "")).toBe("");
  });
});

describe("ab change detection", () => {
  it("maps national and state index entries to abrangência codes", () => {
    const br = abEntries(brAb as unknown as RawAb, "br").map((e) => e.abr);
    expect(br).toContain("sp");
    expect(br).toContain("zz");
    expect(br).toContain("br");
    const sp = abEntries(spAb as unknown as RawAb, "sp").map((e) => e.abr);
    expect(sp).toContain("sp71072");
    expect(sp).toContain("sp");
  });

  it("reports everything on first sight and only the changed entries after", () => {
    const ab = spAb as unknown as RawAb;
    const before = summarizeAb(ab, "sp");
    expect(diffAb(null, before).sort()).toEqual(Object.keys(before).sort());
    expect(diffAb(before, before)).toEqual([]);

    const next: RawAb = {
      ...ab,
      abr: ab.abr.map((a) =>
        a.cdabr === "71072"
          ? { ...a, dt: "04/10/2026", ht: "17:12:03", s: { ...a.s, st: "120" } }
          : a,
      ),
    };
    expect(diffAb(before, summarizeAb(next, "sp"))).toEqual(["sp71072"]);
  });
});

describe("assignColors", () => {
  it("follows the vote rank and leaves the tail neutral", () => {
    const { meta, data } = normalizeResult("br-c0001-e006257", raw(brPres));
    const flavio = meta.candidates.find((c) => c.name === "FLAVIO BOLSONARO")!;
    const lula = meta.candidates.find((c) => c.name === "LULA")!;
    const counted = {
      ...data,
      votes: data.votes.map(([id, , s]): [string, number, string] => [
        id,
        id === flavio.id ? 1000 : id === lula.id ? 900 : 1,
        s,
      ]),
    };
    const colors = assignColors(meta, counted);
    expect(colors[flavio.id]).toBe(1);
    expect(colors[lula.id]).toBe(2);
    expect(Object.values(colors).filter((c) => c === 0)).toHaveLength(12 - 6);
  });
});
