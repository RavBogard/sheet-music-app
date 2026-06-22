# UAT-PENDING — v7.0 milestone

Running list of `checkpoint:human-verify` items carried forward instead of
blocking APPLY. Daniel verifies the whole list against the deployed build at
milestone end (or whenever convenient). Failures route to an in-phase follow-up
plan or an emergent phase.

| Status legend | |
|---|---|
| ⏳ | Pending — not yet checked |
| ✅ | Verified working |
| ❌ | Failed — needs follow-up |

---

## ⏳ v11.6-04-02 (WS-21) — QR approval claim-lag fallback (real device)

**Deployed commit:** `cdfc16cead` (prod `master`).

Emulator/unit-proven (`auth/qr/__tests__/route.test.ts`, 18/18 incl. 4 WS-21 cases).
Live confirm (NON-BLOCKING): with a band member whose `role` claim is stale/absent
but whose `users/{uid}.role` is musician/band_leader/admin (e.g. freshly approved, or
role set via `/api/admin/set-role` with `claimsUpdated=false`):
- On their phone, scan the iPad QR and approve → the iPad signs in (was: 403
  "Approval requires an approved member account").
- Sanity: a `member`/`pending` account still cannot approve (403); a normal
  claim-bearing musician approves as before.

## ⏳ v11.6-04-01 (WS-11 / WS-31) — deliver-airtight (real device)

**Deployed commit:** `1a1690478d` (prod `master`).

- **WS-11:** publish a setlist to a uid recipient → tap the in-app bell notification →
  it opens `/perform/setlist/{id}` (was a 404 on the dead `/setlist/{id}`).
- **WS-31:** open `/qr/{code}` on a phone the instant the iPad shows the QR (before the
  iPad's background register lands) → it shows "Checking session…" and recovers to the
  sign-in screen instead of a false "expired".

## ⏳ v11.5-01-03 (H9) — band_leader library-edit (live MCP, David's bearer)

**Deployed commit:** `d7cbb1a4e0` (prod `master` / prod MCP).

Emulator-proven (`edit-library-entry-authz.emulator.test.ts`, 5/5). Live confirm
on David's **band_leader** bearer pending (NON-BLOCKING) — **do this AFTER reverting
David admin→band_leader** (he's temp-admin since 2026-06-12 18:35 UTC):

- `edit_library_entry { rowId: <an in-org chart>, edits: { tags: [...] }, dryRun:false, force:true }`
  → succeeds in place; the chart's existing bond is intact (no delete/re-import).
- Same on a chart in the OTHER tenant → `row_not_found` (no write, no leak).
- `edit_library_entry { edits: { collection: "core" } }` as band_leader → `forbidden_field`.

**REVERT REMINDER:** drop David admin→band_leader (orgIds-preserving `/api/admin/set-role`)
now that the proper band_leader path is live — then run the above on his real role.

## ⏳ v11.5-01-02 (H5) — anon chord-cache PATCH (live transpose)

**Deployed commit:** `cd97ab21a3` (prod `master`).

Regression-proven (`chord-cache/route.test.ts`, 9/9). Live confirm (NON-BLOCKING):
- Anonymous (signed-out) open a chart in Perform and transpose → chords render; the
  browser console is **free of `/api/library/chord-cache` 401s** (was: saveNativeKey 401).
- Re-load the same chart anon → native key is a cache hit (no re-detect).
- Sanity: an anon attempt to set verification still fails; authed transpose unchanged.

## ⏳ v11.5-01-01 (H4) — Perform-setlist nav branding (live first-paint)

**Deployed commit:** `180c9b666e` (prod `master`).

Regression-proven at server-prop level (`src/app/perform/setlist/__tests__/layout.test.tsx`,
3/3). Live visual confirm still pending (NON-BLOCKING):

- On a real **broslaz iPad**, open `/perform/setlist/<id>` signed-out on
  brotherslazaroff.live → top nav shows the BL wordmark/monogram + "Brothers
  Lazaroff", **never** "CRC Music"/CRC `/logo.jpg`, including first paint (no flash).
  Repeat on the `/track/<trackId>` sub-route → same BL brand.
- Repeat on **centralreform.live** `/perform/setlist/<id>` → CRC brand unchanged.

(See stress cell **B4** in `.paul/research/STRESS-TEST-PROMPT-2026-06-RUN3.md`.)

## ✅ v11.3-04-02 — /perform CLS fix (synthetic) — VERIFIED 2026-06-10

**Deployed commit:** `c0b0ab3367` (live on prod).

What was built: reserved the anon QR sign-in card's slot during `authLoading`
(for expected-anon, `!cachedUser`) so the Upcoming/Past lists no longer shift
when the card mounts post-auth-resolve.

**VERIFIED:** Playwright @ 820×1180 on PROD `/perform` post-deploy → cumulative
layout-shift **0.000** on two consecutive cold loads (was a reproducible 0.187
pre-deploy / 0.200 field p75). Lists do not move; LCP element = setlist title
`<h3>` (820ms). Target (<0.1) beaten — shift fully eliminated.

## ✅ BUG-12 — loginable `/test-login` consume restored — VERIFIED 2026-06-11

**Deployed commit:** `bab97f6013` (prod `master`; quick-fix `bug12-qr-code-validator`).

`GET /api/auth/qr` validator widened to admit the 32-char base64url test-login code
alongside the 6-char device-handoff code; BUG-7 path-char→400-before-Firestore held.

**VERIFIED (admin bearer + real Chromium, 2026-06-11):** minted `loginable:true`
band_leader → opened `loginUrl` → qr poll **200** → landed signed in ("Good evening,
[TEST]") → swept → URL dead. All four BUG-12-blocked stress cells re-fired and PASS
(run3-B report §11): (1) login consume e2e, (2) CRC authoring walk, (3) QR single-use
real-claim + reuse-404 + role fidelity, (4) B3 no-auto-blast (preview/dryRun only).
Evidence `r3c-bug12-signed-in-setlists-ipad.png`. CLEANUP VERIFIED.

## ⏳ NEW FINDINGS from the re-fire (triage — run3-B report §11)

- **✅ BUG-13 — FIXED + live-verified 2026-06-11** (`bug13-qr-code-generator`, commit
  `0fd67114`). Server fallback `generateCode()` now emits a fixed 6-char `[A-Z0-9]` code
  (moved to sibling `code.ts`). 6/6 live server-fallback POSTs returned valid 6-char codes;
  qr route tests 14/14 (1000-draw distribution). AC-4: 7 legacy short-code orphans swept
  from prod `qr-sessions` (collection clean). VERIFY-FIRST resolved: the client
  `generateClientCode()` was already correct (fixed 6× loop) — real device-QR sign-in
  was never affected; only the rarely-hit server fallback. No further action.
- **F-8 (P3, harness-only — NOT a leak) — v11.4-04 default-both doesn't reach MCP test
  accounts.** `provisionTestAccount` skips `orgIds` seeding + crc-pins the bearer, so a
  CRC-minted test leader authoring on the broslaz host falls back to crc (verified:
  setlist landed `orgId:crc`). Cross-tenant authoring is unverifiable via the test
  harness; needs a real both-org leader (David) or an orgIds option on
  `create_test_account`. (broslaz.live MCP also still needs re-auth.)

## ⏳ v11.3-05-01 — BUG-6 broslaz PWA manifest (post-deploy)

**Will deploy with:** phase commit `feat(v11.3-05)` (pending push).

What was built: `proxy.ts` matcher token widened `manifest.json` →
`manifest(?:-[a-z0-9-]+)?\.json` so the org-suffixed PWA manifest bypasses the
proxy like the CRC one (was 307→/login HTML shell on unauth landing).

How to verify (live, non-blocking): (1) `curl -sI https://www.brotherslazaroff.live/manifest-brotherslazaroff.json`
→ expect `200` + `content-type: application/json` (NOT a 307 to /login). (2) On an
iPad on brotherslazaroff.live, Safari → Share → "Add to Home Screen" installs with
the broslaz manifest name/icons (PWA install works). (3) Confirm CRC unchanged:
`curl -sI https://www.centralreform.live/manifest.json` still `200` JSON.

## ⏳ v11.3-05-01 — F-6 cold-load no-429 (post-deploy)

**Will deploy with:** phase commit `feat(v11.3-05)` (pending push).

What was built: new `telemetry` rate-limit tier (300/min, IP-keyed) on
`/api/auth/qr` (POST/GET/PUT) + `/api/web-vitals`, replacing the shared 60/min
`api` tier that the 6-iPad NAT fleet exhausted on cold landing.

How to verify (live, non-blocking): cold-load the broslaz (or CRC) landing on
several iPads behind the venue NAT; confirm `/api/auth/qr` POST + the QR poll +
`/api/web-vitals` beacons return 2xx (no `429` in the Network tab / no
"Too many requests"). Bonus: the v11.3-04-03 RUM slice should now capture
cold-cohort web-vitals beacons that were previously 429-dropped.

## ⏳ v11.3-04-03 — /perform TTFB/FCP (field, post-deploy RUM)

**Deployed commit:** `c0b0ab3367` (live on prod).

What was built: Suspense-streamed the `/perform` listing so the Firestore query
is off the first-byte path. Synthetic TTFB is warm-edge (26ms) and can't
reproduce the field cold-start number — needs real-user RUM to accumulate.

How to verify: after ~1–7 days of traffic, re-run
`node scripts/v11-3-04-webvitals-slice.mjs` and compare `/perform`
cold(navigate) **TTFB/FCP** to the 1633/3551 ms baseline. If TTFB stays high,
it's cold-start-bound → action the Vercel fluid-compute/region follow-up (STATE
Deferred Issues), NOT more app code.

---

## ⏳ v70-03-01 — Chart click-through

**Deployed commit:** `62c2b7c` (pushed to origin master 2026-05-14; Vercel auto-deploy triggered)

What was built: `MobileRowCard`'s chart indicator is a click-through link when a
chart is bound — `<a target="_blank">` to the chart serving URL
(`/api/drive/file/[id]` or `/api/library/file/[id]`). Unbound rows keep the plain
non-interactive icon. The link's `onClick` `stopPropagation` prevents the card's
tap-to-edit from firing.

Check:
- [ ] Bound row: tap the chart icon → chart opens in a new tab; the row's edit pane does NOT open.
- [ ] Desktop: cmd/middle-click the chart icon → opens in a new tab.
- [ ] Unbound row: chart icon does nothing (no new tab, no edit toggle).
- [ ] Right-click / long-press a row → "Bind chart" still works; edit-pane "Bind Chart" button still works.
- [ ] iPad: tap opens chart; long-press still opens the context menu; drag handle still reorders; touch target feels ≥44px.

---

## ⏳ v70-03-02 — Recording-bind UI

**Deployed commit:** `62c2b7c` (pushed to origin master 2026-05-14; Vercel auto-deploy triggered)

What was built: per-track recording affordance in the setlist row card. New
`AudioLines` icon beside the chart icon opens `RecordingBindPopover` — lists the
song's reference recordings newest-first, plays each inline via `<audio>`, and
(for band-leaders/admins) uploads a new recording. New routes
`POST /api/recordings/upload` + `GET /api/recordings/file/[id]` (admin-side audio
serving — no storage.rules change). Recordings persist in `recordings/{id}`.

Check:
- [ ] As band-leader/admin: open a row with a song bound → recording icon is enabled. Open it → "Upload recording" → pick an mp3 → it uploads and appears in the list.
- [ ] Press play on the inline audio control → the recording plays.
- [ ] Reopen the popover (or on another device) → the recording is still listed (Firestore-backed).
- [ ] A row with NO song bound → the recording icon is disabled.
- [ ] Opening the recording popover does NOT toggle the row's edit pane.
- [ ] As a plain member: the popover lists + plays recordings but shows NO upload affordance; a direct POST to /api/recordings/upload as a member is rejected (403).
- [ ] iPad: popover opens, audio plays, long-press still opens the context menu, drag handle still reorders, touch targets feel ≥44px.

---

## ⏳ v70-09-01 — Setlist metadata editor

**Deployed commit:** _(pending — v70-09 phase commit + push)_

What was built: a pencil/edit icon button in the setlist editor's top bar
(`SetlistGridTopBar`, beside the setlist name) opens a mobile-friendly Sheet
(`SetlistMetaEditSheet`) to edit a setlist's **name, event date, service type,
and rabbi** after creation. Save writes through the v6.0 sync engine via
`applyEdit('update','setlists',…)` with a changed-fields-only patch; the top bar
reflects edits live via a `useLiveQuery` on the setlist doc. Cancel / Escape /
an unchanged Save are non-destructive. Closes long-standing Issue 2.

Check:
- [ ] Open an existing setlist → a pencil icon sits next to the name in the top bar; tap it → the edit Sheet slides in, pre-filled with the current name / date / service type / rabbi.
- [ ] Change the name → Save → the top-bar name updates immediately (no reload); reload the page → the new name persists.
- [ ] Change the event date via the calendar → Save → persists across reload.
- [ ] Change the service type and the rabbi → Save → both persist across reload.
- [ ] Open the editor, change nothing, tap Save → nothing happens (no error, sheet closes).
- [ ] Open the editor, make a change, tap Cancel (or press Escape / tap outside) → the change is discarded, setlist unchanged.
- [ ] iPad: the Sheet is comfortable; the pencil trigger, inputs, date picker, service-type select, and Save/Cancel buttons all feel ≥44px and easy to tap.

---

## v70-07-02 — Document-import flow: upload → interview → preview

The ImporterModal now has a third input option, **"Upload Document"** (.docx /
.pdf / .txt). Selecting a document and submitting chains the v70-04→06 backend:
extract text → Gemini structured extraction → library resolution, then walks a
structured **interview form** (setlist name, REQUIRED service date auto-suggested
from the filename, service type auto-inferred from document keywords, optional
rabbi) and a read-only **setlist preview** grouped by section. This plan stops
before commit — the "Create Setlist" button is intentionally inert (wired in
v70-07-03).

Check:
- [ ] Open the importer → the input step shows three options: Google Sheets URL, Upload CSV, **Upload Document**. Selecting one clears the other two.
- [ ] Upload a service-outline doc (the May 15 Shir Shabbat .docx canary) → button reads "Next: Analyze Document" → processing spinner → lands on the interview step. The existing URL/CSV flow still works unchanged.
- [ ] Interview step: setlist name pre-filled from the filename; **service date pre-filled** by parsing the filename (e.g. "May 15th…" → that date); service type pre-selected from doc keywords; rabbi blank/optional.
- [ ] Clear the service date → "Next: Preview" is disabled; set a date → it enables.
- [ ] Preview step: header shows the interview values; tracks are grouped under their section headings in document order, as compact text rows (no cover art); each track shows key / vocal lead and either a **matched library chart** (name + confidence %) or an amber **"Missing chart"** flag; tracks with audio matches show a recording-count marker.
- [ ] The "Create Setlist" button on the preview is present but **disabled** (commit lands in the next step). "Back" navigates preview → interview → input correctly.
- [ ] Error path: upload a corrupt/empty doc → a toast surfaces the server error and the modal returns to the input step.
- [ ] iPad: the new dropzone, the interview form inputs/select, and the preview rows are comfortable and tappable (≥44px).

---

## v70-07-03 — Document-import commit: "Create Setlist" works end to end

The ImporterModal preview-step "Create Setlist" button is now wired. Clicking it
POSTs the resolved structure + interview values to
`POST /api/setlists/import/commit-document`, which flattens the structure
(section headers interleaved before their songs, matched library charts bound,
recording candidates ignored — recording binding deferred) and persists via
`createSetlistServerSide`. This completes the v7.0 doc-driven pipeline:
upload → interview → preview → real setlist.

Check:
- [ ] Run the full flow: open the importer → Upload Document (the May 15 Shir Shabbat .docx canary) → interview → preview → click **"Create Setlist"**.
- [ ] The button shows a "Creating..." spinner while in flight, then the modal closes and the newly created setlist opens.
- [ ] The created setlist has its **section headers** in place, in document order, with the songs grouped under them.
- [ ] Songs that matched a library chart have the **chart bound** (openable from the setlist); songs flagged "missing chart" in the preview have no chart bound.
- [ ] The setlist's **name, event date, service type, and rabbi** match what was entered in the interview form.
- [ ] Error path: if the commit fails (e.g. offline), a toast surfaces the error and the modal stays on the preview step (no half-created setlist, button re-enables).
- [ ] iPad: the "Create Setlist" / "Back" buttons are comfortably tappable; the loading state is clear.

---

## ⏳ DATA-003 — Bar'chu Walkdown chart row whereabouts probe (cycle-2 b4 bundle)

**Deployed commit:** (this branch, b4 bundle pending push)

What needs verifying: cycle-1 followup carry-over. Probe whether
`upload-0594bbd4-...` (Bar'chu Walkdown) chart row exists in `library_index`
and, if so, whether it still carries `mimeType: 'application/octet-stream'`
(residual damage from an earlier MIME-detection bug).

This probe runs against live Firestore — the worktree can't reach prod from
the b4 session, so the check is deferred to UAT.

Check (via claude.ai / Claude Desktop MCP):
- [ ] Call `search_library({query: "Bar'chu Walkdown"})`. Note: does it appear in results?
- [ ] If not found, call `list_library({collection: "uploads", includeNonCharts: true})` and page through — does the `upload-0594bbd4-…` fileId surface?
- [ ] If found with `mimeType: "application/octet-stream"`: residual damage. Open a follow-up to backfill the correct mime via a one-shot script or `dedupe_library_index`-style sweep.
- [ ] If absent or healthy: mark DATA-003 resolved.

---

## ⏳ cycle-9 Lane B — trackCount drift no longer produced by the in-app grid editor

**Deployed commit:** `a0aec2cf5` (pushed to origin master 2026-05-20; Vercel auto-deploy — fix confirmed in live bundle chunk `2899-1cc5fe73a819e31b.js`).

What was built: the client sync chokepoint (`ProductionFirestoreAdapter`) now recomputes a setlist's denormalized `trackCount` from the live `tracks` subcollection after every in-app track add/delete. Previously the grid editor (`SetlistGrid.tsx`) mutated tracks without maintaining the parent counter, so in-app row deletes/adds drifted `trackCount` (45-vs-30 shape). Proven by a real-emulator regression test; the browser E2E below is confirmatory (harness-blocked from automation per META-003).

Check (as an editor — admin/band_leader — in a real browser on the deployed app):
- [ ] Open a setlist in the grid editor; note its track count. Delete a row. Reload / re-open → the setlist's track count reflects the new total (no inflation). Run `recompute_setlist_track_count(setlistId)` via MCP → `drifted: false`.
- [ ] Add a row (pick song / free-text). Reload → count reflects the new total (no deflation). MCP recompute → `drifted: false`.
- [ ] Duplicate a row + paste rows → count stays correct. MCP recompute → `drifted: false`.
- [ ] Bulk-delete several rows → count stays correct. MCP recompute → `drifted: false`.

## v11-02-04 — send David his Brothers Lazaroff bearer (2026-06-08)
- [ ] **Daniel: securely send David his BL MCP bearer token** (minted 2026-06-08, tokenId `93JMXhT1OspFsWDMmb9V`, raw printed once during the issue-bl-bearer.mjs --apply run; NOT recoverable — if lost, revoke + re-mint). Use a secure channel (not email/chat in the clear). Pair it with `docs/onboarding-brotherslazaroff.md`.
- [ ] David adds it to Claude Desktop (see onboarding doc) and confirms he can author a BL setlist + sees only BL data. (Tenant isolation already proven server-side e2e on prod — this is the human UX confirmation.)

## v11-02b — David can now self-onboard (2026-06-08)
- [ ] David adds the MCP server in Claude Desktop and **logs in** (OAuth flow) → he now receives a `brotherslazaroff`-scoped bearer automatically (no manual token needed; the mint paths derive org from his orgIds claim). His existing manual bearer (tokenId `93JMXhT1OspFsWDMmb9V`) also still works. Confirm he sees only Brothers Lazaroff data. (Supersedes the manual-handoff step above — either path works.)

## v11-04-03 — authed-dashboard tenant scoping + David's empty-library onboarding (2026-06-09)
**Deployed commit:** `feat(v11-04-03)` (pushed origin master 2026-06-09; Vercel prod). Authed `/setlists` dashboard reads are now org-scoped (getSetlistsPage SSR + /api/setlists/page + the 4 client subscriptions pass the host org). Server-side proven by unit tests; the items below are the live human/authed-session confirmation (no-local-dev → prod is the only place the host→org seam shows; same lesson as the v11-03 coerceOrgId hotfix).
- [ ] **Sign in on brotherslazaroff.live** (David, or any account with `orgIds:['brotherslazaroff']`) and open `/setlists`. Confirm the dashboard shows ONLY Brothers Lazaroff setlists — currently that's the **empty-library state** (BL has no setlists yet), NOT any CRC service. Confirm the empty state reads as intentional (not a stuck spinner / error).
- [ ] Confirm "Load more" (if reachable) and the live updates carry no CRC rows.
- [ ] **Sign in on centralreform.live** and open `/setlists` → confirm CRC's dashboard is UNCHANGED (all CRC setlists present, same order) — no CRC lock-out / regression.
- [ ] (Onboarding) David creates his first BL setlist **via MCP** (which stamps orgId, v11-02-03) → confirm it appears in his BL dashboard. NOTE/DEFERRED: in-app CreationWizard setlist-create orgId stamping is NOT in v11-04-03 (read scoping only) — an in-app-created BL setlist lacking orgId would not appear in the scoped dashboard. Tracked for v11-05 write-scoping.

---

## ⏳ v11.1-02-01 — Multi-org authoring via broslaz MCP URL

**Deployed commit:** `941e6856d1` (pushed to origin master 2026-06-09; Vercel auto-deploy)

What was built: MCP bearers now pin to the tenant DOMAIN you connect Claude
Desktop through (host-derived `x-org-id` → `resolveMintOrg`, validated against
your `orgIds`). Connecting to the broslaz MCP URL mints a `brotherslazaroff`
bearer; your existing CRC connection stays crc. Verified: routing (www reaches
the endpoint; apex 308-redirects), OAuth discovery is host-relative to
www.brotherslazaroff.live, emulator 9/9, v11-06-02 invariant intact.

**Canonical broslaz MCP URL:** `https://www.brotherslazaroff.live/api/mcp`
(use the `www.` host directly — the apex 308-redirects and can drop the auth header).

Check:
- [ ] In Claude Desktop, add a SECOND MCP connection pointed at `https://www.brotherslazaroff.live/api/mcp` (keep the existing CRC one). Complete the OAuth login (plain Google sign-in).
- [ ] Through that broslaz connection, author a test setlist (create_setlist + a few tracks).
- [ ] It appears on `brotherslazaroff.live` /perform + the authed dashboard, with orgId='brotherslazaroff'.
- [ ] It does NOT appear on centralreform.live (CRC) /perform or dashboard.
- [ ] Your CRC connection still authors crc setlists unchanged.

---

## ⏳ v11.1-02-02 — Admin org-membership toggle

**Deployed commit:** `d466160601` (pushed to origin master 2026-06-09; Vercel auto-deploy)

What was built: a "Band access" control (CRC only / Brothers Lazaroff only / Both)
on band_leader/admin rows in /manage → People, admin-only, with a membership
badge. Setting it writes orgIds to both the Auth claim and the user doc.

Check:
- [ ] In /manage → People, a band_leader (e.g. David) row shows a "Band access" select + a membership badge (CRC / BL / CRC + BL). Musician/member rows do NOT.
- [ ] As a non-admin band_leader, the Band access control is NOT visible.
- [ ] Set David to "Both" → confirm dialog → on reload the badge shows "CRC + BL" and persists.
- [ ] (with 02-01) David can then author for the granted tenant via that tenant's MCP URL.
- [ ] A user whose membership you don't touch is unchanged (CRC users still default to CRC).

## v11.2-01 propose/commit org-scope (BUG-1) — added 2026-06-09
- **Live BL retest** (needs Daniel to reconnect Claude Desktop BL connector to https://www.brotherslazaroff.live/api/mcp first, to mint a BL-pinned bearer):
  1. `create_setlist({name:"BUG-1 retest", isTest:true})` on the BL connector → note the returned setlistId
  2. `propose_setlist_changes({setlistId, proposals:[{action:"add",type:"header",title:"Set 2"}]})` → expect `ok` + a `stageId` (NOT 404 setlist_not_found)
  3. `commit_staged_changes({stageId})` → expect the rows landed; then `delete_setlist` to clean up
  - Emulator proves correctness; this confirms it end-to-end on the live tenant.

## v11.2-02 publish-audience org scoping (BUG-9) — added 2026-06-09
- **Live BL confirmation (dryRun-only, SAFE — no real send)**, after BL connector reconnect:
  - `preview_publish({setlistId:<a BL setlist>})` → `audience.count` should equal the BL roster size, NOT 17 (CRC). Recipients should contain only BL-org members.
  - Emulator already proves correctness; this is live confirmation. Do NOT run a real `publish_setlist` to test.

---

## ⏳ loginable-test-accounts — browser persona sign-in (Plan 01 AC-1 + Plan 02 AC-2)

**Deployed commit:** (this phase commit; pushed to origin master — Vercel auto-deploy)

What was built: `create_test_account({ role, loginable: true })` returns a one-time
`loginUrl` (`/test-login?code=…`). Opening it signs the browser in as the persona
via the existing QR custom-token path → real Firebase Web SDK auth + the normal
app session cookie. TTL enforced by the hourly `/api/cron/disable-expired-test-accounts`
cron (disable + refresh-revoke) + a session-mint rejection for expired accounts.

Verify on the deployed build (safe — test-namespaced, isTest):
1. Via MCP, `create_test_account({ role:"musician", loginable:true })`; open the
   returned `loginUrl` in a fresh browser/Playwright context → lands signed-in as
   the musician, consumer access works, client-side Firestore reads succeed.
2. Re-open the SAME `loginUrl` → fails cleanly (single-use; consumed/410).
3. After `revoke_test_account` (or letting the cron run on an expired one), attempt
   sign-in / an existing session → fails cleanly (AC-2 / AC-4).
4. `create_test_account({ role:"admin", loginable:true })` → refused (AC-3).

---

## ⏳ v11.3-01-01 — Anon chart deep-link serving (BUG-5)

**Status:** code-fixed + route-test-proven (6/6) + tsc/next-build clean. Committed per phase close.

What was built: `/api/library/file/[id]` reworked from a default-auth, db-*-only route
into a public chart proxy mirroring `/api/drive/file/[fileId]` — `requireAuth:false` +
`isTrusted` (Sec-Fetch / Firebase / `crl_live_` bearer) gate + `chart` rate-limit tier,
serving `upload-*`/UUID/Drive ids via `fetchFileById` and `db-*` via digitized_charts.

Verify-first finding (corroborated vs prod, 2026-06-10): the Perform-render path uses
`/api/drive/file` (anon-OK), so the BUG-5 P1 "blank cold-device render" escalation is
**not** real — anon Perform render succeeds. The genuine user-facing path is **"Open chart
in new tab"** on legacy `db-*` MusicXML charts (MobileRowCard → parseFileId → this route),
which 401'd anon pre-fix. BUG-5 is therefore P2 (oracle-contradiction + narrow db-* link).

Check (live, non-blocking):
- [ ] Anon (signed out), open a setlist with a legacy `db-*` MusicXML chart → tap "Open chart in new tab" → renders (was 401).
- [ ] Anon cold device (empty HTTP cache), open a setlist with an `upload-*` chart in Perform mode → renders (confirms `/api/drive/file` path; closes INCOMPLETE #1).
- [ ] Authed musician / in-app: chart open + Perform render unchanged (no regression).

---

## ⏳ v11.3-01-02 — Anon transpose / AI chord-scan (BUG-4)

**Status:** code-fixed + route-tests 7/7 + tsc/next-build clean. Committed at phase close.

What was built: `/api/library/chord-cache` GET+POST and `/api/ai/transposer/scan` POST opened
to anon (`requireAuth:false`) per D-Q2; scan carries an anon-only `ai`-tier rate-limit (authed
unchanged). No client edit — `apiFetch` sends anon and the flow proceeds once endpoints 200.

Check (live, non-blocking):
- [ ] Anon (signed out), open a chart in Perform → tap Transpose → "DETECTED KEY" + chords render (was stuck on "Waiting for scan…").
- [ ] Anon transpose up/down → notation re-renders with transposed chords.
- [ ] Authed musician transpose unchanged (no new throttling on normal multi-page scans).

---

## ⏳ v11.3-02-01 — Agent chart-upload: server-side Drive conversion (David's report)

**Status:** code-fixed + 58/58 chart-upload emulator tests (AC-1..AC-4 + classifier unit) + tsc/next-build clean. Committed at phase close (after Plan 02).

What was built: `DriveClient.fetchAsPdf` (export for native Google docs; convert-on-copy for
`.docx`/`.xlsx`/`.pptx`) + `driveSourceIsConvertible` classifier; `import_chart_from_drive` routes
convertible Drive types through it → PDF server-side, then the existing `processChartUpload` pipeline.
Live UAT can't run on this box (no service-account creds for a real Drive convert).

Check (live, non-blocking — once deployed):
- [ ] Via broslaz/CRC MCP: `import_chart_from_drive` on a **Google Doc** id → imports, library row mimeType `application/pdf`, renders in Perform.
- [ ] `import_chart_from_drive` on an uploaded **.docx** id (David's "Queen Jane Approximately.docx" case) → imports as PDF (convert-on-copy); no leftover `crc-tmp-convert-*` Google Doc in the service-account Drive.
- [ ] `import_chart_from_drive` on a **folder** id → `drive_invalid_target`; on a **Google Form** id → `unsupported_drive_native_type` (export-first hint).
- [ ] Ordinary **PDF** Drive import unchanged (regression).

---

## ⏳ v11.4-04-01 — All-roles Band-access toggle (D8 item 5) — live admin check

**Status:** code-complete + UserRow.test 3/3 + tsc/next-build clean. Committed at phase-plan close. Admin-only UI; no prod data changed (the toggle only writes when an admin uses it).

What was built: the `/manage` → People "Band access" tri-state (CRC only / Brothers Lazaroff only / Both) now shows on EVERY non-pending row (musicians + members + leaders), not just leaders. Setting it writes orgIds to the user doc + Auth claim (lockstep, existing set-role path).

Check (live, admin on /manage People):
- [ ] A **musician** row now shows the "Band access" select + a membership badge (CRC / BL / CRC + BL). Previously only leaders did.
- [ ] Set a test musician to "Both" → confirm → badge reads "CRC + BL" and persists across reload.
- [ ] A **pending** row shows NO Band-access control; a non-admin viewer sees none either.
- [ ] (After v11.4-04-02 backfill) every person defaults to "Both"; the toggle can still narrow an individual.

---

## ⏳ v11.4-03-01 — Remembered ad-hoc recipients (MCP contacts, D8 item 3) — live smoke test

**Status:** code-complete + contacts MCP emulator 6/6 + contacts rules emulator 6/6 + non-emulator MCP 449/449 + tsc/next-build clean. Contacts Firestore rules DEPLOYED to prod. Committed at phase close. Low-risk (no sends — contacts are stored data).

What was built: org-scoped `contacts` address book + MCP `list_contacts` / `create_contact` / `delete_contact` (leader-gated, tenant-isolated, email dedupe). `preview_publish` now returns `savedContacts[]`. Sending to a contact reuses the existing `recipients[]` path on `publish_setlist` (no new arg).

Check (live, SAFE — via Claude Desktop MCP; no notifications sent):
- [ ] `create_contact({name:"Test Guest", email:"you+contacttest@…"})` → returns ok + a contact id; `list_contacts()` includes it.
- [ ] `create_contact` again with the SAME email → returns the existing contact (`created:false`), no duplicate.
- [ ] `create_contact({name:"NoHandle"})` (no email/phone) → `invalid_argument`.
- [ ] `preview_publish({setlistId:<a CRC setlist>})` → `savedContacts[]` includes the test contact.
- [ ] (Optional, real send) publish with `recipients:[{name:"Test Guest", email:"you+contacttest@…"}]` → that address receives the email (confirms the remember→reuse loop end-to-end).
- [ ] `delete_contact({id})` → removed from `list_contacts`. On the BL connector, `list_contacts()` does NOT show CRC's contacts (tenant isolation).

---

## ⏳ v11.4-02-01 — Org-branded comms (D8 item 4) — live brand check + Resend ops step

**Status:** code-complete + email.test 6/6 + branding.test 9/9 + src/lib 1797/1797 + tsc/next-build clean. Committed at phase close. CRC byte-identical (asserted); BL branding follows the setlist's org.

What was built: publish + gig-packet + resend emails brand by the setlist's org — Brothers Lazaroff emails carry the BL from-name, dark-teal header, wordmark image, and "Brothers Lazaroff" footer; CRC unchanged. BL from-ADDRESS falls back to the verified centralreform.live sender unless `RESEND_FROM_EMAIL_BROSLAZ` is set.

**OPS follow-up (enables BL from-address):** verify `brotherslazaroff.live` as a sending domain in Resend (DNS: SPF/DKIM), then set `RESEND_FROM_EMAIL_BROSLAZ=noreply@brotherslazaroff.live` in Vercel prod env. Until then BL emails send from the BL *name* but the CRC-verified *address* (deliverable, just not the BL domain). Non-blocking.

Check (live — a real publish to selected people IS a live send; prefer a TEST setlist / your own address):
- [ ] Publish (or resend) a **Brothers Lazaroff** setlist to yourself → the email shows "Brothers Lazaroff" as sender name, the BL wordmark in the header (dark teal), and "Brothers Lazaroff" in the footer — NO "CRC Music / Central Reform Congregation" anywhere.
- [ ] Publish a **CRC** setlist to yourself → the email is unchanged from before (CRC Music header/footer, no regression).
- [ ] Gig-packet email (`/api/setlist/email-packets`) on a BL setlist → same BL branding.
- [ ] (After the Resend ops step) BL email "from" address reads `…@brotherslazaroff.live`.

---

## ⏳ v11.4-01-01 — No-auto-blast publish/notify (D8 items 1+2) — STOP-gate, human-gated

**Status:** code-complete + MCP emulator 29/29 (incl. 4 new D8 cases) + PublishDialog 3/3 + tsc/next-build clean. Committed at phase close. **Live sends were NOT performed during APPLY (publish/notify STOP-gate — emulator + mocked fetch only); these confirm behavior on the deployed surface.**

What was built: MCP `publish_setlist` refuses a REAL publish when `recipients` is undefined (`recipients_required`) — only `preview_publish`/`dryRun` auto-derives the default org audience. The browser `PublishDialog` per-musician toggle now governs ALL channels (in-app + push + email), default all-selected, and disables Publish at zero selection. Closes the v11.2 BUG-9 implicit-blast class on both surfaces.

Check (MCP — SAFE, use dryRun for the preview path; the real-publish refusal sends nothing):
- [ ] `publish_setlist({setlistId:<a real setlist>})` with NO `recipients` → returns `recipients_required` (no send, no publishedAt change). Then `preview_publish({setlistId})` (or `publish_setlist({…, dryRun:true})`) → returns the default org-scoped candidate audience + recipientCount (writes/sends nothing).
- [ ] `publish_setlist({setlistId, recipients:[{uid:…}], dryRun:true})` → previews exactly that set. (Only run a REAL `publish_setlist` with explicit recipients if you actually intend to notify those people — that is a live send.)

Check (browser — only the "all selected" path is a real send; verify on a TEST setlist or accept it notifies the selected people):
- [ ] Open Publish & Notify on a setlist with ≥2 assigned musicians → all rows are selected by default; "N will be notified" reflects the count.
- [ ] Deselect a musician → they show the deselected (unchecked, dimmed) state; the count drops. (On a real publish they would receive NO in-app notice, NO push, NO email.)
- [ ] Deselect everyone → the Publish button is disabled ("Select at least one").
- [ ] iPad (11"): rows are comfortably tappable (≥44px), selected/deselected states are clearly distinguishable (not color-only).
- [ ] CRC regression: publishing with all musicians left selected behaves exactly as before (everyone assigned notified across channels).

---

## ⏳ v11.3-02-02 — Chunked inline chart-upload (begin/append/commit)

**Status:** code-complete + 20/20 upload-session emulator tests (8 new chunked AC) + tsc/next-build clean. Committed at phase close.

What was built: `begin_chunked_chart_upload` → `append_chart_upload_chunk` ×N → `commit_chunked_chart_upload`
on the `upload_sessions` substrate; commit reassembles chunks in order, delegates to `finalizeChartUpload`,
and org-stamps the result. For non-Drive sources where the signed-URL PUT is proxy-blocked (Cowork) and
inline base64 exceeds the token cap.

Check (live, non-blocking — once deployed):
- [ ] Via broslaz/CRC MCP: begin → append a multi-chunk PDF (~48 KB slices) → commit → chart imports, bonds via add_track_to_setlist.
- [ ] Committed chart's library_index orgId matches the connected tenant (broslaz when via brotherslazaroff.live).
- [ ] Gap / out-of-order / oversize chunk → clear rich error; force:true bypasses a dedup 409.

---

## ⏳ v11.5-02-01 (H3) — seekable audio on iPad (Range support)

**Deployed via:** the `fix(v11.5-02-01)` plan commit (prod `master`).

Server-side proven (helper unit 10/10 + recordings route regression 4/4 + `next build --webpack`).
On a real iPad (band fleet, WebKit), NON-BLOCKING field confirm:

- Open a track that has an audio recording bonded → Perform → the `<audio>` player.
- Drag the scrubber to the middle of the track → playback resumes from the seek point
  (was: scrubber inert / restarts from 0:00).
- Sanity: play-from-start still works; a non-audio chart/PDF still loads normally.

---

## ⏳ v11.5-02-02 (F1) — "next service" CTA on the public /perform index

**Deployed via:** the `feat(v11.5-02-02)` plan commit (prod `master`).

Server-side proven (firstUpcomingSetlist 3/3 + /perform SSR regression 6/6 + `next build --webpack`).
On a real iPad (band fleet, WebKit), NON-BLOCKING field confirm, per tenant (CRC + broslaz):

- Open the public `/perform` index → a prominent "Next service" CTA appears ABOVE the lists,
  naming the soonest upcoming setlist + its date; tapping it opens that setlist in one tap.
- The named setlist is the correct soonest UPCOMING one for THAT host (no cross-tenant bleed).
- A host with NO upcoming setlist shows the plain list (no CTA).
- No layout shift on load (CTA is in the first paint).

**Note (separate axis, not this plan):** H7 re-verify flagged `/perform` cold·MOBILE CLS 0.250 (n=8) —
a future CLS look; and the standing Vercel TTFB infra follow-up (cold-start/geo, not app code).

---

## ⏳ v11.5-02-03 (F2) — in-Perform leader key change + chart swap (ALREADY SHIPPED, confirm live)

**Status:** F2 was already delivered (live-director workstream, ratified 2026-05-23). Closed as
shipped 2026-06-14; 29/29 unit tests green. NON-BLOCKING field confirm on the iPad fleet:

- As a band_leader/admin on a real iPad: long-press a track row (or the open chart) → the
  LiveDirector menu appears with **Change key / Swap chart / Insert song**.
- Change the key → a SECOND device (another iPad/follower) reflects the new key label within a
  few seconds (no transpose of chords/graphics — label-only by design).
- Swap the chart → the follower's device shows the new chart.
- As a plain musician (not leader): long-press does NOTHING (tap still opens the chart) — gate holds.

## v11.5-02-04 (H1 — per-device per-chart zoom + Fit reset) — 7-tablet iPad fleet, non-blocking
- 11" iPad (820×1180) portrait: zoom chart A, navigate to B + back → A remembers its zoom, B at baseline; reload page + reopen A → A still remembered (per-device persistence).
- Rotate to landscape mid-chart → re-fits to the new container AND the calibration multiplier is still applied; rotate back → preserved.
- Two different iPads (or iPad + phone): zoom on device 1 does NOT change device 2's view (per-device proof — must NOT be shared).
- PDF chart + MusicXML chart both honor the per-chart zoom; image chart unaffected (expected — native pinch, doesn't read store zoom).
- Tap the zoom-% / Fit control → chart snaps back to auto-fit baseline (100%).

## v11.5-05-01 (Q6 + Q3 — consumer copy/branding) — non-blocking, both hosts
- Q6: on brotherslazaroff.live `/perform`, the listing subtitle under the band name reads **"Public sets"**; on centralreform.live `/perform` it still reads **"Public setlists"** (unchanged).
- Q3: open a `/qr/<code>` link for an EXPIRED or ALREADY-USED code on a phone → heading "Sign-in code expired" + body names the tenant ("This CRC Music …" / "This Brothers Lazaroff …"), states "expired or was already used", and instructs to ask for a fresh QR code. Confirm NO hardcoded "CRC"/"iPad" leak on the BL host.

## v11.5-05-02 (Q5 title strip + F4 key resolution) — non-blocking
- Q5: on a setlist with a chart whose filename leaked (e.g. CRC "Oseh shalom - Nava tehila.pdf", BL "Queen Jane Approximately.docx"), the consumer setlist-detail row title shows NO extension. Both hosts.
- F4: key badges render on a setlist row whenever the track (or its library_index row) has a key — verify on a CRC setlist that has keys.
- **F4 AUTHORING FOLLOW-UP (verdict B — Daniel/David action, not code):** the live BL setlist "Tower Grove Farmer's Market" has NO keys anywhere (track + library_index + songs.defaults all null). BL key badges will stay absent until keys are authored on the BL charts via MCP `update_song` / `edit_library_entry`. The read-time resolution will surface them automatically once set. See `.paul/research/v11-5-05-02-f4-bl-key-probe.md`.

## v11.5-05-03 (Q4 anon /setlists cleanup) — non-blocking
- As ANON on CRC `/setlists`: NO test fixtures, NO empty "New Setlist" drafts, and NO per-card Edit button or Download icon (card tap → view + Perform still work).
- As a signed-in user on `/setlists`: in-progress drafts (incl. zero-track) still visible, and Edit + Download + overflow menu all present.

## v11.6-02-01 (Nav & hydration airtight — WS-01 / WS-09 / WS-02) — real 11" iPad Safari, post-deploy
- **WS-01 (P0):** open the **Shir Shabbat—Juneteenth** set (`a84f8cce-176e-4b5e-9653-4df71db6f5ba`) in Perform; tap a bonded **prayer/reading** row (Shema / Mi Chamocha / Adonai sfatai) → its OWN chart opens and stays — does NOT flash and bounce to song 1. Next/Prev traverse the prayer rows in setlist order.
- **WS-09:** two devices on the same set, a follower reading mid-set; as leader insert/swap/reorder a row → the follower stays on the chart they were reading, NOT yanked to song 1.
- **WS-02:** on a real 11" iPad on restrictive/camp wifi (Firestore forced to long-poll), open a setlist → rows hydrate (button count grows past the SSR placeholder) and the browser console shows NO "Refused to load …www.google.com/cleardot.gif" CSP violation.
- Headless WebKit is lower-fidelity than a real iPad for these (Firestore long-poll flake is WS-02 itself) — real-device confirmation is the authoritative check.

## v11.6-02-02 (Text Fit-mode reading airtight — WS-03/04/20) — real 11" iPad Safari, post-deploy
- **WS-03 legibility/clip:** open the **Camp Sabra Staff Concert** set (`7c640a8a-358e-48ee-8523-6b8a0eca9d05`, all text/plain) in Fit mode on an 11" iPad portrait. A long chorded line stays readable at music-stand distance (font never sub-~11px) AND the right edge is reachable — either it fits, or the chart scrolls horizontally (no permanently clipped right edge).
- **WS-04 transposed-chord alignment:** on a text chart, transpose so a chord widens (e.g. C→Db, G→F#m); chords stay over their syllables — no progressive drift across the line.
- **WS-20 touch targets:** the Fit/Wrap toggle and the zoom −/+ buttons are comfortably tappable (≥44px) and don't obscure the last chart lines.
- jsdom has no layout engine, so font-floor/alignment are verified by unit + structure tests only — real-device is the authoritative legibility/alignment check.

## v11.6-02-04 (PDF render reliability — WS-05/07/16) — real 11" iPad Safari, post-deploy
- **WS-05 render hang:** open a PDF chart (Shir Shabbat—Juneteenth set, all PDF) on iPad; if pdfjs render stalls, after ~30s the viewer shows "Chart took too long to render" + Retry (NOT an endless "Rendering…" spinner). Also: rotate the device DURING a chart load → no permanently-blank page (a brief "Measuring…" then the chart, never a 0-width blank).
- **WS-07 multi-page:** open a 2+ page PDF chart → a "Page X of N" indicator is visible and updates as you scroll; a single-page chart shows no indicator.
- **WS-16 rotate recovery:** force a chart into the error/Retry-exhausted state, then rotate the iPad → the Retry affordance returns (fresh budget), no leave-and-re-enter needed.
- react-pdf does not render in jsdom, so watchdog/indicator/width/retry-reset are unit-tested at the decision+wiring level only — real-device is authoritative for actual pdfjs render behavior + WS-27 DPR sharpness.

## v11.6-02-05 (Reading controls — WS-18/22/26/14) — real 11" iPad Safari, post-deploy
- **WS-18 zoom readout:** open any chart on an 11" iPad (portrait + landscape). The zoom control shows the actual percentage (e.g. "100%", "140%") — NOT a bare "/" — and it stays readable; tapping it resets to 100%.
- **WS-22 transpose reachable:** open a transposable chart (text set — Camp Sabra Havdalah `7e005452-...` or Staff Concert `7c640a8a-...`) in BOTH orientations; tap TRANSPOSE → the transposer menu opens and +/- changes the key. (Live headless sweep now PASSes this with the visible-trigger selector; real-device confirms there's no touch obstruction.)
- **WS-26 honest Fit control:** the % readout is labelled "Reset zoom to 100%" (no longer "Fit to width"); on a PDF chart a separate fit-mode toggle (icon) sits in the zoom group.
- **WS-14 fit-page (landscape):** open the **Shir Shabbat—Juneteenth** set (`a84f8cce-...`, all PDF) on iPad **landscape**; a portrait page initially overflows below the fold (fit-width). Tap the fit-mode toggle → the WHOLE page fits within the screen height (no vertical scroll needed to read it); toggle back → fit-width. Default on opening every chart is fit-width.
- **Harness note (carry to phase 03):** the live sweep showed INTERMITTENT `open-chart` timeouts on text sets in headless WebKit (each set opened in ≥1 orientation; flaky across re-runs) — consistent with the known headless-WebKit + Firestore-streaming lower-fidelity caveat, NOT a product regression. Confirm real-device chart-open reliability on camp wifi.

## v11.6-02-06 (Image viewer — WS-06/15) — real 11" iPad Safari, post-deploy
- **WS-06 zoom:** open an IMAGE chart in Perform (not in the 3 weekend sets — use any image-typed chart). Tap Zoom-in / Zoom-out → the image actually scales (was inert before); at 100% it's fit-to-screen (object-contain); when zoomed past the screen you can scroll/pan to its edges. Reopen the chart → it remembers the per-device zoom.
- **WS-15 retry:** force an image-chart load failure (e.g. offline or a broken bond) → an alert with a Retry button (≥44px) appears (not a dead "try refreshing"); tap Retry → it re-attempts and, on success, shows the image.
- Verified by unit tests (zoom application + retry recovery) in jsdom; CSS `zoom` pan behavior + real image decode are the real-device check.

## v11.6-02-07 (Drawer-nav — WS-08) — real 11" iPad Safari, post-deploy
- **WS-08 drawer jump preserves the queue:** open a multi-song setlist in Perform (e.g. **Camp Sabra Havdalah** `7e005452-7c42-4cdc-b27d-ff0c78b6667b` or **Staff Concert** `7c640a8a-358e-48ee-8523-6b8a0eca9d05`), open the in-chart **Setlist** drawer, and tap a DIFFERENT song. It jumps straight to that song's chart AND the bottom Next/Prev chevrons still traverse the whole set (NOT "Song 1 of 1" with greyed chevrons). Transpose/zoom for the tapped song are its own (per-chart restore). Tapping an unbonded flow row (no chart) does nothing.
- jsdom has no radix-portal/layout fidelity for the full gesture, so the open-handler wiring (jumpToSong vs router.push, no-fileId no-op) is unit-proven; real-device confirms the live queue + chevron traversal after the jump.

## v11.6-02.1 (P0 — gig packet text charts) — David, centralreform.live, post-deploy
- **Re-print on the website:** open a text-chart set (e.g. **Camp Sabra — Staff Concert — June 20** `c2075393-d994-4643-ade3-432a6864d87f`) → Gig Packet → **Full Packet (PDFs)** → Download. The PDF now contains a monospace chord-chart page per song (was a cover page with NO charts). Try a per-musician transpose too (chords shift, stay over lyrics).
- Prod-verified server-side already: MCP generate_gig_packet rendered 16/16 bonded text charts (pageCount 22, 0 missing) on the live set. This item is David's real-device browser confirmation.

## v11.6-03-02 (off-site WS-12/13) — real 11" iPad, post-deploy
- **WS-12 open set survives offline error:** open a set in Perform, then drop wifi (or incognito/memory mode) so a Firestore onSnapshot error fires → the set STAYS on screen (charts still readable), NOT replaced by the "Couldn't load setlist" full-screen error. A genuine empty-load failure still shows the error.
- **WS-13 definitive saved count:** open a set → the Save-offline control reads "Saved N/N" (green check) once every chart is cached, and "Save M/N" (amber) while partial — so you can confirm all charts are cached before leaving wifi.

## v11.6-03-03 (WS-10 — MusicXML offline) — real 11" iPad, post-deploy
- **WS-10 offline MusicXML:** with a MusicXML chart cached (open it once online + "Saved N/N"), drop wifi and reopen it in Perform → the score renders from the IDB cache, NOT "Failed to load music XML." *(Forward-risk: no MusicXML in the 3 camp sets — needs a MusicXML chart to exercise; unit-proven IDB-first / network-fallback / .mxl-Blob.)*

## v11.6-03-04 (WS-29/30 — off-site SW + audio, ACCEPTED residuals) — real 11" iPad, post-deploy
- **WS-30 full offline reload (should already work):** open a `/perform/setlist/<id>` online, confirm "Saved N/N", drop wifi, then **hard-reload (F5)** that same URL → the set re-renders from cache (HTML + chunks), charts still readable. *(Known accepted residual, NOT a fix target: soft-navigating to a DIFFERENT, not-yet-visited setlist while offline will fail — open the set before leaving wifi.)*
- **WS-29 audio offline (accepted edge):** with an audio-bonded chart cached, go offline and open it → audio is best-effort and may not start on iPad WebKit (`<audio src=blob:>` rejection). ACCEPTED residual — confirm it at least fails gracefully ("Audio file not found"), no crash. *(No audio rows in the 3 camp sets.)*

## v11.7-05-01 (F3 library density — LibraryFileRow) — real 11" iPad, post-deploy
- **Dense track-list rows:** open `/library` signed-in → chart rows read as a compact Logic-Pro-style track list (smaller title/icon, tighter rows), NOT the old spacious cards. Tapping a row still opens/selects the chart; long-press still enters select mode.
- **Composer sub-label:** charts with a `(Composer)` in the filename show the composer as a dimmed, smaller text beside the title (e.g. "Hashkivenu" + dimmed "Klepper-Freelander"), not mashed into the bold title. Charts without one show just the title (no empty slot).
- **Key + recency at all widths:** the key badge (e.g. "Dm") and the "Last: <date> · N×" recency read in BOTH iPad portrait and landscape (recency was previously hidden on narrow widths).
- **Touch targets:** every row is comfortably tappable (≥44px) despite the denser look.
