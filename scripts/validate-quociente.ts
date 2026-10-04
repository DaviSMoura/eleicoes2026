// Checks our seat distribution against the official TSE result of the 2024 municipal election
// (vereadores), which already followed the rules in force for 2026.
// Run: bun scripts/validate-quociente.ts [sampleSize]
import { normalizeResult, type RawResult } from "../supabase/functions/_shared/tse";
import { distributeSeats, qeInputFor } from "../src/lib/election/quociente";

const BASE = "https://resultados.tse.jus.br/oficial/ele2024/619";
const SAMPLE = Number(process.argv[2] ?? 300);

type Cfg = { abr: { cd: string; mu: { cd: string; nm: string }[] }[] };
const cfg = (await (await fetch(`${BASE}/config/mun-e000619-cm.json`)).json()) as Cfg;
const all = cfg.abr
  .filter((a) => a.cd !== "zz")
  .flatMap((a) => a.mu.map((m) => ({ uf: a.cd, cd: m.cd, nm: m.nm })));
// Deterministic spread over every state, plus the state capitals' biggest case (São Paulo).
const step = Math.max(1, Math.floor(all.length / SAMPLE));
const sample = all.filter((_, i) => i % step === 0).slice(0, SAMPLE);
if (!sample.some((m) => m.cd === "71072")) sample.push({ uf: "sp", cd: "71072", nm: "SÃO PAULO" });

// The 2024 project's algorithm, reproduced as it was, for comparison.
function oldAlgorithm(raw: RawResult & { carg: { agr: { par: Record<string, string>[] }[] }[] }) {
  const carg = raw.carg[0]!;
  const seats = Number(carg.nv);
  const partyVotes: Record<string, number> = {};
  for (const agr of carg.agr)
    for (const par of agr.par)
      partyVotes[par["sg"]!] ??= Number(par["tvan"] ?? 0) + Number(par["tvtl"] ?? 0);
  const total = Object.values(partyVotes).reduce((a, b) => a + b, 0);
  const qe = Math.floor(total / seats);
  const res = Object.entries(partyVotes).map(([party, votes]) => ({
    party,
    votes,
    seats: Math.floor(votes / qe),
  }));
  const remaining = seats - res.reduce((a, r) => a + r.seats, 0);
  for (let i = 0; i < remaining; i++) {
    let top: (typeof res)[number] | undefined;
    for (const r of res) if (!top || r.votes / (r.seats + 1) > top.votes / (top.seats + 1)) top = r;
    if (top) top.seats++;
  }
  return { qe, byParty: new Map(res.map((r) => [r.party, r.seats])) };
}

type Outcome = {
  city: string;
  ok: boolean;
  qeOk: boolean;
  namesOk: boolean;
  oldOk: boolean;
  oldQeOk: boolean;
  diff: string;
};

async function check(m: (typeof sample)[number]): Promise<Outcome | null> {
  const key = `${m.uf}${m.cd}-c0013-e000619`;
  const res = await fetch(`${BASE}/dados/${m.uf}/${key}-u.json`);
  if (!res.ok) return null;
  const raw = (await res.json()) as RawResult;
  const { meta, data } = normalizeResult(key, raw);
  // Only final counts are ground truth: partial ones (recounts, sub judice) have no official
  // distribution or no elected marks yet.
  if (!data.official || data.progress < 100 || raw.tf !== "s") return null;

  const ours = distributeSeats(qeInputFor(meta, data));
  const official = new Map(data.official.seats);
  const oursBy = new Map(ours.groups.map((g) => [g.id, g.seats]));
  const ids = new Set([...official.keys(), ...oursBy.keys()]);
  const diffs = [...ids]
    .filter((id) => (official.get(id) ?? 0) !== (oursBy.get(id) ?? 0))
    .map((id) => `${id}: TSE ${official.get(id) ?? 0} x nosso ${oursBy.get(id) ?? 0}`);

  // Same people elected, not just the same seat counts.
  const officialElected = new Set(
    data.votes.filter(([, , st]) => /^eleito/i.test(st)).map(([id]) => id),
  );
  const ourElected = new Set(ours.groups.flatMap((g) => g.elected));
  const namesOk =
    officialElected.size === ourElected.size &&
    [...ourElected].every((id) => officialElected.has(id));

  // Old algorithm works per party; compare by summing parties into their federation.
  const old = oldAlgorithm(raw as never);
  const partyGroup = new Map(meta.candidates.map((c) => [c.party, c.group]));
  for (const g of meta.groups) if (!g.federation) partyGroup.set(g.id, g.id);
  const oldBy = new Map<string, number>();
  for (const [party, s] of old.byParty) {
    const g = partyGroup.get(party) ?? party;
    oldBy.set(g, (oldBy.get(g) ?? 0) + s);
  }
  const oldOk = [...ids].every((id) => (official.get(id) ?? 0) === (oldBy.get(id) ?? 0));

  return {
    city: `${m.nm}/${m.uf.toUpperCase()}`,
    ok: diffs.length === 0,
    qeOk: ours.qe === data.official.qe,
    namesOk,
    oldOk,
    oldQeOk: old.qe === data.official.qe,
    diff: diffs.join("; "),
  };
}

const outcomes: Outcome[] = [];
let i = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (i < sample.length) {
      const m = sample[i++]!;
      try {
        const o = await check(m);
        if (o) outcomes.push(o);
      } catch (err) {
        console.error("skip", m.nm, err);
      }
    }
  }),
);

const count = (f: (o: Outcome) => boolean) => outcomes.filter(f).length;
console.log(`Municípios verificados: ${outcomes.length}`);
console.log(
  `Nosso cálculo   - vagas iguais ao TSE: ${count((o) => o.ok)}, QE igual: ${count((o) => o.qeOk)}, mesmos eleitos: ${count((o) => o.namesOk)}`,
);
console.log(
  `Cálculo de 2024 - vagas iguais ao TSE: ${count((o) => o.oldOk)}, QE igual: ${count((o) => o.oldQeOk)}`,
);
for (const o of outcomes.filter((o) => !o.ok)) console.log(`DIFERENTE ${o.city}: ${o.diff}`);
for (const o of outcomes.filter((o) => !o.qeOk)) console.log(`QE DIFERENTE ${o.city}`);
for (const o of outcomes.filter((o) => !o.namesOk)) console.log(`ELEITOS DIFERENTES ${o.city}`);
