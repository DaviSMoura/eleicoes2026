// Trends over real TSE data: projection, chance of winning, runoff.
import type { RaceData, RaceMeta } from "../../../supabase/functions/_shared/tse";
import { displayName } from "./names";

export type HistoryPoint = {
  sections: number;
  progress: number;
  tseAt: string;
  valid: number;
  votes: Record<string, number>;
};

export type Race = {
  meta: RaceMeta;
  data: RaceData;
  colors: Record<string, number>;
  history: HistoryPoint[];
};

export type Trend = {
  id: string;
  delta: number; // p.p. vs ~5 updates ago
  projected: number; // % projected at the end
  margin: number; // ± p.p.
  win: number; // 0..1 chance of finishing within the seats (1st place for single-seat races)
};

export type TrendSummary = {
  items: Trend[];
  runoff: number; // chance of 2nd round (0 when it does not apply)
  runoffPair: [string, string] | null;
  winLabel: string;
  call: { kind: "vitoria" | "segundo-turno" | "lider" | "indefinido"; text: string };
  decided: string[]; // elected for sure: by the TSE status or mathematically (see mathDecided)
};

const MAJORITARIAN = new Set([1, 3, 5]);
const RUNOFF = new Set([1, 3]);

export const validOf = (data: RaceData) =>
  data.valid || data.votes.reduce((sum, [, v]) => sum + v, 0);

export function shareOf(data: RaceData, id: string) {
  const valid = validOf(data);
  const row = data.votes.find((r) => r[0] === id);
  return valid > 0 && row ? (row[1] / valid) * 100 : 0;
}

// Brasil: each UF contributes its counted votes plus its estimated remaining valid votes
// split by that UF's current shares. UFs with nothing counted yet follow the national share.
export function projectNational(br: Race, ufs: Race[]): Map<string, number> {
  const ids = br.meta.candidates.map((c) => c.id);
  const nat = new Map(ids.map((id) => [id, shareOf(br.data, id) / 100]));
  const turnoutRate = br.data.electorate > 0 ? br.data.turnout / br.data.electorate : 0;
  const validRate = br.data.turnout > 0 ? validOf(br.data) / br.data.turnout : 0;

  const totals = new Map(ids.map((id) => [id, 0]));
  let all = 0;
  for (const uf of ufs) {
    const p = uf.data.progress / 100;
    const valid = validOf(uf.data);
    const counted = p > 0 && valid > 0;
    const remaining = counted
      ? (valid / p) * (1 - p)
      : uf.data.electorate * turnoutRate * validRate;
    for (const id of ids) {
      const now = uf.data.votes.find((r) => r[0] === id)?.[1] ?? 0;
      const share = counted ? now / valid : (nat.get(id) ?? 0);
      totals.set(id, (totals.get(id) ?? 0) + now + remaining * share);
    }
    all += valid + remaining;
  }
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, all > 0 ? ((totals.get(id) ?? 0) / all) * 100 : 0);
  return out;
}

function rngFrom(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isElected = (status: string) => /^eleit/i.test(status);
const isRunoff = (status: string) => /2º turno/i.test(status);

// Candidates already elected no matter how the votes still to be counted go. Worst case: every
// voter of the sections not yet counted shows up and votes validly for a rival.
// - with a runoff (Presidente, Governador): the leader keeps more than half of the valid votes;
// - Senador: a candidate within the seats stays ahead of the first one outside them.
export function mathDecided(race: Race): string[] {
  const { meta, data } = race;
  if (!MAJORITARIAN.has(meta.cargo) || !data.electorateCounted) return [];
  // Only where the election is actually decided: Presidente in Brasil, Governador and Senador
  // in their state. Leading the Presidente count in one state, or a state race in one city,
  // elects nobody.
  const isState = meta.abr.length === 2 && meta.abr !== "br" && meta.abr !== "zz";
  const electionScope = meta.cargo === 1 ? meta.abr === "br" : isState;
  if (!electionScope) return [];
  const remaining = Math.max(0, data.electorate - data.electorateCounted);
  const ranked = [...data.votes].sort((a, b) => b[1] - a[1]);
  if (RUNOFF.has(meta.cargo)) {
    const lead = ranked[0];
    return lead && lead[1] > (validOf(data) + remaining) / 2 ? [lead[0]] : [];
  }
  const firstOut = ranked[meta.seats]?.[1] ?? 0;
  return ranked
    .slice(0, meta.seats)
    .filter(([, v]) => v > firstOut + remaining)
    .map(([id]) => id);
}

export function trendsFor(race: Race, ufs?: Race[]): TrendSummary {
  const { meta, data, history } = race;
  const p = data.progress / 100;
  const seats = meta.seats;
  const nameOf = (id: string) => displayName(meta.candidates.find((c) => c.id === id)?.name ?? id);
  const projectedById =
    ufs && ufs.length > 0 && meta.abr === "br" ? projectNational(race, ufs) : null;

  const past = history[Math.max(0, history.length - 6)];
  const items: Trend[] = meta.candidates.map((c) => {
    const now = shareOf(data, c.id);
    const pastShare =
      past && past.valid > 0 && c.id in past.votes ? (past.votes[c.id]! / past.valid) * 100 : now;
    return {
      id: c.id,
      delta: history.length > 1 ? now - pastShare : 0,
      projected: projectedById?.get(c.id) ?? now,
      margin: Math.max(0.2, 7 * Math.pow(1 - p, 1.2)),
      win: 0,
    };
  });

  const hasRunoff = RUNOFF.has(meta.cargo);
  const winLabel = seats > 1 ? "Eleito" : "1º lugar";
  const ranked = [...items].sort((a, b) => b.projected - a.projected);
  const pair: [string, string] | null =
    hasRunoff && ranked[0] && ranked[1] ? [ranked[0].id, ranked[1].id] : null;

  // Final statuses published by the TSE win over any projection.
  const statuses = data.votes.filter(([, , s]) => s);
  if (statuses.length > 0 && MAJORITARIAN.has(meta.cargo)) {
    const elected = statuses.filter(([, , s]) => isElected(s)).map(([id]) => id);
    const runoff = statuses.filter(([, , s]) => isRunoff(s)).map(([id]) => id);
    items.forEach((t) => (t.win = elected.includes(t.id) ? 1 : 0));
    if (runoff.length === 2)
      return {
        items,
        runoff: 1,
        runoffPair: [runoff[0]!, runoff[1]!],
        decided: [],
        winLabel,
        call: {
          kind: "segundo-turno",
          text: `2º turno: ${nameOf(runoff[0]!)} × ${nameOf(runoff[1]!)}`,
        },
      };
    if (elected.length > 0)
      return {
        items,
        runoff: 0,
        runoffPair: null,
        decided: elected,
        winLabel,
        call: { kind: "vitoria", text: `Eleito: ${elected.map(nameOf).join(" e ")}` },
      };
  }

  const decided = mathDecided(race);
  const decidedText = decided.map(nameOf).join(" e ");
  if (decided.length > 0 && (decided.length >= seats || hasRunoff)) {
    items.forEach((t) => (t.win = decided.includes(t.id) ? 1 : 0));
    return {
      items,
      runoff: 0,
      runoffPair: null,
      decided,
      winLabel,
      call: { kind: "vitoria", text: `Eleito: ${decidedText}, já matematicamente definido` },
    };
  }

  if (!MAJORITARIAN.has(meta.cargo))
    return {
      items,
      runoff: 0,
      runoffPair: null,
      decided,
      winLabel,
      call: { kind: "indefinido", text: "Ordem dos mais votados tende a se manter." },
    };

  if (data.progress === 0)
    return {
      items,
      runoff: 0,
      runoffPair: null,
      decided,
      winLabel,
      call: { kind: "indefinido", text: "Aguardando as primeiras seções totalizadas." },
    };

  const r = rngFrom(hash(meta.key) + data.sections);
  const N = 400;
  const wins = new Array<number>(items.length).fill(0);
  const sets = new Map<string, number>();
  let runoff = 0;
  for (let k = 0; k < N; k++) {
    const draw = items.map((t) => {
      const g = (r() + r() + r() - 1.5) * 1.15; // ~normal
      return Math.max(0, t.projected + g * t.margin);
    });
    const tot = draw.reduce((a, b) => a + b, 0);
    const order = draw.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
    const top = order.slice(0, seats).map(([, i]) => i);
    top.forEach((i) => wins[i]!++);
    const setKey = [...top].sort((a, b) => a - b).join(",");
    sets.set(setKey, (sets.get(setKey) ?? 0) + 1);
    if (hasRunoff && tot > 0 && (order[0]![0] / tot) * 100 < 50) runoff++;
  }
  items.forEach((t, i) => (t.win = wins[i]! / N));
  const runoffP = hasRunoff ? runoff / N : 0;

  const [bestSet, bestCount] = [...sets.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const bestIds = bestSet ? bestSet.split(",").map((i) => items[Number(i)]!.id) : [];
  const top = [...items].sort((a, b) => b.win - a.win)[0]!;

  let call: TrendSummary["call"];
  if (hasRunoff && runoffP >= 0.85 && pair)
    call = {
      kind: "segundo-turno",
      text: `Tendência de 2º turno: ${nameOf(pair[0])} × ${nameOf(pair[1])}`,
    };
  else if (seats > 1 && bestCount / N >= 0.9)
    call = { kind: "vitoria", text: `Tendência: ${bestIds.map(nameOf).join(" e ")} eleitos` };
  else if (seats === 1 && top.win >= 0.9 && (!hasRunoff || runoffP < 0.15))
    call = { kind: "vitoria", text: `Tendência de vitória de ${nameOf(top.id)}` };
  else if (seats === 1 && top.win >= 0.9)
    call = {
      kind: "lider",
      text: `${nameOf(top.id)} deve terminar em 1º; 2º turno ainda indefinido.`,
    };
  else call = { kind: "indefinido", text: "Disputa indefinida, sem tendência clara ainda." };

  // Part of the seats already settled (Senador with two seats): say so, keep simulating the rest.
  if (decided.length > 0) {
    items.forEach((t) => decided.includes(t.id) && (t.win = 1));
    const open = seats - decided.length;
    const others = bestIds.filter((id) => !decided.includes(id)).map(nameOf);
    const rest =
      call.kind === "vitoria" && others.length > 0
        ? `tendência de ${others.join(" e ")} ${open === 1 ? "na outra vaga" : "nas outras vagas"}`
        : open === 1
          ? "a outra vaga segue em disputa"
          : `${open} vagas seguem em disputa`;
    call = { kind: "lider", text: `${decidedText} já está eleito; ${rest}.` };
  }
  return { items, runoff: runoffP, runoffPair: pair, decided, winLabel, call };
}

// Rounds percentages so the integers still add up to the rounded total (largest remainder),
// e.g. 94.75% and 5.25% become 95% and 5%, not 95% and 6% (101%).
export function roundShares(values: number[]): number[] {
  const total = Math.round(values.reduce((a, b) => a + b, 0));
  const floors = values.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = values.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return floors;
}
