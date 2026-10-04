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
