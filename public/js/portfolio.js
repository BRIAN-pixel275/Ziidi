import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getPriceCache } from "./prices.js";

let investments = [];
let listeners = [];

function investmentsRef(uid) {
  return collection(db, "users", uid, "investments");
}

export function watchInvestments(uid, onUpdate) {
  listeners.push(onUpdate);
  const q = query(investmentsRef(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    investments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    listeners.forEach((fn) => fn(investments));
  });
}

export function getInvestments() {
  return investments;
}

export async function addInvestment(uid, { stock, amount, price }) {
  if (!stock || !amount || !price || amount <= 0 || price <= 0) {
    throw new Error("Please fill in all fields with valid values");
  }
  const shares = parseFloat((amount / price).toFixed(4));
  await addDoc(investmentsRef(uid), {
    stock,
    amount: parseFloat(amount.toFixed(2)),
    price: parseFloat(price.toFixed(2)),
    shares,
    date: new Date().toLocaleDateString("en-GB"),
    createdAt: serverTimestamp()
  });
  return shares;
}

export async function deleteInvestment(uid, investmentId) {
  await deleteDoc(doc(db, "users", uid, "investments", investmentId));
}

// Same aggregation logic as the original app, but priced from live Firestore data
export function getPortfolioSummary() {
  const prices = getPriceCache();
  let totalInvested = 0;
  let totalValue = 0;
  const holdings = {};

  investments.forEach((inv) => {
    totalInvested += inv.amount;
    if (!holdings[inv.stock]) {
      holdings[inv.stock] = { shares: 0, totalInvested: 0, transactions: [] };
    }
    holdings[inv.stock].shares += inv.shares;
    holdings[inv.stock].totalInvested += inv.amount;
    holdings[inv.stock].transactions.push(inv);
  });

  for (const stock in holdings) {
    const currentPrice = prices[stock] ? prices[stock].price : 0;
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
