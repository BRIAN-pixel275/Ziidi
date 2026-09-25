# Ziidi Investment Tracker — Supabase Edition

Same feature set as the Firebase version (login, cloud-stored portfolios, live NSE
prices for all listed tickers, dynamic ticker search) but built on **Supabase**
instead — Postgres + Auth + Edge Functions, all on Supabase's free tier with
**no credit card required**.

## Project layout

```
ziidi-supabase/
  public/                          <- static site, host anywhere (Supabase Hosting isn't a thing;
    index.html                        use Netlify/Vercel/GitHub Pages, see step 5)
    manifest.json
    sw.js
    css/styles.css
    js/
      supabase-client.js           <- put your Supabase project URL + anon key here
      auth.js
      portfolio.js
      prices.js
      ui.js
      app.js
  supabase/
    config.toml
    migrations/0001_init.sql       <- database schema + Row Level Security policies
    functions/scrape-nse-prices/   <- Edge Function: scrapes NSE prices
    post-deploy-cron.sql           <- run once after deploying, to schedule the scraper
```

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project. Pick a region close to Kenya if offered (e.g. an EU region). No credit card needed for the free tier.
2. Once it's provisioned, go to **Project Settings → API** and copy the **Project URL** and the **anon/public key**.

## 2. Configure the frontend

Open `public/js/supabase-client.js` and replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the values from step 1.2.

## 3. Install the Supabase CLI and log in

```bash
npm install -g supabase
supabase login
```

From inside the `ziidi-supabase` folder:

```bash
supabase link --project-ref YOUR-PROJECT-REF
```

(Your project ref is the subdomain in your project URL, e.g. `abcdefgh` from `https://abcdefgh.supabase.co`.)

## 4. Push the database schema and deploy the Edge Function

```bash
supabase db push
supabase functions deploy scrape-nse-prices
```

Then set a secret the function uses to authenticate scheduled calls from `pg_cron`:

```bash
supabase secrets set CRON_SECRET=some-long-random-string-you-make-up
```

## 5. Schedule the scraper

Open the **SQL Editor** in your Supabase dashboard, open `supabase/post-deploy-cron.sql` from this project, fill in:
- Your real project URL (from step 1.2)
- The exact same `CRON_SECRET` value you set in step 4

...then run it. This enables `pg_cron` + `pg_net` and schedules the scraper for 7am/9am/11am/1pm East Africa Time on weekdays.

To see it running later: `select * from cron.job_run_details order by start_time desc limit 5;` in the SQL Editor.

## 6. Seed prices immediately (optional)

The scheduler won't fire until its next slot. To get prices right away, either wait, or log into the app once deployed and click **"Refresh Now"** on the Live Prices tab.

## 7. Host the frontend

`public/` is a plain static site — deploy it anywhere:
- **Netlify / Vercel**: drag-and-drop the `public` folder, or connect your GitHub repo and set the publish directory to `public`.
- **GitHub Pages**: push `public/`'s contents to a `gh-pages` branch (or use a GitHub Action).

Unlike Firebase, Supabase doesn't host your static frontend — it's a backend-as-a-service, so pick any static host for `public/`.

## Important notes and limitations

- **Price source**: same caveat as before — this scrapes a free public NSE aggregator page (`afx.kwayisi.org/nse`) since there's no official free NSE Kenya API. If that page's HTML structure changes, `scrape-nse-prices/index.ts`'s `parseNsePrices()` will need updating. It refuses to overwrite existing prices if it parses fewer than 10 tickers, so a broken scrape fails loudly instead of corrupting data.
- **Not real-time**: prices refresh a few times a day, not tick-by-tick.
- **Email confirmation**: by default, Supabase requires users to confirm their email before they can log in. You can turn this off in Authentication → Providers → Email → "Confirm email" if you want frictionless signup for a personal app.
- **Security**: Row Level Security (in `migrations/0001_init.sql`) ensures each user can only see and modify their own `investments` rows. `stock_prices` is read-only to any authenticated client — only the Edge Function (using the service_role key) can write to it.
- **Still no sell transactions**: like the original app, this only tracks buys.

## Local testing

You can serve the frontend locally against your real Supabase project:

```bash
cd public
python -m http.server 8000
```

Then visit `http://localhost:8000`. To test the Edge Function locally before deploying: `supabase functions serve scrape-nse-prices`.
