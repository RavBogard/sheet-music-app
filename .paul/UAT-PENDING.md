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
