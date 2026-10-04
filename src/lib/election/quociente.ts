// Distribution of proportional seats (deputados/vereadores) under the Código Eleitoral as
// amended by Lei 14.211/2021 and the STF ruling in ADIs 7228, 7263 and 7325 (Feb 2024),
// which applies from the 2024 elections on.
import type { RaceData, RaceMeta } from "../../../supabase/functions/_shared/tse";

export type QeCandidate = { id: string; votes: number; born?: string }; // born: yyyy-mm-dd
export type QeGroup = { id: string; label: string; votes: number; candidates: QeCandidate[] };
export type QeInput = { seats: number; valid: number; groups: QeGroup[] };

export type QeGroupResult = {
  id: string;
  label: string;
  votes: number;
  qp: number; // quociente partidário
  byQp: number; // seats from the quociente partidário (art. 108)
  byRemainder: number; // seats from the sobras (art. 109)
  seats: number;
  elected: string[]; // candidate ids, in order of election
};

export type QeResult = {
  qe: number;
  groups: QeGroupResult[]; // sorted by seats, then votes
  noGroupReachedQe: boolean; // art. 111: seats go to the most voted candidates
};

// Art. 106: valid votes / seats, dropping a fraction of up to one half and rounding up above it.
export function quocienteEleitoral(valid: number, seats: number): number {
  if (seats <= 0) return 0;
  const exact = valid / seats;
  const whole = Math.floor(exact);
  return exact - whole > 0.5 ? whole + 1 : whole;
}

// More votes first; equal votes go to the older candidate (art. 110). Unknown birth dates last.
function byVotesThenAge(a: QeCandidate, b: QeCandidate) {
  if (b.votes !== a.votes) return b.votes - a.votes;
  return (a.born || "9999").localeCompare(b.born || "9999");
}

export function distributeSeats(input: QeInput): QeResult {
  const qe = quocienteEleitoral(input.valid, input.seats);
  const rows = input.groups.map((g) => ({
    group: g,
    ranked: [...g.candidates].sort(byVotesThenAge),
    qp: qe > 0 ? Math.floor(g.votes / qe) : 0, // art. 107: fraction dropped
    byQp: 0,
    byRemainder: 0,
    elected: [] as string[],
  }));
  const seatsOf = (r: (typeof rows)[number]) => r.byQp + r.byRemainder;
  let left = input.seats;

  const noGroupReachedQe = qe === 0 || rows.every((r) => r.group.votes < qe);
  if (noGroupReachedQe) {
    // Art. 111: nobody reached the QE, so the most voted candidates are elected.
    const all = rows
      .flatMap((r) => r.ranked.map((c) => ({ r, c })))
      .sort((a, b) => byVotesThenAge(a.c, b.c))
      .slice(0, input.seats);
    for (const { r, c } of all) {
      if (c.votes <= 0) break;
      r.byRemainder++;
      r.elected.push(c.id);
    }
  } else {
    // Art. 108: each party fills its QP with candidates holding at least 10% of the QE.
    for (const r of rows) {
      const eligible = r.ranked.filter((c) => c.votes >= 0.1 * qe);
      r.byQp = Math.min(r.qp, eligible.length, left);
      r.elected = eligible.slice(0, r.byQp).map((c) => c.id);
      left -= r.byQp;
    }

    const nextCandidate = (r: (typeof rows)[number], minVotes: number) =>
      r.ranked.find((c) => !r.elected.includes(c.id) && c.votes >= minVotes && c.votes > 0);

    // Highest average (votes / (seats + 1)). Ties go to the agremiação with more votes, then
    // to the one whose next candidate has more votes, then to the older candidate (art. 110).
    // Checked against the official 2024 results (e.g. Paraguaçu/MG, PDT x PP with 2,548 each).
    const best = (pool: typeof rows, minVotes: number) =>
      pool.reduce<(typeof rows)[number] | undefined>((acc, r) => {
        if (!acc) return r;
        const a = acc.group.votes / (seatsOf(acc) + 1);
        const b = r.group.votes / (seatsOf(r) + 1);
        if (b !== a) return b > a ? r : acc;
        if (r.group.votes !== acc.group.votes) return r.group.votes > acc.group.votes ? r : acc;
        const ca = nextCandidate(acc, minVotes)!;
        const cb = nextCandidate(r, minVotes)!;
        return byVotesThenAge(cb, ca) < 0 ? r : acc;
      }, undefined);

    // Art. 109, I and II: sobras among parties with at least 80% of the QE whose next
    // candidate has at least 20% of the QE.
    while (left > 0) {
      const pool = rows.filter(
        (r) => r.group.votes >= 0.8 * qe && nextCandidate(r, 0.2 * qe) !== undefined,
      );
      const r = best(pool, 0.2 * qe);
      if (!r) break;
      r.elected.push(nextCandidate(r, 0.2 * qe)!.id);
      r.byRemainder++;
      left--;
    }

    // Art. 109, III, as decided by the STF in 2024: when nobody meets those thresholds,
    // every party competes for the remaining seats by highest average.
    while (left > 0) {
      const pool = rows.filter((r) => nextCandidate(r, 0) !== undefined);
      const r = best(pool, 0);
      if (!r) break;
      r.elected.push(nextCandidate(r, 0)!.id);
      r.byRemainder++;
      left--;
    }
  }

  const groups = rows
    .map((r) => ({
      id: r.group.id,
      label: r.group.label,
      votes: r.group.votes,
      qp: r.qp,
      byQp: r.byQp,
      byRemainder: r.byRemainder,
      seats: seatsOf(r),
      elected: r.elected,
    }))
    .sort((a, b) => b.seats - a.seats || b.votes - a.votes);
  return { qe, groups, noGroupReachedQe };
}

// Builds the input from a normalized race. Votes of an agremiação are its valid nominal plus
// valid party-list votes as published by the TSE; candidates whose votes were annulled or count
// for the party only cannot take a seat.
export function qeInputFor(meta: RaceMeta, data: RaceData): QeInput {
  const votes = new Map(data.votes.map(([id, v]) => [id, v]));
  const groupVotes = new Map(data.groupVotes ?? []);
  const blocked = new Set(data.blocked ?? []);
  const groups = (meta.groups ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    votes: groupVotes.get(g.id) ?? 0,
    candidates: meta.candidates
      .filter((c) => c.group === g.id && !blocked.has(c.id))
      .map((c) => ({ id: c.id, votes: votes.get(c.id) ?? 0, born: c.born })),
  }));
  return { seats: meta.seats, valid: data.valid, groups };
}
