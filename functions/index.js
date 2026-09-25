const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

admin.initializeApp();
const db = admin.firestore();

// Public page that mirrors NSE Kenya listed-security prices. This is a
// free, unofficial source scraped server-side (browsers can't call it
// directly due to CORS). If NSE Kenya publishes an official/paid API in
// the future, swap this URL + parseNsePrices() for that instead.
const SOURCE_URL = "https://afx.kwayisi.org/nse/";
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // throttle manual refresh to once per 5 min

/**
 * Parses the NSE listed-securities table out of the source page's HTML.
 * The table has rows of either 5 cells (ticker, name, volume, price, change)
 * or 3 cells (ticker, name, price) when a security didn't trade that day.
 * Exported for local testing.
 */
function parseNsePrices(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const rows = [];

  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length !== 3 && tds.length !== 5) return;

    const ticker = $(tds[0]).text().trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,10}$/.test(ticker) || seen.has(ticker)) return;

    const name = $(tds[1]).text().trim();
    // Real company/security names always contain letters; this also filters
    // out stray matches from unrelated tables (e.g. index summary rows).
    if (!name || name.length < 2 || !/[A-Za-z]/.test(name)) return;

    let volumeText = "0";
    let priceText;
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
  if (!res.ok) {
    throw new Error(`Source page returned ${res.status}`);
  }
  const html = await res.text();
  const rows = parseNsePrices(html);

  if (rows.length < 10) {
    // Sanity check: if the page structure changed and we parsed almost
    // nothing, don't overwrite good existing data with a near-empty set.
    throw new Error(`Only parsed ${rows.length} tickers - source layout may have changed`);
  }

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  rows.forEach((row) => {
    const ref = db.collection("stockPrices").doc(row.ticker);
    batch.set(ref, { ...row, updatedAt: now }, { merge: true });
  });
  await batch.commit();

  await db.collection("_meta").doc("scrapeStatus").set({
    lastRunAt: now,
    tickerCount: rows.length
  });

  return rows.length;
}

// Runs a few times a day on weekdays, roughly covering the NSE trading
// session (Nairobi is UTC+3; NSE trades ~09:30-15:00 EAT on weekdays).
exports.scrapeNsePrices = onSchedule(
  { schedule: "0 7,9,11,13 * * 1-5", timeZone: "Africa/Nairobi" },
  async () => {
    const count = await scrapeAndStore();
    console.log(`Scraped and stored ${count} NSE tickers`);
  }
);

// Lets a logged-in user force an immediate refresh instead of waiting for
// the next scheduled run. Throttled so it can't be spammed.
exports.refreshPricesNow = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to refresh prices.");
  }

  const statusDoc = await db.collection("_meta").doc("scrapeStatus").get();
  const lastRunAt = statusDoc.exists ? statusDoc.data().lastRunAt : null;
  if (lastRunAt && Date.now() - lastRunAt.toMillis() < MIN_REFRESH_INTERVAL_MS) {
    throw new HttpsError(
      "resource-exhausted",
      "Prices were refreshed recently - please try again in a few minutes."
    );
  }

  const count = await scrapeAndStore();
  return { tickerCount: count };
});

module.exports.parseNsePrices = parseNsePrices;
