# STRESS-TEST REPORT — Run 3, Executor B (browser/Playwright) — 2026-06-11

Successor to runs 1–2 (`STRESS-TEST-REPORT-2026-06-10*.md`). Executes the
**Executor B** cells of `STRESS-TEST-PROMPT-2026-06-RUN3.md` using the
**Playwright adapter** (`STRESS-TEST-PROMPT-2026-06-PLAYWRIGHT.md`) — Claude-in-Chrome
unavailable, so a real local Chromium drives the live hosts. Oracle:
`docs/ACCESS-POLICY.md` **v0.4**. BUG numbering continues from **BUG-10**.
Evidence in `.paul/research/stress-evidence-2026-06/` (filenames prefixed `r3b-`).
uidPrefix for any artifact: `r3b`.

---

## 0. Pre-flight gate

| # | Check | Result |
|---|---|---|
| 1 | Playwright launches, loads `centralreform.live`, screenshots, no errors | ✅ PASS — cold load 0 console errors/warnings (`r3b-preflight-crc-landing-ipad.png`) |
| 2 | centralreform.live MCP reachable | ✅ PASS (read tier) — `list_setlists` returned current CRC setlists |
| 2b | brotherslazaroff.live MCP reachable | ❌ **token expired** — "requires re-authorization", then disconnected. Interactive OAuth re-auth = Daniel-only. |
| 3 | Loginable account end-to-end (`create_test_account({loginable:true})` → open URL → land signed in → revoke → URL dead) | ⛔→✅ **NOW PASSES (re-fire 2, §11).** Originally FAILED at consume (🐛 BUG-12: `GET /api/auth/qr` 400'd the 32-char code). After BUG-12 fix (commit `bab97f6013`): mint → open URL → **land signed in (qr poll 200)** → sweep → URL dead, all confirmed in-browser. |

**Pre-flight verdict: PARTIAL.** The browser + read-tier MCP are healthy, so the
entire **anon battery** ran in full. Two prerequisites block the persona-dependent
cells and are **human-actions only**:

- **A connected admin (or band_leader) MCP bearer.** The current bearer is
  member-tier. This is the exact situation run-2's browser executor hit before
  Daniel swapped in an admin bearer. Blocks: BUG-9 end-to-end token-consume,
  the leader UI authoring walk, QR single-use real-claim, web-vitals p75 trend,
  and the leader-side of B3.
- **brotherslazaroff.live MCP re-authorization.** Blocks broslaz stored-org reads
  and broslaz artifact cleanup (moot this run — nothing was created on broslaz).

Per the gate I did **not** fabricate auth or substitute curl/bash against the hosts.
Every host interaction was through the Playwright page (same-origin `fetch`, which
the adapter classifies as "through the page"). **No test artifacts were created**
(the member bearer can't mint), so the cleanup ledger is empty.

---

## 1. Summary

> **This report covers BOTH passes:** the anon battery (member bearer) **and** the
> admin-bearer re-fire of the blocked rows (Daniel swapped in a fresh admin bearer
> mid-run, TTL 4h). See **§10 Re-fire addendum** for the re-fire detail.

- **Severity counts (final):** P0 **0** · P1 **0** · P2 **1** · P3 **3** · Policy questions **1**.
  (Updated after re-fire 2 — §11: **BUG-12 RESOLVED + live-verified**, so the P2 slot is
  now **BUG-13** [generateCode emits short codes → device-QR intermittently 400s];
  P3 gains **F-8** [v11.4-04 default-both doesn't reach MCP test accounts — harness-only,
  not a leak] alongside BUG-10 + BUG-11. All four BUG-12-blocked cells now PASS.)
- **Headline:** **Every v11.3 fix in scope is CONFIRMED FIXED** (BUG-5, BUG-4, BUG-9-proxy,
  BUG-6, F-6; BUG-2 CLS trending down). **BUT the admin-bearer re-fire uncovered
  BUG-12 (P2): the BUG-7 fix re-broke the loginable test-login harness** — a new
  `/^[A-Z0-9]{6}$/` code-format gate on `GET /api/auth/qr` 400s the 32-char codes
  `create_test_account` mints, so no persona can sign in via `/test-login`. This
  **re-blocks** the leader walk / QR real-claim / role-fidelity / BUG-9-e2e cells
  at the code layer (not the bearer layer).
- **Worst finding:** **BUG-12 (P2, harness-blocking, no end-user impact)** — loginable
  sign-in is dead in prod again; the harness BUG-9 restored is masked by the BUG-7
  format validator.
- **Strongest positives:** anon Storage-chart deep links now 200 on **both** the
  direct `/api/library/file/upload-*` endpoint and the in-Perform
  `/api/drive/file/upload-*` path (BUG-5 fully closed, incl. the run-2 cold-render
  escalation — renders, not blank); anon transpose reaches full parity with authed
  ("Detected Key Dm → Ebm, 21 chords"); **offline mode is genuinely graceful**
  ("OFFLINE — 16/16 CHARTS READY", cached PDF renders, no crash); broslaz PWA
  manifest is valid JSON; no cold-landing 429s on either host; **no browser
  auto-send path on any consumer surface** (D8); field CLS p75 0.2→**0.15** (improving).
- **Worthiness: 8/10** (▲ from run-2's 7.5/10). The consumer/anon surface is in
  great shape — the four P2s that capped run-2 are gone (BUG-5/4/9-proxy fixed,
  BUG-8 dissolved by D4-rev1). Held back from higher by **BUG-12** (the loginable
  harness is broken again — a real ops/testing regression even if congregants are
  unaffected), plus polish (BUG-10, audio-Range) and still-elevated `/perform`
  field LCP/TTFB. The persona/authoring **product** surfaces remain **unverified**
  (not failing) because BUG-12 blocks browser sign-in.
- **Cleanup:** 3 test accounts minted during the re-fire, all swept → **CLEANUP VERIFIED** (§8).

---

## 2. Findings

Severity key: P0 data-loss/security/tenancy · P1 core flow broken · P2 degraded · P3 polish.
No fixes prescribed.

### BUG-10 (P3) — Residual anon `401` on `PATCH /api/library/chord-cache` during transpose
- **Persona/tenant/viewport/surface:** Anon · CRC · iPad 1180×820 · Perform transpose panel.
- **Repro:**
  1. Anon, open `/perform/setlist/ncbvBvwFFxkqPey2HiuY/track/07235613-…` (the
     `upload-3a06e127` Storage chart "Hakafah — Russian Sher No 3").
  2. Tap the transpose pill → panel scans and shows "Detected Key: Dm, 21 chords".
  3. Network: `GET …/chord-cache?meta=true` **200**, `?page=1` **200**,
     `POST /api/ai/transposer/scan` **200**, `?page=2` **200**,
     `POST …/chord-cache` **200**, **`PATCH …/chord-cache` → 401**.
  4. Console logs 2 errors: `Failed to load resource: 401 … /api/library/chord-cache`
     and `{event: api-fetch-failed, url:/api/library/chord-cache, status:401}`.
- **Expected:** the B1 cell requires the anon transpose flow be "console free of 401s".
- **Actual:** all reads + the POST succeed for anon; only the **PATCH** (cache
  update/write-back) is still auth-gated, so it 401s and logs errors. Transpose
  itself is unaffected (chords detect + transpose; verified Dm → Ebm).
- **Evidence:** `r3b-bug4-anon-transpose-works-ipad.png`; network req table
  (128–133); console error excerpt.
- **VERIFY FIRST:** is the anon PATCH meant to be a no-op (anon shouldn't persist
  cache updates)? If so the fix is to skip the PATCH for anon (or swallow the 401
  quietly) rather than fire-and-log. The POST path already succeeds, so the cache
  is being written; the PATCH appears redundant for the anon case.

### BUG-11 (P3) — Audio file endpoint ignores `Range` (no `206`/`accept-ranges`)
- **Persona/tenant/surface:** Anon · CRC · `GET /api/drive/file/<mp3 id>`.
- **Repro:** anon `fetch('/api/drive/file/1X6St0GAreLGpJIcPMdA4HJlohuFhPp5W',
  {headers:{Range:'bytes=0-1023'}})` → **200** `audio/mpeg`, **no** `Accept-Ranges`,
  **no** `Content-Range` (full 200, not a 206 partial).
- **Expected:** byte-range support lets `<audio>` seek/scrub and start playback
  before the whole file downloads — important for long recordings on iPad cellular.
- **Actual:** the endpoint returns the whole body and ignores `Range`. Playback
  from the start works (bytes are served anon — see D2 below); seeking/scrubbing
  and progressive start are degraded for large audio.
- **Evidence:** `browser_evaluate` result `{status:200, contentType:'audio/mpeg',
  acceptRanges:null, contentRange:null}`.
- **Note:** P3 — recordings still play for anon; this is a streaming-UX nicety,
  not an access bug. Same endpoint serves charts fine (charts don't need ranges).

### BUG-12 (P2, harness-blocking — no end-user impact) — BUG-7's fix re-broke the loginable `/test-login` flow: `/api/auth/qr` rejects 32-char codes
- **Persona/tenant/surface:** Anon (pre-session) · CRC · `/test-login?code=…` →
  `GET /api/auth/qr?code=…` (the consume poll).
- **Repro (admin bearer, fresh mints):**
  1. `create_test_account({role:'band_leader', loginable:true})` →
     `loginUrl: /test-login?code=HTeAcKgffxbPycjgFgIQXkSgfuFT7GvP` (a **32-char**
     URL-safe code; mixed-case, may contain `-`/`_`).
  2. Open the loginUrl signed-out. The proxy now serves the page (BUG-9 fixed) —
     it shows "Test Login", then flips to **"Invalid or expired login link"**.
  3. Only one auth call fires: `GET /api/auth/qr?code=<32char>` → **400
     `{"error":"Invalid code format"}`** (so the client never gets the custom
     token → `signInWithCustomToken` never runs → no session). Navigating to
     `/setlists` confirms still-anon (→ `/login`).
  4. Format-boundary probe on the live endpoint:
     `?code=ABCDEF` (6-char) → **404 "Session not found"** (format OK, just absent);
     `?code=<32char test code>` → **400 "Invalid code format"**;
     `?code=..%2Fetc` → **400** (BUG-7's 500→400 fix, working as intended).
- **Expected:** a freshly-minted loginable code resolves to
  `{status:"approved", token}` (run-2 confirmed exactly this: 32-char code → 200).
  The loginable harness must work end-to-end (it's pre-flight #4 of this very prompt).
- **Actual / root cause (code-confirmed, `origin/master:src/app/api/auth/qr/route.ts`):**
  the BUG-7 fix added, in the `GET` handler, `if (!/^[A-Z0-9]{6}$/.test(code))
  return 400 "Invalid code format"` — explicitly commented "BUG-7 (run-2 §BUG-7)".
  `generateCode()` emits 6-char uppercase codes (real device-handoff QR — passes),
  but `create_test_account` mints **32-char** codes stored in the **same**
  `qr-sessions` collection (`cleanup` swept `qr-sessions:3`, confirming the shared
  namespace). The 6-char regex rejects every test-login code before the Firestore
  lookup. Two code namespaces share one endpoint + one validator; the validator
  only fits one of them.
- **Impact:** **no congregant/musician impact** — real users sign in via Google or
  the **6-char** device-handoff QR (which still passes the regex; the PUT-approve →
  GET-poll path is all 6-char). But it **100%-breaks the loginable test harness**
  again — the same harness BUG-9's proxy fix was meant to restore — and it blocks
  every browser persona/authoring cell in this prompt. This is a new regression
  **since run-2** (run-2's 32-char codes returned 200; the validator didn't exist yet).
- **Evidence:** `r3b-bug12-testlogin-invalid-code-format-ipad.png`; network req 41
  (`GET /api/auth/qr?code=HTeAcKg… → 400`); the format-boundary probe table; the
  `origin/master` route source (regex at the top of the GET handler);
  `cleanup_all_test_data` aggregate (`qr-sessions:3`).
- **VERIFY FIRST / decision:** the regex needs to admit the test-login code shape
  too (or test-login codes need their own validated path) without re-opening the
  BUG-7 `/`-in-doc-id 500. Confirm the real 6-char QR device-handoff is unaffected
  (it appears to be — 6-char passes) before treating this as anything but harness-only.

---

## 3. Regression verdicts (the v11.3/v11.4 fixes — the core of this run)

| Fix | Run-2 state | Run-3 result | Verdict |
|---|---|---|---|
| **BUG-5** anon Storage chart deep link | 401 `missing_bearer` on `/api/library/file/upload-*` | `/api/library/file/upload-*` → **200 application/pdf** anon (cache-bypassed, `credentials:omit`); in-Perform `/api/drive/file/upload-3a06e127` → **200**; raw PDF + full Perform render both confirmed | ✅ **FIXED** (incl. run-2 cold-render escalation: renders, not blank) |
| **BUG-4** anon transpose dead + 401s | "Waiting for scan…", `scan`/`chord-cache` 401, no re-render | scan **200**, key detected "Dm", 21 chords, transpose Dm→Ebm works | ✅ **FIXED** (one residual cosmetic PATCH 401 → BUG-10) |
| **BUG-4b** anon AI rate-limit graceful | (n/a) | 20-burst of malformed `POST /ai/transposer/scan` → **20×400, zero 500s**; valid UI scan → 200 | ✅ graceful (no 500; 429 ceiling not reached — validation rejects bad bodies first; real-scan spam avoided to spare AI spend) |
| **BUG-9** `/test-login` reachable signed-out | 307 → `/login` (proxy allowlist gap) | anon `GET /test-login?code=…` → **200**; page renders + consumes; **re-fire 2 (§11): e2e sign-in restored after BUG-12 fix** | ✅ **FULLY FIXED end-to-end** (proxy run-3 + consume re-fire 2: mint→open→signed in→sweep→dead) |
| **BUG-7** malformed QR code → 400 not 500 | `?code=..%2Fetc` → 500 | `?code=..%2Fetc` → **400 "Invalid code format"** | ✅ **FIXED** — over-broad validator (🐛 BUG-12) now **RESOLVED** (commit `bab97f6013`: GET admits both 6-char + 32-char shapes; `..%2Fetc`/off-length still 400 — re-verified live, §11) |
| **BUG-12** `/api/auth/qr` 400s 32-char test-login codes | (introduced by BUG-7 fix) | **FIXED** commit `bab97f6013` (GET both-shapes validator); live probe: 32-char→404, 6-char→404, `..%2Fetc`→400; browser e2e sign-in restored (§11) | ✅ **FIXED + live-verified** |
| **BUG-6** broslaz PWA manifest | 200 `text/html` SPA shell | `/manifest-brotherslazaroff.json` → **200 application/json**, valid JSON, `name:"Brothers Lazaroff"` | ✅ **FIXED** |
| **F-6** cold-landing 429s (qr/web-vitals) | `POST /api/auth/qr` → 429 self-heal; web-vitals 429 | CRC + broslaz cold loads: all qr/manifest/web-vitals **200, no 429s** | ✅ **FIXED** both hosts |
| **BUG-2** `/perform` CLS | field p75 CLS 0.2 (worse than run-1's 0.15) | lab CLS = 0; **field p75 CLS = 0.15** (n=67, 7d) — **back down to run-1's level, ▼ from run-2's 0.2** | ✅ **improving / heading toward target** (still >0.1 "good" bar; not yet ~0). LCP p75 2992 ms / FCP 3551 / TTFB 1545 (n≈73–109) — still elevated, **note-trend-only** per the cell; no dramatic regression |

**Every v11.3 fix is confirmed live.** The one regression is **BUG-12** — the
BUG-7 fix's over-broad code-format validator re-broke the loginable harness
(BUG-9's restored end-to-end path). Field CLS p75 confirmed improving (0.2→0.15).

---

## 4. Policy questions (for Daniel, not Claude Code)

1. **Anon recording playback (D2 — still the open ⚠️ copyright-comfort veto).**
   Confirmed this run: the audio endpoint serves anon — `GET /api/drive/file/<mp3>`
   → **200 `audio/mpeg`** with no bearer (test file "3 Songs Office Hours.mp3").
   So *any* embedded player would let a signed-out visitor play recordings; there
   is no role gate on the bytes. The policy encodes recordings as ✅-implied-by-D1
   but flags recordings specifically for your veto. **Decision still yours:** leave
   recordings anon-playable (current behavior), or gate them. (No code change
   observed since run-2; flagging the live behavior, not a bug.)

---

## 5. UX friction journal

| # | Item | Rating | Evidence |
|---|---|---|---|
| F-4 (carry) | Two near-identical **"Shabbat Morning — Parashat Sh'lach — June 13"** setlists (20-item id `ncbvBvwFFxkqPey2HiuY` + 19-item id `QSlxlW635yzn0V9PQVR4`) still both present; a visitor can't tell which to open | **Annoying** | `list_setlists` (both returned) |
| F-7 | Audio recordings can't seek/scrub or progressive-start (no `Range` support, BUG-11) | **Minor** | anon fetch header dump |
| (positive) | **Offline mode is excellent** — "OFFLINE — 16/16 CHARTS READY" indicator, cached PDF charts render, explicit "OFFLINE MODE" banner, no crash on a full reload while offline | — | `r3b-offline-16of16-charts-ready-ipad.png`, `r3b-offline-mode-perform-graceful-ipad.png` |
| (positive) | Cold loads are clean — 0 console errors/warnings on CRC and broslaz landings; `/perform` lab TTFB 67 ms / load 362 ms | — | console dumps |

| F-1 (carry, **now measured**) | `/perform` **field** p75 still over the 2 s bar — **LCP 2992 / FCP 3551 / TTFB 1545 ms** (n=360, 7d). Roughly flat-to-slightly-worse vs run-2 (LCP 2600 / TTFB 1398) but same noisy window class; lab warm-edge load is fast (TTFB 67 ms) so this is cold-start / field variance | **Annoying** | `get_web_vitals_summary` (admin bearer, re-fire) |

> **Field web-vitals (admin re-fire), `/perform`, 7d, n=360:** LCP p75 **2992**,
> CLS p75 **0.15** (▼ from 0.2), INP 56, FCP 3551, TTFB 1545. CLS is the good-news
> trend; LCP/FCP/TTFB remain the standing perf concern (note-trend-only per the cell).

---

## 6. Coverage table

Legend: ✅ OK / 🐛 BUG-n / ⏭ untested (+why). Viewport iPad 1180×820 primary.

### B1 — v11.3 fix regressions (anon, both hosts)

| Cell | CRC | broslaz | Result |
|---|---|---|---|
| Storage chart deep link `/api/library/file/upload-*` → 200 PDF anon (BUG-5) | ✅ 200 pdf | (same backend) | ✅ FIXED |
| In-Perform Storage chart render anon (BUG-5 escalation) | ✅ `/api/drive/file/upload-*` 200 + renders | — | ✅ FIXED |
| Anon transpose: chords detect + notation transposes; console 401-free (BUG-4) | 🐛 **BUG-10** (works, but 1 residual PATCH 401) | — | ✅ core FIXED / 🐛 residual |
| Anon AI rate-limit 4xx-graceful not 500 (BUG-4) | ✅ no 500s | — | ✅ |
| `/test-login` reachable signed-out (BUG-9) | ✅ 200 (proxy fixed) | — | ✅ proxy FIXED; **e2e consume 🐛 BUG-12** (qr poll 400s) |
| broslaz PWA manifest valid JSON (BUG-6) | — | ✅ 200 json | ✅ FIXED |
| Cold landing no 429s on qr/web-vitals (F-6) | ✅ | ✅ | ✅ FIXED |
| `/perform` CLS visually stable (BUG-2) | ✅ lab CLS 0 · field p75 **0.15** (▼) | — | ✅ improving (field trend pulled, admin re-fire) |

### B2 — carry-forward UAT cells

| Cell | Result |
|---|---|
| Anon recording playback (D2) | ✅ bytes serve anon (200 audio/mpeg); 🐛 BUG-11 no Range; policy veto still Daniel's (Policy Q1) |
| Offline degradation mid-Perform | ✅ **graceful** — OFFLINE MODE banner, 16/16 charts ready, cached PDF renders, no crash |
| Leader UI walk: create → add 3 → reorder → delete (both hosts; lands in HOST org) | ⛔ **BLOCKED by BUG-12** — admin bearer minted the band_leader account, but no browser sign-in is possible (consume 400s). Authoring **product** surface unverified. |
| QR single-use isolated: claim end-to-end → reuse fails 410 | ⛔ **BLOCKED by BUG-12** — the 32-char poll 400s; PUT-approve needs an auth I can't get. (Run-2 confirmed used/expired → 410.) |
| `/manage` People render (Daniel-only UAT) | ⏭ skip per prompt |

### B3 — D8 browser surface

| Cell | Result |
|---|---|
| Any browser path that auto-sends without explicit recipients? (consumer/anon surface) | ✅ **NONE** — 0 publish/send/notify/email/recipient/blast controls on the anon setlist+Perform surface (DOM scan). Consistent with PublishDialog being orphaned/mounted-nowhere. |
| Leader-side publish UI (present? requires selection?) | ⛔ **BLOCKED by BUG-12** — needs band_leader sign-in. Per v11.4, PublishDialog is MCP-only/orphaned; no UI auto-send expected, but unverified in-browser. |

### Viewports
iPad 1180×820 primary across all cells. iPhone 390×844 / desktop 1440×900 spot-checks
not re-run this session (run-2 confirmed clean; no layout regressions observed at 1180×820).

---

## 7. Blocked cells — what unblocks them

> **RESOLVED in re-fire 2 (§11).** BUG-12 was fixed (commit `bab97f6013`); all four
> cells below were re-fired and PASS (broslaz-authoring half excepted — see F-8). The
> list below is the original §7 snapshot, kept for provenance.

The admin bearer is no longer the blocker — it works (3 accounts minted via
`/api/mcp`, web-vitals pulled). The remaining cells are blocked by **BUG-12**:

**Need BUG-12 fixed** (`/api/auth/qr` GET must accept the 32-char test-login code
shape, not just `^[A-Z0-9]{6}$`), since none can run without a browser persona session:
- BUG-9 end-to-end token-consume (mint → open URL → land signed in → revoke → dead).
- B2 leader authoring walk (create → add 3 → reorder → delete in the UI, both hosts;
  verify stored org). NB Daniel: post-v11.4-04 new accounts seed both orgs, so a CRC-minted
  leader should walk broslaz too — **unverifiable until BUG-12 is fixed.**
- B2 QR single-use real-claim → 410-on-reuse, and granted-session role fidelity.
- B3 leader-side publish-UI confirmation.

**Done this re-fire (no longer blocked):**
- ✅ BUG-2 `/perform` field p75 trend (`get_web_vitals_summary`) — CLS 0.15, LCP 2992, etc.
- ✅ BUG-9 proxy-layer reachability (page loads signed-out).

**Still need brotherslazaroff.live MCP re-authorized** (expired) — only matters once
BUG-12 unblocks the broslaz leader walk (stored-org read + cleanup there).

Once BUG-12 ships, re-fire just the four cells above — the anon battery + web-vitals
need not repeat.

---

## 8. Cleanup ledger + confirmation

**Anon pass:** no artifacts created.

**Admin-bearer re-fire — test accounts minted (all `test-r3b-*`):**

| uid | role | purpose | disposition |
|---|---|---|---|
| test-r3b-band_leader-fa0a86a7 | band_leader | leader-walk login (consume → BUG-12) | swept |
| test-r3b-band_leader-6e808615 | band_leader | clean consume retry (→ BUG-12) | swept |
| test-r3b-musician-159baba8 | musician | QR + consume diagnosis (→ BUG-12) | swept |

None ever signed in (all consume attempts 400'd), so **zero owned data** was created.
No setlists/charts/tracks/templates. No monitor faders/mutes/matrix touched.
`publish_setlist` never called; no `preview_publish`. Network was toggled offline
once for the degradation test and **restored** (`context.setOffline(false)` confirmed).

**Cleanup action:** `cleanup_all_test_data({prefix:"r3b"})` →
`{removed:3, failures:[], setlists:0, tracks:0, library_index:0, songs:0,
qr-sessions:3, mcpTokens:3, storageDeleted:0}`.
**Verification:** `list_test_accounts({includeExpired:true})` → `{accounts:[]}`.
Throwaway control-plane helper `.stress-mcp-call.mjs` (no hardcoded secrets — bearer
via env) deleted; `Test-Path` → False. Browser closed.

> ## CLEANUP VERIFIED
> All 3 `test-r3b-*` accounts + their qr-sessions/mcpTokens swept (`accounts:[]`).
> Zero setlists/charts/songs created. The admin bearer is Daniel's to revoke
> per his note. The two duplicate June-13 setlists (F-4) and the `[role-*] tiny`
> library rows are pre-existing production data, not mine.

---

## 9. Method / safety adherence

- **Host interaction via the Playwright page only** — same-origin `fetch`
  (cache-bypassed, `credentials:omit` for anon) is "through the page" per the
  adapter; no curl/bash/raw requests against the hosts.
- **No auth fabricated.** Anon pass used the member bearer for read-tier reads only.
  Re-fire used the admin bearer via the `/api/mcp` control plane (a Node helper,
  bearer from env, never hardcoded) — the bearer's sanctioned surface, same approach
  as run-2. When BUG-12 made browser sign-in impossible, the persona cells were
  reported blocked rather than worked around (the run-2 faithful workarounds also
  depend on the now-400ing `GET /api/auth/qr`; admin-test-session would be the wrong
  persona + SSR-only, so it can't faithfully do the client-SDK authoring walk).
- **`/api/mcp` quirk:** the apex host 401s ("No authorization provided") because the
  apex→`www` redirect drops the `Authorization` header — call `https://www.centralreform.live/api/mcp` directly.
- **`browser_run_code_unsafe`** was used solely for `context.setOffline(true/false)`
  (no offline primitive exists in the standard Playwright-MCP toolset) — network
  was restored immediately after.
- **AI spend minimized** — the rate-limit burst used malformed bodies (400s) to
  prove no-500 without firing 20 real Gemini scans.
- ABSOLUTE STOP-GATES honored: no `publish_setlist`, no real emails/push, no
  monitor changes, everything `r3b`-namespaced (3 accounts, all swept — §8).

---

## 10. Re-fire addendum (admin bearer)

Daniel swapped in a fresh admin bearer (TTL 4h, self-revoked post-run) to unblock
the persona/authoring rows. Outcome:

- **Bearer works** via `https://www.centralreform.live/api/mcp` — `list_test_accounts`,
  `create_test_account` (×3), `get_web_vitals_summary`, `cleanup_all_test_data` all 200.
- **✅ Completed:** BUG-2 field web-vitals trend (CLS p75 **0.15**, ▼ from run-2's 0.2;
  LCP 2992 / FCP 3551 / TTFB 1545, n=360); BUG-9 proxy-layer reachability re-confirmed.
- **⛔ Re-blocked by BUG-12 (new finding):** the loginable `/test-login` consume 400s
  (`GET /api/auth/qr` rejects 32-char codes via the BUG-7 `^[A-Z0-9]{6}$` gate), so
  **no browser persona session is obtainable.** That kills the leader UI walk, QR
  single-use real-claim, role fidelity, and B3 leader-side — none could run. They are
  blocked by a **code regression**, not by credentials.

**Net:** the bearer swap did its job (web-vitals + harness diagnosis), but the
product-side persona cells need **BUG-12 fixed** before they can be exercised in a
browser. The most valuable output of the re-fire is BUG-12 itself: Daniel's loginable
test harness is broken in production again, and the BUG-7 fix is the cause.

---

## 11. Re-fire 2 addendum — BUG-12 fixed, the four blocked cells run (2026-06-11, later)

BUG-12 was fixed + live-verified (commit `bab97f6013`: `GET /api/auth/qr` now admits
BOTH `^[A-Z0-9]{6}$` AND the 32-char `^[A-Za-z0-9_-]{32}$` test-login shape; BUG-7
path-char→400 held). Daniel handed a fresh admin bearer (TTL 4h, revoked after). The
four cells blocked at the code layer in §10 were re-fired via the admin/leader bearer
over `/api/mcp` + a real Chromium (Playwright). uidPrefix for this pass: **`r3c`**.

### Cell 1 — loginable mint → `/test-login` consume end-to-end ✅ PASS
- `create_test_account({role:'band_leader', loginable:true, uidPrefix:'r3c'})` →
  `loginUrl: /test-login?code=v8-ex2RGxOKVNaaHLtYhn01kD8F1UiHq` (32-char base64url,
  **contains a `-`** — exactly the shape BUG-12 rejected).
- Opened signed-out in Chromium → page flips through "Test Login" → **redirects to
  `/setlists` signed in** (anon would bounce to `/login`). Dashboard greets
  **"Good evening, [TEST]"** with full authed leader chrome (Create New Setlist,
  per-setlist Edit). Evidence: `r3c-bug12-signed-in-setlists-ipad.png`.
- Decisive network signal: `GET /api/auth/qr?code=v8-ex2RG…` → **200** (was 400 in §10).
  BUG-12 fix confirmed in a real browser, not just curl.

### Cell 2 — leader authoring walk ✅ PASS (CRC) · ⛔ broslaz NOT exercisable (see F-8)
Walked via the minted leader's own bearer over MCP (`assertEditor`/band_leader tier).
- **CRC host** (`www.centralreform.live/api/mcp`): `create_setlist` (isTest:true) →
  `bulk_add_tracks` 3 rows (committed:true, orders 0/1/2) → `get_setlist` shows
  **`orgId:"crc"`**, trackCount 3 → `reorder_setlist` (reverse, version 2→3) →
  `get_setlist` confirms reversed order (Prayer/Reading/Set A) → `delete_setlist`
  (tracksDeleted:3). Full create→add→reorder→delete authoring loop ✅.
- **broslaz host** (`www.brotherslazaroff.live/api/mcp`, same leader bearer):
  `create_setlist` succeeded but `get_setlist` shows **`orgId:"crc"`**, NOT
  `brotherslazaroff` — and it's visible from the CRC host. The CRC-minted test leader
  did **not** author into broslaz; it fell back to crc. → **F-8 (new, P3, harness-only):
  v11.4-04 default-both does NOT extend to MCP test accounts.** `provisionTestAccount`
  (`test-tokens.ts`) never seeds `orgIds` on the user doc/Auth claim and stamps the
  bearer `orgId:DEFAULT_ORG_ID` (crc); v11.4-04's default-both lives in
  `ensureUserProfile` + the one-time backfill, neither of which touches test accounts.
  So `getOrgIdsFromClaims` → `['crc']` → broslaz host x-org-id ∉ orgIds → primary-org
  fallback → crc. **NOT a leak — this is crc-pinning (a safety property);** the gap is
  only that cross-tenant authoring is **unverifiable via the current test harness**.
  Daniel's premise ("test accounts seed both orgs, so this CRC bearer covers broslaz")
  does not hold for MCP test accounts; verifying broslaz authoring needs a real
  both-org leader (e.g. David) or an orgIds-seeding option on `create_test_account`.

### Cell 3 — QR single-use real-claim + reuse-fails ✅ PASS (+ found BUG-13)
- **test-login link single-use:** re-`GET`-ing the already-consumed loginUrl code →
  **404 "Session not found"** (consumed+deleted on first poll). Reuse fails ✅.
- **genuine 6-char device-handoff claim e2e** (run in-page with the live session's
  Firebase ID token): `POST` create (client code `QZ7K9M`) → **`PUT` approve → 200
  `{success:true, userName:"[TEST] band_leader …"}`** → `GET` consume → **200
  `{status:"approved", token present, userName}`** (role fidelity: the granted session
  carries the band_leader persona) → re-`GET` → **404 "Session not found"** (single-use)✅.
- **🐛 BUG-13 (NEW, P2 — intermittent device-QR sign-in failure):** the FIRST device
  POST (empty body → server-generated code) returned **`"HEBFW"` — a 5-char code**,
  which the `^[A-Z0-9]{6}$` validators then 400 at both PUT-approve and GET-poll.
  Root cause: `generateCode()` (route.ts:22) does
  `randomBytes(4).toString("base64url").replace(/[^A-Za-z0-9]/g,"").slice(0,6)` — the
  `.replace` **strips any `-`/`_`** from the ~6-char base64url draw, so a draw containing
  them collapses to ≤5 chars, which the 6-char-anchored guard rejects. Independent of
  BUG-12 (GET was only widened, not the generator). Impact: the shared-iPad device-QR
  sign-in **intermittently fails** (a fresh code self-heals on retry), AND a short code
  POSTed creates a `qr-sessions` doc the GET-expiry cleanup can never reach (the format
  guard 400s before the expired-delete) → permanent orphan. Fix: make `generateCode`
  emit a fixed 6-char `[A-Z0-9]` string (e.g. draw more bytes / pad after stripping),
  OR have it not strip (keep base64url) and align the validator. Caveat: the QR client
  component generates the code client-side (POST honors a valid client code); whether
  the client's generator shares this flaw was not inspected this pass — VERIFY FIRST.

### Cell 4 — B3 leader publish UI / no-auto-blast ✅ PASS (preview/dryRun only)
Per the absolute stop-gate, **no real publish was ever issued** — preview/dryRun only.
- `preview_publish` (read-only): audience **18** (admin 3 / band_leader 1 / musician 14
  / member 0), chartHealth ok, `recommendation:"publish"`, **no send**.
- `publish_setlist({dryRun:true})`: `recipientCount:18`, candidate list surfaced, and
  **`delivery` all zero across inApp/push/email/sms** — would-publish set returned,
  nothing written or blasted. The explicit-recipient requirement on REAL publishes
  (`recipients_required`, v11.4-01) is deployed but was **not** re-triggered live (stop-gate).
- **Browser surface:** DOM scan of `/setlists` (dashboard) AND a setlist editor
  (`/setlists/[id]`, 78 controls) found **zero** publish/send/notify/recipient controls
  — consistent with `PublishDialog` being orphaned (v11.4-03) and publish being
  MCP-only/preview-first. No browser path auto-sends.

### Revised verdicts
- **BUG-12: ✅ FIXED + live-verified** (browser e2e sign-in restored). Supersedes §10's
  "re-blocked" status.
- **BUG-9: ✅ now FULLY closed end-to-end** — proxy (run-3) + consume (this pass): mint
  → open URL → land signed in → revoke/sweep → URL dead.
- **New findings:** BUG-13 (P2, generateCode short-codes break device-QR intermittently)
  and F-8 (P3 harness-only, default-both doesn't reach MCP test accounts).
- **Still open (not re-firable here):** broslaz leader authoring (needs a real both-org
  leader; brotherslazaroff.live MCP also still needs re-auth).

### Cleanup ledger (re-fire 2)
| uid / artifact | purpose | disposition |
|---|---|---|
| test-r3c-band_leader-a15fb1af | cells 1–4 (login, authoring, QR, publish-preview) | swept |
| setlist `b5334290…` (CRC authoring walk, 3 tracks) | cell 2 CRC | deleted in-walk |
| setlist `5fe8e4cb…` (broslaz-host, landed crc) | cell 2 broslaz | deleted in-walk |
| setlist `1588fb95…` (publish-preview, 1 bonded song) | cell 4 | swept via cascade |
| qr-sessions `v8-ex2RG…` (loginUrl) · `QZ7K9M` (device claim) | cells 1,3 | self-deleted on consume |
| qr-sessions `HEBFW` (5-char BUG-13 orphan, un-sweepable via GET) | cell 3 | deleted directly via Firebase MCP |

`cleanup_all_test_data({prefix:"r3c"})` → `{removed:1, failures:[], setlists:1, tracks:3,
mcpTokens:1, qr-sessions:0, …}`. `list_test_accounts({includeExpired:true})` → `{accounts:[]}`.
The lone non-testUid orphan (`HEBFW`, a BUG-13 side-effect) was deleted via
`firestore_delete_document` and re-GET confirmed **not found**; `QZ7K9M` re-GET also
not found. Throwaway MCP caller `.refire-mcp-call.mjs` (bearer via env, never hardcoded)
deleted. Browser closed. Admin + leader bearers are Daniel's to revoke per his note.
No real publish / email / push / SMS ever issued; no monitor changes.

> ## CLEANUP VERIFIED
> All `test-r3c-*` data swept (`accounts:[]`); every `qr-sessions` doc this pass created
> (`v8-ex2RG…`, `QZ7K9M`, `HEBFW`) confirmed gone; zero residual test artifacts. No
> real-people side-effects (preview/dryRun only). Evidence: `r3c-bug12-signed-in-setlists-ipad.png`.
