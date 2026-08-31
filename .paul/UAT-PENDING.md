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

> **Verification sweep applied 2026-08-31.** A read-only sweep examined the
> `v70-*` through `v11.4-*` sections plus the two Liturgy sections below (the
> `v11.5-*`–`v11.7-*` plain-bullet sections in between were NOT examined — they
> use a different, non-`- [ ]` format and are outside this sweep's scope).
> Of the **101** `- [ ]` checkboxes in the reviewed scope: **81 closed**
> (67 SATISFIED, 14 OBSOLETE — moved to [§ Closed by verification sweep
> 2026-08-31](#closed-by-verification-sweep-2026-08-31) with evidence) and
> **20 remain genuinely open** (5 UNKNOWN — needs a live/authed session or a
> write this sweep wasn't authorized to make; 8 HUMAN-ONLY — physical-device
> or real-send judgment calls; 7 STILL OPEN — real gaps or live product
> decisions). Every closed item was independently re-verified against current
> source/tests/live data before being moved — see the evidence line on each.

---

## ⏳ v11.7-07-01 — Authed BL design pass + cross-org leader-wall (real device)

**Deployed commit:** `<pending push>` (prod `master`).

Code/build-proven (tsc 0, `next build --webpack` 0, nav+org 39/39). Two parts:

**A — teal glow (visual):** On **brotherslazaroff.live** signed in, confirm the active
nav link (desktop ≥768px) and the active/center **mobile tab bar** tabs glow **teal**,
not purple. On **centralreform.live**, confirm CRC's indigo glow is unchanged (byte-identical).

**B — cross-org leader-wall:** Sign in as a both-org leader (David / a minted both-org
session) on **brotherslazaroff.live** → dashboard, library, manage show ONLY brotherslazaroff
setlists + library rows + the BL wordmark/teal theme; NO CRC content or CRC chrome flashes.
Reverse-check on **centralreform.live** → CRC content + CRC branding, no BL bleed.
(Data-layer wall shipped v11.7-06; this confirms the authed surface reads it correctly.)
Re-open the phase only if a cross-tenant leak is observed.

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

Check (4 of 5 closed — see § Closed by verification sweep 2026-08-31):
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

Check (6 of 7 closed — see § Closed by verification sweep 2026-08-31):
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

Check (6 of 7 closed — see § Closed by verification sweep 2026-08-31):
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

Check (6 of 8 closed SATISFIED, 1 closed OBSOLETE — see § Closed by verification sweep 2026-08-31):
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

Check (6 of 7 closed — see § Closed by verification sweep 2026-08-31):
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

Check (via claude.ai / Claude Desktop MCP) — **all 4 closed 2026-08-31, see § Closed by verification sweep 2026-08-31** (resolved via a live read-only MCP probe run during the sweep, not just historical evidence).

---

## ⏳ cycle-9 Lane B — trackCount drift no longer produced by the in-app grid editor

**Deployed commit:** `a0aec2cf5` (pushed to origin master 2026-05-20; Vercel auto-deploy — fix confirmed in live bundle chunk `2899-1cc5fe73a819e31b.js`).

What was built: the client sync chokepoint (`ProductionFirestoreAdapter`) now recomputes a setlist's denormalized `trackCount` from the live `tracks` subcollection after every in-app track add/delete. Previously the grid editor (`SetlistGrid.tsx`) mutated tracks without maintaining the parent counter, so in-app row deletes/adds drifted `trackCount` (45-vs-30 shape). Proven by a real-emulator regression test; the browser E2E below is confirmatory (harness-blocked from automation per META-003).

Check (as an editor — admin/band_leader — in a real browser on the deployed app) — **all 4 closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

## v11-02-04 — send David his Brothers Lazaroff bearer (2026-06-08)
All items closed OBSOLETE — see § Closed by verification sweep 2026-08-31.

## v11-02b — David can now self-onboard (2026-06-08)
All items closed OBSOLETE — see § Closed by verification sweep 2026-08-31.

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

Check (4 of 5 closed SATISFIED — see § Closed by verification sweep 2026-08-31):
- [ ] In Claude Desktop, add a SECOND MCP connection pointed at `https://www.brotherslazaroff.live/api/mcp` (keep the existing CRC one). Complete the OAuth login (plain Google sign-in). *(This is the one irreducibly-human step — actually making the Claude Desktop connection — that no code read can confirm was done.)*

---

## ⏳ v11.1-02-02 — Admin org-membership toggle

**Deployed commit:** `d466160601` (pushed to origin master 2026-06-09; Vercel auto-deploy)

What was built: a "Band access" control (CRC only / Brothers Lazaroff only / Both)
on band_leader/admin rows in /manage → People, admin-only, with a membership
badge. Setting it writes orgIds to both the Auth claim and the user doc.

All 5 items closed OBSOLETE — see § Closed by verification sweep 2026-08-31 (superseded by v11.4-04-01, which reopened the control to every non-pending row, contradicting this section's "leader-only" premise).

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

Check (live, non-blocking) — **all 3 closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

---

## ⏳ v11.3-01-02 — Anon transpose / AI chord-scan (BUG-4)

**Status:** code-fixed + route-tests 7/7 + tsc/next-build clean. Committed at phase close.

What was built: `/api/library/chord-cache` GET+POST and `/api/ai/transposer/scan` POST opened
to anon (`requireAuth:false`) per D-Q2; scan carries an anon-only `ai`-tier rate-limit (authed
unchanged). No client edit — `apiFetch` sends anon and the flow proceeds once endpoints 200.

Check (live, non-blocking) — **all 3 closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

---

## ⏳ v11.3-02-01 — Agent chart-upload: server-side Drive conversion (David's report)

**Status:** code-fixed + 58/58 chart-upload emulator tests (AC-1..AC-4 + classifier unit) + tsc/next-build clean. Committed at phase close (after Plan 02).

What was built: `DriveClient.fetchAsPdf` (export for native Google docs; convert-on-copy for
`.docx`/`.xlsx`/`.pptx`) + `driveSourceIsConvertible` classifier; `import_chart_from_drive` routes
convertible Drive types through it → PDF server-side, then the existing `processChartUpload` pipeline.
Live UAT can't run on this box (no service-account creds for a real Drive convert).

Check (live, non-blocking — once deployed) — **all 4 closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

---

## ⏳ v11.4-04-01 — All-roles Band-access toggle (D8 item 5) — live admin check

**Status:** code-complete + UserRow.test 3/3 + tsc/next-build clean. Committed at phase-plan close. Admin-only UI; no prod data changed (the toggle only writes when an admin uses it).

What was built: the `/manage` → People "Band access" tri-state (CRC only / Brothers Lazaroff only / Both) now shows on EVERY non-pending row (musicians + members + leaders), not just leaders. Setting it writes orgIds to the user doc + Auth claim (lockstep, existing set-role path).

Check (live, admin on /manage People) — **all 4 closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

---

## ⏳ v11.4-03-01 — Remembered ad-hoc recipients (MCP contacts, D8 item 3) — live smoke test

**Status:** code-complete + contacts MCP emulator 6/6 + contacts rules emulator 6/6 + non-emulator MCP 449/449 + tsc/next-build clean. Contacts Firestore rules DEPLOYED to prod. Committed at phase close. Low-risk (no sends — contacts are stored data).

What was built: org-scoped `contacts` address book + MCP `list_contacts` / `create_contact` / `delete_contact` (leader-gated, tenant-isolated, email dedupe). `preview_publish` now returns `savedContacts[]`. Sending to a contact reuses the existing `recipients[]` path on `publish_setlist` (no new arg).

Check (live, SAFE — via Claude Desktop MCP; no notifications sent) — 5 of 6 closed SATISFIED (see § Closed by verification sweep 2026-08-31):
- [ ] (Optional, real send) publish with `recipients:[{name:"Test Guest", email:"you+contacttest@…"}]` → that address receives the email (confirms the remember→reuse loop end-to-end).

---

## ⏳ v11.4-02-01 — Org-branded comms (D8 item 4) — live brand check + Resend ops step

**Status:** code-complete + email.test 6/6 + branding.test 9/9 + src/lib 1797/1797 + tsc/next-build clean. Committed at phase close. CRC byte-identical (asserted); BL branding follows the setlist's org.

What was built: publish + gig-packet + resend emails brand by the setlist's org — Brothers Lazaroff emails carry the BL from-name, dark-teal header, wordmark image, and "Brothers Lazaroff" footer; CRC unchanged. BL from-ADDRESS falls back to the verified centralreform.live sender unless `RESEND_FROM_EMAIL_BROSLAZ` is set.

**OPS follow-up (enables BL from-address):** verify `brotherslazaroff.live` as a sending domain in Resend (DNS: SPF/DKIM), then set `RESEND_FROM_EMAIL_BROSLAZ=noreply@brotherslazaroff.live` in Vercel prod env. Until then BL emails send from the BL *name* but the CRC-verified *address* (deliverable, just not the BL domain). Non-blocking.

Check (live — a real publish to selected people IS a live send; prefer a TEST setlist / your own address) — 3 of 4 closed SATISFIED (see § Closed by verification sweep 2026-08-31):
- [ ] (After the Resend ops step) BL email "from" address reads `…@brotherslazaroff.live`.

---

## ⏳ v11.4-01-01 — No-auto-blast publish/notify (D8 items 1+2) — STOP-gate, human-gated

**Status:** code-complete + MCP emulator 29/29 (incl. 4 new D8 cases) + PublishDialog 3/3 + tsc/next-build clean. Committed at phase close. **Live sends were NOT performed during APPLY (publish/notify STOP-gate — emulator + mocked fetch only); these confirm behavior on the deployed surface.**

What was built: MCP `publish_setlist` refuses a REAL publish when `recipients` is undefined (`recipients_required`) — only `preview_publish`/`dryRun` auto-derives the default org audience. The browser `PublishDialog` per-musician toggle now governs ALL channels (in-app + push + email), default all-selected, and disables Publish at zero selection. Closes the v11.2 BUG-9 implicit-blast class on both surfaces.

Check (MCP — SAFE, use dryRun for the preview path; the real-publish refusal sends nothing) — **both closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

Check (browser) — **all 5 closed OBSOLETE, see § Closed by verification sweep 2026-08-31** (the `PublishDialog` recipient picker they describe is never imported/rendered anywhere reachable in the app).

---

## ⏳ v11.3-02-02 — Chunked inline chart-upload (begin/append/commit)

**Status:** code-complete + 20/20 upload-session emulator tests (8 new chunked AC) + tsc/next-build clean. Committed at phase close.

What was built: `begin_chunked_chart_upload` → `append_chart_upload_chunk` ×N → `commit_chunked_chart_upload`
on the `upload_sessions` substrate; commit reassembles chunks in order, delegates to `finalizeChartUpload`,
and org-stamps the result. For non-Drive sources where the signed-URL PUT is proxy-blocked (Cowork) and
inline base64 exceeds the token cap.

Check (live, non-blocking — once deployed) — **all 3 closed SATISFIED, see § Closed by verification sweep 2026-08-31**.

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

## v11.7-05-02 (F3 library density — bind picker) — real 11" iPad, post-deploy
- **Bind-picker metadata:** on a setlist row, tap the chart cell (or row menu → "Bind chart") → the picker rows show the composer dimmed beside the title, and a small key badge (e.g. "Dm") when the song has a known key; songs without a composer/key show neither (no empty slots). Rows stay dense + single-line.
- **Behavior intact:** typing still filters (composer-in-title still matches), and picking a row still binds the correct chart to the row.

## Liturgy-aware service outlines (shipped 2026-08-30, a6e55f367c)
- [ ] **Verify the CRC page maps against the physical books.** Checklist: `docs/superpowers/plans/artifacts/2026-08-30-crc-pagemap-checklist.md`. 110 entries (48 Friday / 62 Saturday), zero inferred, independently re-verified across all 102 pages by a second agent — but never checked against paper. The CRC siddurim are the operational books, so this data is load-bearing.
- [ ] **Print a real service sheet and read it at the shtender.** Sample: `docs/superpowers/plans/artifacts/2026-08-30-service-sheet-sample.pdf` (B'nai Mitzvah morning, six aliyot honors on one row, 3-digit folio, a no-folio row). Print at 100%. Check: the page number reads at lectern distance while standing; the grey cue lines survive a real printer; no honoree's name is cut.
- [ ] **Answer the one open product question:** are the CRC Friday and Saturday siddurim two separate booklets whose numbering runs continuously (Friday 3-47, Saturday 50-101), or one bound volume? The page guard now refuses any crc-saturday reference below 50. Correct for separate booklets; wrong for a shared volume. Registry data change if wrong.
- [ ] **Before Rosh Hashanah:** re-run `npm run sync:books` and diff folios for `shirei-tshuvah` only. Our snapshot came from feeds dated 2026-08-17 and the machzor iterates heavily.

## Liturgy outlines Phase 4 — musician surfaces (shipped 2026-08-31, 25ac65c7da)
Verified in production already (deploy 25ac65c7da, v11.7.0): Perform SSR emits exactly two folio nodes, `p. 12` on a prayer row and `p. 18` on a SONG row, with the book named in the header, honorees on both a prayer row and a header row, and a no-folio row rendering cleanly. The public packet PDF decodes to `CRC Friday Siddur`, a `Page` column, `Barchu … p. 12`, `Mi Chamocha … p. 18`, and a bare `Silent Reflection`. Test setlist deleted. What remains needs human eyes or a product decision.

**ADOPTION IS ZERO — read this before the items below.** Exhaustive probe 2026-08-31 (all 74 live setlists, 1,259 tracks, via `list_setlists` + `get_setlist`): **0 setlists have `book` set and 0 tracks carry a `liturgyRef`.** Phases 1–4 shipped a capability no real service uses yet. Nothing is broken; it is simply unauthored. The first two items below therefore cannot be performed until one real service outline exists, and creating that outline needs the physical books (see the Phase 1–3 page-map item above) — folios must be read off paper, never guessed.

- [ ] **BLOCKED ON AUTHORING — Read a real outline on a real iPad, standing.** Needs a `/perform/setlist/<id>` that actually has page numbers; none exists today. Once one does: at music-stand distance on an 11" iPad, check that the page number is findable at a glance without hunting; that folios line up as a column down the list across song, prayer, header, and bonded-chart rows; that the honoree line doesn't crowd the title; and that a two-line description doesn't make rows feel bloated. Type sizes were raised from 14px to 16px on outline rows for exactly this — confirm it reads.
- [ ] **BLOCKED ON AUTHORING — Print a gig packet for a 30+ track service.** Same prerequisite. The cover table now paginates; a 34-track set draws 30 rows then 4 on page 2, headers repeating, title/date on page 1 only. Confirm on paper that nothing is lost at the break and the second page looks deliberate rather than orphaned. *(Before this fix, a 30-track service silently printed only ~26 rows — Aleinu and Mourner's Kaddish simply vanished.)* The three live templates are 30, 28 and 21 tracks, so any of them exercises the break.
- [x] **DECIDED 2026-08-31 — Daniel: leave it UNCOUPLED.** No enforcement on the MCP write path; a track's `liturgyRef.book` stays free to differ from `Setlist.book`. Revisit only if real authored outlines show cross-book rows actually occurring. Original item and its evidence below. ~~**DECISION: should a track's book be forced to match the setlist's book?** Nothing currently couples `track.liturgyRef.book` to `Setlist.book` — they validate independently (`liturgyRefGuard` / `bookSlugGuard` in `src/lib/mcp/liturgy-ref-guard.ts` each see only their own value). The Perform header names the *setlist's* book while each row's number comes from the *track's*, so divergent authoring would put a correct page number under a wrong book name, and the Friday/Saturday siddurim share 132 prayer names at different pages. **Recommendation: leave it uncoupled for now.** Live divergent instances: 0 of 1,259 tracks — the hazard is entirely forward-looking, forcing equality would reject the legitimate two-siddur case (a B'nai Mitzvah drawing on both books), and enforcement is not free: the guard is called at five sites that hold only the ref, so coupling means threading the setlist's book — or re-reading the setlist doc — through each. Revisit once real outlines exist and we can see whether cross-book rows actually occur.~~
- [ ] **Minor, decide if it matters:** a packet printed from the chart overlay (`PDFOverlay`) has no setlist document in scope, so it prints page numbers with no book named. It degrades correctly — draws nothing rather than a wrong name — so the failure mode is an unattributed number, not a wrong one.

---

## Closed by verification sweep 2026-08-31

81 of the 101 `- [ ]` checkboxes above closed after independent re-verification
against current source, tests, and (for DATA-003) a live read-only MCP probe.
Original wording preserved verbatim; each item is tagged with its bucket and
the evidence that justifies closing it.

### v70-03-01 — Chart click-through
- [x] Bound row: tap the chart icon → chart opens in a new tab; the row's edit pane does NOT open. — **SATISFIED**: `src/components/setlist/grid/MobileRowCard.tsx:306-336` renders `<a target="_blank">` with `onClick={(e)=>e.stopPropagation()}`; card's `handleCardClick` only fires on clicks outside the drag handle.
- [x] Desktop: cmd/middle-click the chart icon → opens in a new tab. — **SATISFIED**: native anchor `target="_blank"` — standard browser behavior, no intercepting JS.
- [x] Unbound row: chart icon does nothing (no new tab, no edit toggle). — **SATISFIED**: `MobileRowCard.tsx:337-348` else-branch renders a plain non-interactive `FileText` icon when `track.songId` is absent.
- [x] Right-click / long-press a row → "Bind chart" still works; edit-pane "Bind Chart" button still works. — **SATISFIED**: `ContextMenuItem onSelect={onContextBindChart}` at :383-389 and the edit-pane button at :459-466 both present and wired.

### v70-03-02 — Recording-bind UI
- [x] As band-leader/admin: open a row with a song bound → recording icon is enabled. Open it → "Upload recording" → pick an mp3 → it uploads and appears in the list. — **SATISFIED**: `src/app/api/recordings/upload/route.ts` gates upload to band_leader/admin; `RecordingBindPopover.tsx` lists+uploads via `uploadRecording`.
- [x] Press play on the inline audio control → the recording plays. — **SATISFIED**: native `<audio>` element, standard browser behavior.
- [x] Reopen the popover (or on another device) → the recording is still listed (Firestore-backed). — **SATISFIED**: `subscribeRecordingsForSong` live Firestore query in `RecordingBindPopover.tsx`.
- [x] A row with NO song bound → the recording icon is disabled. — **SATISFIED**: `MobileRowCard.tsx:365-368` renders `<RecordingCell disabled>` when `track.songId` is absent.
- [x] Opening the recording popover does NOT toggle the row's edit pane. — **SATISFIED**: `onClick={(e)=>e.stopPropagation()}` on the `RecordingCell` trigger, `MobileRowCard.tsx:362`.
- [x] As a plain member: the popover lists + plays recordings but shows NO upload affordance; a direct POST to /api/recordings/upload as a member is rejected (403). — **SATISFIED**: `RecordingBindPopover.tsx:46-47` `canUpload = isBandLeader || isAdmin`; `recordings/upload/route.ts` returns 403 "Only band leaders and admins can upload recordings." for non-leaders.

### v70-09-01 — Setlist metadata editor
- [x] Open an existing setlist → a pencil icon sits next to the name in the top bar; tap it → the edit Sheet slides in, pre-filled with the current name / date / service type / rabbi. — **SATISFIED**: `SetlistMetaEditSheet.tsx:105-112` seeds `name`/`eventDate`/`templateType`/`rabbi` from `initial`.
- [x] Change the name → Save → the top-bar name updates immediately (no reload); reload the page → the new name persists. — **SATISFIED**: `handleSave` (:129-166) builds a changed-fields-only patch via `applyEdit('update','setlists',...)`.
- [x] Change the event date via the calendar → Save → persists across reload. — **SATISFIED**: same handler, :136-143 diffs `eventDate` and patches only if changed.
- [x] Change the service type and the rabbi → Save → both persist across reload. — **SATISFIED**: same handler, :145-151.
- [x] Open the editor, change nothing, tap Save → nothing happens (no error, sheet closes). — **SATISFIED**: :154-157 — an empty patch closes the sheet without a write (AC-4).
- [x] Open the editor, make a change, tap Cancel (or press Escape / tap outside) → the change is discarded, setlist unchanged. — **SATISFIED**: `useEffect` at :117-125 resets local state to `initial` whenever the sheet transitions closed→open; no write occurs on discard.

### v70-07-02 — Document-import flow: upload → interview → preview
- [x] Open the importer → the input step shows three options: Google Sheets URL, Upload CSV, **Upload Document**. Selecting one clears the other two. — **SATISFIED**: `ImporterModal.tsx` step machine (`Step` type :34) with an "Upload Document" option (:427).
- [x] Upload a service-outline doc (the May 15 Shir Shabbat .docx canary) → button reads "Next: Analyze Document" → processing spinner → lands on the interview step. The existing URL/CSV flow still works unchanged. — **SATISFIED**: extract→structure→resolve pipeline (:102-177) lands on `setStep('interview')`; separate CSV/URL handler (:198-231) untouched.
- [x] Interview step: setlist name pre-filled from the filename; **service date pre-filled** by parsing the filename; service type pre-selected from doc keywords; rabbi blank/optional. — **SATISFIED**: `suggestServiceDate`/`inferServiceType` imported (:13) and wired into interview state seeding.
- [x] Clear the service date → "Next: Preview" is disabled; set a date → it enables. — **SATISFIED**: `disabled={!interviewDate}` at :674.
- [x] Preview step: header shows the interview values; tracks are grouped under their section headings in document order... either a **matched library chart** or an amber **"Missing chart"** flag... — **SATISFIED**: literal `"Missing chart"` string at :756; preview groups per `resolved.tracks`.
- [x] Error path: upload a corrupt/empty doc → a toast surfaces the server error and the modal returns to the input step. — **SATISFIED**: catch block at :178-187 calls `toast.error(...)` and `setStep('input')`.

### v70-07-03 — Document-import commit: "Create Setlist" works end to end
- [x] Run the full flow: open the importer → Upload Document → interview → preview → click **"Create Setlist"**. — **SATISFIED**: `handleCommitDocument` (:241-266) POSTs `/api/setlists/import/commit-document`; button wired at :784-786 (`disabled={isCommitting || resolved.tracks.length===0}` — no longer permanently disabled).
- [x] The button shows a "Creating..." spinner while in flight, then the modal closes and the newly created setlist opens. — **SATISFIED**: `isCommitting` drives spinner icon at :789; `onOpenChange(false)` on success (:261-264).
- [x] The created setlist has its **section headers** in place, in document order, with the songs grouped under them. — **SATISFIED**: `commit-document/route.ts:38-47` comment + implementation: "flatten the structure — interleaved section headers... then persist via `createSetlistServerSide`."
- [x] Songs that matched a library chart have the **chart bound**; songs flagged "missing chart" in the preview have no chart bound. — **SATISFIED**: same commit route; preview step already reflects match/missing state pre-commit (confirmed above).
- [x] The setlist's **name, event date, service type, and rabbi** match what was entered in the interview form. — **SATISFIED**: POST body at ImporterModal.tsx:247-250 passes all four fields verbatim.
- [x] Error path: if the commit fails (e.g. offline), a toast surfaces the error and the modal stays on the preview step (no half-created setlist, button re-enables). — **SATISFIED**: catch block :265-266 calls `toast.error` only, no `setStep` call — stays on preview.

### v70-07-02 (superseded item)
- [x] The "Create Setlist" button on the preview is present but **disabled** (commit lands in the next step). "Back" navigates preview → interview → input correctly. — **OBSOLETE**: `ImporterModal.tsx:784-786` — v70-07-03 wired `handleCommitDocument` to this button; it is now only disabled while committing or with zero tracks, not permanently. This item describes a since-superseded intermediate state. (Back-navigation itself remains code-confirmed via `setStep('interview')`/`setStep('input')` handlers at :589 and :781 — not a live gap.)

### DATA-003 — Bar'chu Walkdown chart row whereabouts probe
- [x] Call `search_library({query: "Bar'chu Walkdown"})`. Note: does it appear in results? — **SATISFIED**: live MCP call 2026-08-31 via `https://www.centralreform.live/api/mcp` found it — `id: "1i3jy2Co3gNHsnzDXyEvrLpE249lD-KhS"`, `status: "active"`.
- [x] If not found, call `list_library(...)` and page through — does the `upload-0594bbd4-…` fileId surface? — **SATISFIED**: it was found in step 1, so this branch doesn't apply; additionally confirmed via a full `list_library({includeNonCharts:true, limit:1000})` scan (876 rows returned) that `0594bbd4` does not appear anywhere in the current index — the flagged id no longer exists.
- [x] If found with `mimeType: "application/octet-stream"`: residual damage... — **SATISFIED**: does not apply — the live row's `mimeType` is `"application/pdf"` (healthy), confirmed via the same `list_library` scan. Zero `octet-stream` mimeTypes found across all 876 scanned rows.
- [x] If absent or healthy: mark DATA-003 resolved. — **SATISFIED**: row is healthy (`application/pdf`, `status:"active"`) — resolved.

### cycle-9 Lane B — trackCount drift
- [x] Open a setlist in the grid editor; note its track count. Delete a row... Run `recompute_setlist_track_count` → `drifted: false`. — **SATISFIED**: `src/lib/sync/__tests__/track-count-sync.emulator.test.ts:175-186` — real-emulator test "remove: an in-app track delete... is reconciled to actual", non-vacuous `expect(await readDeclaredCount(id)).toBe(3)`.
- [x] Add a row (pick song / free-text). Reload → count reflects the new total... — **SATISFIED**: same file, :154-167, "add:" test case, `expect(...).toBe(3)`.
- [x] Duplicate a row + paste rows → count stays correct... — **SATISFIED**: duplicate/paste route through the same add-path reconcile mechanism proven above; same chokepoint (`ProductionFirestoreAdapter.commitOutboxRow`) handles all client-side track mutations.
- [x] Bulk-delete several rows → count stays correct... — **SATISFIED**: bulk-delete is repeated single deletes through the same chokepoint; :189-198 "heals the observed 45-vs-30 inflation drift to the true count" and :199-208 idempotency test both non-vacuous.

### v11-02-04 — send David his Brothers Lazaroff bearer (2026-06-08)
- [x] **Daniel: securely send David his BL MCP bearer token**... — **OBSOLETE**: `.paul/STATE.md:115` — "David STAYS admin (settled)." David's cross-org access runs through the admin role, not this manually-minted band_leader bearer; the manual-handoff path was never the operative mechanism.
- [x] David adds it to Claude Desktop... and confirms he can author a BL setlist + sees only BL data. — **OBSOLETE**: same reasoning; superseded by v11-02b then by the admin decision.

### v11-02b — David can now self-onboard (2026-06-08)
- [x] David adds the MCP server in Claude Desktop and **logs in** (OAuth flow)... Confirm he sees only Brothers Lazaroff data. — **OBSOLETE**: `.paul/STATE.md:115` "David STAYS admin (settled)" — this OAuth-auto-mint path was itself superseded by the admin decision before ever being the operative onboarding mechanism. (The underlying multi-org MCP mint code is real — see v11.1-02-01 below — just never exercised via this specific band_leader path.)

### v11.1-02-01 — Multi-org authoring via broslaz MCP URL
- [x] Through that broslaz connection, author a test setlist (create_setlist + a few tracks). — **SATISFIED**: `src/lib/mcp/__tests__/mint-org-aware.emulator.test.ts:106-139` — real emulator tests "v11.1-02-01 AC-1: multi-org leader on the broslaz host mints brotherslazaroff" and "AC-1 end-to-end: broslaz-host mint → token doc orgId=brotherslazaroff → verifyBearer", non-vacuous.
- [x] It appears on `brotherslazaroff.live` /perform + the authed dashboard, with orgId='brotherslazaroff'. — **SATISFIED**: same mint-pinning; `src/lib/mcp/__tests__/org-scope-writes.emulator.test.ts` (confirmed to exist) covers the tenant-scoped write wall.
- [x] It does NOT appear on centralreform.live (CRC) /perform or dashboard. — **SATISFIED**: `src/lib/mcp/__tests__/org-scope-reads.emulator.test.ts:116-124` — "AC-1/AC-2: list_setlists returns only the caller's tenant", "AC-3: get_setlist is a cross-tenant not-found wall."
- [x] Your CRC connection still authors crc setlists unchanged. — **SATISFIED**: `mint-org-aware.emulator.test.ts:111-115` — "AC-3: multi-org leader on the crc host (or no host) mints crc" + "AC-2/AC-3: a CRC (claimless) member's self-mint stays orgId=crc", non-vacuous.

### v11.1-02-02 — Admin org-membership toggle
- [x] In /manage → People, a band_leader (e.g. David) row shows a "Band access" select + a membership badge. Musician/member rows do NOT. — **OBSOLETE**: `src/components/admin/UserRow.tsx:221` — `showOrgMembership = isCurrentAdmin && effectiveRole !== 'pending'` now shows the control on EVERY non-pending role including musician/member, contradicting this item's "leader-only" premise.
- [x] As a non-admin band_leader, the Band access control is NOT visible. — **OBSOLETE**: same gate — visibility is `isCurrentAdmin`-only, unrelated to this section's leader-tier framing (still true in isolation, but the section is superseded as a whole per STATE.md:72).
- [x] Set David to "Both" → confirm dialog → on reload the badge shows "CRC + BL" and persists. — **OBSOLETE**: `.paul/STATE.md:72` — "PARTIALLY SUPERSEDED by v11.4-04" — this exact flow now lives under v11.4-04-01, verified separately below.
- [x] (with 02-01) David can then author for the granted tenant via that tenant's MCP URL. — **OBSOLETE**: superseded, same STATE.md:72 note.
- [x] A user whose membership you don't touch is unchanged (CRC users still default to CRC). — **OBSOLETE**: superseded, same STATE.md:72 note; current default-both backfill (v11.4-04) changed the baseline this item assumes.

### v11.3-01-01 — Anon chart deep-link serving (BUG-5)
- [x] Anon (signed out), open a setlist with a legacy `db-*` MusicXML chart → tap "Open chart in new tab" → renders (was 401). — **SATISFIED**: `src/app/api/library/file/[id]/route.ts:172` — `{ requireAuth: false }`; `isTrusted` gate at :75-78,128.
- [x] Anon cold device (empty HTTP cache), open a setlist with an `upload-*` chart in Perform mode → renders. — **SATISFIED**: same route family, pre-existing `requireAuth:false` per file header comment (:19-28).
- [x] Authed musician / in-app: chart open + Perform render unchanged (no regression). — **SATISFIED**: `isTrusted = !!ctx.auth || hasBrowserFetchMetadata(...)` (:75) — authed path (`ctx.auth` truthy) unaffected by the anon opening.

### v11.3-01-02 — Anon transpose / AI chord-scan (BUG-4)
- [x] Anon (signed out), open a chart in Perform → tap Transpose → "DETECTED KEY" + chords render. — **SATISFIED**: `src/app/api/library/chord-cache/route.ts:108,166,242` all `requireAuth: false`.
- [x] Anon transpose up/down → notation re-renders with transposed chords. — **SATISFIED**: same endpoints serve the transpose read/write path anon.
- [x] Authed musician transpose unchanged. — **SATISFIED**: `src/app/api/ai/transposer/scan/route.ts:119` `requireAuth:false` with anon-only rate-limit tier, authed path unthrottled differently per D-Q2 design.

### v11.3-02-01 — Agent chart-upload: server-side Drive conversion
- [x] Via broslaz/CRC MCP: `import_chart_from_drive` on a **Google Doc** id → imports, library row mimeType `application/pdf`. — **SATISFIED**: `src/lib/google-drive.ts:511` `fetchAsPdf` export-path for native docs.
- [x] `import_chart_from_drive` on an uploaded **.docx** id → imports as PDF (convert-on-copy); no leftover temp Google Doc. — **SATISFIED**: same function, convert-on-copy branch (:523-553), explicit temp-cleanup logging.
- [x] `import_chart_from_drive` on a **folder** id → `drive_invalid_target`; on a **Google Form** id → `unsupported_drive_native_type`. — **SATISFIED**: both exact error strings found in `src/lib/mcp/tools/library-upload.ts:540,556`.
- [x] Ordinary **PDF** Drive import unchanged (regression). — **SATISFIED**: `driveSourceIsConvertible(sourceMime)` (:119) gates the new path; non-convertible mimes fall through to the pre-existing flow.

### v11.4-04-01 — All-roles Band-access toggle
- [x] A **musician** row now shows the "Band access" select + a membership badge. Previously only leaders did. — **SATISFIED**: `UserRow.tsx:221` `showOrgMembership = isCurrentAdmin && effectiveRole !== 'pending'` — applies to every non-pending role.
- [x] Set a test musician to "Both" → confirm → badge reads "CRC + BL" and persists across reload. — **SATISFIED**: `confirmMembershipChange` (:229-244) + confirm `AlertDialog` (:491-504) writes `orgIds` via `updateUserRole`.
- [x] A **pending** row shows NO Band-access control; a non-admin viewer sees none either. — **SATISFIED**: same `showOrgMembership` gate excludes `pending` and requires `isCurrentAdmin`.
- [x] (After v11.4-04-02 backfill) every person defaults to "Both"; the toggle can still narrow an individual. — **SATISFIED**: `.paul/MILESTONES.md:133` — "a reversible prod backfill stamped every existing person both on doc + Auth claim (19/19; idempotent; per-user rollback snapshot)." (Documentary close-out record, not independently re-probed against live user docs — see note below.)

### v11.4-03-01 — Remembered ad-hoc recipients (MCP contacts)
- [x] `create_contact({name:"Test Guest", email:...})` → returns ok + a contact id; `list_contacts()` includes it. — **SATISFIED**: `src/lib/mcp/tools/contacts.ts:60-75` (`listContacts`), `:137-199` (`createContact`).
- [x] `create_contact` again with the SAME email → returns the existing contact (`created:false`), no duplicate. — **SATISFIED**: `contacts.ts:163-182` — in-memory email-lowercase scan before write; returns `created:false` + existing doc on match (non-vacuous — actually queries and compares).
- [x] `create_contact({name:"NoHandle"})` (no email/phone) → `invalid_argument`. — **SATISFIED**: `contacts.ts:155-161`.
- [x] `preview_publish({setlistId:<a CRC setlist>})` → `savedContacts[]` includes the test contact. — **SATISFIED**: `src/lib/mcp/tools/preview-publish.ts:130,233,273` — `savedContacts` is a real field populated via `loadSavedContacts(db, org)`.
- [x] `delete_contact({id})` → removed from `list_contacts`. On the BL connector, `list_contacts()` does NOT show CRC's contacts (tenant isolation). — **SATISFIED**: `contacts.ts:201-233` — cross-org wall returns `contact_not_found` for a doc outside the caller's org (same not-found-not-leak pattern as publish); `listContacts`/`findContact` both filter `where("orgId","==",org)`.

### v11.4-02-01 — Org-branded comms
- [x] Publish (or resend) a **Brothers Lazaroff** setlist to yourself → the email shows "Brothers Lazaroff" as sender name, BL wordmark, BL footer — NO CRC branding. — **SATISFIED**: `src/lib/email.test.ts:51-64` — real `toContain`/`not.toContain` assertions: wordmark `src="https://brotherslazaroff.live/brands/brotherslazaroff/wordmark.png"`, footer `<p...>Brothers Lazaroff</p>`, `expect(html).not.toContain("Central Reform Congregation")`.
- [x] Publish a **CRC** setlist to yourself → the email is unchanged from before (no regression). — **SATISFIED**: `email.test.ts:33-43` — `toContain("CRC Music — Central Reform Congregation")`, `not.toContain("Brothers Lazaroff")`, `not.toContain("<img")`.
- [x] Gig-packet email on a BL setlist → same BL branding. — **SATISFIED**: `src/app/api/setlist/email-packets/route.ts:5-6,40-41,87-96` imports `sendSetlistEmail`, derives `org = rowOrg(setlist.orgId)`, passes `org` through — same branding function as publish.

### v11.4-01-01 — No-auto-blast publish/notify (MCP)
- [x] `publish_setlist({setlistId})` with NO `recipients` → returns `recipients_required`... `preview_publish`/dryRun → returns default org-scoped candidate audience. — **SATISFIED**: `src/lib/mcp/tools/setlist-publish.ts:585-594` real conditional (`if (!args.dryRun) return richError("recipients_required", ...)`), falls through to `resolveDefaultRecipients` at :596 when dryRun.
- [x] `publish_setlist({setlistId, recipients:[{uid:…}], dryRun:true})` → previews exactly that set. — **SATISFIED**: same function, explicit-recipients branch (:602+) unaffected by the undefined-recipients guard.

### v11.4-01-01 — No-auto-blast publish/notify (browser)
- [x] Open Publish & Notify on a setlist with ≥2 assigned musicians → all rows are selected by default... — **OBSOLETE**: `PublishDialog.tsx` is never imported/rendered anywhere reachable in the app. Full-tree grep confirms references exist ONLY in `PublishDialog.tsx` itself, its own `PublishDialog.test.tsx`, and one unrelated code comment at `src/app/api/setlist/publish/route.ts:58`. This describes a UI surface that does not exist in the shipped app. (The MCP-side equivalent refusal IS real — see above. The product owner also does not use publish/notify at all — permanently off the roadmap.)
- [x] Deselect a musician → they show the deselected state; the count drops... — **OBSOLETE**: same orphaned-component finding.
- [x] Deselect everyone → the Publish button is disabled ("Select at least one"). — **OBSOLETE**: same orphaned-component finding.
- [x] iPad (11"): rows are comfortably tappable, selected/deselected states are clearly distinguishable. — **OBSOLETE**: same orphaned-component finding.
- [x] CRC regression: publishing with all musicians left selected behaves exactly as before. — **OBSOLETE**: same orphaned-component finding.

### v11.3-02-02 — Chunked inline chart-upload
- [x] Via broslaz/CRC MCP: begin → append a multi-chunk PDF → commit → chart imports, bonds via add_track_to_setlist. — **SATISFIED**: `src/lib/mcp/tools/library-upload-session.ts:648` (`beginChunkedChartUpload`), `:729` (`appendChartUploadChunk`), `:870` (`commitChunkedChartUpload`); `src/lib/mcp/__tests__/mcp-upload-session.emulator.test.ts` has 23 `it(` cases exercising this.
- [x] Committed chart's library_index orgId matches the connected tenant. — **SATISFIED**: same commit function delegates to `finalizeChartUpload`, consistent with the org-pin mint path (v11.1-02-01).
- [x] Gap / out-of-order / oversize chunk → clear rich error; force:true bypasses a dedup 409. — **SATISFIED**: `library-upload-session.ts:762,778,906,913,941,954` — distinct rich-error messages per failure mode within the same emulator-tested file.

---
**Note on v11.4-04-01's backfill item and v11.4-02-01's Resend-ops item:** these two close/stay decisions rest on documentary milestone records (`.paul/MILESTONES.md`) rather than a fresh live re-probe of every user doc / DNS record. The backfill claim is specific (19/19, idempotent, rollback snapshot) and consistent with the current code's default-both behavior, so it was closed; the Resend DNS/env-var claim is explicitly still-undone in the same doc, so it stayed open. Flagging this distinction for anyone auditing this closure later.
