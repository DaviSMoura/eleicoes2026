-- Live TSE results: one poller writes, every browser reads (and gets pushed updates via Realtime).

create table public.results_latest (
  key text primary key,
  ele text not null,
  abr text not null,
  uf text not null,
  cargo smallint not null,
  seats smallint not null,
  idg text not null,
  sections integer not null,
  progress numeric(6, 2) not null,
  tse_at timestamptz,
  meta jsonb not null,
  data jsonb not null,
  colors jsonb not null default '{}'::jsonb,
  colors_frozen boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.results_history (
  id bigserial primary key,
  key text not null,
  sections integer not null,
  progress numeric(6, 2) not null,
  tse_at timestamptz,
  valid bigint not null,
  votes jsonb not null,
  created_at timestamptz not null default now(),
  unique (key, sections)
);

create table public.watch (
  key text primary key,
  last_seen_at timestamptz not null default now()
);
create index watch_last_seen_at_idx on public.watch (last_seen_at);

-- Per-URL conditional-request state (etag, index summaries, backoff) plus the cycle lock row.
create table public.poller_state (
  id text primary key,
  etag text,
  summary jsonb,
  retry_after timestamptz,
  checked_at timestamptz,
  locked_until timestamptz not null default 'epoch',
  last_run_at timestamptz not null default 'epoch'
);
insert into public.poller_state (id) values ('lock');

alter table public.results_latest enable row level security;
alter table public.results_history enable row level security;
alter table public.watch enable row level security;
alter table public.poller_state enable row level security;

-- Results are public. Nobody but the service role (Edge Functions) writes anything.
create policy "results_latest are public" on public.results_latest for select using (true);
create policy "results_history are public" on public.results_history for select using (true);

-- Refuses overlapping cycles and cycles closer than 3s apart, so calling poll-tse more often
-- than the cron does never adds load on the TSE.
create or replace function public.poller_try_lock()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  got boolean;
begin
  update poller_state
     set locked_until = now() + interval '25 seconds',
         last_run_at = now()
   where id = 'lock'
     and locked_until < now()
     and last_run_at < now() - interval '3 seconds'
  returning true into got;
  return coalesce(got, false);
end;
$$;

create or replace function public.poller_unlock()
returns void
language sql
security definer
set search_path = public
as $$
  update poller_state set locked_until = 'epoch' where id = 'lock';
$$;

revoke execute on function public.poller_try_lock() from public, anon, authenticated;
revoke execute on function public.poller_unlock() from public, anon, authenticated;

-- Used by the poll-tse schedule (added once the project URL is known).
create extension if not exists pg_cron;
create extension if not exists pg_net;
