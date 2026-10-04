// Pure TSE helpers shared by the Edge Functions (Deno), the web app (Vite) and the tests (Vitest).
// Keep this file free of runtime-specific APIs and imports.

export const TSE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";

export const ELECTION_FEDERAL = "6257";
export const ELECTION_STATE = "6259";
export const ELECTIONS = [ELECTION_FEDERAL, ELECTION_STATE] as const;

export const CARGO = {
  presidente: 1,
  governador: 3,
  senador: 5,
  depFederal: 6,
  depEstadual: 7,
  depDistrital: 8,
} as const;

export const UFS = [
  "ac",
  "al",
  "am",
  "ap",
  "ba",
  "ce",
  "df",
  "es",
  "go",
  "ma",
  "mg",
  "ms",
  "mt",
  "pa",
  "pb",
  "pe",
  "pi",
  "pr",
  "rj",
  "rn",
  "ro",
  "rr",
  "rs",
  "sc",
  "se",
  "sp",
  "to",
] as const;

// ---------- keys ----------
// A race key is the stem of the TSE file name, e.g. "sp71072-c0003-e006259".
// `abr` is "br", a UF ("sp"), "zz" (abroad) or a UF followed by the municipality code ("sp71072").

export type ParsedKey = { abr: string; uf: string; cargo: number; ele: string };

export const electionFor = (cargo: number) =>
  cargo === CARGO.presidente ? ELECTION_FEDERAL : ELECTION_STATE;

export const keyFor = (abr: string, cargo: number) =>
  `${abr}-c${String(cargo).padStart(4, "0")}-e${electionFor(cargo).padStart(6, "0")}`;

export function parseKey(key: string): ParsedKey {
  const m = /^([a-z]{2})(\d*)-c(\d{4})-e(\d{6})$/.exec(key);
  if (!m) throw new Error(`Invalid race key: ${key}`);
  return { abr: `${m[1]}${m[2]}`, uf: m[1]!, cargo: Number(m[3]), ele: String(Number(m[4])) };
}

export const resultUrl = (key: string) => {
  const { uf, ele } = parseKey(key);
  return `${TSE_BASE}/${ele}/dados/${uf}/${key}-u.json`;
};

export const abUrl = (ele: string, uf: string) =>
  `${TSE_BASE}/${ele}/dados/${uf}/${uf}-e${ele.padStart(6, "0")}-ab.json`;

export const photoUrl = (ele: string, uf: string, sqcand: string) =>
  `${TSE_BASE}/${ele}/fotos/${uf}/${sqcand}.jpeg`;

// ---------- raw TSE shapes (only the fields we read) ----------

type RawCand = {
  n: string;
  sqcand: string;
  nmu: string;
  seq?: string;
  e?: string;
  st?: string;
  vap: string;
};
type RawPar = { sg: string; cand: RawCand[] };
type RawAgr = { par: RawPar[] };
type RawCarg = { cd: string; nmn: string; nv: string; agr: RawAgr[] };
export type RawResult = {
  ele: string;
  cdabr: string;
  dg: string;
  hg: string;
  idg: string;
  s: { ts: string; st: string; pst: string };
  e: { te: string; c: string };
  v: { vv: string };
  carg: RawCarg[];
};

type RawAbEntry = {
  tpabr: string;
  cdabr: string;
  dt: string;
  ht: string;
  s: { ts: string; st: string; pst: string };
  e: { te: string; pest: string };
};
export type RawAb = { ele: string; dg: string; hg: string; idg: string; abr: RawAbEntry[] };

// ---------- normalized shapes ----------

export type CandidateMeta = {
  id: string;
  name: string;
  party: string;
  number: string;
  seq: number;
};

export type RaceMeta = {
  key: string;
  ele: string;
  abr: string;
  uf: string;
  cargo: number;
  office: string;
  seats: number;
  candidates: CandidateMeta[];
};

// [sqcand, votes, TSE status ("" while counting; e.g. "Eleito", "2º turno", "Eleito por QP")]
export type VoteRow = [id: string, votes: number, status: string];

export type RaceData = {
  idg: string;
  tseAt: string; // ISO timestamp of the TSE generation (Brasília time)
  sections: number; // seções totalizadas
  sectionsTotal: number;
  progress: number; // % de seções totalizadas
  electorate: number;
  turnout: number; // comparecimento (people)
  valid: number; // votos válidos
  votes: VoteRow[];
};

export type NormalizedRace = { meta: RaceMeta; data: RaceData };

// ---------- parsing ----------

export const toInt = (s: string | undefined) => (s ? Number.parseInt(s, 10) || 0 : 0);
export const toPct = (s: string | undefined) =>
  s ? Number.parseFloat(s.replace(",", ".")) || 0 : 0;

// TSE timestamps are Brasília time (UTC-3, no DST since 2019).
export function tseTime(dg: string, hg: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dg);
  if (!m || !/^\d{2}:\d{2}:\d{2}$/.test(hg)) return "";
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${hg}-03:00`).toISOString();
}

export function normalizeResult(key: string, raw: RawResult): NormalizedRace {
  const { abr, uf, cargo, ele } = parseKey(key);
  const carg = raw.carg[0];
  if (!carg) throw new Error(`No cargo in ${key}`);
  const candidates: CandidateMeta[] = [];
  const votes: VoteRow[] = [];
  for (const agr of carg.agr) {
    for (const par of agr.par) {
      for (const c of par.cand) {
        candidates.push({
          id: c.sqcand,
          name: c.nmu,
          party: par.sg,
          number: c.n,
          seq: toInt(c.seq),
        });
        votes.push([c.sqcand, toInt(c.vap), c.st ?? ""]);
      }
    }
  }
  candidates.sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
  return {
    meta: {
      key,
      ele,
      abr,
      uf,
      cargo,
      office: carg.nmn,
      seats: toInt(carg.nv) || 1,
      candidates,
    },
    data: {
      idg: raw.idg,
      tseAt: tseTime(raw.dg, raw.hg),
      sections: toInt(raw.s.st),
      sectionsTotal: toInt(raw.s.ts),
      progress: toPct(raw.s.pst),
      electorate: toInt(raw.e.te),
      turnout: toInt(raw.e.c),
      valid: toInt(raw.v.vv),
      votes,
    },
  };
}

// ---------- change detection over the "-ab" (abrangência) index files ----------

export type AbSummary = Record<string, string>; // abr -> fingerprint

export type AbEntry = {
  abr: string;
  sections: number;
  progress: number;
  electorate: number;
  electoratePct: number;
  at: string;
};

export function abEntries(ab: RawAb, uf: string): AbEntry[] {
  return ab.abr.map((a) => ({
    abr: a.tpabr === "mun" ? `${uf}${a.cdabr}` : a.cdabr,
    sections: toInt(a.s.st),
    progress: toPct(a.s.pst),
    electorate: toInt(a.e.te),
    electoratePct: toPct(a.e.pest),
    at: tseTime(a.dt, a.ht),
  }));
}

export function summarizeAb(ab: RawAb, uf: string): AbSummary {
  const out: AbSummary = {};
  for (const a of ab.abr) {
    const abr = a.tpabr === "mun" ? `${uf}${a.cdabr}` : a.cdabr;
    out[abr] = `${a.s.st}|${a.dt}|${a.ht}`;
  }
  return out;
}

export function diffAb(prev: AbSummary | null | undefined, next: AbSummary): string[] {
  return Object.keys(next).filter((abr) => !prev || prev[abr] !== next[abr]);
}

// ---------- colors ----------
// Colors stay stable for everyone: until 1% of sections are counted they follow the current
// vote rank (ballot order while everything is zero); after that they are frozen in the stored meta.

export const COLOR_FREEZE_PROGRESS = 1;
export const PALETTE_SIZE = 6;

export function assignColors(meta: RaceMeta, data: RaceData): Record<string, number> {
  const votes = new Map(data.votes.map(([id, v]) => [id, v]));
  const ranked = [...meta.candidates].sort(
    (a, b) => (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0) || a.seq - b.seq,
  );
  const out: Record<string, number> = {};
  ranked.forEach((c, i) => (out[c.id] = i < PALETTE_SIZE ? i + 1 : 0));
  return out;
}
