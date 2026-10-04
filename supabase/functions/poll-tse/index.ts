// One polling cycle, triggered every 5s by pg_cron. Public on purpose: the lock in
// poller_try_lock() refuses cycles closer than 3s apart, so extra calls never add TSE load.
import {
  ELECTIONS,
  abEntries,
  abUrl,
  diffAb,
  parseKey,
  resultUrl,
  summarizeAb,
  type RawAb,
} from "../_shared/tse.ts";
import {
  broadcast,
  corsHeaders,
  db,
  fetchTse,
  getStates,
  mapLimit,
  refreshRace,
  saveState,
  type Broadcast,
} from "../_shared/store.ts";

const WATCH_WINDOW_MS = 3 * 60 * 1000;
const SAFETY_RECHECK_MS = 60 * 1000;

const isMunicipal = (abr: string) => abr.length > 2;

async function changedAbrangencias(watched: string[]): Promise<Set<string>> {
  const changed = new Set<string>();
  const byElection = new Map<string, string[]>();
  for (const key of watched) {
    const { ele } = parseKey(key);
    byElection.set(ele, [...(byElection.get(ele) ?? []), key]);
  }

  for (const ele of ELECTIONS) {
    const keys = byElection.get(ele);
    if (!keys) continue;

    // National index: tells which UFs moved since the last cycle.
    const brUrl = abUrl(ele, "br");
    const brState = (await getStates([brUrl])).get(brUrl);
    const br = await fetchTse<RawAb>(brUrl, brState);
    if (br.kind !== "new") continue;
    const brSummary = summarizeAb(br.body, "br");
    const movedUfs = diffAb(brState?.summary, brSummary);
    for (const abr of movedUfs) changed.add(abr);

    // State indexes, only for UFs that moved and have watched municipalities.
    const ufsWithMun = new Set(
      keys
        .map((k) => parseKey(k))
        .filter((p) => isMunicipal(p.abr))
        .map((p) => p.uf),
    );
    const ufs = movedUfs.filter((uf) => ufsWithMun.has(uf));
    const ufUrls = ufs.map((uf) => abUrl(ele, uf));
    const ufStates = await getStates(ufUrls);
    await mapLimit(ufs, 6, async (uf) => {
      const url = abUrl(ele, uf);
      const state = ufStates.get(url);
      const got = await fetchTse<RawAb>(url, state);
      if (got.kind !== "new") return;
      const summary = summarizeAb(got.body, uf);
      for (const abr of diffAb(state?.summary, summary)) changed.add(abr);
      await saveState({ id: url, etag: got.etag, summary, checked_at: new Date().toISOString() });
    });

    await saveState({
      id: brUrl,
      etag: br.etag,
      summary: brSummary,
      checked_at: new Date().toISOString(),
    });
    console.log(
      `ele ${ele}: ${movedUfs.length} abrangências moved, ${abEntries(br.body, "br").length} listed`,
    );
  }
  return changed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const changed = await changedAbrangencias(watched);
    const states = await getStates(watched.map(resultUrl));
    const stale = (key: string) => {
      const at = states.get(resultUrl(key))?.checked_at;
      return !at || Date.now() - new Date(at).getTime() > SAFETY_RECHECK_MS;
    };

    // br/UF races are few: always do a (cheap, conditional) check. Municipal races only when
    // their index entry moved, plus a safety recheck every minute.
    const due = watched.filter((key) => {
      const { abr } = parseKey(key);
      return !isMunicipal(abr) || changed.has(abr) || stale(key);
    });

    const messages = (await mapLimit(due, 8, refreshRace)).filter(
      (m): m is Broadcast => m !== null,
    );
    await broadcast(messages);
    const summary = `watched=${watched.length} due=${due.length} updated=${messages.length} in ${Date.now() - started}ms`;
    console.log(summary);
    return new Response(summary);
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  } finally {
    await db.rpc("poller_unlock");
  }
});
