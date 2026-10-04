import { createClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");

// Publishable keys (sb_publishable_...) are opaque, not JWTs: send them only as `apikey`,
// never as a bearer token, or the gateway rejects the request.
const fetchWithKey: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
  headers.set("apikey", key);
  return fetch(input, { ...init, headers });
};

// The app is read-only and anonymous: no auth session to keep.
export const supabase = createClient(url, key, {
  global: { fetch: fetchWithKey },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
