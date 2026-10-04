// Called by the browser when a column opens and every minute after (heartbeat).
// Marks races as watched for the poller and returns what we already have stored.
// Only a race nobody has opened yet is fetched from the TSE here.
import { parseKey } from "../_shared/tse.ts";
import {
  broadcast,
  corsHeaders,
  db,
  mapLimit,
  refreshRace,
  type Broadcast,
} from "../_shared/store.ts";

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

  const now = new Date().toISOString();
  const { error: wErr } = await db
    .from("watch")
    .upsert(keys.map((key) => ({ key, last_seen_at: now })));
  if (wErr) return json({ error: wErr.message }, 500);

  const select = () => db.from("results_latest").select("key, meta, data, colors").in("key", keys);
  let { data: latest, error } = await select();
  if (error) return json({ error: error.message }, 500);

  const have = new Set((latest ?? []).map((r) => r.key as string));
  const missing = keys.filter((k) => !have.has(k));
  if (missing.length > 0) {
    const msgs = (await mapLimit(missing, 8, refreshRace)).filter(
      (m): m is Broadcast => m !== null,
    );
    await broadcast(msgs);
    ({ data: latest, error } = await select());
    if (error) return json({ error: error.message }, 500);
  }

  const history: Record<string, unknown[]> = {};
  if (historyFor.length > 0) {
    const { data: rows, error: hErr } = await db
      .from("results_history")
      .select("key, sections, progress, tse_at, valid, votes")
      .in("key", historyFor)
      .order("sections", { ascending: true });
    if (hErr) return json({ error: hErr.message }, 500);
    for (const r of rows ?? []) (history[r.key as string] ??= []).push(r);
  }

  const races: Record<string, unknown> = {};
  for (const r of latest ?? []) races[r.key as string] = r;
  return json({ races, history });
});
