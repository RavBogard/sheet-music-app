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

**Deployed commit:** _(set on push)_

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

**Deployed commit:** _(set on push)_

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
