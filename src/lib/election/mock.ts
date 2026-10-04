// @ts-nocheck -- mock simulation; heavy array indexing, replaced by real data later
// Mock data + simulation for the 2026 vote count. Replace with the real source later;
// UI only depends on the types and functions exported here.

export type Office = "presidente" | "governador" | "senador" | "deputados";

export const OFFICES: { id: Office; label: string }[] = [
  { id: "presidente", label: "Presidente" },
  { id: "governador", label: "Governador" },
  { id: "senador", label: "Senador" },
  { id: "deputados", label: "Dep. Federal" },
];

export type Candidate = { id: string; name: string; party: string; number: string; color: number };
export type City = { id: string; name: string; uf: string; electorate: number };

export const CITIES: City[] = [
  ["brasil", "Brasil", "BR", 155900000],
  ["sao-paulo", "São Paulo", "SP", 9322000],
  ["rio-de-janeiro", "Rio de Janeiro", "RJ", 5011000],
  ["brasilia", "Brasília", "DF", 2203000],
  ["salvador", "Salvador", "BA", 1985000],
  ["fortaleza", "Fortaleza", "CE", 1817000],
  ["belo-horizonte", "Belo Horizonte", "MG", 1982000],
  ["manaus", "Manaus", "AM", 1450000],
  ["curitiba", "Curitiba", "PR", 1335000],
  ["recife", "Recife", "PE", 1180000],
  ["goiania", "Goiânia", "GO", 1048000],
  ["belem", "Belém", "PA", 1045000],
  ["porto-alegre", "Porto Alegre", "RS", 1100000],
  ["guarulhos", "Guarulhos", "SP", 870000],
  ["campinas", "Campinas", "SP", 845000],
  ["sao-luis", "São Luís", "MA", 720000],
  ["sao-goncalo", "São Gonçalo", "RJ", 740000],
  ["maceio", "Maceió", "AL", 650000],
  ["natal", "Natal", "RN", 560000],
  ["teresina", "Teresina", "PI", 610000],
  ["campo-grande", "Campo Grande", "MS", 640000],
  ["joao-pessoa", "João Pessoa", "PB", 560000],
  ["sao-bernardo", "São Bernardo do Campo", "SP", 640000],
  ["osasco", "Osasco", "SP", 540000],
  ["santo-andre", "Santo André", "SP", 560000],
  ["jaboatao", "Jaboatão dos Guararapes", "PE", 470000],
  ["uberlandia", "Uberlândia", "MG", 520000],
  ["contagem", "Contagem", "MG", 470000],
  ["sorocaba", "Sorocaba", "SP", 520000],
  ["ribeirao-preto", "Ribeirão Preto", "SP", 510000],
  ["cuiaba", "Cuiabá", "MT", 440000],
  ["aracaju", "Aracaju", "SE", 440000],
  ["feira-de-santana", "Feira de Santana", "BA", 430000],
  ["juiz-de-fora", "Juiz de Fora", "MG", 420000],
  ["joinville", "Joinville", "SC", 450000],
  ["londrina", "Londrina", "PR", 400000],
  ["florianopolis", "Florianópolis", "SC", 380000],
  ["porto-velho", "Porto Velho", "RO", 330000],
  ["macapa", "Macapá", "AP", 300000],
  ["vitoria", "Vitória", "ES", 260000],
  ["rio-branco", "Rio Branco", "AC", 270000],
  ["boa-vista", "Boa Vista", "RR", 250000],
  ["palmas", "Palmas", "TO", 220000],
  ["crato", "Crato", "CE", 95000],
  ["juazeiro-do-norte", "Juazeiro do Norte", "CE", 200000],
].map(([id, name, uf, electorate]) => ({ id, name, uf, electorate } as City));

export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
export const isNational = (id: string) => id === "brasil";

export const cityById = (id: string) => CITIES.find((c) => c.id === id);

// ---------- deterministic helpers ----------
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rngFrom(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ana", "Carlos", "Fernanda", "Jorge", "Luciana", "Marcos", "Patrícia", "Roberto", "Simone", "Tiago", "Vera", "Wagner", "Beatriz", "Eduardo", "Helena", "Igor", "Juliana", "Otávio", "Raquel", "Sérgio", "Denise", "Fábio", "Gilberto", "Rosana"];
const LAST = ["Albuquerque", "Barreto", "Cavalcanti", "Duarte", "Esteves", "Freitas", "Gusmão", "Holanda", "Lacerda", "Macedo", "Nogueira", "Pimentel", "Queiroz", "Rangel", "Sampaio", "Teixeira", "Valadares", "Xavier", "Bezerra", "Moreira"];
const PARTIES = [
  { p: "PNS", c: 1 }, { p: "UDB", c: 2 }, { p: "MOV", c: 3 }, { p: "PTR", c: 4 },
  { p: "ALI", c: 5 }, { p: "CID", c: 6 }, { p: "RNV", c: 2 }, { p: "FRT", c: 1 },
];

const PRESIDENT: Candidate[] = [
  { id: "p1", name: "Augusto Rangel", party: "PNS", number: "11", color: 1 },
  { id: "p2", name: "Marta Cavalcanti", party: "UDB", number: "22", color: 2 },
  { id: "p3", name: "Renato Esteves", party: "MOV", number: "33", color: 3 },
  { id: "p4", name: "Clara Sampaio", party: "PTR", number: "44", color: 4 },
  { id: "p5", name: "Outros", party: "—", number: "", color: 0 },
];

function genCandidates(key: string, n: number, digits: number): Candidate[] {
  const r = rngFrom(hash(key));
  const used = new Set<string>();
  const out: Candidate[] = [];
  const parties = [...PARTIES].sort(() => r() - 0.5);
  for (let i = 0; i < n; i++) {
    let name = "";
    do name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    while (used.has(name));
    used.add(name);
    const party = parties[i % parties.length];
    const num = String(10 + Math.floor(r() * 89)) + (digits > 2 ? String(Math.floor(r() * 10 ** (digits - 2))).padStart(digits - 2, "0") : "");
    out.push({ id: `${key}-${i}`, name, party: party.p, number: num, color: party.c });
  }
  return out;
}

export function candidatesFor(office: Office, uf: string): Candidate[] {
  if (office === "presidente") return PRESIDENT;
  if (office === "governador") return genCandidates(`${uf}-gov`, 4, 2);
  if (office === "senador") return genCandidates(`${uf}-sen`, 4, 3);
  return genCandidates(`${uf}-dep`, 14, 4).map((c) => ({ ...c, color: 0 }));
}

// ---------- state ----------
export type HistoryPoint = { p: number } & Record<string, number>;
export type OfficeState = { candidates: Candidate[]; target: number[]; shares: number[]; history: HistoryPoint[] };
export type FeedItem = { id: string; time: number; kind: "marco" | "virada" | "zona" | "info"; text: string };
export type CityState = {
  id: string;
  city: City;
  progress: number;
  turnout: number;
  zones: { n: number; speed: number; noise: Record<Office, number[]> }[];
  offices: Record<Office, OfficeState>;
  feed: FeedItem[];
};

export const SIM_START = 17 * 60 + 40; // 17:40
export const fmtClock = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const normalize = (a: number[]) => {
  const s = a.reduce((x, y) => x + y, 0);
  return a.map((v) => v / s);
};
const argmax = (a: number[]) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function validVotes(s: CityState) {
  return Math.round(s.city.electorate * s.turnout * (s.progress / 100) * 0.93);
}
export function zoneProgress(s: CityState, i: number) {
  return Math.min(100, s.progress * s.zones[i].speed);
}
export function zoneLeader(s: CityState, office: Office, i: number) {
  const o = s.offices[office];
  return argmax(o.target.map((t, k) => t + s.zones[i].noise[office][k]));
}

function makeOffice(office: Office, city: City, r: () => number): OfficeState {
  const candidates = candidatesFor(office, city.uf);
  const u = hash(city.id + office);
  const ur = rngFrom(u);
  let target: number[];
  if (office === "presidente") {
    const lean = (hash(city.uf) % 100) / 100 - 0.5; // state lean
    target = [0.4 + lean * 0.25 + (ur() - 0.5) * 0.08, 0.4 - lean * 0.25 + (ur() - 0.5) * 0.08, 0.08 + ur() * 0.04, 0.04 + ur() * 0.03, 0.03];
  } else if (office === "deputados") {
    target = candidates.map((_, i) => Math.pow(0.78, i) * (0.7 + ur() * 0.6));
  } else {
    target = candidates.map((_, i) => (i === 0 ? 0.38 : i === 1 ? 0.34 : 0.14) * (0.8 + ur() * 0.4));
  }
  target = normalize(target);
  // early count is skewed: swap some weight between first two
  const shares = normalize(target.map((t, i) => t * (1 + (r() - 0.5) * 0.5) + (i === 1 ? 0.04 : 0)));
  return { candidates, target, shares, history: [] };
}

export function tickCity(s: CityState, clock: number, r: () => number = Math.random): CityState {
  if (s.progress >= 100) return s;
  const prevP = s.progress;
  const p = Math.min(100, round(prevP + 0.5 + r() * 2.6 + (prevP > 85 ? 0.8 : 0), 2));
  const feed: FeedItem[] = [];
  const offices = { ...s.offices };
  const tag = s.city.uf;

  (Object.keys(offices) as Office[]).forEach((office) => {
    const o = offices[office];
    const noise = 0.18 * Math.pow(1 - p / 100, 1.4);
    const shares = normalize(
      o.shares.map((v, i) => 0.65 * v + 0.35 * Math.max(0.001, o.target[i] * (1 + (r() - 0.5) * 2 * noise))),
    );
    if (p >= 100) shares.splice(0, shares.length, ...normalize(shares.map((v, i) => 0.5 * v + 0.5 * o.target[i])));
    const point: HistoryPoint = { p: round(p, 1) } as HistoryPoint;
    o.candidates.forEach((c, i) => (point[c.id] = round(shares[i] * 100, 2)));
    const before = argmax(o.shares);
    const after = argmax(shares);
    if (office !== "deputados" && before !== after && prevP > 2) {
      const lbl = OFFICES.find((x) => x.id === office)!.label;
      feed.push({
        id: `${s.id}-${office}-${p}`,
        time: clock,
        kind: "virada",
        text: `Virada para ${lbl.toLowerCase()}: ${o.candidates[after].name} (${o.candidates[after].party}) passa ${o.candidates[before].name} com ${(shares[after] * 100).toFixed(2).replace(".", ",")}% dos válidos.`,
      });
    }
    offices[office] = { ...o, shares, history: [...o.history, point] };
  });

  for (const m of [10, 25, 50, 75, 90, 100]) {
    if (prevP < m && p >= m) {
      const o = offices.presidente;
      const lead = argmax(o.shares);
      const sorted = [...o.shares].sort((a, b) => b - a);
      const diff = ((sorted[0] - sorted[1]) * 100).toFixed(1).replace(".", ",");
      feed.push({
        id: `${s.id}-m${m}`,
        time: clock,
        kind: "marco",
        text:
          m === 100
            ? `Apuração encerrada em ${s.city.name}. ${o.candidates[lead].name} vence no município com ${(o.shares[lead] * 100).toFixed(2).replace(".", ",")}% dos votos válidos para presidente.`
            : `${m}% das seções totalizadas em ${s.city.name}/${tag}. ${o.candidates[lead].name} lidera para presidente com ${diff} p.p. de vantagem.`,
      });
    }
  }
  s.zones.forEach((z, i) => {
    const before = Math.min(100, prevP * z.speed);
    const after = Math.min(100, p * z.speed);
    if (before < 100 && after >= 100 && feed.length < 2) {
      const lead = zoneLeader({ ...s, offices }, "presidente", i);
      feed.push({
        id: `${s.id}-z${z.n}`,
        time: clock,
        kind: "zona",
        text: isNational(s.id) ? `${UFS[z.n]} totalizado. ${offices.presidente.candidates[lead]?.name} venceu no estado.` : `Zona ${z.n} totalizada. ${offices.presidente.candidates[lead]?.name} foi o mais votado na zona.`,
      });
    }
  });

  return { ...s, progress: p, offices, feed: [...feed.reverse(), ...s.feed].slice(0, 60) };
}

export function createCityState(id: string, clock: number = SIM_START): CityState | null {
  const city = cityById(id);
  if (!city) return null;
  const r = rngFrom(hash(id) ^ 0x9e3779b9);
  const zoneCount = isNational(id) ? 27 : Math.max(6, Math.min(20, Math.round(city.electorate / 150000) + 5));
  const zones = Array.from({ length: zoneCount }, (_, i) => {
    const noise = {} as Record<Office, number[]>;
    OFFICES.forEach(({ id: o }) => {
      noise[o] = Array.from({ length: 14 }, () => (r() - 0.5) * 0.22);
    });
    return { n: isNational(id) ? i : 1 + i + (hash(id) % 200), speed: 0.75 + r() * 0.6, noise };
  });
  const offices = {} as Record<Office, OfficeState>;
  OFFICES.forEach(({ id: o }) => (offices[o] = makeOffice(o, city, r)));
  let s: CityState = {
    id,
    city,
    progress: 0,
    turnout: 0.76 + r() * 0.08,
    zones,
    offices,
    feed: [
      { id: `${id}-open`, time: SIM_START - 100, kind: "info", text: `Urnas fechadas em ${city.name}/${city.uf}. Início da totalização.` },
    ],
  };
  const initial = 4 + r() * 30;
  let n = 0;
  const steps: number[] = [];
  // pre-roll to an initial progress; timestamps spread back from clock
  while (s.progress < initial) {
    s = tickCity(s, 0, r);
    steps.push(s.feed.length);
    n++;
  }
  s = { ...s, feed: s.feed.map((f) => (f.time === 0 ? { ...f, time: clock - Math.round(r() * Math.min(60, n * 2)) } : f)).sort((a, b) => b.time - a.time) };
  return s;
}

// ---------- tendências ----------
export type Trend = {
  id: string;
  delta: number; // pontos percentuais vs ~5 atualizações atrás
  projected: number; // % projetado ao final
  margin: number; // ± p.p.
  win: number; // 0..1 chance de terminar em 1º
};
export type TrendSummary = {
  items: Trend[];
  runoff: number; // chance de 2º turno (0 quando não se aplica)
  runoffPair: [string, string] | null;
  call: { kind: "vitoria" | "segundo-turno" | "indefinido"; text: string };
};

export function trendsFor(s: CityState, office: Office): TrendSummary {
  const o = s.offices[office];
  const p = s.progress / 100;
  const h = o.history;
  const past = h[Math.max(0, h.length - 6)];
  const items: Trend[] = o.candidates.map((c, i) => {
    const now = o.shares[i] * 100;
    const projected = now * p + o.target[i] * 100 * (1 - p) * 0.6 + now * (1 - p) * 0.4;
    return {
      id: c.id,
      delta: past ? now - (past[c.id] ?? now) : 0,
      projected,
      margin: Math.max(0.2, 7 * Math.pow(1 - p, 1.2)),
      win: 0,
    };
  });
  const r = rngFrom(hash(s.id + office) + Math.round(s.progress * 10));
  const N = 400;
  const wins = new Array(items.length).fill(0);
  let runoff = 0;
  const hasRunoff = office === "presidente" || office === "governador";
  const real = items.filter((_, i) => o.candidates[i].name !== "Outros");
  for (let k = 0; k < N; k++) {
    const draw = items.map((t, i) => {
      if (o.candidates[i].name === "Outros") return -1;
      const g = (r() + r() + r() - 1.5) * 1.15; // ~normal
      return Math.max(0, t.projected + g * t.margin);
    });
    const tot = draw.reduce((a, b) => a + Math.max(0, b), 0) + (items.find((_, i) => o.candidates[i].name === "Outros")?.projected ?? 0);
    const w = argmax(draw);
    wins[w]++;
    if (hasRunoff && (draw[w] / tot) * 100 < 50) runoff++;
  }
  items.forEach((t, i) => (t.win = wins[i] / N));
  const ranked = [...real].sort((a, b) => b.projected - a.projected);
  const nameOf = (id: string) => o.candidates.find((c) => c.id === id)!.name;
  const runoffP = hasRunoff ? runoff / N : 0;
  const pair: [string, string] | null = hasRunoff && ranked[1] ? [ranked[0].id, ranked[1].id] : null;
  const top = [...items].sort((a, b) => b.win - a.win)[0];
  let call: TrendSummary["call"];
  if (office === "deputados") call = { kind: "indefinido", text: "Ordem dos mais votados tende a se manter." };
  else if (hasRunoff && runoffP >= 0.85 && pair) call = { kind: "segundo-turno", text: `Tendência de 2º turno: ${nameOf(pair[0])} × ${nameOf(pair[1])}` };
  else if (top.win >= 0.9 && (!hasRunoff || runoffP < 0.15)) call = { kind: "vitoria", text: `Tendência de vitória de ${nameOf(top.id)}` };
  else call = { kind: "indefinido", text: "Disputa indefinida — sem tendência clara ainda." };
  return { items, runoff: runoffP, runoffPair: pair, call };
}
