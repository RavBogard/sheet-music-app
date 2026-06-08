# RUNBOOK — backfill-orgid-v11.mjs (v11-01-03)

One-time tenant backfill + org seeding. Stamps `orgId="crc"` on every existing
doc missing it across the five tenant collections, and seeds `orgs/{crc}` +
`orgs/{brotherslazaroff}` from the org registry.

## Why

Second precondition (with v11-01-02's write-path stamping) for the strict
org-scoped Firestore rules deployed in **v11-01-04**. A rule that `require`s
`orgId` would reject every legacy CRC doc → service lock-out — unless every
existing doc already carries it. All existing data is CRC, so the stamp is a
uniform `orgId="crc"`. brotherslazaroff has no data yet; its org doc is seeded
for v11-03 host routing.

## Auth

`.env.local` at the repo root must carry the admin SA creds:

- `FIREBASE_CLIENT_EMAIL` (firebase-adminsdk-fbsvc@crcmusiccharts)
- `FIREBASE_PRIVATE_KEY`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (default `crcmusiccharts`)

SA needs `datastore.user` (read/write on the five collections + `orgs`).

## Procedure (single-owner, dry-run first)

1. **DRY-RUN (read-only, no writes):**

   ```
   node scripts/backfill-orgid-v11.mjs
   ```

   Inspect the JSON summary on stdout. Per collection you'll see
   `{ scanned, alreadyStamped, wouldStamp }`. Sanity-check the magnitudes:
   - CRC has on the order of hundreds of `setlists`/`tracks`/`library_index`/
     `songs` rows and some `recordings`.
   - On a FIRST run, `wouldStamp ≈ scanned` for each collection (nothing stamped
     yet) and `alreadyStamped ≈ 0`.
   - `orgs` actions should be `create` for both crc + brotherslazaroff.

2. **APPLY (writes):** once the dry-run looks right —

   ```
   node scripts/backfill-orgid-v11.mjs --apply
   ```

   Reports `{ scanned, alreadyStamped, stamped }` per collection and the org
   seed actions.

3. **Verify idempotency:** re-run the DRY-RUN —

   ```
   node scripts/backfill-orgid-v11.mjs
   ```

   Every collection should now report `wouldStamp: 0` and
   `alreadyStamped ≈ scanned`; `orgs` actions should be `noop`.

## Idempotency

- A doc with a non-empty `orgId` is SKIPPED — never overwritten. Re-running
  `--apply` stamps 0.
- `orgs/{id}` is merge-set; `createdAt` is stamped only when absent, so re-runs
  preserve the original creation time.

## Rollback

- `orgId` is **additive** and **UN-enforced** until v11-01-04 deploys the strict
  rules. A bad/partial stamp therefore has NO enforcement impact and is safe to
  re-run (idempotent). There is no need to roll back before v11-01-04.
- If a revert is ever required (e.g. a wrong value was written), the reverse is a
  field-delete pass (`update({ orgId: FieldValue.delete() })`) over the affected
  docs. Not needed for the uniform `"crc"` stamp on all-CRC data.
- Crucially: do NOT deploy v11-01-04 rules until this backfill's dry-run shows
  `wouldStamp: 0` everywhere (i.e. all existing data carries orgId).

## Safety notes

- Single-owner rule: ONE named executor runs `--apply`; inspect the dry-run
  first ([[feedback_single_owner_destructive_runs]]).
- Touches ONLY `orgId` (+ `createdAt` on the two org docs). No other field is
  mutated; sibling fields are preserved by the merge-set.
- The canonical stamping/seeding rules are emulator-tested in
  `src/lib/org/__tests__/backfill-orgid.emulator.test.ts`.
