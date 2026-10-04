// One polling cycle, triggered every 5s by pg_cron. Public on purpose: the lock in
// poller_try_lock() refuses cycles closer than 3s apart, so extra calls never add TSE load.
import { parseKey } from "../_shared/tse.ts";
import {
  broadcast,
  corsHeaders,
  db,
  refreshMany,
  saveState,
  SERVICE_KEY,
  SUPABASE_URL,
} from "../_shared/store.ts";

const WATCH_WINDOW_MS = 3 * 60 * 1000;

// Each refresh downloads and parses a TSE file; during the count every watched race changes
// at once. Workers split that work so no single invocation hits the CPU limit.
const WORKER_BATCH = 8;
const WORKER_TIMEOUT_MS = 22_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

type WorkerResult = { updated: number; errors: string[] };

// Worker: refreshes a small batch of races. Only the dispatcher (holding the service key) may
// call it, so outsiders cannot use it to make us hit the TSE.
async function work(keys: string[]): Promise<WorkerResult> {
  const { results, errors } = await refreshMany(keys);
  await broadcast(results.flatMap((r) => r.messages));
  return { updated: results.length, errors };
}

async function dispatch(keys: string[]): Promise<WorkerResult> {
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += WORKER_BATCH) batches.push(keys.slice(i, i + WORKER_BATCH));
  const outcomes = await Promise.all(
    batches.map((batch) =>
      fetch(`${SUPABASE_URL}/functions/v1/poll-tse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-poller-key": SERVICE_KEY },
        body: JSON.stringify({ keys: batch }),
        signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
      })
        .then(async (res) =>
          res.ok
            ? ((await res.json()) as WorkerResult)
            : { updated: 0, errors: [`worker HTTP ${res.status}`] },
        )
        .catch((err) => ({ updated: 0, errors: [`worker: ${String(err)}`] })),
    ),
  );
  return {
    updated: outcomes.reduce((n, o) => n + o.updated, 0),
    errors: outcomes.flatMap((o) => o.errors),
  };
}

async function recordStatus(summary: Record<string, unknown>) {
  await saveState({
    id: "status",
    summary: summary as never,
    checked_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Public status of the last cycle, to check the poller without access to the logs.
  if (req.method === "GET") {
    const { data, error } = await db
      .from("poller_state")
      .select("summary, checked_at")
      .eq("id", "status");
    if (error) return json({ error: error.message }, 500);
    return json(data?.[0] ?? null);
  }

  const body = (await req.json().catch(() => ({}))) as { keys?: unknown };
  if (Array.isArray(body.keys)) {
    if (req.headers.get("x-poller-key") !== SERVICE_KEY) return json({ error: "forbidden" }, 403);
    const keys = body.keys.filter((k): k is string => typeof k === "string").slice(0, WORKER_BATCH);
    keys.forEach(parseKey);
    return json(await work(keys));
  }

  const { data: locked, error: lockErr } = await db.rpc("poller_try_lock");
  if (lockErr) {
    console.error(lockErr);
    return new Response("lock error", { status: 500 });
  }
  if (!locked) return new Response("busy", { status: 202 });

  const started = Date.now();
  try {
    const since = new Date(Date.now() - WATCH_WINDOW_MS).toISOString();
    const { data: rows, error } = await db.from("watch").select("key").gte("last_seen_at", since);
    if (error) throw error;
    const watched = (rows as { key: string }[]).map((r) => r.key);
    if (watched.length === 0) return new Response("idle");

    // Every watched race gets a conditional GET each cycle: a 304 costs nothing on either side
    // and nothing is written, so this is cheaper than tracking the per-UF index files.
    const due = watched;

    const result = await dispatch(due);
    const summary = {
      at: new Date().toISOString(),
      watched: watched.length,
      due: due.length,
      updated: result.updated,
      errors: result.errors.length,
      firstErrors: result.errors.slice(0, 5),
      ms: Date.now() - started,
    };
    console.log(JSON.stringify(summary));
    await recordStatus(summary);
    return json(summary);
  } catch (err) {
    console.error(err);
    await recordStatus({
      at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    }).catch(() => undefined);
    return new Response("error", { status: 500 });
  } finally {
    await db.rpc("poller_unlock");
  }
});
