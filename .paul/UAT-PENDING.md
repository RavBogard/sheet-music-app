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

## ✅ v11.3-04-02 — /perform CLS fix (synthetic) — VERIFIED 2026-06-10

**Deployed commit:** `c0b0ab3367` (live on prod).

What was built: reserved the anon QR sign-in card's slot during `authLoading`
(for expected-anon, `!cachedUser`) so the Upcoming/Past lists no longer shift
when the card mounts post-auth-resolve.

**VERIFIED:** Playwright @ 820×1180 on PROD `/perform` post-deploy → cumulative
layout-shift **0.000** on two consecutive cold loads (was a reproducible 0.187
pre-deploy / 0.200 field p75). Lists do not move; LCP element = setlist title
`<h3>` (820ms). Target (<0.1) beaten — shift fully eliminated.

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
