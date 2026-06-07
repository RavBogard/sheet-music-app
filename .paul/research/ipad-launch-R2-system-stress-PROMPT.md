# Lane R2 — System stress: concurrency + monitor + data integrity test research (coder-4) — Tier 0 READ-ONLY research

Read `.paul/research/ipad-launch-stress-test-PARENT.md` FIRST (the verified auth path + the HARD safety constraints — both bind you, ESPECIALLY the service-time guard and non-destructive-to-live-data).

## Mission
Design + VALIDATE fully-autonomous (no-human) **system stress** tests for the fleet: **multi-iPad concurrency** (6 sessions), the **monitor/IEM** plane (safely), **data integrity / sync races / reconnect / offline / backgrounding**, and a READ-ONLY **soundness check of tonight's + tomorrow's actual setlists** (data side). Produce ready-to-run test prompts (Cowork + Claude Code).

## Foundation (verify against origin/master — [[feedback_cowork_prompt_verify_before_write]])
- **Auth + fixtures:** `mintSession` (customToken) + MCP `create_test_account`/`cleanup_all_test_data` with per-session `uidPrefix` ([[feedback_sandbox_test_isolation]]). 6 distinct test-* musicians.
- **Viewport:** webkit 820×1180 per session.
- **Monitor:** the just-shipped Phase-1/3 plane is LIVE (v10.0.1): `/monitor` route, `monitor-store`, fader-confirmation machine; MCP tools `get_mix`/`list_monitor_buses`/`set_bus_fader`/`assign_monitor_bus`; bridge state at `monitor-live/state`. Live desk oracle = `scripts/monitor-live-probe.mjs` (P0-B2).
- **Sync fidelity:** use REAL Firestore (or emulator), NOT the in-memory adapter — it misses cache-vs-fresh races ([[feedback_harness_real_firestore]]).

## Coverage matrix to design tests for
1. **★ Multi-iPad concurrency (6 sessions):** 6 authenticated webkit sessions (test-* uids) on the SAME test setlist (Perform nav/annotate) + each assigned a DIFFERENT monitor bus → assert **zero cross-talk** (musician A's fader never moves B's), no lost/corrupted state, sync convergence across all 6. Against TEST fixtures + test buses ONLY.
2. **Monitor/IEM (SAFE):** the fader-confirm UX (optimistic→confirmed→revert, drag-suppression) under concurrent sessions reading `monitor-live/state`. LIVE desk = **ONLY** the existing `monitor-live-probe.mjs` P0-B2 oracle (snapshot→write a monitor/IEM bus→restore byte-identical), monitor buses only, **service-time guard ON** (NO writes Fri-eve tonight / Shabbat-morning tomorrow — today Fri-daytime is the window). MCP read tools + `assign_monitor_bus` **dryRun** are safe anytime.
3. **Data integrity / resilience:** Firestore sync races (concurrent writes to a test setlist), reconnect (drop+restore the listener), WiFi-blip, app-backgrounding/foregrounding → state stays consistent, no dupes, no corruption.
4. **★ Real-setlist soundness (READ-ONLY, data side):** enumerate tonight's + tomorrow-morning's actual setlists; verify every track is bound, every chart fileId resolves to a present/fetchable file, no orphans / missing files / broken mime ([[project_track_mimetype_gotcha]], [[project_orphan_baseline]]). Coordinate with R1 (render side). Do NOT mutate.
5. **Auth/role edges:** a musician can only touch their own bus (403 otherwise); access gates hold under concurrency.

## Oracles (programmatic)
Cross-talk = any session observing another's mutation = fail; sync divergence after settle = fail; orphaned/missing chart in a real setlist = launch-blocking finding; console errors; desk left byte-identical after any live probe (assert restore).

## Deliverables (write to `.paul/research/`)
1. `ipad-launch-R2-STRATEGY.md` — concurrency model, safety enforcement (service guard + test isolation), oracles.
2. `ipad-launch-R2-claude-code-PROMPT.md` — Claude Code prompt driving the N-session concurrency harness + the safe live-monitor oracle + the real-setlist data audit.
3. `ipad-launch-R2-cowork-PROMPT.md` — Cowork stress prompt (~75min reality, in-sandbox Playwright).
4. **SMOKE PROOF:** run a minimal pass — 2 concurrent authenticated sessions on a test setlist + a read-only enumerate of ONE real setlist's chart fileIds + (Fri-daytime, if safe) one P0-B2 dry/safe oracle pass. Paste results in the STRATEGY. Any cross-talk or missing real-setlist chart = surface to inbox/supervisor.md IMMEDIATELY (launch-blocking).

## Boundary
Tier-0 READ-ONLY: no `src/**` changes. Live desk writes ONLY via the existing P0-B2 oracle, non-service-window, monitor buses, restore-verified. Real setlists/library = READ-ONLY. SHIP-NOTICE → inbox/supervisor.md when prompts + smoke ready.
**Action required:** ACK in inbox/supervisor.md, then research + validate.
