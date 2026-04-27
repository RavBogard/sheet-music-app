# v50-07-02 — Scrub Apply Log

**Date:** 2026-04-27
**Command:** `npx tsx scripts/scrub-livestate.ts --apply`

```
[scrub] APPLY complete: 10 setlists scrubbed.
[scrub] Done. 10 setlists updated. Rollback snapshots in migrations/livestate-scrub/snapshot/*
```

**Result:** 10 setlists' `liveState` field removed via `FieldValue.delete()`.

**Rollback safety:**
- Per-setlist snapshots written to `migrations/livestate-scrub/snapshot/{setlistId}` BEFORE each delete
- Snapshots include `liveState` value + `snapshottedAt` timestamp
- Marker `system/livestateScrub` written with `appliedAt` + `affectedCount: 10`
- Rollback path: `npx tsx scripts/scrub-livestate.ts --rollback` would restore all 10 fields

**Post-scrub re-audit verification:**

```
[audit-v50]   29 setlists, 24 with embedded tracks, 650 total embedded tracks
[audit-v50]   chats: 0, songGroups: 0, config/songGroups: absent
[audit-v50]   Dry-run: 0 songs would be touched
```

Re-audit (audit-v50.ts) shows:
- **Setlists with non-null `liveState` field: 0** ← was 10, now 0 ✓
- Total setlists: 29 (unchanged) ✓
- Total embedded track count: 650 (unchanged) ✓
- Top-level tracks count: 0 (unchanged) ✓
- All other v50-02 orphans: still clean ✓

No collateral mutations. AC-7 satisfied.
