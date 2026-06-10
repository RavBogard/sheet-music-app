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
