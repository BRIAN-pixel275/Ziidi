import { watchAuthState, signIn, signUp, signOut, resetPassword } from "./auth.js";
import { watchInvestments, addInvestment, deleteInvestment } from "./portfolio.js";
import { watchPrices, requestPriceRefresh } from "./prices.js";
import {
  showAlert,
  switchTab,
  renderPortfolio,
  renderInvestmentHistory,
  renderPriceBrowser,
  populateStockSelect
} from "./ui.js";

let unsubInvestments = null;
let unsubPrices = null;
let currentUid = null;

window.switchTab = switchTab;

function showApp(user) {
  currentUid = user.id;
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("userEmailLabel").textContent = user.email;

  unsubPrices = watchPrices(() => {
    populateStockSelect();
    renderPortfolio();
    renderPriceBrowser(document.getElementById("tickerSearch").value);
  });

  unsubInvestments = watchInvestments(currentUid, () => {
    renderPortfolio();
    renderInvestmentHistory();
  });
}

function showAuthScreen() {
  currentUid = null;
  if (unsubInvestments) unsubInvestments();
  if (unsubPrices) unsubPrices();
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("appScreen").style.display = "none";
}

watchAuthState((user) => {
  if (user) showApp(user);
  else showAuthScreen();
});

// --- Auth form wiring ---

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signIn(email, password);
  } catch (err) {
    showAuthError(err);
  }
});

document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  try {
    await signUp(email, password);
    document.getElementById("authError").style.color = "var(--success)";
    document.getElementById("authError").textContent =
      "Account created. Check your email if confirmation is required, then log in.";
  } catch (err) {
    showAuthError(err);
  }
});

document.getElementById("showSignup").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("loginPanel").style.display = "none";
  document.getElementById("signupPanel").style.display = "block";
});

document.getElementById("showLogin").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("signupPanel").style.display = "none";
  document.getElementById("loginPanel").style.display = "block";
});

document.getElementById("forgotPassword").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) {
    document.getElementById("authError").textContent = "Enter your email above first.";
    return;
  }
  try {
    await resetPassword(email);
    document.getElementById("authError").style.color = "var(--success)";
    document.getElementById("authError").textContent = "Password reset email sent.";
  } catch (err) {
    showAuthError(err);
  }
});

function showAuthError(err) {
  const box = document.getElementById("authError");
  box.style.color = "var(--danger)";
  box.textContent = friendlyAuthError(err.message) || err.message;
}

function friendlyAuthError(message) {
  const map = {
    "User already registered": "That email is already registered — try logging in instead.",
    "Invalid login credentials": "Incorrect email or password.",
    "Password should be at least 6 characters": "Password should be at least 6 characters.",
    "Unable to validate email address: invalid format": "That email address looks invalid."
  };
  return map[message];
}

document.getElementById("logoutBtn").addEventListener("click", () => signOut());

// --- App form wiring ---

document.getElementById("addInvestmentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const stock = document.getElementById("stock").value;
  const amount = parseFloat(document.getElementById("investmentAmount").value);
  const price = parseFloat(document.getElementById("sharePrice").value);
  try {
    const shares = await addInvestment(currentUid, { stock, amount, price });
    document.getElementById("addInvestmentForm").reset();
    showAlert(`Added ${shares.toFixed(4)} shares of ${stock}`, "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete-id]");
  if (!btn) return;
  if (!confirm("Are you sure you want to delete this investment? This cannot be undone.")) return;
  try {
    await deleteInvestment(currentUid, btn.dataset.deleteId);
    showAlert("Investment deleted", "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
});

document.getElementById("tickerSearch").addEventListener("input", (e) => {
  renderPriceBrowser(e.target.value);
});

document.getElementById("refreshPricesBtn").addEventListener("click", async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = "Refreshing...";
  try {
    await requestPriceRefresh();
    showAlert("Prices refreshed", "success");
  } catch (err) {
    showAlert(err.message || "Could not refresh prices right now", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Refresh Now";
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
