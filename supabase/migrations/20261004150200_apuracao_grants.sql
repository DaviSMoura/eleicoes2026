-- Read-only access for the browser; full access for the Edge Functions (service role).
grant select on public.results_latest, public.results_history to anon, authenticated;
grant all on public.results_latest, public.results_history, public.watch, public.poller_state to service_role;
grant usage, select on sequence public.results_history_id_seq to service_role;
grant execute on function public.poller_try_lock(), public.poller_unlock() to service_role;
