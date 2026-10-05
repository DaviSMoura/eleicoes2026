// Candidates "sub judice": the TSE counts their votes in the percentages (as votos válidos
// computados) until the Justiça Eleitoral rules on the candidacy. If it is denied, those votes
// become null, so every share is then taken over the valid votes only. This builds that scenario.
import { displayName } from "./names";
import { inElectionScope, type Race } from "./trends";

const SUB_JUDICE = /sub judice/i;
const RUNOFF_CARGOS = new Set([1, 3]);
const PROPORTIONAL_CARGOS = new Set([6, 7, 8, 13]);

export type AnnulledScenario = {
  ids: string[]; // candidates sub judice
  names: string[];
  share: (id: string) => number | null; // % of the valid votes; null for the annulled ones
  outcome: string | null; // what changes in the result, with the votes counted so far
};

export function annulledScenario(race: Race): AnnulledScenario | null {
  const { meta, data } = race;
  const ids = (data.voteStatus ?? []).filter(([, s]) => SUB_JUDICE.test(s)).map(([id]) => id);
  if (ids.length === 0 || !data.valid) return null;
  const nameOf = (id: string) => displayName(meta.candidates.find((c) => c.id === id)?.name ?? id);
  const blocked = new Set(data.blocked ?? []);
  const valid = data.valid; // the TSE's valid votes: annulled and sub judice votes are not in it
  const share = (id: string) => {
    if (blocked.has(id)) return null;
    const v = data.votes.find(([c]) => c === id)?.[1] ?? 0;
    return (v / valid) * 100;
  };
  const ranked = data.votes.filter(([id]) => !blocked.has(id)).sort((a, b) => b[1] - a[1]);
  const pct = (n: number) => n.toFixed(2).replace(".", ",");

  let outcome: string | null = null;
  if (PROPORTIONAL_CARGOS.has(meta.cargo))
    outcome = "As vagas não mudam: o quociente já deixa esses votos de fora.";
  else if (data.progress > 0 && inElectionScope(meta)) {
    if (RUNOFF_CARGOS.has(meta.cargo)) {
      const [first, second] = ranked;
      if (first && second) {
        const top = (first[1] / valid) * 100;
        outcome =
          top > 50
            ? `${nameOf(first[0])} iria a ${pct(top)}% e venceria no 1º turno.`
            : `Ninguém passaria de 50%: 2º turno entre ${nameOf(first[0])} e ${nameOf(second[0])}.`;
      }
    } else {
      const seats = ranked.slice(0, meta.seats).map(([id]) => nameOf(id));
      if (seats.length > 0)
        outcome =
          seats.length === 1
            ? `A vaga ficaria com ${seats[0]}.`
            : `As vagas ficariam com ${seats.slice(0, -1).join(", ")} e ${seats.at(-1)}.`;
    }
  }
  return { ids, names: ids.map(nameOf), share, outcome };
}
