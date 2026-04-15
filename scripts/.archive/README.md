# Archived one-shot migrations

These scripts have all been run against production and are idempotent no-ops if re-run. Archived here so they don't show up in `scripts/` autocomplete and get run again accidentally. Retain for reference.

| Script | Ran | Purpose |
|--------|-----|---------|
| `backfill-owner-id.js` | v4.0 era | Stamped `ownerId` on legacy setlist docs that predated the owner-ID requirement. |
| `backfill-setlist-rev.ts` | v4.2 Phase 1.1 (2026-04-13) | Stamped `rev` + `updatedAt` on 10 legacy setlist docs for concurrent-edit-safety rollout. |
| `migrate-leader-role.js` | v4.0 / v4.1 era | Renamed `role: 'leader'` → `role: 'band_leader'` on user docs. |
| `migrate-remove-isPublic.ts` | v4.1 (2026-04-13) | Stripped the removed `isPublic` field from 25 of 26 setlist docs. |

Carry-over: **LOW-004** `leader → band_leader` Firestore data migration. Per v4.3 audit carry-over list, any remaining `leader` values should be swept. Re-run `migrate-leader-role.js` if audit finds any.
