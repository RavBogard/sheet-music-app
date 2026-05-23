# Track A2 restore runbook — `scripts/restore-gcs-versions.mjs`

**Sibling of:** `scripts/probe-gcs-versions.mjs` (the read-only probe at `9ede17855`).
**Inventory source:** `.paul/research/track-a2-resalvage/gcs-version-probe-output.json` (the committed JSON output of that probe — load-bearing; the restore script reads it directly rather than hardcoding generations).
**Posture:** Tier-0 ops tool. **DRY-RUN by default; `--apply` required for the real run.** Single-owner per `[[feedback_single_owner_destructive_runs]]` — Daniel runs `--apply`.

---

## What it does

For each of the 4 vanished bare-UUID chart objects inventoried by the probe:

1. Reads `{fileId, objectName, sourceGeneration, expectedMd5, expectedSize}` from the probe JSON.
2. Pre-flight `bucket.file(name).exists()` — if a live version already exists with md5 matching the source generation, **SKIP** (idempotent).
3. If a live version exists with a **different** md5, **ABORT** (refuses to overwrite an unrelated restore).
4. If no live version exists:
   - DRY-RUN (default): logs `WOULD COPY gen=X → live` and moves on.
   - `--apply`: fires `bucket.file(name, {generation}).copy(bucket.file(name))` (server-side copy; preserves md5Hash + crc32c automatically), then `.getMetadata()` verifies the new live object's md5Hash matches the source generation's md5Hash.
5. On any FAIL (copy throws / md5 mismatch / metadata throws), aborts the loop immediately — does not silently continue restoring after a failure.
6. Emits a structured per-row report to stdout (JSON) + a human-readable per-row log to stderr.

The 4 rows are read from the probe JSON, not hardcoded — every restore action is traceable back to the GCS-VERSION-PROBE.md inventory committed alongside.

---

## Run it

**Daniel runs `--apply`. Coder-2 does not.** Coder-2 may run dry-run for confidence in the pre-flight, but the script's own self-check is the proof — re-running dry-run is unnecessary.

```sh
# From the worktree (or canonical sheet-music-app/) root:

# 0. Ensure .env.local is present with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
#    If missing, pull from a Vercel-linked sibling or copy from sheet-music-app-mcp/.env.local:
cp ../sheet-music-app-mcp/.env.local .env.local
# (or `vercel env pull .env.local` from a Vercel-linked worktree.)

# 1. DRY-RUN — inspects the bucket, lists what it WOULD copy, exits 0. NO WRITES.
node scripts/restore-gcs-versions.mjs

# 2. Review the output. Confirm:
#    - 4 rows enumerated
#    - each shows "WOULD COPY gen=<n> → live" (or "SKIP — already restored" if you re-run after step 3)
#    - no ABORT, no FAIL
#    - bucket name matches "crcmusiccharts.firebasestorage.app"
#    - source md5s match the values in GCS-VERSION-PROBE.md

# 3. APPLY — fires the 4 server-side copies + verifies each post-copy md5.
node scripts/restore-gcs-versions.mjs --apply

# 4. Re-run step 1 (dry-run) as a sanity check — should now show all 4 as SKIP (idempotent verify).
```

---

## Post-restore verification (per `GCS-VERSION-PROBE.md` §Verification checklist)

After a successful `--apply`:

1. `bucket.file(name).exists()` returns `[true]` for each of the 4 objects (the script verifies this implicitly via the .getMetadata() after copy).
2. `bucket.file(name).getMetadata()` md5Hash matches the prior generation's md5Hash (the script asserts this; FAIL aborts).
3. `get_chart_status` MCP tool for each row returns the healthy status (or whatever non-`needs_storage_sync` value applies). Per `[[project_chart_loss_reports_are_display_bugs]]`, also confirm Daniel's iPad fetch resolves the chart, not just that GCS has bytes.
4. `verify_setlist_charts` on tomorrow's Kabbalat Shabbat + Yizkor setlists returns green for these 4 fileIds.
5. Re-run `node scripts/probe-gcs-versions.mjs` — expect each object to now report 2 versions: the restored live generation (fresh `timeCreated`) + the original non-current (the salvage version from 2026-05-20).

---

## Auth / SA notes

- Same SA path as the probe: `firebase-adminsdk-fbsvc@crcmusiccharts.iam.gserviceaccount.com` via `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` in `.env.local`. Probe succeeded first-try on read; restore needs the same SA's `storage.objects.create` permission. The default Firebase Admin SDK SA should have this — if `--apply` fails with permission errors, see GCS-VERSION-PROBE.md §Risks #1 for the bucket-admin SA fallback path.
- Bucket name resolves from the probe JSON (`crcmusiccharts.firebasestorage.app`), not from env, to keep the audit trail tight.

## Lifecycle TTL not verified

Per GCS-VERSION-PROBE.md §Risks #4 — the bucket's lifecycle rule (claimed 30-day non-current retention per `[[project_backup_floors]]`) was not pulled by the probe. Verify before relying on the 30-day floor as a safety margin for future incidents. Not blocking for this restore (we're well within 7h of the delete).

## Idempotency

- Re-running with `--apply` after a successful restore: all 4 rows SKIP (live md5 matches source).
- Re-running with `--apply` after Daniel has manually replaced a chart with a different version: that row ABORTs with `live-md5-mismatch` — script refuses to clobber.
- Re-running with no `--apply` (dry-run): no writes ever, regardless of state.
