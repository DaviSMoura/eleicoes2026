// Where a race stands, summarized for the status column's maps and lists. It reuses trendsFor,
// so the status column and the race columns always tell the same story.
import { colorsFor } from "./colors";
import { displayName } from "./names";
import { shareOf, trendsFor, type Race } from "./trends";

export type RaceState =
  | "aguardando" // nothing counted yet
  | "eleito" // every seat settled (TSE status or mathematically)
  | "parcial" // some seats settled (Senador with two seats)
  | "segundo-turno" // the TSE published the runoff
  | "tende-segundo-turno"
  | "tende-vencer"
  | "lidera" // clear 1st place, runoff still open
  | "disputa";

export type RaceStatus = {
  state: RaceState;
  leader: { id: string; name: string; party: string; share: number; color: number } | null;
  decided: string[]; // names of those already elected
  progress: number;
};

const RUNOFF_STATUS = /2º turno/i;

export function raceStatus(race: Race, ufs?: Race[]): RaceStatus {
  const { meta, data } = race;
  const colors = colorsFor(meta);
  const top = [...data.votes].sort((a, b) => b[1] - a[1])[0];
  const leaderMeta = top && top[1] > 0 ? meta.candidates.find((c) => c.id === top[0]) : undefined;
  const leader = leaderMeta
    ? {
        id: leaderMeta.id,
        name: displayName(leaderMeta.name),
        party: leaderMeta.party,
        share: shareOf(data, leaderMeta.id),
        color: colors[leaderMeta.id] ?? 0,
      }
    : null;
  const base = { leader, progress: data.progress };
  if (data.progress === 0 || !leader) return { ...base, state: "aguardando", decided: [] };

  const tr = trendsFor(race, ufs);
  const nameOf = (id: string) => displayName(meta.candidates.find((c) => c.id === id)?.name ?? id);
  const decided = tr.decided.map(nameOf);
  if (data.votes.some(([, , s]) => RUNOFF_STATUS.test(s)) || tr.inRunoff.length === 2)
    return { ...base, state: "segundo-turno", decided };
  if (tr.decided.length >= meta.seats) return { ...base, state: "eleito", decided };
  if (tr.decided.length > 0) return { ...base, state: "parcial", decided };
  const state: RaceState =
    tr.call.kind === "segundo-turno"
      ? "tende-segundo-turno"
      : tr.call.kind === "vitoria"
        ? "tende-vencer"
        : tr.call.kind === "lider"
          ? "lidera"
          : "disputa";
  return { ...base, state, decided };
}

export const STATE_LABEL: Record<RaceState, string> = {
  aguardando: "aguardando",
  eleito: "eleito",
  parcial: "1 vaga definida",
  "segundo-turno": "2º turno",
  "tende-segundo-turno": "tende ao 2º turno",
  "tende-vencer": "tende a vencer",
  lidera: "lidera",
  disputa: "em disputa",
};

// Settled outcomes, shown with a check on the map.
export const isSettled = (s: RaceState) => s === "eleito" || s === "segundo-turno";
