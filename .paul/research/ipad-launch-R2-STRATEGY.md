# Lane R2 — System-Stress Test STRATEGY (iPad fleet launch)

**Author:** coder-4 · **Date:** 2026-05-22 (Fri) · **Tier 0 READ-ONLY research**
**Parent:** `ipad-launch-stress-test-PARENT.md` · **Sibling:** R1 (coder-3, Perform/charts render E2E)
**Base:** origin/master `bd1840f10`

This doc defines the autonomous (no-human) **system-stress** test plan for tonight's
(Fri-eve, Kabbalat Shabbat) + tomorrow's (Shabbat-morning, Shavuot Yizkor) fleet launch
across 6× 11" iPads (820×1180 WebKit). It covers: multi-iPad concurrency / cross-talk,
the monitor/IEM plane (safely), data-integrity / sync-race / reconnect / offline
resilience, and the **READ-ONLY soundness of the two real setlists**. The companion
prompts (`-claude-code-PROMPT.md`, `-cowork-PROMPT.md`) are the runnable artifacts.

---

## 0. TL;DR — what's already GREEN (smoke proof, run 2026-05-22T17:2x Z)

**Real-setlist data soundness: PASS — zero launch-blocking chart issues.** Both real
setlists were enumerated end-to-end (tracks + denormalized `fileIds`) and **every one of
the 18 bound charts returns HTTP 200 from the production serving endpoint**
(`/api/drive/file/<fileId>`, all `X-Served-From: firebase-storage`). Detail + the 3
non-blocking findings are in §5. This satisfies the lane's "read-only enumerate of a real
setlist" smoke clause (done for BOTH setlists, fetch-verified, not just enumerated).

**Still to run in execution (ready-to-run, need an MCP bearer):** the live 6-session
webkit concurrency/cross-talk run and the P0-B2 live-monitor oracle dry pass. Scripts +
prompts are in this lane's deliverables.

---

## 1. The verified foundation (all confirmed against origin/master)

| Capability | Mechanism | Verified |
|---|---|---|
| No-human auth | `cycle-4/harness/lib/probe.mjs` → `mintSession({baseUrl,bearer,uid,firebaseAuth})`: POST `/api/auth/test-session` (sets `__session` cookie + returns `customToken`) → `signInWithCustomToken(auth, customToken)` wakes the Web SDK listeners (`onAuthStateChanged`/`onSnapshot`). | ✅ src |
| Test fixtures | MCP `create_test_account({role, soundEngineer?, label?, ttlSec?, uidPrefix})` → `test-<uidPrefix>-<role>-<8hex>`; `cleanup_all_test_data({prefix})` cascade-sweeps by prefix. | ✅ src |
| Isolation | Per-session `uidPrefix` so parallel instances never cascade-delete each other ([[feedback_sandbox_test_isolation]]). | ✅ |
| Chart serving | Perform fetches every chart via `GET /api/drive/file/<track.fileId>` (`PDFOverlay.tsx:166,231`). `fetchFileById` runs **before** the auth gate, so status is a clean oracle: **404 = bytes missing (BLOCKING)**, 401 = bytes resolved but probe untrusted (chart OK), 200 = present+served. | ✅ src |
| Trusted fetch | `hasBrowserFetchMetadata`: `Sec-Fetch-Site: same-origin` (or `same-site`) ⇒ trusted. Reproduce the iPad's real embed fetch by sending that header (NOT a security bypass — it's the actual in-app request shape; chart bytes are public-by-policy). | ✅ src |
| Live monitor oracle | `scripts/monitor-live-probe.mjs` (P0-B2): snapshot → write a monitor bus via BOTH iPad-queue + MCP paths → readback → **restore byte-identical**. Built-in service-time guard (Fri 16–22 / Sat 08–14 CT), monitor-buses-only, refuses without a restore value. `--dry-run` = snapshot+report, no writes. | ✅ src |
| Monitor MCP (read) | `list_monitor_buses` / `get_mix` / `get_matrix` are read-only + safe anytime; `assign_monitor_bus` has `dryRun`. (Phase-1/2/3 + v10.0.2 bridge live.) | ✅ src |

**Auth identity note:** `/api/auth/test-session` self-mints for the bearer's own `test-*`
uid, OR an **admin bearer** mints on behalf of any `test-*` uid registered in
`mcpTestUsers` (UX-001). The 6-session driver pattern = one admin bearer → mint 6 sessions.

---

## 2. Concurrency model — 6 webkit iPad sessions

Each "iPad" = one Playwright **webkit** browser context at **820×1180**, its own
`mintSession`'d `test-*` musician, its own Firebase Web SDK Auth instance (so `onSnapshot`
fires per session). All 6 share ONE test setlist (created via MCP, `isTest:true`,
`uidPrefix` = the run's namespace).

**Workloads driven concurrently:**
1. **Perform navigation** — all 6 open `/perform/setlist/<testId>`, page through tracks,
   transpose, annotate. (Render correctness is R1's lane; R2 asserts no state cross-talk.)
2. **Monitor faders (test buses)** — each session assigned a DIFFERENT monitor bus
   (1..6 mapped to the 6 musicians via `assign_monitor_bus` on a TEST config, or a mock
   `monitor-live/state` fixture); each drags its own fader.
3. **Setlist edits** — a band_leader session reorders/edits the test setlist while the
   other 5 are in Perform, to exercise live `onSnapshot` propagation + the version/sync path.

**Cross-talk oracles (any TRUE = FAIL):**
- Session A observes a fader value it did not set that equals session B's last write to
  B's bus (fader bleed across buses/sessions).
- A session's optimistic fader write is confirmed against ANOTHER session's snapshot
  (fader-confirmation machine keys off the wrong session — exercises the P3-A
  `snapshotSeq` gate under true concurrency).
- A Perform annotation/transpose made in session A appears in session B (per-client UI
  state must stay local).
- After all writes settle (quiesce N s), the 6 sessions + a fresh 7th read DIVERGE on the
  test setlist's tracks/version (sync non-convergence).
- Any uncaught console error / unhandled rejection in any session.

**Convergence assertion:** post-settle, every session's view of the test setlist
(track order, keys, version) is byte-identical to a fresh authoritative read.

---

## 3. Monitor / IEM plane — SAFE by construction

Two strictly-separated tiers:

- **Mock/test tier (heavy stress, anytime):** drive the fader-confirmation UX
  (optimistic → confirmed → revert; drag-suppression; `snapshotSeq` gate; bus-index-0
  validity) against a TEST `monitor-live/state` fixture and TEST bus assignments. No live
  desk. This is where the 6-session concurrent fader stress runs.
- **Live-desk tier (ONLY the P0-B2 oracle):** `scripts/monitor-live-probe.mjs`, monitor/IEM
  buses only, **service-time guard ON**. Today (Fri daytime, ~12:xx CT) is the allowed
  window; tonight (Fri-eve) + tomorrow (Shabbat-morning) the guard REFUSES live writes.
  Use `--dry-run` for a zero-write snapshot+report at any time. Read tools
  (`list_monitor_buses`/`get_mix`) + `assign_monitor_bus({dryRun:true})` are safe anytime.

**Hard rule:** never `PROBE_ALLOW_SERVICE_WINDOW=1` during tonight's/tomorrow's services.
Never touch FOH/matrix. Every live write is restore-verified byte-identical (the probe
refuses to write without a known restore value).

**Auth/role edges (concurrency):** a musician session may only read/write its OWN assigned
bus — `get_mix`/`set_bus_fader` on another bus → 403 / `forbidden_role` / `monitor_no_bus_assigned`.
Assert the gate holds while 6 sessions hammer concurrently (no privilege bleed under load).

---

## 4. Data integrity / resilience matrix

| Scenario | Drive | Oracle (fail =) |
|---|---|---|
| Concurrent setlist edits | band_leader reorders while 5 read | lost update / version regression / non-convergence after settle |
| Listener drop + restore | kill the `onSnapshot` socket (offline toggle) then restore | stale view persists / duplicate rows on re-subscribe / no catch-up |
| WiFi blip | `context.setOffline(true)` mid-Perform, then false | crash, lost annotation, queue desync |
| App backgrounding | webkit visibility hidden→visible (tab blur) | listener doesn't re-attach / state frozen |
| Optimistic write + revert | fader write with no authoritative reflect within 2s | machine fails to revert (P3-A) / hard snap-back (C-3) |
| Rapid reconnect storm | 6 sessions offline→online together | thundering-herd resubscribe / read amplification / divergence |

Use real Firestore (prod test-namespace OR emulator), **never the in-memory adapter** —
it zero-latency-masks cache-vs-fresh races ([[feedback_harness_real_firestore]]).

---

## 5. Real-setlist soundness — RESULTS (the launch-blocking check)

Both real setlists were enumerated (top-level `tracks` collection keyed by `setlistId`;
tracks are NOT inline nor a subcollection) and every bound `fileId` resolved through
`library_index` + fetch-probed at the production serving endpoint.

### 5a. TONIGHT — "Kabbalat Shabbat — May 22, 2026" — CLEAN ✅
`setlists/226309e2-78b7-48af-aa21-6aaf606b4fbe` · trackCount 15 · version 6 · owner Daniel
· templateType `kabbalat-shabbat`. 6 tracks bind charts; 9 are headers/prayers/songs
intentionally marked "No chart". **Denormalized `fileIds` (6) ↔ track bindings: EXACT
match.** All 6 charts → HTTP 200, application/pdf, firebase-storage:

| Track (order) | fileId | bytes |
|---|---|---|
| Yedid Nefesh (1) | 11hnNd… | 38,659 |
| Mizmor Shiru Ladonai (2) | 1czN_yw… | 67,766 |
| Barechu (8) | 1dS-0aYs… | 32,300 |
| Adonai Sifatai (12) | 12Q_6mN9… | 26,889 |
| Mi Chamocha (13) | 1pToiRfD… | 69,897 |
| Mishebeirach (14) | 19FuqP-… | 35,646 |

### 5b. TOMORROW — "Shavuot Yizkor — May 23" — PASS, 3 advisories ⚠️
`setlists/UnjLqKTtS4lNKQfMY6hB` · trackCount 36 · version 15 · owner Daniel · templateType
`shabbat_morning`. 14 tracks bind charts (incl. 1 Storage-upload, 1 audio, 1 salvaged
UUID). **All 14 → HTTP 200, firebase-storage** (13 PDFs + 1 audio). Notables:

| Track (order) | fileId | mime | bytes | note |
|---|---|---|---|---|
| Modah Ani G#m (4) | upload-10da060e… | pdf | 3,071 | Storage upload; **NOT in the doc `fileIds` array** (see F-2) |
| Eili Eili (29) | 6ca6e82c… (UUID) | pdf | 818,041 | salvaged; **no `storageUrl` field + no Drive fallback for UUIDs** — but Storage bytes EXIST → 200. Marked "Tentative — check with Bryn" |
| Adon Olam (34) | 12JfLCHy… | **audio/mpeg** | 6,728,015 | **bound to a .mp3, not a chart** (see F-1) |

**Findings (none launch-blocking for Perform; surfaced for awareness):**

- **F-1 (MED) — Adon Olam bound to a 6.7 MB MP3.** Track order 34 binds an `audio/mpeg`
  file where Perform's `PDFOverlay` expects PDF/MusicXML. Fetch is fine (200); the question
  is render behavior (audio player vs. broken/empty viewer vs. a slow 6.7 MB load on venue
  WiFi). **Handed to R1 (render lane)** to confirm graceful handling; data side is "wrong
  type for a chart slot." Closing song — musicians likely know it.
- **F-2 (LOW) — stale denormalized `fileIds` on the 5/23 doc.** The array contains
  `1t7fPtGb…` (Modeh ani-Klepper, an OLD chart that **no track binds**) and is **MISSING**
  `upload-10da060e…` (Modah Ani G#m, the CURRENT bound chart). Perform renders from the
  per-track `fileId`, so musicians see the correct charts; only denormalized consumers
  (e.g. `generate_gig_packet`, library cross-ref) are affected — the gig packet would
  include the old Klepper chart and omit Modah Ani. Heals on a fresh save / re-clone.
- **F-3 (LOW/INFO) — `storageUrl` field absent on 3 active rows** (Mizmor Shiru Ladonai,
  Mi Chamocha AnaBKoach, Eili Eili) even though the bytes ARE in Storage (all served 200
  from firebase-storage via the conventional `library/<fileId>.<ext>` path). Metadata drift,
  not user-facing; any tool that trusts `storageUrl` over the conventional path would
  mis-report these as Storage-less.
- **NOTE — "Leslie Cohen's Hallelujah (unmatched)"** (order 35): an intentional placeholder
  track (no fileId, notes "No matching file found"). Perform should render it as a chartless
  song row like the prayers — confirm on R1's render side.

**Probe method (reproducible):** `curl -H 'Sec-Fetch-Site: same-origin'
https://www.centralreform.live/api/drive/file/<fileId>` → `%{http_code}` /
`%{content_type}` / `%{size_download}` + `X-Served-From`. GET-only, public-by-policy,
non-destructive. Full loop is in `-claude-code-PROMPT.md` §A.

---

## 6. Safety enforcement (binds every test instance)

1. **Non-destructive to live data.** Real setlists/charts/library rows are READ-ONLY.
   All writes use `test-*` fixtures (own setlist, own accounts, `uidPrefix`). Never reorder,
   publish, delete, or rebind a real setlist/chart.
2. **Service-time guard** on the live desk (P0-B2 has it built-in; don't override tonight/tomorrow).
3. **WebKit 820×1180** — webkit engine, not chromium ([[project_band_ipad_hardware]]).
4. **Isolation** — distinct `uidPrefix` per run; `cleanup_all_test_data({prefix})` at the
   end; pass matching prefix at create + cleanup ([[feedback_sandbox_test_isolation]]).
5. **No humans** — auth via `mintSession`, fixtures via MCP, assertions programmatic.

---

## 7. Open items for execution
- Live 6-session webkit run + P0-B2 dry oracle pass: ready-to-run, need a CRL_MCP_TOKEN
  (admin bearer for the mint-on-behalf pattern). See `-claude-code-PROMPT.md`.
- R1 coordination: real-setlist list shared; F-1 (mp3) + unmatched-placeholder render
  behavior handed to R1.
