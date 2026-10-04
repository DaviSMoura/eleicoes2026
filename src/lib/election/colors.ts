// Candidate colors follow the party, the way people recognize them (PT red, PL blue, Missão
// yellow...), and never the vote rank, so nobody changes color when they overtake someone.
// Slots map to --party-N in styles.css: 1 red, 2 blue, 3 yellow, 4 green, 5 orange, 6 purple,
// 7 pink, 8 cyan, 9 brown, 10 teal. 0 is the neutral gray.
import type { RaceMeta } from "../../../supabase/functions/_shared/tse";

const SLOTS = 10;

// Earlier parties pick first when two in the same race want the same color; each party falls
// back along its own list.
const PARTY_COLORS: [party: string, slots: number[]][] = [
  ["PT", [1]],
  ["PL", [2]],
  ["MISSÃO", [3]],
  ["NOVO", [5]],
  ["MDB", [4]],
  ["PSOL", [6]],
  ["PSD", [8]],
  ["UNIÃO", [2, 8]],
  ["PP", [2, 8]],
  ["PSDB", [8, 2]],
  ["REPUBLICANOS", [4, 10]],
  ["PSB", [3, 5]],
  ["PDT", [1, 5]],
  ["PODE", [4, 10]],
  ["AVANTE", [10, 8]],
  ["PC do B", [1, 7]],
  ["PCdoB", [1, 7]],
  ["PV", [4, 10]],
  ["REDE", [10, 4]],
  ["SOLIDARIEDADE", [5, 3]],
  ["CIDADANIA", [7]],
  ["PRD", [9]],
  ["AGIR", [9]],
  ["MOBILIZA", [7]],
];
const PRIORITY = new Map(PARTY_COLORS.map(([party], i) => [party, i]));
const PREFERRED = new Map(PARTY_COLORS);

export function partyColors(meta: Pick<RaceMeta, "candidates">): Record<string, number> {
  const used = new Set<number>();
  const out: Record<string, number> = {};
  // Mapped parties in priority order, then everyone else in ballot order.
  const order = [...meta.candidates].sort(
    (a, b) =>
      (PRIORITY.get(a.party) ?? Infinity) - (PRIORITY.get(b.party) ?? Infinity) || a.seq - b.seq,
  );
  for (const c of order) {
    const wanted = PREFERRED.get(c.party) ?? [];
    let slot = wanted.find((s) => !used.has(s));
    if (slot === undefined) {
      for (let s = 1; s <= SLOTS && slot === undefined; s++) if (!used.has(s)) slot = s;
    }
    out[c.id] = slot ?? 0;
    if (slot) used.add(slot);
  }
  return out;
}

const cache = new Map<string, Record<string, number>>();

// Static per race (the candidate list does not change), so compute once per key.
export function colorsFor(meta: RaceMeta): Record<string, number> {
  let colors = cache.get(meta.key);
  if (!colors || Object.keys(colors).length !== meta.candidates.length) {
    colors = partyColors(meta);
    cache.set(meta.key, colors);
  }
  return colors;
}
