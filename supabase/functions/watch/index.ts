// Called by the browser when a column opens and every minute after (heartbeat).
// Marks races as watched for the poller and returns what we already have stored.
// Only a race nobody has opened yet is fetched from the TSE here.
import { parseKey } from "../_shared/tse.ts";
import { broadcast, corsHeaders, db, refreshMany, type LatestOut } from "../_shared/store.ts";

const MAX_KEYS = 40;
// Most recent points per race; plenty for a chart and far below the database row cap.
const HISTORY_POINTS = 800;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let keys: string[];
  let historyFor: string[];
  let have: Set<string>;
  let lite: boolean;
  try {
    const body = (await req.json()) as {
      keys?: unknown;
      history?: unknown;
      have?: unknown;
      lite?: unknown;
    };
    keys = Array.isArray(body.keys)
      ? body.keys.filter((k): k is string => typeof k === "string")
      : [];
    historyFor = Array.isArray(body.history)
      ? body.history.filter((k): k is string => typeof k === "string")
      : [];
    keys = [...new Set(keys)].slice(0, MAX_KEYS);
    keys.forEach(parseKey);
    historyFor = historyFor.filter((k) => keys.includes(k));
    have = new Set(
      Array.isArray(body.have) ? body.have.filter((k): k is string => typeof k === "string") : [],
    );
    // Heartbeats only keep races watched. Tabs still on the previous client send them without
    // `have` and without history; treat those as lite too, so they stop pulling whole rows.
    lite = body.lite === true || (body.have === undefined && historyFor.length === 0);
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (keys.length === 0) return json({ races: {}, history: {} });

  const now = new Date().toISOString();
  if (lite) {
    const { error } = await db
      .from("watch")
      .upsert(keys.map((key) => ({ key, last_seen_at: now })));
    if (error) return json({ error: error.message }, 500);
    return json({ races: {}, history: {} });
  }

  // The candidate list (meta) is static and large (hundreds of KB for deputados): only send it
  // for races the browser does not have yet.
  const withMeta = keys.filter((k) => !have.has(k));
  const withoutMeta = keys.filter((k) => have.has(k));
  const none = Promise.resolve({ data: [], error: null });
  // One round trip: the function and the database are in different regions.
  const [watchRes, metaRes, dataRes, historyRes] = await Promise.all([
    db.from("watch").upsert(keys.map((key) => ({ key, last_seen_at: now }))),
    withMeta.length
      ? db.from("results_latest").select("key, meta, data, colors").in("key", withMeta)
      : none,
    withoutMeta.length
      ? db.from("results_latest").select("key, data, colors").in("key", withoutMeta)
      : none,
    // One query per race: a single query for all of them hit the row cap and cut the races
    // with the largest section numbers (Brasil) down to their first point.
    Promise.all(
      historyFor.map((key) =>
        db
          .from("results_history")
          .select("key, sections, progress, tse_at, valid, votes")
          .eq("key", key)
          .order("sections", { ascending: false })
          .limit(HISTORY_POINTS),
      ),
    ).then((results) => ({
      data: results.flatMap((r) => [...(r.data ?? [])].reverse()),
      error: results.find((r) => r.error)?.error ?? null,
    })),
  ]);
  const failed = watchRes.error ?? metaRes.error ?? dataRes.error ?? historyRes.error;
  if (failed) return json({ error: failed.message }, 500);

  const races: Record<string, Partial<LatestOut> & { key: string }> = {};
  for (const r of [...(metaRes.data ?? []), ...(dataRes.data ?? [])] as LatestOut[])
    races[r.key] = r;

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
