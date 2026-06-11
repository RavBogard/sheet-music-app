# STRESS-TEST REPORT — Browser half (Playwright adapter) — 2026-06-10

Successor to `STRESS-TEST-REPORT-2026-06-10.md` (run 1, MCP/data layer). Executed run 1's
`## INCOMPLETE` list with **Playwright (chromium)** standing in for Claude-in-Chrome.
Judged against `docs/ACCESS-POLICY.md` (v0.2). BUG numbering continues from BUG-3.
Evidence in `.paul/research/stress-evidence-2026-06/`.

> **Run history this session.** Started on a **member-role** MCP bearer (anon-only work,
> BUG-4..7). Daniel then swapped in a **fresh admin bearer**, which unblocked minting
> loginable accounts → the persona half (BUG-8, BUG-9, the D4/D6 rendered gates, Pass B).
> The admin bearer was used only for the master-prompt scope (mint test accounts,
> assign/unassign monitor buses, `get_web_vitals_summary`, stored-org verification,
> cleanup) via the deployed `/api/mcp` JSON-RPC transport.

> **Harness note (important).** The intended browser sign-in path —
> `create_test_account({loginable:true})` → open the one-time `/test-login?code=…` URL —
> is **broken in production (BUG-9)**: unauthenticated `/test-login` is 307'd to `/login`
> by the `proxy.ts` allowlist before its client custom-token consume runs. I verified the
> root cause in code and then drove persona sign-in two faithful ways: (a) replicating the
> app's own `syncSessionCookie` step (real pre-approved token → `/api/auth/session`) for
> SSR-gated surfaces, and (b) for client-SDK-gated surfaces (monitor), navigating
> `/test-login` **while already holding a session** (which passes the proxy), so the page's
> real `signInWithCustomToken` runs and yields genuine Firebase Web SDK auth. No auth was
> fabricated — every session came from a real pre-approved test-account token via the app's
> own endpoints.

---

## 1. Summary

- **Severity counts (browser layer, this run):** P0 **0** · P1 **0** · P2 **4** · P3 **2** · Policy questions **3**.
- **Worst finding:** **BUG-5 (P2, borderline P1)** — anon `GET /api/library/file/[id]`
  (Firebase-Storage `upload-*` charts) → **401 `missing_bearer`**, while `/api/drive/file/[id]`
  → **200**. The policy lists both under the anon-✅ chart-deep-link row; Storage is the
  go-forward backend, so a texted deep link to a *recent* chart is dead for a signed-out
  visitor — straight against the prime directive.
- **Two confirmed access defects beyond BUG-5:** **BUG-8 (P2)** — the `member` persona sees
  the full CRC library (472 charts), so the D4 musician-tier gate is absent; **BUG-9 (P2,
  harness-blocking)** — the loginable `/test-login` flow is non-functional in prod (proxy
  allowlist gap). **BUG-4 (P2)** — anon transpose is dead (401 chord-scan), now confirmed
  **anon-specific** (works for authed musicians).
- **Strongest positives (verified in-browser):** per-host branding/vocab clean, no cross-leak
  (inv 1); anon list/open/Perform render + cross-tenant deep links open (D1/D2/D3); anon
  write controls invisible (inv 6); `/library`·`/manage`·`/admin` gate anon to `/login`;
  QR scan-target is a pure sign-in gate (D5); **D6 monitor gates hold** — unassigned
  musician sees "Access Denied", an assigned musician sees **only their own bus**; leader
  sees authoring affordances members/musicians don't; authed transpose works.
- **Overall worthiness: 7.5/10.** Core consumer + permission model is sound and on-brand.
  Held back by: Storage-chart anon deep links (BUG-5), member-library over-exposure (BUG-8),
  a broken test harness (BUG-9), dead anon transpose (BUG-4), and `/perform` perf (BUG-2 carry).
- **Cleanup: CLEANUP VERIFIED** — 10 test accounts swept (failures: []), 2 monitor buses
  returned to empty, bus 5 (Daniel) untouched, no setlists/charts created, no faders moved.

---

## 2. Findings

Severity key: P0 data-loss/security/tenancy · P1 core flow broken · P2 degraded · P3 polish.
No fixes prescribed.

### BUG-4 (P2) — Anon transpose in Perform mode does nothing and spams 401s *(now confirmed anon-specific)*
- **Persona/tenant/viewport/surface:** Anon · CRC · iPad 1180×820 · transpose panel in Perform mode.
- **Repro (anon):** open a chart → tap transpose (`+0`) → panel shows **"Waiting for scan…"**;
  tap Transpose up → counter reads "+1 semitones" but the notation does not change. Console:
  `401` on `GET /api/library/chord-cache?fileId=…` (meta, page=1, page=2) and `POST /api/ai/transposer/scan`.
- **Contrast (authed musician, this run):** same chart, same action → chord-cache GET/PATCH +
  scan all **200**; the panel shows **"DETECTED KEY: D", "21 chords detected", "Edit Chords"**.
  So transpose is functional for signed-in users and broken only for anon.
- **Expected:** anon may use Perform mode (D1); transpose is a core Perform tool (Pass B exercises it).
- **Actual:** the chord-scan/chord-cache endpoints require auth → anon's transpose dead-ends on
  "Waiting for scan…" with console 401s and no re-render.
- **Evidence:** `anon-crc-transpose-up-ipad.png`, `musician-transpose-authed-works-ipad.png`,
  network excerpts (anon 401 vs authed 200).
- **VERIFY FIRST / decision:** is anon transpose meant to be gated (AI-cost) or available? If gated,
  the fix is UX (don't show a dead "Waiting for scan…" + don't log 401s); if available, the scan/
  cache endpoints need an anon path. (Policy is silent → also Policy Question 2.)

### BUG-5 (P2, borderline P1) — Anon chart deep link 401s for Storage-backed charts (Drive ones work)
- **Persona/tenant/surface:** Anon · CRC · `GET /api/library/file/[id]` vs `GET /api/drive/file/[id]`.
- **Repro (same-origin `fetch`, cache-bypassed, no bearer):**
  - `/api/drive/file/11w4r08…` → **200 `application/pdf`**.
  - `/api/library/file/upload-3a06e127-…` → **401 `application/json`** (`missing_bearer`).
- **Expected:** ACCESS-POLICY anon chart-deep-link row names *both* endpoints as ✅. Prime directive: never wrongly deny a chart read.
- **Actual:** Drive-backed charts honor anon; Storage-backed (`upload-*`) charts 401. New uploads
  are Storage-backed, so anon deep links to *new* charts break.
- **Evidence:** `browser_evaluate` result (`{drive:200/pdf, library_storage:401/json}`); the
  in-Perform render of the Storage chart was served from **HTTP disk cache** (zero
  `/api/library/file` calls fired even after SW + Cache-API clear), masking the failure.
- **VERIFY FIRST:** open a setlist containing an `upload-*` chart on a **truly cold device**
  (empty HTTP cache) as anon, in Perform mode — render or blank? Blank ⇒ unambiguously **P1**.

### BUG-8 (P2) — `member` persona sees the full CRC library (D4 role gate absent)
- **Persona/tenant/viewport/surface:** Member (signed in, role `member`) · CRC · iPad · `/library`.
- **Repro:**
  1. Sign in as a `member` test account (session cookie set via the app's `/api/auth/session`).
  2. Navigate `/library`. The page renders the full catalog: **"CRC Charts (472)"**, "Shireinu (0)",
     "Uploads (0)", "Audio (65)", a working search box, and browsable chart rows (Abanibi, Achot
     ketana, Adio kerida, …). A "Library" nav tab is also present. Zero deny/"unauthorized" text.
- **Expected:** ACCESS-POLICY read-surface "Library browse (this host's org)" = **Member ❌ D4**
  (musician+ only). The policy's own emphasis note flagged this exact cell to verify ("verify the
  role gate exists at all").
- **Actual:** the member sees and can search the entire library; the musician-tier gate does not exist
  at the rendered layer.
- **Evidence:** `member-crc-library-viewport-BUG.png`, `member-crc-library-ipad.png` (full 472-row
  catalog), snapshot grep (486 catalog refs, 0 deny refs).
- **Note / Policy Question 3:** this is *over-permissive*, not a private-data leak — charts are meant
  to be broadly viewable, and the prime directive + the err-public standing rule lean toward access.
  Daniel may choose to **relax D4** (member ✅) rather than fix it. Flagged against the oracle as-written.

### BUG-9 (P2, harness-blocking — no end-user impact) — Loginable `/test-login` is dead in prod (proxy allowlist gap)
- **Persona/tenant/surface:** Anon (pre-session) · CRC · `/test-login?code=…`.
- **Repro:**
  1. `create_test_account({loginable:true})` → one-time `loginUrl: /test-login?code=…`.
  2. Open it signed-out → server **307 → /login** ("Sign-in didn't complete"); the client
     `signInWithCustomToken` never runs (no `identitytoolkit` exchange fires).
  3. The backend is healthy: `GET /api/auth/qr?code=<test-code>` → **200 `{status:"approved", token}`**.
  4. Open the **same** `/test-login?code=…` *while already holding any session cookie* → it renders,
     the client signs in, and redirects to `/setlists` (works).
- **Expected:** `/test-login` is the documented loginable-account landing; it must be reachable
  while unauthenticated (you sign in *there*), exactly like `/qr/*`.
- **Actual / root cause (code-confirmed, `src/proxy.ts`):** the public-route allowlist —
  `publicExactRoutes` + `publicPrefixes = ['/perform','/qr','/.well-known']` — **omits `/test-login`**.
  So `if (!session && !isPublicRoute)` 307s it to `/login` before the page can consume the code.
  `/qr` is allowlisted with the exact "used before having a session" rationale; `/test-login` is not.
- **Impact:** **no congregant/musician impact** — real users sign in via Google or the QR
  device-handoff, not `/test-login`. But it 100%-breaks the loginable test harness and derailed
  the pre-flight of two consecutive stress runs.
- **Evidence:** `proxy.ts:62-78` (allowlist), `src/app/test-login/{page.tsx,TestLoginClient.tsx}`
  (the consume flow), redirect-follow fetch (`redirected:true → /login`, login HTML), and the
  with-session success (redirect to `/setlists`).

### BUG-6 (P3) — broslaz PWA manifest returns the SPA HTML shell, not JSON
- **Persona/tenant/surface:** Anon · broslaz · `GET /manifest-brotherslazaroff.json`.
- **Repro:** cold-load `brotherslazaroff.live` → console `Manifest: Line 1, column 1, Syntax error`;
  `fetch('/manifest-brotherslazaroff.json')` → **200 `text/html`**, body `<!DOCTYPE html>…data-org="brotherslazaroff"`.
- **Expected:** the linked PWA manifest must be valid JSON (add-to-home-screen / standalone on iPads).
- **Actual:** the manifest path resolves to the app shell, not a manifest; PWA install degraded on broslaz.
- **Evidence:** `anon-broslaz-perform-landing-ipad.png`, console + fetch head dump.
- **VERIFY FIRST:** filename/link mismatch vs missing rewrite; confirm CRC's `manifest-crc.json`
  resolves to JSON (couldn't compare cross-origin — CORS). NB: `proxy.ts` matcher excludes only
  `manifest.json`, not the org-suffixed variants.

### BUG-7 (P3) — QR/test-login code-status endpoint 500s on a malformed code
- **Persona/tenant/surface:** Anon · CRC · `GET /api/auth/qr?code=…`.
- **Repro:** `?code=BOGUS1` → **404** "Session not found"; `?code=short` → **404**; `?code=..%2Fetc`
  → **500** "Failed to check session"; `?code=<live>` → **200**; `?code=<expired/used>` → **410** "Gone".
- **Expected:** deterministic client errors should be 4xx (404/400), not 500 (the v11.2 contract).
- **Actual:** a code containing `/` throws (likely used as a Firestore doc id) → 500. No traversal
  succeeded; this is an error-contract blemish, not a breach.
- **Evidence:** `browser_evaluate` result table.

---

## 3. Policy questions (for Daniel, not Claude Code)

1. **"Schedule view" surface.** Policy lists *Schedule view* ✅ for anon; `/schedule` redirects anon to
   `/login`, and authed users get a `/schedule` nav link. The *public* schedule is the upcoming-services
   list on `/perform` (anon ✅). Confirm "Schedule view" = `/perform` list and `/schedule` is the authed
   assignments page (then no bug).
2. **Anon transpose / AI-scan gating** (BUG-4): should signed-out visitors transpose at all? If the AI
   scan is intentionally auth-gated for cost, the bug is purely the dead-end UX + console 401s.
3. **D4 member library** (BUG-8): keep members out of the library catalog (current policy, currently
   *not* enforced), or relax D4 to member-✅ per the err-public prime directive? The code currently
   does the latter.

---

## 4. UX friction journal

| # | Item | Rating | Evidence |
|---|---|---|---|
| F-1 | `/perform` cold load over the 2 s bar — p75 **LCP 2600 / FCP 3012 / TTFB 1398 ms** (field RUM, n=303) | **Annoying** | `get_web_vitals_summary` (confirms run-1 BUG-2) |
| F-2 | `/perform` p75 **CLS 0.2** — visible layout shift, and **worse than run-1's 0.15** (regression) | **Annoying** | same |
| F-4 | Two near-identical **"Shabbat Morning — Parashat Sh'lach — June 13"** setlists (16 / 15 songs) both on the public anon landing — visitor can't tell which to open (data hygiene, not a policy bug) | **Annoying** | `anon-crc-perform-landing-ipad.png`, `list_setlists` |
| F-5 | Anon transpose dead-ends on "Waiting for scan…" with no explanation (BUG-4) | **Annoying** | `anon-crc-transpose-up-ipad.png` |
| F-6 | Cold landing fires `POST /api/auth/qr` → **429** then self-heals on retry; `/api/web-vitals` also 429 | **Minor** | network log |

Positives: MusicXML render quality excellent on iPad; Perform paging (Next song, skips section
headers correctly) is instant; healthy routes — `/setlists` (LCP 1.1 s, CLS 0.02), `/perform/setlist/[id]`
(LCP 1.4 s, CLS 0.01), `/library` (LCP 1.4 s). Layout clean across 390 / 1180 / 1440.

---

## 5. Coverage table

Legend: ✅ OK · 🐛 BUG-n · ⏭ untested (+why).

### Pass A step 1 — Anon, both hosts

| Cell | CRC | broslaz | Notes |
|---|---|---|---|
| Landing / branding (per host) | ✅ (390/1180/1440) | ✅ | CRC light "Services & Setlists"; broslaz dark "Shows & Sets"; no cross-leak (inv 1) |
| Setlist list (host org) | ✅ | ✅ | host-scoped |
| Setlist detail | ✅ | ✅ (via D3) | no write controls (inv 6) |
| Perform mode (chart render) | ✅ MusicXML + scanned image | ✅ (via D3) | |
| Chart deep link `/api/drive/file/[id]` | ✅ 200 | — | Drive anon-accessible |
| Chart deep link `/api/library/file/[id]` | 🐛 **BUG-5** 401 | (same backend) | Storage anon-DENIED |
| Recordings / audio (D2) | ⏭ Audio(65) tab exists but no anon-playback exercised | ⏭ | carry-forward |
| Library URL (deny D4) | ✅ → `/login` | ⏭ | |
| Schedule (`/schedule`) | ⚠️ → `/login` (Policy Q1) | ⏭ | public schedule = `/perform` list ✅ |
| `/manage` / `/admin` (deny) | ✅ → `/login` | ⏭ | |
| Write controls invisible (inv 6) | ✅ | ✅ | anon MONITOR → "No monitor connected" (no faders) |

### Pass A step 2 — Cross-tenant deep links (D3)

| Cell | Result |
|---|---|
| broslaz setlist URL on CRC host, anon | ✅ opens (broslaz content, CRC chrome — inv 1: scoping = lists, not direct URLs) |
| UI lists stay host-scoped | ✅ CRC lists only CRC, broslaz only broslaz |
| No CRC-brand leak on broslaz | ✅ |

### Pass A steps 3–6 — Authenticated personas (admin bearer + faithful sign-in)

| Cell | Result | Notes |
|---|---|---|
| test-member: library hidden (D4) | 🐛 **BUG-8** | member sees full 472-chart catalog |
| test-musician: full read | ✅ | library + setlists + schedule + monitor nav all present |
| test-musician (no bus): monitor shows no faders (D6) | ✅ | "Monitor Access Denied — ask a sound engineer for a bus" |
| test-musician (with bus): own-bus-only (D6) | ✅ | sees **only** MON 2 Bass / Bus 2 (its assigned bus); no other bus, no switcher. **No faders moved.** |
| test-leader: authoring affordances (this org) | ✅ | per-row "Edit setlist" + "Setlist menu" + "Gig Packet" on CRC |
| test-leader-crc: authoring WALL on broslaz (UI) | ⏭ | cross-host real-auth sign-in not run; **data-layer wall ✅ in run 1** (CRC bearer→broslaz id→404) |
| Loginable `/test-login` harness | 🐛 **BUG-9** | proxy 307→/login for unauth |

### Pass A step 7 — QR / test-login auth (D5)

| Check | Result |
|---|---|
| Register (`POST /api/auth/qr`) | ✅ 200 `{code, expiresAt}` (~5-min) |
| Poll pending | ✅ 200 `{status:"pending"}` |
| Pre-approved test code | ✅ 200 `{status:"approved", token}` |
| Scan-target `/qr/[code]` (anon) | ✅ sign-in gate only, no content/session granted |
| Expired/used code | ✅ **410 "Gone"** → page shows "Invalid or expired" (clean) |
| Invalid code | ✅ 404 "Session not found" |
| Malformed code (`/`) | 🐛 **BUG-7** 500 |
| Single-use reuse-after-successful-claim | ⏭ inferred (consume marks used; 410 on reuse) — not isolated end-to-end |
| Role fidelity of granted session | ✅ implied (member/musician/leader sessions each carried correct role gates) |

### Pass B — day-to-day worthiness (authed musician)

| Step | Result |
|---|---|
| cold → setlist → open chart | ✅ |
| page through → next song | ✅ (Next skips section headers to next song) |
| transpose | ✅ authed (DETECTED KEY D, 21 chords) — anon 🐛 BUG-4 |
| play recording while viewing chart | ⏭ carry-forward (no audio track exercised) |
| offline degradation | ⏭ carry-forward |
| leader create→add 3→reorder→delete (UI) | ⏭ not run in UI; **MCP authoring ✅ run 1**; leader Edit affordances present ✅ |

### Viewports
iPad 1180×820 primary (landing, detail, Perform, transpose, monitor ×3 personas, QR, cross-tenant,
member library) · iPhone 390×844 (landing) · desktop 1440×900 (landing) — all ✅, no jank.

---

## 6. Cleanup ledger + confirmation

**Test accounts created (all `test-strs0610b-*`, admin bearer):**

| Account | Role | Purpose | Disposition |
|---|---|---|---|
| member-5aab5420 | member | preflight login probe (loginUrl failed → BUG-9) | swept |
| member-4d3b97ca | member | preflight retry | swept |
| member-4ceac0a7 | member | route probe | swept |
| member-01c491bf | member | qr-approval probe | swept |
| member-09305f9c | member | **D4 test — signed in, BUG-8** | swept |
| musician-150da2ba | musician | no-bus monitor (D6) | swept |
| musician-36b5ecb9 | musician | with-bus (bus 1) | bus 1 unassigned → swept |
| musician-c0fbe638 | musician | with-bus (bus 2) — own-bus-only (D6, real auth) | bus 2 unassigned → swept |
| band_leader-33e3f09f | band_leader | leader (code expired → 410) | swept |
| band_leader-e4f9b208 | band_leader | leader authoring affordances | swept |

**Monitor buses:** bus 1 ← musician-36b5ecb9, bus 2 ← musician-c0fbe638 — **both unassigned**
before cleanup. Bus 5 (Daniel) never touched. **No faders/mutes/matrix levels moved** (bridge
was offline/stale since 2026-06-06 throughout).

**Cleanup actions:** `unassign_monitor_bus(1)` + `unassign_monitor_bus(2)` → `assignedTo:[]`;
`cleanup_all_test_data({prefix:"strs0610b"})` → `removed:10, failures:[], qr-sessions:3, mcpTokens:10,
setlists/library/songs:0`. Browser session signed out (`DELETE /api/auth/session` → 200).

**Verification:** `list_test_accounts({includeExpired:true})` → `{accounts:[]}`;
`list_monitor_buses` → buses 1–4 `assignedTo:[]`, bus 5 only Daniel (unchanged).
Throwaway MCP-caller script (`.stress-mcp-call.mjs`, no hardcoded secrets) deleted.

> ## CLEANUP VERIFIED
> No stress-test artifact remains. Zero setlists/charts/songs were ever created. The two
> pre-existing `[role-*] tiny` CRC library rows (run-1 BUG-1) and the duplicate June-13
> setlist (F-4) are pre-existing production data — not mine, left in place.

---

## INCOMPLETE — carry-forward

1. **BUG-5 escalation:** cold-device anon (empty HTTP cache) Perform-mode render of an `upload-*`
   Storage chart — render or blank? Decides P2 vs P1.
2. **Leader-crc authoring WALL on broslaz (UI):** sign in the CRC leader on the broslaz host and
   confirm authoring controls are absent + any write fails cleanly (data-layer ✅ already).
3. **Recordings (D2):** anon playback of a track with an attached audio recording.
4. **Pass B offline degradation** and **leader create→reorder→delete in the UI**.
5. **QR single-use** isolated end-to-end (claim a code, then prove reuse fails) under real Google auth.

---

## 7. Method notes / safety adherence

- **`publish_setlist` never called.** No `preview_publish`. ✅
- **No monitor faders/mutes/matrix levels moved** — bus assign/unassign only (reversible, no-notify). ✅
- **No destructive admin tools** except on my own `test-strs0610b-*` artifacts. ✅
- **Host interaction via the Playwright page only** — no curl/bash against the tenant hosts. The
  admin MCP calls went to `/api/mcp` (the bearer's sanctioned control plane) via a Node helper;
  in-page `fetch` (QR semantics, the faithful session replication) is "through the page." ✅
- **Auth was not fabricated.** Every persona session came from a real pre-approved
  `create_test_account` token via the app's own `/api/auth/qr` → `/api/auth/session` flow (or the
  real `/test-login` client sign-in when a session let it past the proxy). BUG-9 was the reason the
  normal one-shot link couldn't be used directly.
