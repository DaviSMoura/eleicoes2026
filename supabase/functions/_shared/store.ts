// Deno-only glue between the TSE CDN, Postgres and Supabase Realtime.
// The browser never talks to the TSE: everything goes through here.
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  COLOR_FREEZE_PROGRESS,
  assignColors,
  normalizeResult,
  resultUrl,
  type NormalizedRace,
  type RaceData,
  type RawResult,
} from "./tse.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

export const HISTORY_TOP = 12;

// Bump whenever normalizeResult's output changes: stored races are then refetched once,
// since their etags are kept per version.
const NORMALIZE_VERSION = 2;
export const raceStateId = (key: string) => `${resultUrl(key)}#v${NORMALIZE_VERSION}`;

export type Broadcast = { topic: string; event: string; payload: unknown };

type PollerRow = {
  id: string;
  etag: string | null;
  summary: Record<string, string> | null;
  retry_after: string | null;
  checked_at: string | null;
};

export async function getStates(ids: string[]): Promise<Map<string, PollerRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("poller_state")
    .select("id, etag, summary, retry_after, checked_at")
    .in("id", ids);
  if (error) throw error;
  return new Map((data as PollerRow[]).map((r) => [r.id, r]));
}

export async function saveState(row: Partial<PollerRow> & { id: string }) {
  const { error } = await db.from("poller_state").upsert(row);
  if (error) throw error;
}

export type Fetched<T> =
  | { kind: "new"; body: T; etag: string | null }
  | { kind: "same" }
  | { kind: "missing" }
  | { kind: "error"; status: number };

// Conditional GET against the TSE CDN. A 304 costs nothing on either side.
export async function fetchTse<T>(
  url: string,
  state: PollerRow | undefined,
  stateId: string = url,
): Promise<Fetched<T>> {
  if (state?.retry_after && new Date(state.retry_after) > new Date()) return { kind: "same" };
  const headers: Record<string, string> = { "accept-encoding": "gzip" };
  if (state?.etag) headers["if-none-match"] = state.etag;
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    console.error("tse fetch failed", url, err);
    return { kind: "error", status: 0 };
  }
  if (res.status === 304) return { kind: "same" };
  if (res.status === 404) {
    await res.body?.cancel();
    return { kind: "missing" };
  }
  if (!res.ok) {
    await res.body?.cancel();
    const backoff = res.status === 429 ? 15 : 5;
    await saveState({
      id: stateId,
      retry_after: new Date(Date.now() + backoff * 1000).toISOString(),
    });
    console.error("tse error", res.status, url);
    return { kind: "error", status: res.status };
  }
  return { kind: "new", body: (await res.json()) as T, etag: res.headers.get("etag") };
}

type LatestRow = {
  key: string;
  sections: number;
  colors: Record<string, number>;
  colors_frozen: boolean;
};

const historyVotes = (data: RaceData) =>
  [...data.votes]
    .sort((a, b) => b[1] - a[1])
    .slice(0, HISTORY_TOP)
    .map(([id, v]) => [id, v]);

// Fetches one race and, when it changed, stores it and returns the realtime message.
export async function refreshRace(key: string): Promise<Broadcast | null> {
  const url = resultUrl(key);
  const stateId = raceStateId(key);
  const states = await getStates([stateId]);
  const got = await fetchTse<RawResult>(url, states.get(stateId), stateId);
  const now = new Date().toISOString();
  if (got.kind !== "new") {
    if (got.kind === "same" || got.kind === "missing")
      await saveState({ id: stateId, checked_at: now });
    return null;
  }
  const race: NormalizedRace = normalizeResult(key, got.body);

  const { data: prevRows, error: prevErr } = await db
    .from("results_latest")
    .select("key, sections, colors, colors_frozen")
    .eq("key", key);
  if (prevErr) throw prevErr;
  const prev = (prevRows as LatestRow[])[0];

  const frozen = prev?.colors_frozen ?? false;
  const colors = frozen && prev ? prev.colors : assignColors(race.meta, race.data);
  const colorsFrozen = frozen || race.data.progress >= COLOR_FREEZE_PROGRESS;

  const { error: upErr } = await db.from("results_latest").upsert({
    key,
    ele: race.meta.ele,
    abr: race.meta.abr,
    uf: race.meta.uf,
    cargo: race.meta.cargo,
    seats: race.meta.seats,
    idg: race.data.idg,
    sections: race.data.sections,
    progress: race.data.progress,
    tse_at: race.data.tseAt || null,
    meta: race.meta,
    data: race.data,
    colors,
    colors_frozen: colorsFrozen,
    updated_at: now,
  });
  if (upErr) throw upErr;

  if (!prev || prev.sections !== race.data.sections) {
    const { error: hErr } = await db.from("results_history").upsert(
      {
        key,
        sections: race.data.sections,
        progress: race.data.progress,
        tse_at: race.data.tseAt || null,
        valid: race.data.valid,
        votes: historyVotes(race.data),
      },
      { onConflict: "key,sections", ignoreDuplicates: true },
    );
    if (hErr) throw hErr;
  }

  await saveState({ id: stateId, etag: got.etag, checked_at: now, retry_after: null });
  return { topic: `res:${key}`, event: "update", payload: { key, data: race.data, colors } };
}

export async function broadcast(messages: Broadcast[]) {
  for (let i = 0; i < messages.length; i += 50) {
    const batch = messages.slice(i, i + 50).map((m) => ({ ...m, private: false }));
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messages: batch }),
    });
    if (!res.ok) console.error("broadcast failed", res.status, await res.text());
    else await res.body?.cancel();
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
