// Called by the browser when a column opens and every minute after (heartbeat).
// Marks races as watched for the poller and returns what we already have stored.
// Only a race nobody has opened yet is fetched from the TSE here.
import { parseKey } from "../_shared/tse.ts";
import { broadcast, corsHeaders, db, refreshMany, type LatestOut } from "../_shared/store.ts";

const MAX_KEYS = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let keys: string[];
  let historyFor: string[];
  try {
    const body = (await req.json()) as { keys?: unknown; history?: unknown };
    keys = Array.isArray(body.keys)
      ? body.keys.filter((k): k is string => typeof k === "string")
      : [];
    historyFor = Array.isArray(body.history)
      ? body.history.filter((k): k is string => typeof k === "string")
      : [];
    keys = [...new Set(keys)].slice(0, MAX_KEYS);
    keys.forEach(parseKey);
    historyFor = historyFor.filter((k) => keys.includes(k));
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (keys.length === 0) return json({ races: {}, history: {} });

  // One round trip: the function and the database are in different regions.
  const now = new Date().toISOString();
  const [watchRes, latestRes, historyRes] = await Promise.all([
    db.from("watch").upsert(keys.map((key) => ({ key, last_seen_at: now }))),
    db.from("results_latest").select("key, meta, data, colors").in("key", keys),
    historyFor.length > 0
      ? db
          .from("results_history")
          .select("key, sections, progress, tse_at, valid, votes")
          .in("key", historyFor)
          .order("sections", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = watchRes.error ?? latestRes.error ?? historyRes.error;
  if (failed) return json({ error: failed.message }, 500);

  const races: Record<string, LatestOut> = {};
  for (const r of (latestRes.data ?? []) as LatestOut[]) races[r.key] = r;

  // First viewer of a race: fetch it from the TSE now and answer with what was stored.
  const missing = keys.filter((k) => !races[k]);
  if (missing.length > 0) {
    const { results: fresh } = await refreshMany(missing);
    for (const { row } of fresh) races[row.key] = row;
    await broadcast(fresh.flatMap((r) => r.messages));
  }

  const history: Record<string, unknown[]> = {};
  for (const r of historyRes.data ?? []) (history[r.key as string] ??= []).push(r);
  return json({ races, history });
});
