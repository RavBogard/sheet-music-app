# Bridge v10.1 Research — RECOMMENDATIONS (FINDINGS)

**Lane:** `bridge-v10.1-research-recommendations` (Tier-0 research; no `src/`/`bridge/` writes)
**Coder:** coder-6
**Date:** 2026-05-26T17:35Z–~19:00Z
**Base SHA:** `29c80956d1` (origin/master tip; coder-5 monitor-popup-fullbottom-redesign)
**Prior FINDINGS:** `.paul/research/bridge-analysis/FINDINGS.md` (this coder's TOP-10 list 2026-05-25)
**Live state snapshot time:** 2026-05-26T17:35–17:40Z (Firebase MCP probes against `config/monitor`, `monitor-live/state`, `monitor-live/bridgeLog`, `config/bridgeHealth`)
**Method:** (a) git ls-tree + diff current `bridge/{src,ui}` against the structure captured in prior FINDINGS' §1 architecture map; (b) commit history walk on `origin/master -- bridge/` since prior FINDINGS (repo unshallowed for accurate ancestry); (c) live Firestore probe of bridge state docs; (d) static cross-check of `src/app/api/cron/admin-consistency/route.ts` + `vercel.json` for the bridge-health-alarm wiring; (e) cross-ref `inbox/coder-1.md`, `inbox/coder-3.md`, and their status files for in-flight v10.0.7-implicit work.

---

## §1 EXECUTIVE SUMMARY

### Headline recommendation

**Don't ship v10.1 yet. Ship v10.0.7 instead, folding the two in-flight bridge-touching lanes (coder-1 `monitor-master-mute-fix` set_bus_on OSC handler + coder-3 `tray-icon-import-deferred-refactor`) into the next signed-installer + GH release. Pair it with one ZERO-bridge-release observability win: change `vercel.json` admin-consistency cron schedule from `0 4 * * *` (daily) to `*/15 * * * *` (every 15min) so the bridge-health-alarm we already shipped actually fires in time to be useful.**

**Confidence:** HIGH on the v10.0.7-over-v10.1 framing; MED on the exact cron cadence (`*/15` vs `*/5` vs split-cron-out). The load-bearing reason is twofold: (i) of my prior TOP-10, **9 of 10 items are already SHIPPED into v10.0.4–v10.0.6 + the in-flight lanes**, so there's no compelling "v10.1 must-have" backlog driving a release; (ii) **the one observability fix that would matter most is a single-line `vercel.json` change** — it doesn't need a bridge release at all, and the freed coder/release capacity is better spent there.

The "DON'T SHIP v10.1 YET" case (§4 below) is the serious candidate, and it wins on the evidence. A v10.0.7 hotfix-bundle is the right next bridge release; v10.1 should wait for either (a) a discovered live regression in v10.0.6 that the band reports, or (b) a meaningful net-new feature with cross-functional value (not just a polish pile).

---

## §2 CURRENT BRIDGE STATE SNAPSHOT

### §2.1 File inventory at `29c80956d1`

`bridge/src/*.ts` — **13 files / 4,203 LOC** (was 9 files / ~3.5k LOC in prior FINDINGS, base SHA `de1d96a34`):

| file                       | LOC | new since prior? |
|----------------------------|-----|------------------|
| `ack-writer.ts`            | 114 | (was there)      |
| `bridge-control.ts`        | 281 | (was there)      |
| `config.ts`                | 314 | (was there)      |
| `firestore-transport.ts`   | 713 | (+12 LOC; B-A4 standby ack added) |
| `get-local-ip.ts`          | 215 | **NEW** — extracted from `index.ts` + virtual-adapter rejection (closes prior R-A5 + T-A4) |
| `index.ts`                 | 479 | (+20 LOC; periodic selftest interval — closes prior F-A2/TOP-10 #4) |
| `main.ts`                  | 621 | (+85 LOC; periodic checkForUpdates + tray-icon-color polling — closes prior R-A1/TOP-10 #6 + F-A3) |
| `remote-log.ts`            | 181 | (was there)      |
| `tray-icon.ts`             | 122 | **NEW** — health-color factory (closes prior F-A3 / TOP-10 Lane #9) |
| `types.ts`                 | 119 | (was there)      |
| `update-panel-state.ts`    | 109 | **NEW** — extracted update-pending state machine (testable) |
| `update-policy.ts`         |  69 | **NEW** — `shouldInstallNow()` extracted (closes prior T-A3) |
| `x32-client.ts`            | 866 | (+4 LOC; virtual-adapter filter in /xinfo discovery) |

`bridge/src/__tests__/*.ts` — **21 files** (was 14): added `get-local-ip.test.ts`, `tray-icon.test.ts`, `update-panel-state.test.ts`, `update-policy.test.ts`, plus refactor of x32-correlation/recovery tests. **+1,000+ LOC test coverage** vs prior FINDINGS baseline.

`bridge/ui/index.html` — **+~80 LOC** added: `#update-pending` banner + "Install & Restart" wiring (closes prior R-A2 + dashboard-update-ui TOP-10 #5).

`bridge/Dockerfile` + `bridge/docker-compose.yml` — **DELETED** (closes prior B-A1 / TOP-10 #2). `bridge/README.md` and `bridge/SETUP_GUIDE.md` rewritten to Electron+Firestore reality, 10-char setup code lie corrected (closes B-A2/B-A3/B-A7/TOP-10 #2+#7).

`bridge/package.json` — version bump v10.0.4 → v10.0.6 (skipped v10.0.5, which accumulated locally but never built — bundled with v10.0.6 release `e091ea4f96`).

### §2.2 Prior TOP-10 status — POPPED vs STILL-OPEN

| # | Recommendation (from prior FINDINGS §2)                          | Status      | Evidence |
|---|------------------------------------------------------------------|-------------|----------|
| 1 | Sentry alarm on `bridgeLog.errCount` jumps via admin-consistency | **SHIPPED** | `src/app/api/cron/admin-consistency/route.ts:73-89,194-201,562-687` `readAndAlertBridgeHealth()` w/ errCount-delta + lastSeen-staleness + x32-disconnect-duration alarms; persists snapshot at `config/bridgeHealth` |
| 2 | Delete Dockerfile/docker-compose + rewrite README                | **SHIPPED** | `2409ed183c` docs(bridge) rewrite; `git ls-tree origin/master bridge/` confirms Dockerfile + docker-compose.yml absent; README 99 lines (was 220+) |
| 3 | Standby-drop pending command ack `rejected:bridge-standby`       | **SHIPPED** | `b5583eb908`; `firestore-transport.ts:293` writes `rejected reason:"bridge-standby"` via ackWriter before clearing queue |
| 4 | Periodic 10-min selftest snapshot                                | **SHIPPED** | `5509c6474c`; `index.ts:70 SELFTEST_CADENCE_MS = 10*60_000`, `:333` setInterval writes `monitor-live/selftest` |
| 5 | Dashboard update UI (Install & Restart panel)                    | **SHIPPED** | `36f4693866`; `bridge/ui/index.html:233-326` `#update-pending` banner + IPC wiring |
| 6 | Periodic `autoUpdater.checkForUpdates()` every 4h                | **SHIPPED** | `b0f2e093fe`; `main.ts:301 PERIODIC_UPDATE_CHECK_MS = 4*60*60_000`, `:434` `periodicUpdateTimer = setInterval(...)`, `shouldInstallNow()` extracted to `update-policy.ts` |
| 7 | Rewrite SETUP_GUIDE (10-char fix + drop manual-Node)             | **SHIPPED** | `2409ed183c`; SETUP_GUIDE.md 91 lines, "10-character code" wording fixed |
| 8 | `/api/cron/bridge-health-alarm` for lastSeen-staleness etc.      | **SHIPPED — but cron cadence is wrong** | Code path present (same `readAndAlertBridgeHealth()` as #1); but `vercel.json` schedules `/api/cron/admin-consistency` daily at `0 4 * * *` — see CRITICAL FINDING below |
| 9 | Bridge MCP enrichment: `bridge_clear_acks` / `bridge_clear_pending_commands` / `bridge_get_log` | **SHIPPED** | Registered in `src/lib/mcp/tools/index.ts:2360,2371,2382` per `2dc4506cf` |
| 10 | Cold-boot fresh-laptop integration test (Playwright/Spectron)   | **STILL OPEN** | No `bridge/test/e2e/` directory exists; no Spectron/Playwright Electron harness wired |

**Score: 9 of 10 SHIPPED, 1 STILL OPEN.** Plus the prior individually-flagged items: R-A5 (getLocalIp virtual-adapter rejection) **SHIPPED** (`get-local-ip.ts` `VIRTUAL_NAME_PATTERNS` + `034c6d82d1` X32 /xinfo discovery filter); T-A3 (shouldInstallNow testable) **SHIPPED** (`update-policy.ts` + tests); F-A3 (tray icon health color) **SHIPPED** (`tray-icon.ts` + `b61e90bfa9`); F-A2 (auto selftest cadence) **SHIPPED** (same as #4).

### §2.3 In-flight at FINDINGS write time

- **coder-1 LIVE — `monitor-master-mute-fix`** (Tier-1 P0 LIVE-SERVICE, ~165 LOC). Mirrors `set_matrix_on` for buses: bridge-side `set_bus_on` OSC handler in `bridge/src/x32-client.ts` (~25 LOC) + matching MCP write tool + firestore.rules 1-line allow + monitor-store consumer updates. **Implicit v10.0.7 candidate** — the bridge-side OSC handler needs a bridge release to deploy to the studio PC.
- **coder-3 DISPATCHED — `tray-icon-import-deferred-refactor`** (Tier-1 P2 NORMAL, ~5–10 LOC). Closes auditor BLOCK-TEARDOWN on v10.0.6 bundle: `bridge/src/tray-icon.ts` `import { nativeImage }` → function-scoped `require("electron")` so root vitest can collect the file (Electron isn't in root `node_modules`). **Also implicit v10.0.7 candidate** for cohort-hygiene if Daniel wants the runtime artifact to match.

These two together = the natural shape of a v10.0.7 hotfix-bundle. **~190 LOC total bridge-side; both lanes already mid-flight; ZERO additional v10.1 scope needed.**

### §2.4 Observability + reliability posture (live snapshot)

| field                                | value at probe time          | interpretation |
|--------------------------------------|------------------------------|----------------|
| `config/monitor.bridge.version`      | `"10.0.6"`                   | v10.0.6 deployed ✓ (matches `e091ea4f96` release) |
| `config/monitor.bridge.x32Connected` | `true`                       | X32 was connected last write |
| `config/monitor.bridge.status`       | `"online"`                   | (stale — see lastSeen) |
| `config/monitor.bridge.lastSeen`     | `2026-05-26T17:04:22.150Z`   | **STALE ~31min** at 17:35Z probe time |
| `config/monitor.bridge.uptimeMs`     | `3781419` (~63min)           | bridge ran ~63min before going silent |
| `config/monitor.bridge.errCount`     | `5`                          | (boot-time noise; filtered by `remote-log.ts` `isStartupNoise()`) |
| `bridgeLease.expiresAt`              | `1779815172211` (17:06:12Z)  | lease expired ~29min ago; no successor took it |
| `monitor-live/state.updatedAt`       | `2026-05-26T17:05:11.715Z`   | state-write also stopped ~30min ago — confirms heartbeat-AND-state-write went silent together (rules out the `[[project_bridge_state_freshness_diagnostic]]` failure mode where heartbeat advances but state freezes) |
| `monitor-live/bridgeLog.updatedAt`   | `2026-05-26T16:01:25.921Z`   | one flush at boot (5 entries), nothing since (subsequent errors filtered as startup-noise or none) |
| `config/bridgeHealth.lastUpdatedAt`  | `2026-05-26T04:00:40.254Z`   | **last cron run was ~13.5h ago** at the 0 4 * * * UTC daily window |

Interpretation: the bridge went quiet at ~17:04Z (heartbeat + state-write + lease-renew all stopped together). Plausible cause = studio PC sleep/shutdown/network-loss (benign); the bridge process exited cleanly enough that no final error log was flushed. There is no evidence of a crash from the data; just silence. **The point isn't the silence — it's that no alarm fired.** See §3 CRITICAL FINDING.

---

## §3 CRITICAL FINDING — observability gap that survives v10.0.6

### What

The bridge-health-alarm code path is **SHIPPED** (`readAndAlertBridgeHealth()` in `src/app/api/cron/admin-consistency/route.ts:607`) and checks all the right things — `lastSeen` staleness > 3min, `errCount` delta > 5, `x32Connected===false` sustained > 5min — but `vercel.json:39-42` schedules `/api/cron/admin-consistency` at **`0 4 * * *` (daily, 04:00 UTC)**, meaning:

- The bridge stalled at 17:04Z today.
- Next cron firing: 04:00Z tomorrow.
- **Mean-time-to-alarm on bridge silence: up to ~24h.**

If the bridge dies mid-Shabbat-morning service (Friday-evening / Saturday-morning per `[[project_shul_cadence]]`), the alarm fires the following Tuesday morning. That is functionally useless for the F-A1 motivation that drove the alarm in the first place.

### Why this is the recommendation-shaping headline

The single highest-leverage v10.1-related fix in the entire bridge-surface is **changing one schedule string in `vercel.json` from `"0 4 * * *"` to `"*/15 * * * *"` (or `"*/5 * * * *"` for hot-band hours)**. It requires:
- ZERO `bridge/src/` changes
- ZERO Electron rebuild
- ZERO GH release
- ZERO Daniel-installer-run

Just a Vercel deploy. **A v10.1 bridge release would not even touch this fix** — it's not in the bridge codebase. So if your gut said "v10.1 should bring more observability," the actual answer is "no, v10.1 doesn't bring it; a one-character vercel.json change does, and we should ship that without a bridge release."

This finding is *new* — it wasn't in the prior FINDINGS' TOP-10 because the cron route didn't exist yet. It only surfaces NOW that #1+#8 have shipped and a live probe shows the alarm latency.

### Caveat — split-cron vs schedule-change

There's a secondary axis: `/api/cron/admin-consistency` is a heavy daily aggregator (PGR-03/PGR-04/storageBackupHealth/library-bytes-health/bridgeHealth). Running it every 15min may cost real money (Firestore reads, function invocations). Two cleaner shapes:

1. **Cheap:** add a new `/api/cron/bridge-health-poll` route that does ONLY the bridge-health check (the lightweight bits: read `config/monitor.bridge` + `monitor-live/bridgeLog`, compare to snapshot, Sentry-alarm if needed), scheduled `*/15 * * * *`. Leave `admin-consistency` daily for the heavy aggregators.
2. **Cheaper:** add a quickly-bailing top-of-route mode flag — if invoked with `?mode=bridge-health-only`, skip the heavy checks. Two cron entries pointed at the same route with different querystrings.

Either is ~50–100 LOC and one new vercel.json cron entry. **Recommended:** shape 1 (cleanest separation of concerns).

---

## §4 CANDIDATE LANES FOR v10.1 (and the anti-list)

### v10.0.7-bundle candidates (already in flight; just need to land + release)

| lane                                          | scope        | LOC est. | risk | value | notes |
|-----------------------------------------------|--------------|----------|------|-------|-------|
| coder-1 `monitor-master-mute-fix` set_bus_on  | bridge OSC + MCP + rules | ~165 (~25 bridge) | LOW-MED | MED | Mirror of `set_matrix_on`. Bridge side is the v10.0.7 driver. |
| coder-3 `tray-icon-import-deferred-refactor`  | bridge tray-icon.ts import | ~10 | LOW | LOW | Cohort-hygiene; closes auditor BLOCK on v10.0.6 bundle. |

### NON-bridge-release v10.1-flavored lanes (no installer needed)

| lane                                          | scope        | LOC est. | risk | value | notes |
|-----------------------------------------------|--------------|----------|------|-------|-------|
| **`bridge-health-cron-cadence-fix`** (NEW)    | `vercel.json` schedule change OR new dedicated route | ~50–100 | LOW | **HIGH** | The §3 headline. Closes the mean-time-to-alarm gap. NO bridge release. |
| (already shipped) `bridgeHealth` route        | n/a — already in `admin-consistency`  | — | — | — | Just needs the cron firing more often. |

### True v10.1-candidate bridge-side lanes (would require an installer)

| lane                                          | scope        | LOC est. | risk | value | notes |
|-----------------------------------------------|--------------|----------|------|-------|-------|
| `bridge-cold-boot-integration-test` (prior TOP-10 #10) | Playwright/Spectron Electron-host e2e test | ~300 | MED | LOW-MED | Multi-day lane. Catches setup-code regressions. Currently no equivalent coverage. NOT a "must-have" — covered today by Daniel's lived experience + the unit-tested `setup-code/route.ts`. **Defer to a separate research lane** that scopes the Electron e2e harness choice (Spectron is unmaintained; @playwright/test-electron is the modern option). |
| `bridge-electron-sentry` (was QUEUE.md P3 backlog) | Wire `@sentry/electron/main` to capture uncaughtException + unhandledRejection + manual `Sentry.captureException` from `RemoteLogger.flush()` failures | ~40–80 | LOW-MED | LOW-MED | We already have `RemoteLogger` → `monitor-live/bridgeLog`. Sentry-electron is duplicate coverage with worse signal-to-noise. **Anti-list: skip unless cron-cadence-fix proves insufficient.** |
| `bridge-lastError-decay` (prior R-A3 unfixed) | Time-decay `bridgeLog.lastError` after N min of no new error | ~10 LOC | LOW | LOW | Marginal value; current errCount-delta alarm already handles the "static lastError masks new errors" case. **Anti-list: skip — already mitigated.** |
| `bridge-cleanupStaleCommands-createTime` (prior B-A5) | Swap iPad-clock-relative `createdAt` for server-relative `createTime` in stale-command sweep | ~5 LOC | LOW | LOW | Marginal; safety-net path only. Skip unless we observe an actual stale-command bug. |
| `bridge-localIp-iface-discovery-coupling` (prior R-A5 follow-up) | Prefer the iface whose subnet contains the discovered X32 IP over the wired-name heuristic | ~30 LOC | MED | LOW | The virtual-adapter rejection already shipped is the load-bearing part. This further-tightening adds risk for low gain (Hyper-V studio PC isn't actually broken today; iPads use Firestore, don't consume `bridge.localIp`). **Anti-list: skip — close to F-A5 territory; just delete bridge.localIp instead.** |
| `bridge-localIp-deprecation` (prior F-A5) | Stop writing `bridge.localIp` (consumer-dead field) OR add `LEGACY:` comment | ~3 LOC | LOW | LOW | Trivial. Bundle with v10.0.7 if it's in the area; otherwise skip. |
| `bridge-mtx-mock-fidelity` (prior T-A5) | Add 3-4 matrix-fidelity assertions to `x32-mock-fidelity.test.ts` | ~30 LOC | LOW | LOW | Test-only. No release impact. Owner: any. **Don't gate v10.1 on this.** |

### Anti-list — features that might *seem* like good v10.1 ideas but I'd argue against

1. **"Add Sentry to the bridge directly"** — we already have `RemoteLogger` → `monitor-live/bridgeLog`. The signal-vs-noise tuning happened in `isStartupNoise()` over multiple iterations. Layering Sentry on top means re-tuning startup-noise filters for a second pipeline. Cost > benefit unless you have a specific signal Sentry catches that bridgeLog doesn't (and the cron-cadence-fix closes the bridge-silence gap that was the strongest pro-Sentry argument).
2. **"Add an in-app `/admin/sound-system` page surfacing bridge health"** (prior Feat-A4) — sounds good in isolation but: (a) `get_bridge_health` MCP tool already serves Daniel's authoring surface; (b) the band iPads don't need this; (c) the cron-cadence-fix delivers proactive alarming, which is strictly stronger than a page Daniel has to check. **Skip.**
3. **"Restore a TINY HTTP /health endpoint for localhost diagnostics"** (prior Feat-A3) — adds attack surface (localhost-only is still a foothold for cross-process attacks if any future bug lets a local process bind a malicious health responder), and nobody-on-the-team uses it today. The Firestore-transport pivot was deliberate. **Skip.**
4. **"Multi-X32 support"** (prior Feat-A2) — CRC has one X32 forever. Zero motivating use case. **Skip — keep on the long-tail pile.**
5. **"Setup-code regen UX polish"** (prior Feat-A5) — setup happens once per device. **Skip.**
6. **"Record X32 firmware version"** (prior Feat-A6) — desk-firmware-specific bugs have never surfaced. **Skip unless one does.**

---

## §5 THE "DON'T SHIP v10.1 YET" CASE — and why it wins

State this case seriously, because it's the one I'm recommending.

### The case for waiting

1. **v10.0.6 just shipped 2 days ago** (2026-05-26 morning, `e091ea4f96`). It rolled v10.0.4 + v10.0.5 accumulator + 3 fresh lanes into one signed installer. The studio PC is on v10.0.6 and `config/monitor.bridge.version: 10.0.6` is confirmed. Three fresh lanes per bundle is already at the upper end of comfortable release-blast-radius.
2. **The band uses the bridge every Friday-evening / Shabbat-morning** per `[[project_shul_cadence]]`. Any regression hits a live-service surface. Conservative posture has direct, named cost.
3. **In-flight master-mute (coder-1) + tray-icon-refactor (coder-3) are BOTH targeting v10.0.7 already.** A v10.0.7 is the obvious next bridge release. v10.1 would be *on top of* v10.0.7 in the bump sequence (semver-wise). What does v10.1 do that v10.0.7 doesn't?
4. **9 of 10 prior TOP-10 items are SHIPPED.** The remaining one (`bridge-cold-boot-integration-test`) is L-effort, multi-day, and has near-zero failure-mode coverage that Daniel's lived experience doesn't already provide. There is no compelling "v10.1 must-have" backlog.
5. **Bridge releases have a real cost.** Daniel has to install at the studio PC (`[[project_bridge_release_build]]` + `[[project_bridge_update_ops]]`); electron-updater pulls to the periodic-update flow on remaining devices; any installer-side regression (cred discovery, lease takeover, X32 reconnect) is hours of debug at the studio.
6. **The single highest-leverage observability win doesn't need v10.1.** Per §3, the cron-cadence-fix is `vercel.json`-only. If we're talking "should we add observability to v10.1," the honest answer is "we already added it; ship the schedule fix and the alarm starts working."

### When v10.1 would make sense

A v10.1 release becomes justified when ONE of these holds:
- Daniel reports an active behavior gap in v10.0.6+v10.0.7 that the band has hit in service (definite signal, not speculation).
- A meaningful net-new feature appears with cross-functional value — e.g. multi-mixer support if CRC ever buys a second X32, or in-band remote-control (band-leader-iPad → bridge → engineer-LED visualisation, hypothetical).
- The cold-boot integration test (prior TOP-10 #10) gets prioritised — but that's a research lane, not a release-driving lane. The test landing doesn't change runtime; it changes confidence.

None of these hold today.

### What we do INSTEAD of v10.1

1. **Land v10.0.7** as the natural cohort of coder-1 + coder-3 in-flights. ~190 LOC bridge-side total. Standard bundle-release flow per `[[project_bridge_release_build]]`.
2. **Ship `bridge-health-cron-cadence-fix`** in the same window. Single Vercel deploy. NO bridge release. ~50–100 LOC if we split out a dedicated `/api/cron/bridge-health-poll` route (recommended).
3. **Sit on v10.1.** Revisit in 2–4 weeks after v10.0.7 has been on the studio PC for 2–4 services without incident. If a clear v10.1-driver emerges (Daniel-reported behavior gap or net-new feature), we scope at that point with fresh evidence.

---

## §6 OPEN QUESTIONS FOR DANIEL

Answers to any of these would shift the recommendation shape:

1. **Studio PC state right now** — did you intentionally power down or sleep the studio PC at ~17:04Z today? Or is the heartbeat gap unexpected (= a real bridge silent-failure that v10.0.6 didn't catch)? If the latter, this becomes a P0 v10.0.7 investigation, NOT a "wait and see" item.
2. **Cron cadence preference** — `*/15 * * * *` (every 15min; conservative) vs `*/5 * * * *` (every 5min; band-hours-friendly) vs `*/15` always + `*/3` Fri-evening/Sat-morning (cost-tuned)? Recommendation: split-out to a dedicated `/api/cron/bridge-health-poll` route at `*/5 * * * *` so the heavy `admin-consistency` cron stays daily.
3. **Sentry-electron — wanted, or skip?** I argue skip in the anti-list (§4). Counter-argument: "Sentry has nicer ops-side UX than reading bridgeLog via MCP." If you'd actually use it, that flips it from anti-list to candidate. (But: the studio PC isn't internet-reliable for fresh package fetches; offline crash-buffer is non-trivial.)
4. **Cold-boot integration test (prior TOP-10 #10) — priority?** This is the one remaining open from prior FINDINGS. L-effort multi-day. Defer to a future cycle, or queue as next-research-lane after v10.0.7 ships?
5. **Is there a behavior gap in v10.0.6+v10.0.7 that the band has surfaced recently that I don't have visibility into?** This is the single signal that would flip "wait" to "scope v10.1 now."

---

## §7 SUPERVISOR + DANIEL DECISIONS BLOCK

Mirror of the supervisor's standard table-shape (Question | Recommendation | Easy-answer-token):

| Question | Recommendation | Easy answer |
|----------|----------------|-------------|
| Ship v10.1 now? | **No — ship v10.0.7 instead** (master-mute + tray-icon-refactor bundle, ~190 LOC, both in-flight) | "v10.0.7 it is" |
| Address bridge-health-alarm cadence gap? | **Yes — change cron schedule (or split-out dedicated route at `*/5 * * * *`)** | "ship the cron fix" |
| Was the studio PC intentionally off at 17:04Z? | (Daniel-only answer) | "yes intentional" / "no investigate" |
| Add Sentry-electron to bridge? | **No** — bridgeLog + tuned cron is strictly better signal-to-noise | "skip Sentry" |
| Prioritize cold-boot integration test now? | **No** — defer to post-v10.0.7 research cycle | "defer cold-boot test" |
| Anything else from the anti-list to reconsider? | (Daniel-only) | "all good" / "let's discuss [X]" |

---

## §8 OPEN-FOLLOWUPS (NOT this lane's scope — flagged for triage)

These are findings worth tracking but not in-scope for this research lane.

1. **`config/monitor.bridge.lastSeen` is STALE ~31min** at FINDINGS-write time (probe at 17:35Z; lastSeen 17:04:22Z). Plausibly benign (studio PC sleep/shutdown) but unconfirmed. **Tier-1 P1 LAUNCH-RELEVANT** until Daniel confirms (§6 Q1). If unexplained, root-cause investigation lane is the response, not a v10.1 release.
2. **`monitor-live/bridgeLog` stuck at 16:01:25Z flush time** despite `errCount: 5`. Likely because subsequent errors filtered by `isStartupNoise()` (DEP* + STANDBY entries), which is the intended v10.0.5 behavior. Sanity check the filter isn't TOO aggressive (false-negative of real errors) is worth a separate ~30min audit.
3. **Two-bridge boot warning at 16:01:21Z** ("Another bridge instance appears to be running! ... IP: 192.168.1.201 ... Continuing anyway — this instance will take over"). Same IP suggests a stale lease from a prior process, not a real conflict. The takeover succeeded. Worth confirming the lease-takeover-from-zombie path is the intended design (vs always-quit-on-conflict).
4. **`bridge.localIp` field is still written every heartbeat** (prior F-A5 unfixed) and visible in the probe. Cheap 1-line `// LEGACY:` comment OR delete-and-test-no-iPad-consumes-it; bundle with v10.0.7 if there's bandwidth, otherwise long-tail.
5. **Cold-boot integration test (prior TOP-10 #10 — still open)** — only prior FINDINGS item not closed. Multi-day Playwright/@playwright/test-electron lane; queue as standalone after v10.0.7 ships.

---

## §9 Verification artifacts

- **Source tree at base SHA `29c80956d1`:** inventoried in §2.1; full file list `git ls-tree origin/master bridge/src/`.
- **Commit range:** all bridge-touching commits in `origin/master -- bridge/` since prior FINDINGS' base SHA `de1d96a34` walked via `git log`. Repo was shallow-cloned at session start; unshallowed via `git fetch --unshallow origin` (2153 total commits visible; was 1 before). This avoided the [[feedback_auditor_shallow_clone_check_before_panic]] failure mode.
- **Live state probes** (Firebase MCP `firestore_get_document`):
  - `config/monitor` (full doc, masked to bridge sub-map)
  - `monitor-live/state` (mask: `updatedAt`, `bridgeVersion`)
  - `monitor-live/bridgeLog` (full doc)
  - `config/bridgeHealth` (full doc — the snapshot the cron writes)
- **Cron schedule cross-check:** `vercel.json:39-42` `/api/cron/admin-consistency` at `0 4 * * *`. `/api/cron/admin-consistency/route.ts:607` `readAndAlertBridgeHealth()` — code present, schedule too coarse.
- **In-flight coder state** read from `.coord/inbox/coder-1.md`, `.coord/inbox/coder-3.md`, `.coord/status/coder-1.md`, `.coord/status/coder-3.md`.
- **No probe mutations.** Read-only Firestore queries via Firebase MCP. No `bridge_clear_acks`/`_pending_commands` calls. ZERO writes.
- **Memory entries cross-referenced:** `[[project_bridge_release_build]]`, `[[project_bridge_update_ops]]`, `[[project_bridge_state_freshness_diagnostic]]`, `[[project_monitor_live_probe]]`, `[[project_shul_cadence]]`, `[[project_band_ipad_hardware]]`, `[[feedback_auditor_shallow_clone_check_before_panic]]`.

---

**Success criterion (per dispatch):** when Daniel reads this FINDINGS.md, he can immediately pick ONE of the §1 headline options or punt to the §7 decisions table. The recommended path is v10.0.7 + cron-cadence-fix, no v10.1 release.

Go.

— coder-6
