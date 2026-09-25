import { getPortfolioSummary, getInvestments } from "./portfolio.js";
import { getPriceCache, mostRecentUpdate, searchTickers } from "./prices.js";

let chart = null;

export function showAlert(message, type = "success") {
  const alertBox = document.getElementById("alertBox");
  alertBox.className = `alert show alert-${type}`;
  alertBox.textContent = message;
  setTimeout(() => alertBox.classList.remove("show"), 4000);
}

export function switchTab(event, tabName) {
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(tabName).classList.add("active");
  event.target.classList.add("active");

  if (tabName === "portfolio") renderPortfolio();
  else if (tabName === "add-investment") renderInvestmentHistory();
  else if (tabName === "prices") renderPriceBrowser();
}

export function renderPortfolio() {
  const summary = getPortfolioSummary();

  document.getElementById("statsGrid").innerHTML = `
    <div class="stat-card">
      <h4>Total Invested</h4>
      <div class="stat-value">KES <span class="number">${summary.totalInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    </div>
    <div class="stat-card">
      <h4>Current Value</h4>
      <div class="stat-value">KES <span class="number">${summary.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    </div>
    <div class="stat-card ${summary.totalGainLoss < 0 ? "negative" : ""}">
      <h4>Total Gain/Loss</h4>
      <div class="stat-value ${summary.totalGainLoss >= 0 ? "positive" : "negative"}">
        KES <span class="number">${summary.totalGainLoss >= 0 ? "+" : ""}${summary.totalGainLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
    <div class="stat-card ${summary.totalReturnPercent < 0 ? "negative" : ""}">
      <h4>Overall Return</h4>
      <div class="stat-value ${summary.totalReturnPercent >= 0 ? "positive" : "negative"}">
        ${summary.totalReturnPercent >= 0 ? "+" : ""}${summary.totalReturnPercent}%
      </div>
    </div>
  `;

  const holdingsBody = document.getElementById("holdingsBody");
  holdingsBody.innerHTML = "";
  if (Object.keys(summary.holdings).length === 0) {
    holdingsBody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:60px 20px;">No holdings yet. Add your first investment to get started!</td></tr>';
  } else {
    for (const stock in summary.holdings) {
      const h = summary.holdings[stock];
      const cls = h.gainLoss >= 0 ? "positive" : "negative";
      holdingsBody.innerHTML += `
        <tr>
          <td><strong>${stock}</strong></td>
          <td data-label="Shares"><span class="number">${h.shares.toFixed(4)}</span></td>
          <td data-label="Avg Cost (KES)"><span class="number">KES ${h.averageCost.toFixed(2)}</span></td>
          <td data-label="Current Price (KES)"><span class="number">KES ${h.currentPrice.toFixed(2)}</span></td>
          <td data-label="Position Value (KES)"><span class="number">KES ${h.currentValue.toFixed(2)}</span></td>
          <td data-label="Total Invested (KES)"><span class="number">KES ${h.totalInvested.toFixed(2)}</span></td>
          <td data-label="Gain/Loss"><span class="${cls} number">KES ${h.gainLoss >= 0 ? "+" : ""}${h.gainLoss.toFixed(2)}</span></td>
          <td data-label="Return %"><span class="${cls} number">${h.returnPercent >= 0 ? "+" : ""}${h.returnPercent}%</span></td>
        </tr>`;
    }
  }

  renderTransactions();
  renderPortfolioChart(summary.holdings);
  renderLastUpdated();
}

function renderTransactions() {
  const investments = getInvestments();
  const body = document.getElementById("transactionsBody");
  body.innerHTML = "";
  if (investments.length === 0) {
    body.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:40px 20px;">No transactions yet</td></tr>';
    return;
  }
  investments.forEach((inv) => {
    body.innerHTML += `
      <tr>
        <td>${inv.date}</td>
        <td data-label="Stock"><strong>${inv.stock}</strong></td>
        <td data-label="Type"><span class="badge badge-success">BUY</span></td>
        <td data-label="Amount (KES)"><span class="number">KES ${inv.amount.toFixed(2)}</span></td>
        <td data-label="Shares"><span class="number">${inv.shares.toFixed(4)}</span></td>
        <td data-label="Price/Share (KES)"><span class="number">KES ${inv.price.toFixed(2)}</span></td>
        <td data-label="Action"><button class="btn-danger" data-delete-id="${inv.id}">Delete</button></td>
      </tr>`;
  });
}

export function renderInvestmentHistory() {
  const investments = getInvestments();
  const body = document.getElementById("investmentHistoryBody");
  body.innerHTML = "";
  if (investments.length === 0) {
    body.innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:60px 20px;">No investments yet. Add your first investment above!</td></tr>';
    return;
  }
  investments.forEach((inv) => {
    body.innerHTML += `
      <tr>
        <td>${inv.date}</td>
        <td><strong>${inv.stock}</strong></td>
        <td><span class="number">KES ${inv.amount.toFixed(2)}</span></td>
        <td><span class="number">${inv.shares.toFixed(4)}</span></td>
        <td><span class="number">KES ${inv.price.toFixed(2)}</span></td>
        <td><button class="btn-danger" data-delete-id="${inv.id}">Delete</button></td>
      </tr>`;
  });
}

function renderPortfolioChart(holdings) {
  const stocks = Object.keys(holdings);
  const values = Object.values(holdings).map((h) => h.currentValue);
  const container = document.getElementById("chartContainer");

  if (stocks.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  const ctx = document.getElementById("portfolioChart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: stocks,
      datasets: [
        {
          data: values,
          backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"],
          borderColor: "#fff",
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { font: { size: 13, weight: "600" }, padding: 20, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return `KES ${value.toFixed(2)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderLastUpdated() {
  const ts = mostRecentUpdate();
  const text = ts
    ? `Prices last refreshed ${new Date(ts).toLocaleString("en-GB")}`
    : "Prices have not loaded yet";
  ["pricesUpdatedNote", "pricesUpdatedNoteTab"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

// --- Live price browser / ticker search (Prices tab) ---

export function renderPriceBrowser(term = "") {
  const grid = document.getElementById("priceGrid");
  const results = searchTickers(term);
  grid.innerHTML = "";
  if (results.length === 0) {
    grid.innerHTML = '<p style="padding:20px;">No matching tickers.</p>';
    return;
  }
  results.forEach((s) => {
    const changeClass = (s.change || 0) >= 0 ? "positive" : "negative";
    grid.innerHTML += `
      <div class="price-item">
        <label>${s.ticker} <span style="font-weight:400;color:var(--text-secondary);">${s.name || ""}</span></label>
        <div class="stat-value" style="font-size:16px;">KES ${Number(s.price || 0).toFixed(2)}
          <span class="${changeClass} number" style="font-size:12px;">${s.change >= 0 ? "+" : ""}${s.change ?? 0}</span>
        </div>
      </div>`;
  });
  renderLastUpdated();
}

// Populates the ticker <select> used on the Add Investment tab from live data
export function populateStockSelect() {
  const select = document.getElementById("stock");
  const current = select.value;
  const all = searchTickers("").sort((a, b) => a.ticker.localeCompare(b.ticker));
  select.innerHTML = '<option value="">Select a stock</option>' +
    all.map((s) => `<option value="${s.ticker}">${s.ticker} — ${s.name || ""}</option>`).join("");
  if (current) select.value = current;
}
