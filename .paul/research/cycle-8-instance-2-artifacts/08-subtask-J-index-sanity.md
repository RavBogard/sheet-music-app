# §5 — sub-task J index sanity evidence

Captured 2026-05-19T22:42Z; deployed SHA = `edb24a47c`.

## §5.1 — musician_availability composite probe

`firestore.indexes.json` on origin/master includes the two
`musician_availability` composites coder-1 ratified (KEEP × 2 per supervisor's
sub-task J table):

```
musician_availability: musicianUid ASCENDING, startDate ASCENDING
musician_availability: startDate ASCENDING, endDate ASCENDING
```

These composites currently have NO LIVE QUERIER in the deployed MCP surface —
`src/lib/mcp/tools/roster.ts` explicitly defers `set_unavailability` to a c1.5
phase ("NO `set_unavailability` — deferred to c1.5 pending Daniel-ratified
data-model call"). The collection is only referenced by `cleanup_all_test_data`
cascade-sweep (`src/lib/mcp/tools/test-tokens.ts:387`), which is a
single-field equality query and doesn't need the composite.

Net: composites are KEPT-for-future per coder-1's recommendation; no
FAILED_PRECONDITION possible today because nothing queries the collection
with the composites' field-combinations. Probe trivially passes by
construction. ✓

## §5.2 — setlists.isPublic dead-composite verification

The two `setlists(isPublic, ...)` composites were DELETED per supervisor's
sub-task J table. Confirmed no `setlists.isPublic` query exists on
origin/master:

`git grep -nE 'where\("isPublic|\.where\(.isPublic'` against
`src/**/*.ts(x)`: **zero matches.**

Sole `setlist.isPublic` field reference (`src/app/api/setlist/resend-email/route.ts:68`)
is a SINGLE-DOC field read after `setlistRef.get()` — no Firestore query.
Doesn't depend on a composite index, so the deletion is safe.

Net: dropped composites have NO active read path. ✓

## §5.3 — HIGH — `suggest_band` REGRESSION-OF-SHIPPED-FIX (REPRO-C7I1-004)

`suggest_band({setlistId:"UnjLqKTtS4lNKQfMY6hB"})` against prod returns the
SAME 500 the cycle-7 instance-1 audit caught:

```json
{
  "ok": false,
  "error": {
    "code": 500,
    "machine_code": "suggest_band_failed",
    "message": "Failed to suggest band: 9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/crcmusiccharts/firestore/indexes?create_composite=Cl1wcm9qZWN0cy9jcmNtdXNpY2NoYXJ0cy9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvc2NoZWR1bGluZ19hc3NpZ25tZW50cy9pbmRleGVzL18QARoKCgZzdGF0dXMQARoOCgphc3NpZ25lZEF0EAIaDAoIX19uYW1lX18QAg"
  },
  "setlistId": "UnjLqKTtS4lNKQfMY6hB",
  "hint": "Check Firestore index status at console.firebase.google.com/project/crcmusiccharts/firestore/indexes — `suggest_band` requires the `scheduling_assignments(status ASC, assignedAt ASC)` composite index. If indexes are deployed and green, fall back to verifying Firestore connectivity."
}
```

### Root cause: index direction is wrong (ASC vs DESC)

Decoded create_composite URL (base64-urlsafe → protobuf):

```
projects/crcmusiccharts/databases/(default)/collectionGroups/scheduling_assignments/indexes/_
  status     order=1 (ASCENDING)
  assignedAt order=2 (DESCENDING)   ← Firestore needs DESCENDING
  __name__   order=2 (DESCENDING)
```

But `firestore.indexes.json` on origin/master has:

```json
{ "collectionGroup": "scheduling_assignments", "fields": [
    { "fieldPath": "status",     "order": "ASCENDING" },
    { "fieldPath": "assignedAt", "order": "ASCENDING" }      ← WRONG; should be DESCENDING
]}
```

The actual query in `src/lib/mcp/tools/roster.ts:747-749`:

```ts
.collection("scheduling_assignments")
.where("status", "==", "...")
.orderBy("assignedAt", "desc")          // DESC
```

The Lane 4 ship (`460178e8b`) added the index to config in the WRONG sort
direction. Even the hint string in roster.ts:847 repeats the wrong direction
("status ASC, assignedAt ASC"), so an operator following the hint reproduces
the bug.

### Severity rationale

Per PARENT §6 soft-re-entry rule: "Parallel-wave mode auto-revives only if
cycle-8 TRIAGE surfaces ≥3 BLOCKS-GREEN OR any regression-of-shipped-fix."
This is one regression-of-shipped-fix. Combined with §2.1 (chart-bond cron
not registered in vercel.json — also Lane 3 regression-of-shipped-fix), the
auto-revive bar is met.

The user-facing impact is real: `suggest_band` is the load-bearing tool for
"who should I invite to play this Friday's service" — the original cycle-7
instance-1 weekly-flow scenario. It has been broken since the original Lane 4
ship and remains broken at `edb24a47c`.

### Patch

Edit `firestore.indexes.json`:

```diff
-{ "fieldPath": "assignedAt", "order": "ASCENDING" }
+{ "fieldPath": "assignedAt", "order": "DESCENDING" }
```

Plus `firebase deploy --only firestore:indexes`, plus update the
roster.ts:847 hint string to match. Plus check whether the `firebase deploy`
step ever ran for the Lane 4 commit — if not, even fixing the JSON won't
materialize the index in prod.

## §5.4 — list_pending_assignments + list_musicians_on_date sanity ✓

Both succeed without FAILED_PRECONDITION on prod:

```
list_pending_assignments() → { ok: true, assignments: [], count: 0 }
list_musicians_on_date({eventDate:"2026-05-02"}) → { ok: true, matchedSetlists: [], grouped:{pending:[], confirmed:[], declined:[], cancelled:[]}, total: 0 }
```

The other `scheduling_assignments` composites
(`status+eventDate`, `musicianUid+status`, `setlistId+musicianUid`) appear
correctly configured.
