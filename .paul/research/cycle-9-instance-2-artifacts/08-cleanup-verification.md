# Cleanup verification

## Fixture inventory (all minted during the sweep, in order)

| # | Type | ID | Name | Tracks | Cleanup result |
|---|---|---|---|---|---|
| 1 | setlist | 69be5383-a5b0-4470-aa40-2995c1938616 | c9i2-CLONE-emor-weekly-flow-test | 31 | `delete_setlist` → `{ok:true, tracksDeleted:31}` |
| 2 | template | 2855c50e-81dd-428f-a090-84c765ce9960 | c9i2-template-shabbat-morning-roundtrip | n/a | `delete_template` → `{ok:true, deleted:true}` |
| 3 | setlist | 18d2cf2f-c558-47f3-b571-4ac5bedb5fec | c9i2-from-template-roundtrip | 31 | `delete_setlist` → `{ok:true, tracksDeleted:31}` |
| 4 | setlist | 655937c5-1e57-42e3-896f-ba25c2b0c4ba | c9i2-CLONE-zerotrack-confirmation-shabbat | 5 | `delete_setlist` → `{ok:true, tracksDeleted:5}` |
| 5 | template | ec67a643-baaf-4421-9bac-47c39f3deeb5 | c9i2-template-shabbat-morning-roundtrip (duplicate-name fixture) | n/a | `delete_template` → `{ok:true, deleted:true}` |
| 6 | template | 57b8c045-8771-42f4-82b3-a63d11e354c3 | c9i2-VERY-LONG-template-name-…(~300 chars) | n/a | `delete_template` → `{ok:true, deleted:true}` |

## Post-delete `cleanup_all_test_data({prefix:"c9i2"})`

`{removed: 0, failures: [], aggregate: {}}` — confirming finding C9I2-003:
admin-owned fixtures with c9i2-prefixed NAMES are not reachable via the
uid-prefix sweep (the sweep walks `test-c9i2-*` UIDs, not names; my fixtures
were owned by admin uid `93Xn3DbS0bSNb8zmfzLyfOMX1A13`). Per-id deletion is
the only effective cleanup path when the sweep instance runs against an
admin bearer.

## Post-cleanup state checks

`list_setlists({sort:"recent_write", limit:10})` — no c9i2-* entries; the
top of the list is "Eitan Shabbat Morning 2/21" (b12a5221-…) ahead of
"5/15 -- Shir Shabbat" (an interesting recency-sort observation — see
C9I2-011 below), and the recent c9i2 fixtures are gone.

`list_templates({})` → `{ok:true, templates:[], total:0}` — still empty,
including post-delete: my three c9i2 templates are gone, AND C7I1-001's
zero-templates-seeded remains (no other cleanup happened).

## Side-observations from the cleanup listing (NOT my fixtures, just noted)

- "Eitan Shabbat Morning 2/21" (b12a5221-…) with eventDate Feb 2026 sorts
  FIRST in recent_write — its `date` field is "2026-02-20T..." but it
  surfaces ahead of the May 20 Shir Shabbat write. Probably a recency-sort
  field mismatch (sort key is the `date` field, not server-side write
  timestamp, OR an unrelated touch bumped its date). **LOW INFO** —
  C9I2-011: recent_write sort doesn't reflect actual most-recent write.
- "[TEST] cycle-3 probes" (97da3fc7-…) and "6fixes-l1-probe-shortcut"
  (dc88e673-…) are orphaned test fixtures from prior cycles that
  cleanup_all_test_data sweeps don't reach. **LOW INFO** — same pattern
  as C9I2-003.
- "Bnei Mitzvah Morning (Template)" appears TWICE as a setlist (not in
  templates collection). Pre-existing artifact of someone trying to use
  setlist-as-template-by-naming-convention — confirms the user-perceived
  need C7I1-001 was meant to fill. Not my data to touch.

## Bearer status

- Wired admin bearer (Daniel's `93Xn3DbS0bSNb8zmfzLyfOMX1A13`) — not minted by me;
  cannot mark "burned" in the pool from this cowork session (the pool is outside
  the mounted folder per PARENT §2). Note for supervisor: this bearer is the
  long-lived admin bearer and TTL-expiration is the supervisor's clock.
- No test bearers minted by me. Probe 6 documents the reason
  (`create_test_account` would mint a bearer but the MCP connection is fixed
  to admin so I couldn't USE a test bearer for tool calls).

## Net cleanup state
**ALL c9i2-* fixtures created during this sweep have been deleted.** Verified
via two listings + the `cleanup_all_test_data` zero-removed proof.
