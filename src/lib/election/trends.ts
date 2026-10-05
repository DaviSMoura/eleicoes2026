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
  inRunoff: string[]; // in the 2nd round for sure: by the TSE status or mathematically (mathRunoff)
};

const MAJORITARIAN = new Set([1, 3, 5]);
const RUNOFF = new Set([1, 3]);

// Base of every percentage, as the TSE publishes them ("votos válidos computados", vvc): the
// valid votes plus those of candidates whose votes were annulled or are sub judice. Without it a
// race with a sub judice candidate drifts from the TSE (RJ 2026: 51.58% here, 49.93% there) and
// the shares add up to more than 100%. The quociente keeps the valid votes only (art. 106).
export function validOf(data: RaceData) {
  if (!data.valid) return data.votes.reduce((sum, [, v]) => sum + v, 0);
  const blocked = new Set(data.blocked ?? []);
  return data.votes.reduce((sum, [id, v]) => (blocked.has(id) ? sum + v : sum), data.valid);
}

// The same base for a history point, whose `valid` is the TSE's valid votes at that moment.
export const pointValidOf = (h: HistoryPoint, blocked: readonly string[] | undefined) =>
  h.valid > 0 ? (blocked ?? []).reduce((sum, id) => sum + (h.votes[id] ?? 0), h.valid) : 0;

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

// ---------- trend of the count ----------
// The final share of a candidate is what they have now plus their share of the votes still to
// be counted. We estimate that composition (r) and draw the path to 100% with
//   share(q) = (votes_now + r * added(q)) / (valid_now + added(q)),
// where added(q) grows linearly with the count. Sources for r:
// - Brasil: the per-UF model (each state keeps voting as it has, weighted by what it still has);
// - states and cities: the marginal share of the votes counted over the last ~15% of the count,
//   which follows the changing profile of the ballot boxes coming in, shrunk toward the current
//   share when that window is short.

export type Remaining = { votes: number; shares: Map<string, number> };

const MARGINAL_WINDOW = 15; // percentage points of the count
const MARGINAL_FULL_WEIGHT = 10; // points of window needed to trust the marginal share fully

function normalize(m: Map<string, number>) {
  let total = 0;
  for (const [id, v] of m) {
    const clamped = Math.max(0, v);
    m.set(id, clamped);
    total += clamped;
  }
  if (total > 0) for (const [id, v] of m) m.set(id, v / total);
  return m;
}

export function remainingVotes(race: Race, ufs?: Race[]): Remaining | null {
  const { meta, data, history } = race;
  const p = data.progress / 100;
  const valid = validOf(data);
  if (p <= 0 || p >= 1 || valid <= 0) return null;
  const votes = (valid / p) * (1 - p);
  const now = new Map(data.votes.map(([id, v]) => [id, v]));
  const current = new Map(data.votes.map(([id, v]) => [id, v / valid]));

  if (meta.abr === "br" && ufs && ufs.length > 0) {
    const final = projectNational(race, ufs);
    const shares = new Map<string, number>();
    for (const [id, f] of final)
      shares.set(id, ((f / 100) * (valid + votes) - (now.get(id) ?? 0)) / votes);
    return { votes, shares: normalize(shares) };
  }

  // Latest history point at least MARGINAL_WINDOW points behind; else the earliest with votes.
  const baseOf = (h: HistoryPoint) => pointValidOf(h, data.blocked);
  const counted = history.filter((h) => baseOf(h) > 0 && baseOf(h) < valid);
  const base =
    [...counted].reverse().find((h) => h.progress <= data.progress - MARGINAL_WINDOW) ?? counted[0];
  if (!base) return { votes, shares: current };
  const dValid = valid - baseOf(base);
  const weight = Math.min(1, (data.progress - base.progress) / MARGINAL_FULL_WEIGHT);
  const shares = new Map<string, number>();
  for (const [id, cur] of current) {
    const before = base.votes[id];
    const marginal = before === undefined ? cur : ((now.get(id) ?? 0) - before) / dValid;
    shares.set(id, weight * marginal + (1 - weight) * cur);
  }
  return { votes, shares: normalize(shares) };
}

export type TrendPoint = { p: number; shares: Map<string, number> }; // shares in %

export function trendPath(race: Race, ufs?: Race[], step = 2.5): TrendPoint[] {
  const rem = remainingVotes(race, ufs);
  if (!rem) return [];
  const { data } = race;
  const valid = validOf(data);
  const start = data.progress;
  const points: TrendPoint[] = [];
  const marks = [start];
  for (let q = Math.ceil(start / step) * step; q < 100; q += step) if (q > start) marks.push(q);
  marks.push(100);
  for (const q of marks) {
    const added = rem.votes * ((q - start) / (100 - start));
    const shares = new Map<string, number>();
    for (const [id, v] of data.votes)
      shares.set(id, ((v + (rem.shares.get(id) ?? 0) * added) / (valid + added)) * 100);
    points.push({ p: q, shares });
  }
  return points;
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
// Only where the election is actually decided: Presidente in Brasil, Governador and Senador in
// their state. Leading the Presidente count in one state, or a state race in one city, elects
// nobody.
function inElectionScope(meta: RaceMeta) {
  const isState = meta.abr.length === 2 && meta.abr !== "br" && meta.abr !== "zz";
  return meta.cargo === 1 ? meta.abr === "br" : isState;
}

export function mathDecided(race: Race): string[] {
  const { meta, data } = race;
  if (!MAJORITARIAN.has(meta.cargo) || !data.electorateCounted) return [];
  if (!inElectionScope(meta)) return [];
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

// Candidates already in the 2nd round no matter how the votes still to be counted go, using the
// same worst case as mathDecided:
// - nobody can still pass half of the valid votes, even taking every vote not yet counted. Each
//   candidate is tested in the scenario best for them: votes of annulled or sub judice rivals
//   stay out of the base (they would be null), and a sub judice candidate counts as validated;
// - and at most one rival can still end ahead of the candidate (taking all remaining votes
//   between two rivals, a tie counting as passing).
export function mathRunoff(race: Race): string[] {
  const { meta, data } = race;
  if (!RUNOFF.has(meta.cargo) || !data.electorateCounted || !data.valid) return [];
  if (!inElectionScope(meta)) return [];
  const remaining = Math.max(0, data.electorate - data.electorateCounted);
  const blocked = new Set(data.blocked ?? []);
  const canWin = data.votes.some(([id, v]) => {
    const base = data.valid + (blocked.has(id) ? v : 0);
    return (v + remaining) * 2 > base + remaining;
  });
  if (canWin) return [];
  const ranked = [...data.votes].sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, 2).flatMap(([id, v]) => {
    const [a = Infinity, b = Infinity] = ranked
      .filter(([other]) => other !== id)
      .map(([, w]) => Math.max(0, v - w))
      .sort((x, y) => x - y);
    return remaining < a + b ? [id] : [];
  });
}

export function trendsFor(race: Race, ufs?: Race[]): TrendSummary {
  const { meta, data, history } = race;
  const p = data.progress / 100;
  const seats = meta.seats;
  const nameOf = (id: string) => displayName(meta.candidates.find((c) => c.id === id)?.name ?? id);
  // Projection = where the trend line ends, so the table and the chart always agree.
  const projectedById = trendPath(race, ufs).at(-1)?.shares ?? null;

  const past = history[Math.max(0, history.length - 6)];
  const pastValid = past ? pointValidOf(past, data.blocked) : 0;
  const items: Trend[] = meta.candidates.map((c) => {
    const now = shareOf(data, c.id);
    const pastShare =
      pastValid > 0 && c.id in past!.votes ? (past!.votes[c.id]! / pastValid) * 100 : now;
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
        inRunoff: runoff,
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
        inRunoff: [],
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
      inRunoff: [],
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
      inRunoff: [],
      winLabel,
      call: { kind: "indefinido", text: "Ordem dos mais votados tende a se manter." },
    };

  if (data.progress === 0)
    return {
      items,
      runoff: 0,
      runoffPair: null,
      decided,
      inRunoff: [],
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

  // A 2nd round already settled by the numbers, before the TSE publishes it.
  const inRunoff = mathRunoff(race);
  if (inRunoff.length === 2) {
    const [a, b] = inRunoff as [string, string];
    return {
      items,
      runoff: 1,
      runoffPair: [a, b],
      decided,
      inRunoff,
      winLabel,
      call: {
        kind: "segundo-turno",
        text: `2º turno: ${nameOf(a)} × ${nameOf(b)}, já matematicamente definido`,
      },
    };
  }
  if (inRunoff.length === 1)
    call = {
      kind: "segundo-turno",
      text: `${nameOf(inRunoff[0]!)} já está no 2º turno; o adversário ainda está em aberto.`,
    };
  return {
    items,
    runoff: inRunoff.length > 0 ? 1 : runoffP,
    runoffPair: pair,
    decided,
    inRunoff,
    winLabel,
    call,
  };
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
