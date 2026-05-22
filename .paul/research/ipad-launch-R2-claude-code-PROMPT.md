# R2 — Claude Code (Playwright) autonomous system-stress PROMPT

Paste into a fresh Claude Code session (cwd = a sheet-music-app checkout with
`node_modules` — use `sheet-music-app-auditor-validation/` which has the complete install,
or `npm ci`). Runs fully autonomously, no humans. Tier-0 READ-ONLY of production data;
all writes are `test-*` isolated. Read `ipad-launch-R2-STRATEGY.md` first.

## Secrets you must be given (do NOT hardcode)
- `CRL_MCP_TOKEN` — an **admin** MCP bearer (`crl_live_…`). Used to (a) mint 6 test
  sessions via the mint-on-behalf path, (b) drive monitor read tools, (c) run P0-B2.
- Firebase Web SDK config is public (`NEXT_PUBLIC_FIREBASE_*` from `.env.local`).
- Base URL: `https://www.centralreform.live`.

## HARD safety (abort if violated)
- Real setlists/charts/library = READ-ONLY. Every write uses a `test-*` fixture with
  `uidPrefix=r2cc<timestamp>`. Clean up with `cleanup_all_test_data({prefix:"r2cc<...>"})`.
- Live monitor desk: P0-B2 oracle ONLY, and tonight/tomorrow it must be `--dry-run`
  (service-time guard is ON; never set `PROBE_ALLOW_SERVICE_WINDOW=1`).
- webkit engine @ 820×1180 for every browser context.

---

## §A. Real-setlist data-soundness audit (regression oracle — re-run anytime)

Confirms tonight's + tomorrow's real setlists have every bound chart fetchable. This is
non-destructive (GET, public charts). Tonight=`226309e2-78b7-48af-aa21-6aaf606b4fbe`,
Tomorrow=`UnjLqKTtS4lNKQfMY6hB`. For each setlist: read its `tracks` (top-level collection,
`where setlistId == <id>`) via Firebase admin OR the MCP `get_setlist`, collect every
track `fileId`, and:

```bash
for fid in <fileIds...>; do
  curl -sS -m 30 -o /dev/null -D - \
    -H "Sec-Fetch-Site: same-origin" \
    -w "HTTP %{http_code}  %{content_type}  %{size_download}B\n" \
    "https://www.centralreform.live/api/drive/file/$fid" | grep -iE "^HTTP|x-served-from"
done
```

**FAIL (launch-blocking) = any 404** (bytes missing) **or 502** (upstream). 401 = chart OK
(present, probe untrusted). 200 = served. Also assert: each track's `fileId` resolves in
`library_index` with `status != orphaned` (or status absent for legacy Drive rows), and
`mimeType` ∈ {application/pdf, application/vnd.recordare.musicxml+xml, text/xml} — flag any
`audio/*` or `octet-stream` bound to a non-audio track (the Adon Olam F-1 class). Baseline
(2026-05-22): 18/18 → 200 firebase-storage; F-1 Adon Olam=audio/mpeg (known).

---

## §B. 6-session webkit concurrency / cross-talk run

1. **Fixtures (MCP, via `CRL_MCP_TOKEN`):**
   - `create_test_account({role:"band_leader", uidPrefix:"r2cc<ts>", label:"r2-lead"})`
   - 5× `create_test_account({role:"musician", uidPrefix:"r2cc<ts>", label:"r2-m<n>"})`
   - Create ONE test setlist owned by the lead (MCP write tool / `clone_setlist` from a
     template; ensure `isTest:true`), with ~10 tracks, ≥3 binding real public chart fileIds
     (reuse tonight's verified ids — read-only reuse of bytes is fine).
   - Assign each musician a DISTINCT monitor bus via a TEST config (or run monitor stress
     against a mock `monitor-live/state` fixture — do NOT touch `config/monitor` prod).

2. **Sessions:** for each of the 6 uids, `mintSession({baseUrl, bearer:CRL_MCP_TOKEN,
   uid, firebaseAuth})` (admin mint-on-behalf) inside its own webkit context (820×1180).
   Confirm `webSdkSignedIn === true` so `onSnapshot` is live.

3. **Concurrent workload (≥60s):** all 6 open `/perform/setlist/<testId>`; page/transpose/
   annotate; each drags ITS bus fader repeatedly; the lead reorders + edits the setlist
   mid-run.

4. **Oracles (any TRUE ⇒ FAIL, report to inbox/supervisor.md):**
   - fader bleed: session A reads a value equal to B's last write to B's bus.
   - confirm-against-wrong-session: P3-A confirmation machine confirms off another
     session's snapshotSeq.
   - annotation/transpose from A visible in B (per-client state must stay local).
   - post-settle divergence: 6 sessions + a fresh 7th read disagree on track order/keys/version.
   - any console error / unhandled rejection.
   - resilience: toggle `context.setOffline(true/false)` mid-run on 3 sessions; visibility
     hidden→visible; assert catch-up, no dup rows, no crash.

5. **Auth edge under load:** a musician session calling `get_mix`/`set_bus_fader` on a bus
   it does NOT own must 403 / `forbidden_role` / `monitor_no_bus_assigned` — assert it holds
   while all 6 hammer concurrently.

6. **Teardown:** `cleanup_all_test_data({prefix:"r2cc<ts>"})`; verify the test setlist +
   accounts are gone; confirm NO real setlist/chart/library row changed.

---

## §C. Live-monitor P0-B2 oracle (DRY tonight/tomorrow)

```bash
CRL_MCP_TOKEN=<bearer> node scripts/monitor-live-probe.mjs --dry-run
```
Reports desk liveness + bus snapshot with ZERO writes. (Non-service window + a real
restore value are required for any actual write tier — do NOT enable during services.)
Expected post-Phase-1: control path live + readback reflects (FULLY GREEN) on a non-dry
run in a safe window; dry run just confirms the desk is reachable + state is fresh.

---

## Deliverable
A short PASS/FAIL report appended to `.coord/inbox/supervisor.md` (signed `from <id>`):
§A chart table, §B oracle results + any cross-talk, §C desk reachability. Any §A 404 or §B
cross-talk ⇒ headline it as launch-blocking.
