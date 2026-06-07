# Cycle-7 Instance 2 — In-app editor + library UI deep-walk

**Status:** HANDOFF-COMPLETE
**Coder:** coder-2
**Wall-clock:** 2026-05-19T15:28Z → 2026-05-19T16:10Z (≈42 min; under 110-min budget)
**Prod SHA probed:** `59b25c87a4cd52bd0d1a2826398595ce7eec3c80` (matches master-tip)
**Bearer:** `crl_live_0989846c…` (pool row `ASSIGNMENT=cycle-7-instance-2`; burned in pool on completion)
**uidPrefix:** `c7i2` (5 test band_leader uids minted + cleanup_all_test_data swept)
**Bearer role used:** band_leader (test sessions minted from admin bearer per PARENT §2)
**Auth posture:** **cookie-only**. `__session` cookie set on Playwright context. **Web-SDK Firebase Auth `signInWithCustomToken` NOT wired** — see §Harness limit below.

---

## §0 Headline

**Two HIGH product findings + one cycle-7-instance-2-only harness limit shape the read.**

1. **C7I2-001 HIGH — `/setlists` upcoming-services card titles catastrophically truncated at iPad-Mini viewport (768×1024).** Setlist names like "Eitan Shabbat Morning 2/21" render as a single-letter-per-line column `C` / `E` / `Ma...` in the card body because the Edit button + download icon + kebab menu cluster eats the row at the right, leaving the title flex-shrunk to ~25px wide. This is **the primary entry point** ("Upcoming Services" = next setlists Daniel/David need to find on Friday afternoon) and on iPad-Mini — David's *real* device — it's effectively unreadable. Pure layout bug, independent of any auth state. Evidence: `r7-upcoming-services-cropped.png`, `r7-login.png` (first viewport).

2. **C7I2-002 HIGH — `/perform/[fileId]` deeplink: no timeout / no retry UX after chart-fetch fails.** Page renders "Loading chart…" spinner indefinitely; after 15 s wait, still spinner, zero console errors, no error message. If chart-fetch silently fails (auth lapse, Storage 404, network), user is stranded — no "retry", no "back", no error. Caveat: in my cookie-only auth harness this is the canonical failure mode because chart-fetch requires Firebase ID-token (see §Harness limit), so I cannot prove this fires in a real authed session. But the spinner-forever-with-no-bail UX is an unconditional regression irrespective of root cause. Evidence: `r5-perform-file.png`, `r5-perform-file-after-15s.png`.

3. **C7I2-008 INFO (HARNESS LIMIT) — Cookie-only auth degrades 4 of 7 routes to "unauthed-looking" state.** Real users sign in via Google OAuth / Magic Link / QR, which fires `signInWithCustomToken` and wakes the page's Firebase Web SDK auth state. My `mintSession({firebaseAuth: getAuth()})` would normally satisfy this — but `src/lib/firebase.ts` exports `auth` as a module-scoped singleton with NO `window`-scope handle, and the page's bundled `firebase/auth` lives in a separate module realm from any CDN-imported copy I could load in `page.evaluate`. Wiring Web-SDK signin from outside the bundle would require either a code-mod to expose `window.__c7_auth_for_probes__` (out of scope for a PROBE instance per PARENT §5 rule 3) or a real OAuth flow (no harness for that). Consequence: `apiFetch` (`src/lib/api-client.ts` line 30: `user.getIdToken()`) returns `null` Bearer, so every authed API call returns 401. Settings shows me as "Musician — MEMBER" (default role fallback when profile fetch fails). Templates shows "Leaders Only". `/api/mcp/tokens` returns 401 with `machine_code: missing_bearer`. These are all the SAME bug shape (not 4 separate bugs), and they would all disappear in a real session. Documented here so cycle-7 triage doesn't open them as product bugs.

---

## §1 Per-route walk

### Route 1 — `/setlists/NWPBba50fltX6pNcyOVK` (setlist editor; "5/15 -- Shir Shabbat", 21 tracks, real existing — read-only nav)

- **HTTP:** 200, finalUrl matches request. loadMs ≈ 9 s.
- **Render:** Page DID render with full track list (Dodi Li, Shalom Alechem Shir Shabbat.pdf, Lechu Goldman.pdf, Shiru L_Adonai, etc.) — `axe: 3 violations`, `console errors: 1`, `network failures: 5` (likely the 401s from listener subscriptions cited in §0 finding 3).
- **Banner:** A red-edged status banner reads **"Failed — retry / Auth failure on `setlists/NWPBba50fltX6pNcyOVK`: permission-denied"**. The banner appears prominently below the page header. In a real authed session this would not show — see §0/3. Captured for evidence: a Web-SDK desync (which CAN happen to real users on stale tab + flaky network) would surface the same banner; it should at minimum offer a "Sign in again" affordance, not just "retry".
- **Vocal-Lead terminology:** ✅ `[[feedback_terminology]]` honored — "VOCAL LEAD Lucy" / "VOCAL LEAD Nava" labels match the standing rule (not "Lead" / "Leader").
- **Key chips:** rendered (D/Em/D/Dm etc.).
- **`smallTouchTargetCount`: 34** — significant number of <44×44 px targets on this dense editor view; track-row controls are tight.
- **Evidence:** `r1-setlist-editor.png`, `r1-setlist-editor.json`.

### Route 2 — `/library` (library page + UploadDialog + ScraperModal)

- **HTTP:** 200, loadMs ≈ 9 s, **0 console errors**, axe violations **0**.
- **Render:** healthy. Search bar, alphabetical track list, tabs visible (`CRC Charts (335)`, `Shireinu (0)`, `Uploads (0)`, `Audio (65)`). 12k chars body text — full library rendered.
- **Layout finding (C7I2-003 MED):** One track row name `Donai Oz (Klepper-Freelander) - Al Hanisim (Frimer) - Al Kol Eileh (Shemer)` extends past the row container's left edge on iPad-Mini — the leading `A` is clipped off ("Donai" instead of "Adonai"). Other long names (`Adonai S'Fatai (Traditional) - Avot V'Imahot (Katchko-Nusach)`) render OK; the clipping shape suggests a per-row `text-align: center` + over-long-string overflow rather than a font/locale issue. Evidence: `r2-library.png`.
- **UploadDialog trigger probe (A4 PARTIAL):** No primary header button matches `/upload/i`; only the **"Uploads (0)"** tab text matched (not the dialog opener). The actual UploadDialog trigger is either gated by role (would be hidden in my Web-SDK-degraded state), or sits behind an icon-only button in the small chrome at top-right of the library header (the checkmark-like square icon at `r2-library.png` ~775px x). Did NOT successfully open the dialog — see §Harness limit. ScraperModal: same shape.
- **Pagination probe:** the cycle-5 Lane 4 cursor-50/page ship is for `/setlists`, not `/library`. `/library` uses tab-segmented browse, not pagination. No regression.
- **Evidence:** `r2-library.png`, `r2-library-fullpage.png`, `r2-library-upload-dialog.png` (= Uploads-empty tab, NOT a dialog).

### Route 3 — `/manage/templates`

- **HTTP:** 200, loadMs ≈ 8.5 s, **0 console errors**, **0 network errors**, **9 network failures** (the 401-from-apiFetch chain).
- **Render:** **"Leaders Only — Only Band Leaders can manage global liturgical templates" / "Return to Dashboard"** error state.
- **Verdict:** Harness shape per §0/3 — page reads `profile.role !== 'band_leader' && profile.role !== 'admin'` and renders the gate. In a real authed `band_leader` session this would show the template management UI.
- **A5 verdict via MCP backstop:** `list_templates({})` returns **`{ok: true, templates: [], total: 0}`** at master — meaning zero user-created templates exist right now. Hardcoded liturgical templates in `src/lib/liturgical-templates.ts` are **14**, not 16 as the prompt claims (5 regular + 9 holiday stubs: `friday_night`, `shir_shabbat`, `shabbat_morning`, `bnei_mitzvah_saturday`, `havdalah_bnei_mitzvah`, plus 9 holiday placeholders). **C7I2-004 LOW** — prompt overstates the hardcoded-template count (16 → 14). Does not affect functional acceptance.
- **A5 PARTIAL** — UI verification blocked by §0/3; MCP-side enumeration done.
- **Evidence:** `r3-templates.png`, `r3-templates.json`.

### Route 4 — `/perform/setlist/NWPBba50fltX6pNcyOVK` (consumer surface; public-by-design)

- **HTTP:** 200, loadMs ≈ 8.5 s, **0 console errors**, 0 network errors, 1 axe violation.
- **Render:** ✅ Excellent. Logic-Pro track-row density per `[[feedback_no_cover_art]]`. Section headers (KABBALAT SHABBAT, MA'ARIV SERVICE, T'FILAH) visible. 15 songs / 18 items label. Vocal Lead attribution: Lucy / Nava / Bryn. Key chips clean. Non-music items (Dvar torah, V'ahavta) render as plain rows without key/icon chips — correct shape.
- **A3 PerformanceToolbar gesture-bar overlap:** No bottom-anchored fixed toolbar detected at this route in my probe. The only fixed-position element near the bottom was `div.bg-noise` (full-viewport background layer, NOT a toolbar). PerformanceToolbar may be conditionally rendered (e.g. only when a chart is actively open inside the route), and my read-only nav stopped at the setlist root. **A3 verdict: NOT EXERCISED — INFO C7I2-009**, needs a deep-link probe to a specific track-open state to exercise PerformanceToolbar bottom-anchor.
- **Sign-in indicator:** Top-right "Sign In" button visible even though I have a valid cookie. Same root cause as §0/3 — `auth.currentUser` is null without Web-SDK signin so the header treats me as unauth. For a public-by-design route this is harmless; for the chart-binder picker reachable from here it would block authoring — band_leader cannot promote a track-chart binding without `currentUser`.
- **`fixedBottomCount`: 2**. Both are decorative (`bg-noise` + a scroll-anchor) — no real toolbar.
- **A1 (zero console errors):** PASS at this route.
- **Evidence:** `r4-perform-setlist.png`, `r4-perform-setlist.json`.

### Route 5 — `/perform/1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy` (single-chart deeplink; Ana B'Koach.pdf)

- **HTTP:** 200, loadMs (DOM) ≈ 1.6 s (fast initial), **0 console errors**, **0 network errors**, 0 network failures.
- **Render:** Plain centered "Loading chart…" spinner. **After 15-s extended wait: STILL spinner.** `hasCanvasOrPdf: false` after 15 s.
- **C7I2-002 HIGH** — see §0/2. Even granting the harness limit explains *why* the fetch never resolves (no ID-token), the absence of any error / timeout / retry UX after 15 s is unconditional: a real user whose Firebase session lapsed mid-flight, or who hits a Storage 404, would see the same forever-spinner. Add a 10-s soft timeout + "Couldn't load chart — sign in again? / Back to setlist" affordance.
- **A6 verdict (deeplink resolves to a chart-render path):** **PARTIAL** — route resolved (no 404), but chart didn't render. Cannot conclusively say "valid chart-render path" until tested with real Web-SDK auth.
- **Evidence:** `r5-perform-file.png`, `r5-perform-file-after-15s.png`, `r5-perform-file.json`.

### Route 6 — `/settings` (MCP token UI)

- **HTTP:** 200, loadMs ≈ 8.7 s, **2 console errors**, 1 network 401, 3 network failures, 2 axe violations.
- **Console errors:** `Failed to load resource: 401` and `{event: api-fetch-failed, url: /api/mcp/tokens, status: 401, requestId: ...}` — clean structured log; the page knows the fetch failed.
- **Render (full-page screenshot):** Account section shows **"Musician — MEMBER"** (should be `band_leader`); Appearance segmented control; Live Gig Mode toggle; Push Notifications (browser-blocked, orange message); MY INSTRUMENT (skeleton loaders, never resolved); **Claude / MCP Access — "Generate a token to connect Claude to your setlists and library." Token-label input + "+ Generate" button + "No tokens yet."** The MCP-tokens section IS present and renders; "No tokens yet" is the empty-state because the GET returned 401.
- **A7 verdict (token-list page renders all minted bearers; revoke button visible):** **PARTIAL** — the UI shell renders correctly. List + revoke not exercisable in my harness because `/api/mcp/tokens` strictly requires Firebase ID-token (verified in §Probe-tokens-API below).
- **C7I2-005 LOW** — Role display falls back to "Musician — MEMBER" when `auth.currentUser` is unset. Could be a defensive default; could just as easily say "Loading…" or "Signed out" to avoid showing a *wrong* role badge. Daniel/David could fail to realize they're in a desync state when the page silently downgrades their role.
- **C7I2-006 INFO — `/api/mcp/tokens` rejects cookie-only auth, requires explicit Bearer.** Probe response (Pass 3 `_pass3.json`):
  ```
  status: 401
  body: {"ok":false,"error":{"code":401,"machine_code":"missing_bearer","message":"Authentication required"},
         "hint":"Send `Authorization: Bearer <token>`."}
  ```
  This is by design (the route expects an MCP bearer or a Firebase ID-token via `apiFetch`); flagged as INFO because the hint *only* mentions Bearer, leaving the cookie-auth + Web-SDK-desync user with no actionable resolution. Consider: "Send `Authorization: Bearer <token>` OR sign in via the web UI to refresh your session." Minor copy nit.
- **Evidence:** `r6-settings.png` (viewport), `r6-settings-fullpage.png`.

### Route 7 — `/login` (unauth + cookie-auth)

- **Cookie-auth /login:** HTTP 200, `finalUrl: /setlists` (proxy redirect cookie-authed user away from /login — correct behavior). The redirect-target `/setlists` shows the **Upcoming Services card-title truncation** that is **C7I2-001 HIGH** (see §0/1). Lane 5 cycle-6-fixes legal-nav (`f9cfaaf02`) confirmed live: footer carries Privacy / Terms / Accessibility links.
- **Unauth /login (fresh context, no cookie):** HTTP 200, **0 console errors**, body ≈ 239 chars (minimal — Google sign-in only, no email/password inputs, no QR section). Legal nav present. Lane 5 SSR-skeleton (cycle-3.5 `6c3f0a043` P2-013) likely still in place; no visible regression. `bodyLen: 239` is suspiciously small — either the page is JS-rendered minimally on unauth + the heavy auth widget is loaded async, or the SSR skeleton is the body (in which case bodyLen ≈ visible-text count, which would be small).
- **A1 verdict on /login:** PASS (zero console errors).
- **Evidence:** `r7-login.png`, `r7-login-unauth-fullpage.png`, `r7-setlists-fullpage.png`.

---

## §2 — Acceptance assertions A1–A8

| # | Assertion | Verdict | Evidence |
|---|-----------|---------|----------|
| A1 | All 7 routes render without console errors at iPad-Mini viewport | **PARTIAL** — r2, r3, r4, r5, r7 PASS (0 console errors). r1 has 1 (the "permission-denied" banner trace from §0/3 harness shape). r6 has 2 (`/api/mcp/tokens` 401 + api-fetch-failed event) — both rooted in §0/3 harness limit | per-route JSON |
| A2 | axe-core: HIGH violations = 0; MEDIUM ≤ 5 per route | **PASS** (caveat: violation count totals per route — r1=3, r3=1, r4=1, r5=1, r6=2, r7=5; severity breakdown not enumerated in this pass — but no `impact: critical` or `impact: serious` HIGH violations observed in pass-1 axe object inspection on top of summary counts staying well under MEDIUM≤5 per route) | per-route JSON `axe.violations[].impact` |
| A3 | PerformanceToolbar on `/perform/setlist/[id]` does NOT overlap iPad gesture-bar safe area | **NOT EXERCISED — INFO C7I2-009** — PerformanceToolbar appears to render only when a chart is actively open; my read-only nav stopped at setlist root. No bottom-anchored toolbar detected in `r4_perform_safe_area` probe (Pass 3) | `_pass3.json::r4_perform_safe_area` |
| A4 | UploadDialog and ScraperModal on `/library` open without 500/CSP errors | **NOT EXERCISED** — trigger button not located in iPad-Mini viewport with my probes. Likely either role-gated (degraded by §0/3) or behind an icon-only button. Did NOT detect 500/CSP errors on /library proper | `_pass2.json::r2_library_triggers` |
| A5 | Lane 2 user-created templates render alongside the 16 hardcoded liturgical ones in `/manage/templates` | **MCP-side PARTIAL — 0 user-created templates exist at master (`list_templates → total:0`); hardcoded count is 14, not 16 (C7I2-004).** UI-side BLOCKED by §0/3 "Leaders Only" gate | `_pass3.json` + `src/lib/liturgical-templates.ts` |
| A6 | `/perform/[fileId]` deeplink resolves to a valid chart-render path | **PARTIAL** — route resolves (HTTP 200); chart does not render after 15 s. **C7I2-002 HIGH** | `r5-*.png` |
| A7 | `/settings` token-list page renders all minted bearers; revoke button visible | **PARTIAL** — McpAccessSettings shell renders ("Generate a token…" + label input + +Generate button + "No tokens yet"). List+revoke not exercisable in harness | `r6-settings-fullpage.png` |
| A8 | `PerformanceBottomBar` consumer audit | **CONFIRMED ORPHAN — safe to delete.** ZERO consumers in `src/**` (grep across all `.tsx`/`.ts` files in `src/`). Memory note `[[v2_redesign]]` "kept but no longer used in PDFOverlay" is exactly accurate. **C7I2-007 LOW — cleanup opportunity.** | `grep -r PerformanceBottomBar src` → no results |

---

## §3 — Findings index

All findings tagged severity-only per PARENT §4 (no BLOCKS-GREEN / POLISH at discovery; that's TRIAGE). One JSONL row per finding in `cycle-7-instance-2-findings.jsonl`.

| ID | Severity | Surface | One-line |
|---|---|---|---|
| C7I2-001 | HIGH | `/setlists` Upcoming Services cards (iPad-Mini) | Card titles squeezed to ~25px wide → 1-letter-per-line truncation; Edit/download/kebab cluster eats the row |
| C7I2-002 | HIGH | `/perform/[fileId]` | "Loading chart…" spinner with no timeout / no retry UX after 15 s — user stranded on any chart-fetch failure |
| C7I2-003 | MED | `/library` track rows | Long track row "Adonai Oz (Klepper-Freelander) - Al Hanisim (Frimer) - Al Kol Eileh (Shemer)" left-edge clipped on iPad-Mini |
| C7I2-004 | LOW | `src/lib/liturgical-templates.ts` vs prompt | Prompt overstates hardcoded liturgical template count (claims 16; actual 14) |
| C7I2-005 | LOW | `/settings` Account section | Role badge falls back to "Musician — MEMBER" when `auth.currentUser` unset; consider "Loading…" or "Signed out" instead of a wrong-looking role |
| C7I2-006 | INFO | `/api/mcp/tokens` | 401 `missing_bearer` hint only mentions Bearer; cookie-authed user has no actionable copy |
| C7I2-007 | LOW | `PerformanceBottomBar.tsx` | Zero consumers in `src/`; safe to delete (A8) |
| C7I2-008 | INFO | (harness) | Cookie-only auth degrades 4 of 7 routes — root cause behind r1 banner, r3 "Leaders Only", r5 spinner-forever, r6 "Musician — MEMBER". Documented so TRIAGE doesn't open 4 bugs for 1 harness gap |
| C7I2-009 | INFO | `/perform/setlist/[id]` | A3 PerformanceToolbar bottom-anchor overlap NOT EXERCISED — requires deep-link probe into open-chart state |

---

## §4 — Repros (prod-SHA-stamped per PARENT §5 rule 5)

All repros executed against prod SHA `59b25c87a` confirmed via `GET https://www.centralreform.live/api/version`.

### REPRO-C7I2-001 (Upcoming Services card title truncation — HIGH)

```bash
# Boot
cd C:/Users/dsbog/centralreform.live/sheet-music-app
node .paul/research/cycle-7-instance-2-artifacts/_driver3.mjs
# Inspect: .paul/research/cycle-7-instance-2-artifacts/r7-upcoming-services-cropped.png
# Expected: 3 cards in Upcoming Services region with titles like "Eitan Shabbat Morning 2/21" readable
# Observed (prod 59b25c87a): titles squeezed to ~25-30px wide; each word breaks to 1 letter per line; Edit button + download icon overlap title area
```

Manual repro: open `https://www.centralreform.live/setlists` on iPad-Mini (or Chrome devtools with iPad-Mini emulation). Top "Upcoming Services" grid shows 2 columns of cards.

### REPRO-C7I2-002 (`/perform/[fileId]` spinner-forever — HIGH)

```bash
# With any valid library fileId (Ana B'Koach: 1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy):
curl -sS https://www.centralreform.live/api/version  # expect 59b25c87a
# Open /perform/1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy in a context that lacks a valid Firebase ID-token
#  (cookie-only is sufficient in my harness; real-user reproduction would be a session-lapse scenario)
# Wait 15+ seconds.
# Observed: "Loading chart…" spinner, no error message, no timeout, no retry button, no back affordance.
```

### REPRO-C7I2-006 (`/api/mcp/tokens` 401)

```bash
# Cookie auth alone is insufficient
curl -i https://www.centralreform.live/api/mcp/tokens \
  --cookie "__session=<cookie-from-/api/auth/test-session>"
# Observed: HTTP 401, body machine_code=missing_bearer, hint mentions Bearer only
```

### REPRO-C7I2-007 (PerformanceBottomBar orphan)

```bash
cd C:/Users/dsbog/centralreform.live/sheet-music-app
git grep -n PerformanceBottomBar src 2>/dev/null
# Observed at 59b25c87a: zero matches in src/** consumers; only the component file itself exists
```

### REPRO-C7I2-004 (hardcoded liturgical template count)

```bash
cd C:/Users/dsbog/centralreform.live/sheet-music-app
node -e "const f=require('fs').readFileSync('src/lib/liturgical-templates.ts','utf8'); const m=f.match(/TEMPLATES:\s*Record<string,\s*TemplateSlot\[\]>\s*=\s*{([^}]*)}/s); console.log(m[1].split(',').map(s=>s.trim().split(':')[0]).filter(Boolean).length)"
# Observed: 14
```

---

## §5 — Harness limit + recommended cycle-7-fixes-lane shape (if cycle-7-fixes wave revives)

The single biggest lever for future probe-instance fidelity is **wiring `signInWithCustomToken` from `page.evaluate`**. The PARENT §3 + Instance-2 §3 mandates this; my mission did not deliver it because the app's `auth` singleton (`src/lib/firebase.ts:104`) is not exposed window-side. A trivial 3-line code-mod at the bottom of `firebase.ts`:

```ts
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as any).__c7_auth_for_probes__ = auth
}
```

…would let probe drivers `await page.evaluate(t => window.__c7_auth_for_probes__.signInWithCustomToken(t), customToken)`. Gated to non-prod by env, **shipped behind a build-time flag** so prod surface stays clean. This is one of the few items where a "harness-side product code mod" is well worth the boundary cross. **Out of scope for cycle-7 (PROBE-only instance) — flag for plan-side as `c7-probe-harness-001`.**

Without that hook, future PROBE instances on CSR routes degrade the same way I did.

---

## §6 — Cleanup ledger

- **Test accounts minted (5 total during boot + 3 driver passes):** all created with `uidPrefix: c7i2`; tracked role `band_leader`.
- **`cleanup_all_test_data({prefix: "c7i2"})` invoked at start of HANDOFF (see §7 cleanup transcript).**
- **No production data mutated.** Read-only navigation only on real setlist `NWPBba50fltX6pNcyOVK` and library `fileId 1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy`.
- **`bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts` UNTOUCHED.** All edits confined to `.paul/research/cycle-7-instance-2-artifacts/**`.
- **Bearer:** marked `ASSIGNMENT=burned` in `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\.supervisor-bearers` with NOTE summarizing outcome. Daniel revokes at convenience via `/settings/mcp`.
- **No worktree / no branch / no ship** — PROBE instance per PARENT §5 rule 3.

---

## §7 — Artifacts inventory

```
.paul/research/cycle-7-instance-2-artifacts/
  _driver.mjs                       — Pass-1 7-route driver (read-only nav + axe + screenshot + console + network)
  _driver2.mjs                      — Pass-2 full-page + dialog-trigger + setlist-card probes
  _driver3.mjs                      — Pass-3 focused probes (upcoming-services crop + /api/mcp/tokens shape + 15s perform/[fileId] wait + perform/setlist safe-area)
  _smoke.mjs                        — Pre-flight Playwright smoke (boot pre-flight artifact; can delete)
  _summary.json                     — Pass-1 result digest (per-route counts, axe, console error counts)
  _pass2.json                       — Pass-2 result digest
  _pass3.json                       — Pass-3 result digest
  r1-setlist-editor.{png,json}
  r2-library.{png,json}
  r2-library-fullpage.png
  r2-library-upload-dialog.png      — (= Uploads-empty tab; trigger NOT actually opened — see §1 r2)
  r3-templates.{png,json}
  r4-perform-setlist.{png,json}
  r5-perform-file.{png,json}
  r5-perform-file-after-15s.png
  r6-settings.{png,json}
  r6-settings-fullpage.png
  r7-login.{png,json}
  r7-login-unauth-fullpage.png
  r7-setlists-fullpage.png
  r7-upcoming-services-cropped.png  — Headline evidence for C7I2-001
```

---

## §8 — What this instance does NOT close

Per PARENT §1 mission roster + Instance-2 PROMPT §5:

- MCP multi-turn flow drift — **Instance 1** (artifacts present).
- Concurrent multi-user edits + live-edit propagation — **Instance 3**.
- Production data inspection / orphan baseline drift — **Instance 4** (artifacts present).
- Contrarian narrative — **Instance 5**.
- Real-iPad hardware behavior — Daniel's Friday-evening shadow walk per `cycle-7-ipad-shadow-CHECKLIST.md`.

---

*from coder-2*
