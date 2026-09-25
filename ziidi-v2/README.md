# Ziidi Investment Tracker v2 — Cloud Edition

This is a rebuild of Ziidi with:

- **Login/signup** (Firebase Authentication) — each user has their own private portfolio
- **Cloud storage** (Firestore) instead of `localStorage` — your data follows you across devices/browsers
- **Live-ish NSE prices** for all ~65 listed NSE tickers, refreshed automatically a few times a day by a scheduled Cloud Function that scrapes a public price page, plus a manual "Refresh Now" button
- **Dynamic ticker search** in the Add Investment and Live Prices tabs — no longer hardcoded to 3 stocks
- Restructured into separate files: `index.html`, `css/styles.css`, and `js/{firebase-config,auth,portfolio,prices,ui,app}.js`, plus a `functions/` folder for the backend scraper

## Project layout

```
ziidi-v2/
  public/                 <- deployed as the website (Firebase Hosting)
    index.html
    manifest.json
    sw.js
    css/styles.css
    js/
      firebase-config.js  <- put your Firebase project keys here
      auth.js
      portfolio.js
      prices.js
      ui.js
      app.js
  functions/               <- Cloud Functions (the scraper + refresh endpoint)
    index.js
    package.json
  firestore.rules
  firebase.json
```

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → create a database (start in production mode — the rules file below locks it down properly).
4. **Project Settings** → General → "Your apps" → add a **Web app**. Copy the `firebaseConfig` object it gives you.
5. Upgrade the project to the **Blaze (pay-as-you-go) plan**. This is required for Cloud Functions that make outbound network calls (the scraper) and for scheduled functions. For a personal app scraping a page 4x/day, you should stay comfortably within the free-tier usage included in Blaze — but Google requires the plan to be enabled either way.

## 2. Configure the frontend

Open `public/js/firebase-config.js` and replace the placeholder values with the `firebaseConfig` object from step 1.4 above.

## 3. Install the Firebase CLI and log in

```bash
npm install -g firebase-tools
c
```

From inside the `ziidi-v2` folder:

```bash
firebase use --add
# select the project you created, give it an alias like "default"
```

## 4. Install Cloud Functions dependencies

```bash
cd functions
npm install
cd ..
```

## 5. Deploy

```bash
firebase deploy
```

This deploys Hosting (the frontend), Firestore security rules, and the two Cloud Functions:
- `scrapeNsePrices` — runs on a schedule (currently 7am, 9am, 11am, 1pm East Africa Time, weekdays) and writes to the `stockPrices` collection
- `refreshPricesNow` — a callable function the "Refresh Now" button in the app triggers, throttled to once every 5 minutes

After deploying, the CLI prints your live Hosting URL.

## 6. Seed prices immediately (optional)

The scheduled scraper won't run until its next scheduled time. To populate prices right away after your first deploy, either:
- Wait for the next scheduled run, or
- Log into the app and click **"Refresh Now"** on the Live Prices tab — this calls `refreshPricesNow` directly.

## Important notes and limitations

- **Price source**: The scraper reads a free, public NSE price-aggregator page (`afx.kwayisi.org/nse`) since there's no official free NSE Kenya API. This is inherently a bit fragile — if that site changes its HTML structure, `parseNsePrices()` in `functions/index.js` will need updating (it currently throws a loud error and refuses to overwrite good data if it parses fewer than 10 tickers, so you'll notice if it breaks rather than silently corrupting prices).
- **Not real-time**: Prices refresh a few times a day, matching how NSE data realistically updates, not tick-by-tick. Treat this as informational, not a trading feed.
- **Scraping caveat**: Automated scraping of a third-party site sits in a legal/ToS gray area even when the data itself is public. This is fine for personal/portfolio-tracking use; if you ever turn this into a product for other people, look into a licensed market-data provider instead.
- **Security**: Firestore rules (`firestore.rules`) ensure each user can only read/write their own `users/{uid}/investments` — no user can see another user's portfolio. The `stockPrices` collection is read-only from the client; only the Cloud Functions (via the Admin SDK) can write to it.
- **Still no sell transactions**: Like the original, this only tracks buys. Average cost accounting for partial sells is a good next feature to add if you want to keep iterating.

## Local testing before deploying

You can run the frontend locally against your real Firebase project (no separate local backend needed, since Auth/Firestore/Functions all just talk to the cloud):

```bash
cd public
python -m http.server 8000
```

Then visit `http://localhost:8000`. You can also use the Firebase Emulator Suite (`firebase emulators:start`) if you want to test without touching production data.
