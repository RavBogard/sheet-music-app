# R2 — Cowork autonomous system-stress PROMPT

For a Claude Cowork instance. **Reality check ([[feedback_cowork_real_harness]]):** Cowork
is ~75 min single-thread, NOT a walk-away. **CFC + chrome.debugger DOES NOT WORK** — the
path is the **in-sandbox Playwright harness** (webkit). `/api/auth/test-session` gives a
session cookie; you MUST also `signInWithCustomToken` to wake Web SDK listeners. Mount
`sheet-music-app-mcp/` (or any checkout with `node_modules`) at session start. Scope is
time-boxed: do §A fully (cheap, high value) then as much of §B as 75 min allows.

## Given (do NOT hardcode)
- `CRL_MCP_TOKEN` (admin bearer), base `https://www.centralreform.live`, public
  `NEXT_PUBLIC_FIREBASE_*`. Run `uidPrefix=r2cw<ts>`; clean up at the end.

## HARD safety
- Real setlists/charts = READ-ONLY (GET only). All writes are `test-*` (`uidPrefix`).
- NO live monitor-desk writes (service-time guard ON tonight/tomorrow). Read tools +
  `--dry-run` P0-B2 only. webkit @ 820×1180.

---

## §A (do first — ~10 min) Real-setlist data soundness
Enumerate both real setlists' tracks and fetch-probe every bound chart. Non-destructive.
- Tonight `226309e2-78b7-48af-aa21-6aaf606b4fbe` · Tomorrow `UnjLqKTtS4lNKQfMY6hB`.
- For every track `fileId`: `curl -H 'Sec-Fetch-Site: same-origin'
  https://www.centralreform.live/api/drive/file/<fileId>` → assert **200** (404=missing=
  LAUNCH-BLOCKING; 401=OK-but-untrusted; 200=served). Flag any `audio/*`/`octet-stream`
  bound to a non-audio track. Baseline 2026-05-22: 18/18 → 200; Adon Olam=audio/mpeg (F-1, known).
- Report the table + any new 404 IMMEDIATELY.

## §B (remaining time) 2–3 session concurrency / cross-talk
In-sandbox webkit, 820×1180. Mint 2–3 sessions:
`mintSession({baseUrl, bearer:CRL_MCP_TOKEN, uid:test-r2cw<ts>-musician-…, firebaseAuth})`
(admin mint-on-behalf; confirm `webSdkSignedIn:true`). Create ONE test setlist (`isTest:true`)
via MCP, ~8 tracks, ≥2 binding verified public chart ids. Run concurrently for ~3–5 min:
- both/all open `/perform/setlist/<testId>`; one edits/reorders while the other(s) view.
- **Oracles (FAIL):** an edit/annotation/transpose from session A leaking into B;
  post-settle divergence between sessions + a fresh read; any console error; a fader/optimistic
  write confirmed against the wrong session's snapshot (P3-A machine).
- resilience (if time): toggle offline→online on one session; assert catch-up, no dup rows.
- monitor (safe): `list_monitor_buses`/`get_mix` reads under the concurrent sessions; assert
  a musician can't read another's bus (403). Heavy fader stress → mock `monitor-live/state`
  fixture only, never prod `config/monitor`.

## §C (optional, ~1 min) `node scripts/monitor-live-probe.mjs --dry-run` — desk reachability, zero writes.

## Teardown + report
`cleanup_all_test_data({prefix:"r2cw<ts>"})`; verify fixtures gone + NO real data changed.
Append a PASS/FAIL summary (§A table, §B cross-talk results) to the cowork HANDOFF +
`.coord/inbox/supervisor.md`. Any §A 404 or §B cross-talk = launch-blocking headline.
