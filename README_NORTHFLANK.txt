BITCOIN HERO TRACKER v22 — NORTHFLANK DEPLOYMENT

Contents
- server.py: authenticated Python HTTP server, 3-second server-side price collector, SQLite persistence, analytics and API proxy routes.
- tracker.html: v22 dashboard with all eight coins, market analytics, heatmap, scanner, live activity, monthly/all-time leaderboards and player profiles.
- Dockerfile / requirements.txt: container deployment files.

Deploy
1. Create/update the Northflank service from this ZIP or its repository.
2. Expose HTTP port 8000.
3. Attach a persistent volume mounted at /data. Do not remove or replace the existing volume: it contains bitcoin_hero.sqlite3 and protected historical records.
4. Set TRACKER_USERNAME and TRACKER_PASSWORD to your login credentials.
5. Optional: set BITCOIN_HERO_API to the price endpoint (default https://bitcoinhero.me/api/prices).
6. Optional: set BITCOIN_HERO_API_ROOT (default https://bitcoinhero.me/api) if the public API root changes.
7. Deploy and sign in.

New authenticated endpoints
- GET /api/analytics — 5m, 15m, 1h and 24h returns, trend, rolling volatility, reversal heuristic, distance from protected records and 0–100 heuristic score.
- GET /api/activity — proxies /api/activity.
- GET /api/leaderboard/month — proxies /api/leaderboard?period=month.
- GET /api/leaderboard/all — proxies /api/leaderboard?period=all.
- GET /api/players/{username} — proxies the URL-encoded player name.

Data safety
- Existing SQLite tables and records are retained; the server adds no destructive migration.
- Protected historical lows/highs continue to be updated only by the existing collector and CSV merge rules. Analytics are calculated separately from raw price observations.
- Server-side polling continues when the browser is closed, provided the Northflank service remains running.
- Keep the /data persistent volume attached across redeployments.

Notes
- Leaderboard/activity/profile JSON is rendered defensively across common response shapes. If the upstream API uses different field names or nested shapes, the layout may need a small mapping adjustment after inspecting live responses.
- Signal score, trend, reversal and opportunity scanner are heuristic indicators, not financial advice or trading instructions.
- This build restores the supplied server.py backend alongside the uploaded v21 ZIP, whose archive did not contain server.py even though its Dockerfile required it.
