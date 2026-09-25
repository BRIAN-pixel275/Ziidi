import { supabase } from "./supabase-client.js";

let priceCache = {}; // { TICKER: { ticker, name, price, change, volume, updated_at } }
let listeners = [];
let channel = null;

export function watchPrices(onUpdate) {
  listeners.push(onUpdate);

  // Initial load
  supabase
    .from("stock_prices")
    .select("*")
    .order("ticker")
    .then(({ data, error }) => {
      if (error) {
        console.error("Failed to load stock prices", error);
        return;
      }
      priceCache = Object.fromEntries((data || []).map((row) => [row.ticker, row]));
      listeners.forEach((fn) => fn(priceCache));
    });

  // Realtime updates as the scraper writes new prices
  channel = supabase
    .channel("stock_prices-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "stock_prices" }, (payload) => {
      if (payload.eventType === "DELETE") {
        delete priceCache[payload.old.ticker];
      } else {
        priceCache[payload.new.ticker] = payload.new;
      }
      listeners.forEach((fn) => fn(priceCache));
    })
    .subscribe();

  return () => {
    if (channel) supabase.removeChannel(channel);
  };
}

export function getPriceCache() {
  return priceCache;
}

export function getPrice(ticker) {
  return priceCache[ticker] ? Number(priceCache[ticker].price) : 0;
}

export function searchTickers(term) {
  const t = term.trim().toUpperCase();
  if (!t) return Object.values(priceCache).slice(0, 20);
  return Object.values(priceCache).filter(
    (s) => s.ticker.includes(t) || (s.name || "").toUpperCase().includes(t)
  );
}

export async function requestPriceRefresh() {
  const { data, error } = await supabase.functions.invoke("scrape-nse-prices");
  if (error) {
    // supabase-js wraps non-2xx responses in a FunctionsHttpError; try to
    // surface the server's own message (e.g. the 5-minute throttle notice).
    const message = (await error.context?.json?.().catch(() => null))?.error;
    throw new Error(message || error.message || "Could not refresh prices right now");
  }
  return data;
}

export function mostRecentUpdate() {
  const all = Object.values(priceCache);
  if (all.length === 0) return null;
  return all.reduce((latest, s) => {
    const t = s.updated_at ? new Date(s.updated_at).getTime() : 0;
    return t > latest ? t : latest;
  }, 0);
}
