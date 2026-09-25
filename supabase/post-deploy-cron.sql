-- Run this in the Supabase SQL Editor AFTER you've deployed the
-- scrape-nse-prices Edge Function and set its CRON_SECRET env var.
-- Fill in the three placeholders below first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store your project URL and the SAME secret you set as the
-- scrape-nse-prices function's CRON_SECRET env var, so pg_cron can
-- authenticate its calls to the function.
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('YOUR_CRON_SECRET_VALUE', 'cron_secret');

-- Runs at 7am, 9am, 11am and 1pm East Africa Time on weekdays,
-- roughly covering the NSE trading session.
select cron.schedule(
  'scrape-nse-prices',
  '0 4,6,8,10 * * 1-5', -- UTC times equivalent to 7/9/11/13 EAT (UTC+3)
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scrape-nse-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check scheduled jobs later:
-- select * from cron.job;
-- To remove it:
-- select cron.unschedule('scrape-nse-prices');
