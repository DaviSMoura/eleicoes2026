-- lovable-cron-fallback-reviewed: TSE CDN offers no webhook; live election results need ~5s freshness, and poller_try_lock skips cycles with no watched races
-- Runs one poll-tse cycle every 5 seconds. poll-tse is public and rate-limited by
-- poller_try_lock(), so no secret is needed here.
select cron.schedule(
  'poll-tse',
  '5 seconds',
  $$
  select net.http_post(
    url := 'https://cyvszcfumuctbfzxqsgv.supabase.co/functions/v1/poll-tse',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
