# F4 verify-first probe — BL setlist key data (v11.5-05-02 Task 1)

**Date:** 2026-06-16 · **Method:** read-only. Throwaway BL bearer
(`mint-throwaway-bl-bearer.mjs --apply`, tokenId `GnYbOXdIctHYn8yz6GGw`, pinned to
David `HTks9a8YRiVCQ5lVipUJcBsWjnB3`) → BL MCP `list_setlists`/`get_setlist`;
then Admin-SDK read of `library_index/{fileId}` + `songs/{fileId}.defaults`.
**Bearer REVOKED + temp ADC deleted after probe.**

## What was probed
- Only ONE BL setlist exists: **"Tower Grove Farmer's Market"**
  (`qAzY0sJJGcad8mUqEZF0`, 18 song tracks) — the audit's `bl-setlist-detail-1180.png`.

## Findings

| layer | result |
|-------|--------|
| `track.key` on all 18 BL song rows | **null / empty for ALL 18** (→ `displayKey` returns null → no badge; F4 confirmed, NO org gate involved) |
| `library_index/{fileId}.key` (sampled 5 fileIds) | **null for all sampled** |
| `songs/{fileId}.defaults.key` (sampled 5 fileIds) | **null for all sampled** |
| Q5 corroboration | track title `"Queen Jane Approximately.docx"` → raw `.docx` leak confirmed on the consumer surface |

Sampled fileIds (all `upload-*`, Storage-backed): `a6835ea0`, `02a78030`, `529d1446`,
`05dfb994` (the .docx), `4351dd4a` — every one: `library_index.key=null`, `songs.defaults.key=null`.

## Verdict: **(B) — catalog ALSO lacks keys → AUTHORING DATA GAP**

The keys were never set anywhere — not on the track, not in `library_index`, not in
`songs.defaults`. The BL charts were uploaded without a key. Therefore:

- **F4 is NOT a code/display bug** (SetlistRow's `displayKey` already has no org gate —
  it renders for any track with a non-empty `key`). It is a **missing-data** condition.
- The **server-side key resolution (Task 2) is forward-safe but cannot light up BL badges
  today** — there is nothing in the catalog to resolve *from*. It WILL populate badges the
  moment a key exists on `library_index` (e.g. once authored), and it also closes the
  generic gap for any CRC track whose `track.key` is empty but whose catalog row has a key.
- **To actually get BL key badges:** Daniel/David must author keys on the BL charts via
  MCP `update_song` (writes `songs.defaults` + `library_index`) or `edit_library_entry`.
  → authoring note + UAT item (see SUMMARY / UAT-PENDING).

## Decision impact
- Ship Task 2 (resolution) + Task 3 (Q5) as planned — both correct and tested.
- F4 "badges visible on BL" is reclassified from a code deliverable to an **authoring
  follow-up** (no code can synthesize a key that was never chosen). Documented, not blocked.
