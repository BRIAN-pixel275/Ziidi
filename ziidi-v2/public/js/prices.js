import { db, functions } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";

// In-memory cache of the latest scraped prices: { TICKER: { ticker, name, price, change, updatedAt } }
let priceCache = {};
let listeners = [];

export function watchPrices(onUpdate) {
  listeners.push(onUpdate);
  const q = query(collection(db, "stockPrices"), orderBy("ticker"));
  return onSnapshot(q, (snap) => {
    const next = {};
    snap.forEach((doc) => {
      next[doc.id] = doc.data();
    });
    priceCache = next;
    listeners.forEach((fn) => fn(priceCache));
  });
}

export function getPriceCache() {
  return priceCache;
}

export function getPrice(ticker) {
  return priceCache[ticker] ? priceCache[ticker].price : 0;
}

// Search tickers by symbol or company name, e.g. for an autocomplete box
export function searchTickers(term) {
  const t = term.trim().toUpperCase();
  if (!t) return Object.values(priceCache).slice(0, 20);
  return Object.values(priceCache).filter(
    (s) => s.ticker.includes(t) || (s.name || "").toUpperCase().includes(t)
  );
}

// Ask the Cloud Function to refresh prices right now, instead of waiting
// for the next scheduled scrape. The function itself throttles repeated calls.
export async function requestPriceRefresh() {
  const refresh = httpsCallable(functions, "refreshPricesNow");
  const result = await refresh();
  return result.data;
}

export function mostRecentUpdate() {
  const all = Object.values(priceCache);
  if (all.length === 0) return null;
  return all.reduce((latest, s) => {
    if (!s.updatedAt) return latest;
    const t = s.updatedAt.toMillis ? s.updatedAt.toMillis() : 0;
    return t > latest ? t : latest;
  }, 0);
}
