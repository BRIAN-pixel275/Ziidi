import { supabase } from "./supabase-client.js";
import { getPriceCache } from "./prices.js";

let investments = [];
let listeners = [];
let channel = null;

export function watchInvestments(uid, onUpdate) {
  listeners.push(onUpdate);

  supabase
    .from("investments")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .then(({ data, error }) => {
      if (error) {
        console.error("Failed to load investments", error);
        return;
      }
      investments = data || [];
      listeners.forEach((fn) => fn(investments));
    });

  channel = supabase
    .channel(`investments-${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "investments", filter: `user_id=eq.${uid}` },
      () => {
        // Simplest correct approach: re-fetch on any change for this user
        supabase
          .from("investments")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            investments = data || [];
            listeners.forEach((fn) => fn(investments));
          });
      }
    )
    .subscribe();

  return () => {
    if (channel) supabase.removeChannel(channel);
  };
}

export function getInvestments() {
  return investments;
}

export async function addInvestment(uid, { stock, amount, price }) {
  if (!stock || !amount || !price || amount <= 0 || price <= 0) {
    throw new Error("Please fill in all fields with valid values");
  }
  const shares = parseFloat((amount / price).toFixed(4));
  const { error } = await supabase.from("investments").insert({
    user_id: uid,
    stock,
    amount: parseFloat(amount.toFixed(2)),
    price: parseFloat(price.toFixed(2)),
    shares,
    txn_date: new Date().toISOString().slice(0, 10)
  });
  if (error) throw error;
  return shares;
}

export async function deleteInvestment(uid, investmentId) {
  const { error } = await supabase.from("investments").delete().eq("id", investmentId).eq("user_id", uid);
  if (error) throw error;
}

export function getPortfolioSummary() {
  const prices = getPriceCache();
  let totalInvested = 0;
  let totalValue = 0;
  const holdings = {};

  investments.forEach((inv) => {
    const amount = Number(inv.amount);
    const shares = Number(inv.shares);
    totalInvested += amount;
    if (!holdings[inv.stock]) {
      holdings[inv.stock] = { shares: 0, totalInvested: 0, transactions: [] };
    }
    holdings[inv.stock].shares += shares;
    holdings[inv.stock].totalInvested += amount;
    holdings[inv.stock].transactions.push(inv);
  });

  for (const stock in holdings) {
    const currentPrice = prices[stock] ? Number(prices[stock].price) : 0;
    const h = holdings[stock];
    h.currentPrice = currentPrice;
    h.currentValue = h.shares * currentPrice;
    h.averageCost = h.totalInvested / h.shares;
    h.gainLoss = h.currentValue - h.totalInvested;
    h.returnPercent =
      h.totalInvested > 0 ? ((h.gainLoss / h.totalInvested) * 100).toFixed(2) : "0.00";
    totalValue += h.currentValue;
  }

  return {
    totalInvested: parseFloat(totalInvested.toFixed(2)),
    totalValue: parseFloat(totalValue.toFixed(2)),
    totalGainLoss: parseFloat((totalValue - totalInvested).toFixed(2)),
    totalReturnPercent:
      totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested * 100).toFixed(2) : "0.00",
    holdings
  };
}
