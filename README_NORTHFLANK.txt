BITCOIN HERO v24 — NORTHFLANK DEPLOYMENT

Package contents:
- server.py: authenticated Python backend, 3-second server-side price collector, SQLite records/history, analytics and API proxy routes.
- tracker.html: single-page dashboard with Market, Market Intelligence, Opportunity Scanner and Leaderboards tabs.
- Dockerfile / requirements.txt: container deployment files.

Deploy:
1. Replace the application files with this package and deploy the Dockerfile.
2. Attach the existing persistent volume at /data. Do not detach or delete the existing volume.
3. Preserve TRACKER_USERNAME and TRACKER_PASSWORD environment variables.
4. Set PORT=8000 and DATA_DIR=/data (the Dockerfile defaults these).
5. Keep the existing Northflank service URL and HTTPS configuration.

v23 features:
- Main Market page: eight coin cards, independent LIVE/5M/15M/1H/1 DAY/ALL TIME chart controls, live activity, market alerts and market history.
- Market Intelligence page: 5m/15m/1h/24h changes, trend, volatility, 0-100 score, high/low distance and proportional treemap heatmap.
- Opportunity Scanner page: score-ranked candidates and proximity-to-high breakout watch.
- Leaderboards page: Monthly and All Time subtabs.
- Player profiles opened from activity/leaderboards; profile statistics, history and achievements render when supplied by the player API.
- Player avatar proxy uses player ID and the supplied avatar endpoint; initials are fallback.

External API routes are proxied server-side:
  /api/activity
  /api/leaderboard?period=month|all
  /api/player?username=...
  /api/avatar/{playerid}

Important:
- Existing SQLite data is stored in /data/bitcoin_hero.sqlite3. Keep the same persistent /data volume to preserve high/low records and stored price history.
- Analytics use available stored price observations. Short-period changes and volatility become more meaningful as observations accumulate.
- External API payload structures may vary. The frontend supports common array/object field shapes, but confirm activity, leaderboard and player fields against the live API after deployment.
- This ZIP is not deployed automatically.


V24 PLAYER PROFILE FIX
- Public player profiles treat the public API's `achievements` array as the earned achievements list.
- Displays the returned earned count against `achievementsTotal` (for example, Tacopilot: 13/16).
- Shows the complete 16-achievement catalog; missing entries are shown as locked.
- Uses the public profile's actual `level` object, `curve`, `recent`, `closed`, `wins`, `trades`, `best`, `month`, `netWorth`, `startCash`, `rank`, and `createdAt` fields.
- Does not call the authenticated /api/users/{id}/achievements endpoint for public profiles.
- Does not invent unlock dates.


V24 GRAPH RESTORATION
- Restores the individual price graph and timeframe controls inside every coin card (BTC, ETH, SOL, DOGE, XRP, ADA, LINK and AVAX).
- Each coin has independent LIVE (rolling 5-minute), 5M, 15M, 1H, 1 DAY and ALL TIME selections.
- Graph history refreshes alongside the 3-second live dashboard poll; changing one coin's timeframe does not change another coin's selection.
- Backend history supports the 5M and 15M range parameters. ALL TIME reads retained hourly candles from the existing SQLite database.

UI layout correction: all eight coin cards display compact individual charts and their own LIVE, 5M, 15M, 1H, 1 DAY and ALL TIME controls. Selecting a coin no longer expands its chart or hides the other cards' controls.


V25 changes:
- Coin card positions are fixed BTC, ETH, SOL, DOGE, XRP, ADA, LINK, AVAX.
- Every card has the same compact graph layout and independent LIVE/5M/15M/1H/1 DAY/ALL TIME selection.
- Removed the Market History dashboard panel (historical SQLite price and extrema records are preserved).
- Added spacing above Live Activity and Market Alerts.
- Added Trade Opportunity Assistant: all eight coins ranked with conservative WAIT / UP SETUP / DOWN SETUP analysis, price-based levels, risk/reward and reasons. It uses observed stored prices; insufficient data produces WAIT. Not investment advice, not automatic trading.
- Added authenticated GET /api/trade-assistant.
- No database schema changes or data deletion. Keep the existing persistent /data volume.


V26 changes:
- Removed Trade Opportunity Assistant from the dashboard.
- Removed Market Intelligence and Opportunity Scanner navigation/pages and their associated backend analysis endpoints.
- Live Activity and Market Alerts panels are swapped: Market Alerts left, Live Activity right.
- Live Activity uses the matching colored coin-card glyph and no longer shows the redundant trade metadata line.
- Market Alerts use the matching colored coin-card glyph instead of ticker text.
- Leaderboard Monthly and All Time tabs are centred. Both periods render a 1-2-3 podium followed by a descending ranked list.
- Corrected the upstream production API host to https://api.bitcoinhero.me for prices, activity, leaderboards, player profiles and avatars.
- Header tagline removed, connection status reads Connected, and logout is an icon-only button with an accessible label and tooltip.
- Existing persistent SQLite data and schema are retained. Do not delete or recreate /data.
