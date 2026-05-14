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
