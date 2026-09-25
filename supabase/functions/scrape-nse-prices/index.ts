// supabase/functions/scrape-nse-prices/index.ts
//
// Two ways this gets invoked:
//  1. pg_cron, on a schedule, via net.http_post with an `x-cron-secret` header
//     matching the CRON_SECRET env var (see supabase/migrations for the cron job).
//  2. A logged-in user clicking "Refresh Now" in the app, via
//     supabase.functions.invoke(), which sends their session JWT. This path
//     is throttled to once every 5 minutes using the scrape_status table.
//
// Uses the service_role key internally to write to stock_prices, which is
// otherwise read-only to normal clients (see the RLS policies).

import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1.0.0-rc.12";

const SOURCE_URL = "https://afx.kwayisi.org/nse/";
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Browsers send a preflight OPTIONS request before any cross-origin call
// that carries an Authorization header. Without these headers on every
// response, the browser blocks the request before it even reaches this
// code, which shows up client-side as "Failed to send a request to the
// Edge Function" even though the function itself never ran.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parseNsePrices(html: string) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const rows: { ticker: string; name: string; price: number; change: number; volume: number }[] = [];

  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length !== 3 && tds.length !== 5) return;

    const ticker = $(tds[0]).text().trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,10}$/.test(ticker) || seen.has(ticker)) return;

    const name = $(tds[1]).text().trim();
    if (!name || name.length < 2 || !/[A-Za-z]/.test(name)) return;

    let volumeText = "0";
    let priceText: string;
    let changeText = "0";

    if (tds.length === 5) {
      volumeText = $(tds[2]).text().trim();
      priceText = $(tds[3]).text().trim();
      changeText = $(tds[4]).text().trim();
    } else {
      priceText = $(tds[2]).text().trim();
    }

    const price = parseFloat(priceText.replace(/,/g, ""));
    if (Number.isNaN(price)) return;

    const change = parseFloat(changeText.replace(/,/g, "").replace("+", ""));
    const volume = parseInt(volumeText.replace(/,/g, ""), 10);

    seen.add(ticker);
    rows.push({
      ticker,
      name,
      price,
      change: Number.isNaN(change) ? 0 : change,
      volume: Number.isNaN(volume) ? 0 : volume
    });
  });

  return rows;
}

async function scrapeAndStore() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ZiidiPriceBot/1.0)" }
  });
  if (!res.ok) throw new Error(`Source page returned ${res.status}`);

  const html = await res.text();
  const rows = parseNsePrices(html);

  if (rows.length < 10) {
    throw new Error(`Only parsed ${rows.length} tickers - source layout may have changed`);
  }

  const { error: upsertError } = await adminClient
    .from("stock_prices")
    .upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "ticker" }
    );
  if (upsertError) throw upsertError;

  const { error: statusError } = await adminClient
    .from("scrape_status")
    .update({ last_run_at: new Date().toISOString(), ticker_count: rows.length })
    .eq("id", true);
  if (statusError) throw statusError;

  return rows.length;
}

Deno.serve(async (req) => {
  // Answer the browser's preflight check before doing anything else
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronHeader = req.headers.get("x-cron-secret");
    const isCron = Boolean(CRON_SECRET) && cronHeader === CRON_SECRET;

    if (!isCron) {
      // Not the cron job - must be a logged-in user calling "Refresh Now"
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await adminClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: status } = await adminClient
        .from("scrape_status")
        .select("last_run_at")
        .eq("id", true)
        .single();

      if (status?.last_run_at && Date.now() - new Date(status.last_run_at).getTime() < MIN_REFRESH_INTERVAL_MS) {
        return new Response(
          JSON.stringify({ error: "Prices were refreshed recently - please try again in a few minutes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const tickerCount = await scrapeAndStore();
    return new Response(JSON.stringify({ tickerCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
