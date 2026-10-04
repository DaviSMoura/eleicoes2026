// Live election data. The UI imports only from here: races come from our backend
// (Supabase), never from the TSE directly, and updates are pushed over Realtime.
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { supabase } from "@/lib/supabase";
import {
  CARGO,
  UFS,
  keyFor,
  photoUrl,
  placeTopic,
  PRESIDENT_BY_UF_TOPIC,
  topicsFor,
  type RaceData,
  type RaceMeta,
} from "../../../supabase/functions/_shared/tse";
import { colorsFor } from "./colors";
import type { HistoryPoint, Race } from "./trends";

export type { HistoryPoint, Race, Trend, TrendSummary } from "./trends";
export { roundShares, trendsFor, shareOf, validOf } from "./trends";
export { distributeSeats, qeInputFor, quocienteEleitoral } from "./quociente";
export type { QeResult, QeGroupResult } from "./quociente";

// ---------- places ----------

export type PlaceKind = "status" | "br" | "uf" | "mun" | "zz";
export type Place = { id: string; name: string; uf: string; kind: PlaceKind };

export const STATUS_PLACE = "status";

export const placeKind = (id: string): PlaceKind =>
  id === STATUS_PLACE
    ? "status"
    : id === "br"
      ? "br"
      : id.length === 2
        ? "uf"
        : id.startsWith("zz")
          ? "zz"
          : "mun";

export const DEFAULT_PLACES = [STATUS_PLACE, "br", "sp", "sp71072"];

let placesPromise: Promise<Place[]> | undefined;
export function loadPlaces(): Promise<Place[]> {
  placesPromise ??= import("./places.gen").then((m) => [
    { id: STATUS_PLACE, name: "Status da apuração", uf: "BR", kind: "status" as const },
    ...m.PLACES.map(([id, name, uf]) => ({ id, name, uf, kind: placeKind(id) })),
  ]);
  return placesPromise;
}

export type Office = { cargo: number; label: string };
export const OFFICES: Office[] = [
  { cargo: CARGO.presidente, label: "Presidente" },
  { cargo: CARGO.governador, label: "Governador" },
  { cargo: CARGO.senador, label: "Senador" },
  { cargo: CARGO.depFederal, label: "Dep. Fed." },
];
const DEP_ESTADUAL: Office = { cargo: CARGO.depEstadual, label: "Dep. Est." };
// The Federal District elects deputados distritais instead of estaduais.
const DEP_DISTRITAL: Office = { cargo: CARGO.depDistrital, label: "Dep. Dist." };

export const officesFor = (placeId: string): Office[] => {
  const kind = placeKind(placeId);
  if (kind === "br" || kind === "zz") return OFFICES.slice(0, 1);
  return [...OFFICES, placeId.startsWith("df") ? DEP_DISTRITAL : DEP_ESTADUAL];
};

// Presidente per UF plus abroad ("zz"): feeds the Brasil column's projection and states grid.
const NATIONAL_UF_KEYS = [...UFS, "zz"].map((uf) => keyFor(uf, CARGO.presidente));

// Proportional races (deputados): seats are distributed by the quociente eleitoral.
export const isProportional = (cargo: number) =>
  cargo === CARGO.depFederal || cargo === CARGO.depEstadual || cargo === CARGO.depDistrital;

export { displayName } from "./names";

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
// Turnout as the TSE shows it: over the electorate of the sections already counted. Rows
// stored before that field existed have no base, so they show nothing rather than a wrong %.
export const turnoutPct = (data: RaceData) =>
  data.electorateCounted && data.electorateCounted > 0
    ? (data.turnout / data.electorateCounted) * 100
    : null;

export const fmtTime = (iso: string) => (iso ? timeFmt.format(new Date(iso)) : "");

const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
// "17:42" when it happened today (Brasília), otherwise "03/10".
export const fmtWhen = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return dayFmt.format(d) === dayFmt.format(new Date()) ? timeFmt.format(d) : dayFmt.format(d);
};
export const fmtFull = (iso: string) =>
  iso ? `${dayFmt.format(new Date(iso))} às ${timeFmt.format(new Date(iso))}` : "";

export const candidatePhoto = (meta: RaceMeta, id: string) =>
  photoUrl(meta.ele, meta.cargo === CARGO.presidente ? "br" : meta.uf, id);

// ---------- store ----------

type LatestRow = { key: string; meta: RaceMeta; data: RaceData; colors: Record<string, number> };
type HistoryRow = {
  key: string;
  sections: number;
  progress: number;
  tse_at: string | null;
  valid: number;
  votes: [string, number][];
};
type Update = { key: string; data: RaceData; colors: Record<string, number> };

const races = new Map<string, Race>();
const refs = new Map<string, number>();
const historyWanted = new Set<string>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const listeners = new Set<() => void>();
let version = 0;
let status: { live: boolean; error: string | null } = { live: false, error: null };

function emit() {
  version++;
  listeners.forEach((l) => l());
}

const toPoint = (r: HistoryRow): HistoryPoint => ({
  sections: r.sections,
  progress: Number(r.progress),
  tseAt: r.tse_at ?? "",
  valid: Number(r.valid),
  votes: Object.fromEntries(r.votes),
});

const pointFrom = (data: RaceData): HistoryPoint => ({
  sections: data.sections,
  progress: data.progress,
  tseAt: data.tseAt,
  valid: data.valid,
  votes: Object.fromEntries(data.votes.map(([id, v]) => [id, v])),
});

// Union of what we have and what arrived, by sections counted. A response can be partial (the
// history query has a row cap), so it must never replace points we already have.
export function mergeHistory(have: HistoryPoint[], incoming: HistoryPoint[]): HistoryPoint[] {
  if (incoming.length === 0) return have;
  const bySections = new Map(have.map((h) => [h.sections, h]));
  for (const h of incoming) bySections.set(h.sections, h);
  return [...bySections.values()].sort((a, b) => a.sections - b.sections);
}

function applyUpdate(u: Update) {
  const cur = races.get(u.key);
  if (!cur || u.data.sections < cur.data.sections) return;
  const last = cur.history.at(-1);
  const history =
    historyWanted.has(u.key) && u.data.sections > (last?.sections ?? -1)
      ? [...cur.history, pointFrom(u.data)]
      : cur.history;
  races.set(u.key, { ...cur, data: u.data, history });
  emit();
}

// Last known snapshot of each race, so a reload renders immediately while the backend answers
// (stale-while-revalidate). Optional: any storage failure just means no instant render.
const CACHE_PREFIX = "eleicoes2026:race:";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX_CHARS = 600_000;

function readCache(key: string): Race | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const { at, race } = JSON.parse(raw) as { at: number; race: Race };
    if (Date.now() - at > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return undefined;
    }
    return race;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, race: Race) {
  try {
    const raw = JSON.stringify({ at: Date.now(), race });
    if (raw.length <= CACHE_MAX_CHARS) localStorage.setItem(CACHE_PREFIX + key, raw);
  } catch {
    // Storage full or unavailable: the cache is only an optimization.
  }
}

// Races whose candidate list (meta) came from the server in this session. Only these are sent
// as `have`, so the server skips their meta; metas restored from the local cache may be from an
// older format and are fetched once more.
const metaConfirmed = new Set<string>();

// `lite` only keeps the races watched for the poller (the heartbeat while Realtime is up).
async function watch(keys: string[], withHistory: boolean, lite = false) {
  for (let i = 0; i < keys.length; i += 40) {
    const chunk = keys.slice(i, i + 40);
    const history = withHistory ? chunk.filter((k) => historyWanted.has(k)) : [];
    const have = chunk.filter((k) => metaConfirmed.has(k) && races.has(k));
    const { data, error } = await supabase.functions.invoke<{
      races: Record<string, Partial<LatestRow> & { key: string }>;
      history: Record<string, HistoryRow[]>;
    }>("watch", { body: { keys: chunk, history, have, lite } });
    if (error || !data) {
      status = { ...status, error: error?.message ?? "Falha ao carregar" };
      emit();
      throw error ?? new Error("watch failed");
    }
    for (const key of chunk) {
      const row = data.races[key];
      if (!row?.data) continue;
      const prev = races.get(key);
      const meta = row.meta ?? prev?.meta;
      if (!meta) continue;
      if (row.meta) metaConfirmed.add(key);
      const rows = data.history[key];
      const race: Race = {
        meta,
        data: prev && prev.data.sections > row.data.sections ? prev.data : row.data,
        colors: colorsFor(meta),
        history: mergeHistory(prev?.history ?? [], rows ? rows.map(toPoint) : []),
      };
      races.set(key, race);
      writeCache(key, race);
    }
    if (status.error) status = { ...status, error: null };
    emit();
  }
}

// Realtime: one channel per topic (a place, or the Presidente of all UFs), shared by every
// column that needs it. Race data is reference-counted separately, per race key.
const topicRefs = new Map<string, number>();
const joined = new Set<string>();
const lingering = new Set<string>(); // released keys whose data is kept a moment for remounts
const pendingResync = new Set<string>();
let resyncTimer: ReturnType<typeof setTimeout> | undefined;

// A reconnect rejoins every channel at once; batch them into a single watch call.
function queueResync(keys: string[]) {
  keys.forEach((k) => pendingResync.add(k));
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    const due = [...pendingResync].filter((k) => refs.has(k));
    pendingResync.clear();
    if (due.length) void watch(due, true).catch(() => undefined);
  }, 300);
}

function subscribe(topic: string) {
  const ch = supabase
    .channel(topic)
    .on("broadcast", { event: "update" }, ({ payload }) => applyUpdate(payload as Update))
    .subscribe((s) => {
      if (s === "SUBSCRIBED") {
        if (!status.live) {
          status = { ...status, live: true };
          emit();
        }
        // Rejoined after a drop: fetch what this topic may have missed while disconnected.
        if (joined.has(topic))
          queueResync([...refs.keys()].filter((k) => topicsFor(k).includes(topic)));
        joined.add(topic);
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        if (status.live) {
          status = { ...status, live: false };
          emit();
        }
      }
    });
  channels.set(topic, ch);
}

function retain(keys: string[], history: string[], topics: string[]) {
  history.forEach((k) => historyWanted.add(k));
  // Keys released moments ago (a remount, a moved column) still have fresh data: no refetch.
  const fresh = keys.filter((k) => (refs.get(k) ?? 0) === 0 && !lingering.has(k));
  keys.forEach((k) => {
    refs.set(k, (refs.get(k) ?? 0) + 1);
    lingering.delete(k);
  });
  let hydrated = false;
  for (const k of fresh) {
    const cached = races.has(k) ? undefined : readCache(k);
    if (cached) {
      races.set(k, { ...cached, colors: colorsFor(cached.meta) });
      hydrated = true;
    }
  }
  if (hydrated) emit();
  for (const t of topics) {
    topicRefs.set(t, (topicRefs.get(t) ?? 0) + 1);
    if (!channels.has(t)) subscribe(t);
  }
  if (fresh.length) void watch(fresh, true).catch(() => setTimeout(() => retry(fresh), 5000));
}

function retry(keys: string[]) {
  const still = keys.filter((k) => (refs.get(k) ?? 0) > 0);
  if (still.length) void watch(still, true).catch(() => setTimeout(() => retry(still), 5000));
}

const RELEASE_DELAY_MS = 2000;

// Drop data and channels only if nobody re-retains them shortly after
// (React remounts, moving a column), so those cases cost no extra request.
function release(keys: string[], topics: string[]) {
  for (const k of keys) {
    const n = (refs.get(k) ?? 0) - 1;
    if (n > 0) refs.set(k, n);
    else {
      refs.delete(k);
      lingering.add(k);
    }
  }
  for (const t of topics) {
    const n = (topicRefs.get(t) ?? 0) - 1;
    if (n > 0) topicRefs.set(t, n);
    else topicRefs.delete(t);
  }
  setTimeout(() => {
    for (const k of keys) {
      if (refs.has(k)) continue;
      lingering.delete(k);
      historyWanted.delete(k);
      metaConfirmed.delete(k);
      races.delete(k);
    }
    for (const t of topics) {
      if (topicRefs.has(t)) continue;
      joined.delete(t);
      const ch = channels.get(t);
      if (ch) void supabase.removeChannel(ch);
      channels.delete(t);
    }
  }, RELEASE_DELAY_MS);
}

// Heartbeat keeps our races "watched" for the poller and heals any missed message.
if (typeof window !== "undefined") {
  setInterval(() => {
    const keys = [...refs.keys()];
    // While Realtime is up, updates arrive by push: the heartbeat only keeps races watched.
    if (keys.length) void watch(keys, false, status.live).catch(() => undefined);
  }, 60_000);
  document.addEventListener("visibilitychange", () => {
    const keys = [...refs.keys()];
    if (document.visibilityState === "visible" && keys.length)
      void watch(keys, true).catch(() => undefined);
  });
}

const subscribeStore = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

// ---------- hooks ----------

export type Column = {
  place: string;
  races: Map<number, Race | undefined>;
  ufRaces: Race[]; // Brasil only: Presidente per UF (+ abroad), for the projection and the grid
};

export function useColumn(placeId: string): Column {
  const offices = officesFor(placeId);
  const mainKeys = useMemo(() => offices.map((o) => keyFor(placeId, o.cargo)), [placeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const extra = placeId === "br" ? NATIONAL_UF_KEYS : null;

  useEffect(() => {
    const keys = [...mainKeys, ...(extra ?? [])];
    const topics = [placeTopic(placeId), ...(extra ? [PRESIDENT_BY_UF_TOPIC] : [])];
    retain(keys, mainKeys, topics);
    return () => release(keys, topics);
  }, [placeId, mainKeys, extra]);

  const v = useSyncExternalStore(subscribeStore, getVersion, getVersion);
  return useMemo(
    () => ({
      place: placeId,
      races: new Map(offices.map((o, i) => [o.cargo, races.get(mainKeys[i]!)])),
      ufRaces: extra
        ? extra.map((k) => races.get(k)).filter((r): r is Race => r !== undefined)
        : [],
    }),
    [v, placeId, mainKeys, extra], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function useLiveStatus() {
  const v = useSyncExternalStore(subscribeStore, getVersion, getVersion);
  return useMemo(() => {
    let last = "";
    for (const r of races.values()) if (r.data.tseAt > last) last = r.data.tseAt;
    return { ...status, lastTseAt: last };
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
}
