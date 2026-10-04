// Live election data. The UI imports only from here: races come from our backend
// (Supabase), never from the TSE directly, and updates are pushed over Realtime.
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  CARGO,
  UFS,
  keyFor,
  photoUrl,
  type RaceData,
  type RaceMeta,
} from "../../../supabase/functions/_shared/tse";
import type { HistoryPoint, Race } from "./trends";

export type { HistoryPoint, Race, Trend, TrendSummary } from "./trends";
export { trendsFor, shareOf, validOf } from "./trends";
export { distributeSeats, qeInputFor, quocienteEleitoral } from "./quociente";
export type { QeResult, QeGroupResult } from "./quociente";

// ---------- places ----------

export type PlaceKind = "br" | "uf" | "mun" | "zz";
export type Place = { id: string; name: string; uf: string; kind: PlaceKind };

export const placeKind = (id: string): PlaceKind =>
  id === "br" ? "br" : id.length === 2 ? "uf" : id.startsWith("zz") ? "zz" : "mun";

export const DEFAULT_PLACES = ["br", "sp", "sp71072"];

let placesPromise: Promise<Place[]> | undefined;
export function loadPlaces(): Promise<Place[]> {
  placesPromise ??= import("./places.gen").then((m) =>
    m.PLACES.map(([id, name, uf]) => ({ id, name, uf, kind: placeKind(id) })),
  );
  return placesPromise;
}

export type Office = { cargo: number; label: string };
export const OFFICES: Office[] = [
  { cargo: CARGO.presidente, label: "Presidente" },
  { cargo: CARGO.governador, label: "Governador" },
  { cargo: CARGO.senador, label: "Senador" },
  { cargo: CARGO.depFederal, label: "Dep. Federal" },
];

export const officesFor = (placeId: string): Office[] => {
  const kind = placeKind(placeId);
  return kind === "br" || kind === "zz" ? OFFICES.slice(0, 1) : OFFICES;
};

const NATIONAL_UF_KEYS = [...UFS, "zz"].map((uf) => keyFor(uf, CARGO.presidente));

export const CARGO_DEP_FEDERAL = CARGO.depFederal;

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

// TSE names come in upper case ("FLAVIO BOLSONARO"); show them like people write them.
export const displayName = (name: string) =>
  name
    .split(" ")
    .map((w, i) => {
      if (/^[IVX]+$/.test(w) && i > 0) return w;
      const lower = w.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join("-");
    })
    .join(" ");

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
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

function applyUpdate(u: Update) {
  const cur = races.get(u.key);
  if (!cur || u.data.sections < cur.data.sections) return;
  const last = cur.history.at(-1);
  const history =
    historyWanted.has(u.key) && u.data.sections > (last?.sections ?? -1)
      ? [...cur.history, pointFrom(u.data)]
      : cur.history;
  races.set(u.key, { ...cur, data: u.data, colors: u.colors, history });
  emit();
}

async function watch(keys: string[], withHistory: boolean) {
  for (let i = 0; i < keys.length; i += 40) {
    const chunk = keys.slice(i, i + 40);
    const history = withHistory ? chunk.filter((k) => historyWanted.has(k)) : [];
    const { data, error } = await supabase.functions.invoke<{
      races: Record<string, LatestRow>;
      history: Record<string, HistoryRow[]>;
    }>("watch", { body: { keys: chunk, history } });
    if (error || !data) {
      status = { ...status, error: error?.message ?? "Falha ao carregar" };
      emit();
      throw error ?? new Error("watch failed");
    }
    for (const key of chunk) {
      const row = data.races[key];
      if (!row) continue;
      const prev = races.get(key);
      const rows = data.history[key];
      races.set(key, {
        meta: row.meta,
        data: prev && prev.data.sections > row.data.sections ? prev.data : row.data,
        colors: row.colors,
        history: rows ? rows.map(toPoint) : (prev?.history ?? []),
      });
    }
    if (status.error) status = { ...status, error: null };
    emit();
  }
}

const joined = new Set<string>();
const pendingResync = new Set<string>();
let resyncTimer: ReturnType<typeof setTimeout> | undefined;

// A reconnect rejoins every channel at once; batch them into a single watch call.
function queueResync(key: string) {
  pendingResync.add(key);
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    const keys = [...pendingResync].filter((k) => refs.has(k));
    pendingResync.clear();
    if (keys.length) void watch(keys, true).catch(() => undefined);
  }, 300);
}

function subscribe(key: string) {
  const ch = supabase
    .channel(`res:${key}`)
    .on("broadcast", { event: "update" }, ({ payload }) => applyUpdate(payload as Update))
    .subscribe((s) => {
      if (s === "SUBSCRIBED") {
        if (!status.live) {
          status = { ...status, live: true };
          emit();
        }
        // Rejoined after a drop: fetch what we may have missed while disconnected.
        if (joined.has(key)) queueResync(key);
        joined.add(key);
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        if (status.live && s !== "CLOSED") {
          status = { ...status, live: false };
          emit();
        }
      }
    });
  channels.set(key, ch);
}

function retain(keys: string[], history: string[]) {
  history.forEach((k) => historyWanted.add(k));
  // Keys still subscribed (released moments ago, e.g. a remount) need no new fetch.
  const fresh = keys.filter((k) => (refs.get(k) ?? 0) === 0 && !channels.has(k));
  keys.forEach((k) => refs.set(k, (refs.get(k) ?? 0) + 1));
  fresh.forEach(subscribe);
  if (fresh.length) void watch(fresh, true).catch(() => setTimeout(() => retry(fresh), 5000));
}

function retry(keys: string[]) {
  const still = keys.filter((k) => (refs.get(k) ?? 0) > 0);
  if (still.length) void watch(still, true).catch(() => setTimeout(() => retry(still), 5000));
}

const RELEASE_DELAY_MS = 2000;

// Drop channels and data only if nobody re-retains the key shortly after
// (React remounts, moving a column), so those cases cost no extra request.
function release(keys: string[]) {
  for (const k of keys) {
    const n = (refs.get(k) ?? 0) - 1;
    if (n > 0) refs.set(k, n);
    else refs.delete(k);
  }
  setTimeout(() => {
    for (const k of keys) {
      if (refs.has(k)) continue;
      historyWanted.delete(k);
      joined.delete(k);
      const ch = channels.get(k);
      if (ch) void supabase.removeChannel(ch);
      channels.delete(k);
      races.delete(k);
    }
  }, RELEASE_DELAY_MS);
}

// Heartbeat keeps our races "watched" for the poller and heals any missed message.
if (typeof window !== "undefined") {
  setInterval(() => {
    const keys = [...refs.keys()];
    if (keys.length) void watch(keys, false).catch(() => undefined);
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
    retain(keys, mainKeys);
    return () => release(keys);
  }, [mainKeys, extra]);

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
