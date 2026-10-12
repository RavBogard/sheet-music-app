# RETURN — Multi-tenant phase 0 (security patch) + preconditions, 2026-10-12

Executor: Claude Code (Opus 5.5). Branch `claude/multitenant-2026-10-12`, fast-forwarded to `master`.
Shipped: `bc7e97b2` (rules + app), deployed to production 2026-10-12 (Firestore rules released ~17:05Z; Vercel `dpl_Erh4gjBoEjQmWczbkKPGDtmuwKPa` Ready).

## Preconditions

| Check | Result |
|---|---|
| `master` at or after `d7c7ec7f` | PASS: `master` was exactly `d7c7ec7f`; no line references moved. |
| BL probe at `scripts/dev/e2e-bl-tenant-probe.mjs`; production baseline | PASS: **19/19** against production (bearer minted on David's uid, revoked after; token `Nis7bzupppFLO7weEaog`). Baseline: CRC setlists 4 listed, CRC templates 4, BL templates 0 / 0 leaked, BL leadHistory 7 / 0 leaked, CRC musicians 10, BL musicians 9. Note: `mint-throwaway-bl-bearer.mjs` no longer auto-finds David because he is now `admin`, not `band_leader`; run with `DAVID_UID=HTks9a8YRiVCQ5lVipUJcBsWjnB3`. |
| Self-role hole exists | PASS (confirmed real). Emulator: **21** escalation writes succeeded under the old rules (`src/lib/__tests__/firestore-rules-users-self-role.emulator.test.ts`, run before the fix). Code: `sync-claims` copied any non-pending doc role into the claim. **A second path was found**: `/api/auth/session` and `/api/auth/refresh-session` sign `users/{uid}.role` straight into the `__session_role` cookie the proxy trusts. Both are fixed below. |
| Recordings and finalize tag tenants | Not re-verified line by line in P0. Carried to phase 2, which owns the recordings read rule and making finalize's `org` required. |
| Platform-wide admin accounts | PASS. Six `role: admin` claims, all granted by daniel@ in `auditLogs`: Daniel (`93Xn3DbS0bSNb8zmfzLyfOMX1A13`), Karen Bogard, Drew Brodsky (two accounts), **David Lazaroff** (`HTks9a8YRiVCQ5lVipUJcBsWjnB3`), crcmusic@. David is on the list, so ruling 5 applies as written. **`config/admins.uids` = `["93Xn3DbS0bSNb8zmfzLyfOMX1Ai3"]`**, which matches no account (Daniel's real uid ends `…1A13`). The fallback is dead, not a hole. It folds into `platform/owners` in phase 2. `SUPER_ADMIN_UID` is a Vercel env value and was not read here; phase 2 folds it in. |
| Vercel API can add/remove a `*.vercel.app` alias | PASS with the CLI's token: `POST /v10/projects/{id}/domains {name: "mt-probe-1791824959.vercel.app"}` returned `verified: true` immediately; `/login` served 200 on it; `DELETE` removed it; project domains back to the original five. A **server-side** token still has to be created and stored for phase 3 (credential, no cost). |
| Firebase authorized-domain patch | PASS with Daniel's Firebase CLI credential: read 8 domains, added the probe, read back 9, removed, read back 8 and identical to the original. Whether the **Vercel runtime's service account** has the Identity Toolkit admin permission is untested and is phase 3's first step. |
| Fresh export + test restore | PASS. Export `gs://crcmusiccharts-backups/multitenant-2026-10-12-pre` (26,198 docs, 17:10–17:11Z; this bucket already holds the daily backups). Restored into the Firestore emulator as the scratch target (no new GCP project, so no billing question). Counts for all 48 top-level collections and 4 collection groups match production, except `qr-sessions` (+4) and `webVitalsObservations` (+8), which are live telemetry written between the export and the count. |

## Phase 0 checklist

| Item | Result |
|---|---|
| `users/{uid}`: self-create only as pending; self-update only profile fields; `orgIds`, `m`, `po` never self-writable | PASS. Profile fields from every browser writer: `email` (must equal the token's email), `displayName`, `photoURL`, `lastLoginAt`, `musicianProfile` (incl. dotted `instrument` / `calendarFeedToken`), `viewedWelcomeModal`, `fcmTokens`. Subcollections unchanged. |
| `sync-claims` never raises a claim; keeps or lowers | PASS. Raising attempts are refused and logged (`raise_refused`). |
| Session cookies (found during P0) | PASS. `session` and `refresh-session` cap the signed role at the higher of the stored claim and the token's claim; a lower doc role still wins (demotion honoured). |
| Admin still settable only through `/api/admin/set-role` | PASS (code unchanged; admin writes in rules unchanged; unit tests green). Not exercised live, since it needs an admin's browser session. |
| Check for use of the hole | PASS, nothing found. No account has a doc role above its claim. Every elevated claim except two has a matching set-role audit row. The two exceptions (benjamminreece@, andrewwarshauer@, both musicians) were promoted 2 seconds apart on 2026-02-20, three days before audit logging began (first row 2026-02-23). That is a batch admin action, not self-promotion. No account looks self-promoted; nothing was changed. Script: `scripts/ops/multitenant/p0-role-audit.mjs` (read-only). |
| Tests | PASS (see tails below). |
| Deployed same day; production refusal | PASS. `scripts/ops/multitenant/p0-prod-escalation-probe.mjs` against production, **7/7**: self-create as pending 200; self-write `role:'admin'` **403**; doc still pending; displayName write 200; with `role:'admin'` forced onto the doc server-side, the deployed `sync-claims` left the claim unset; deployed `refresh-session` signed `null`, not admin; the throwaway account and doc were deleted and confirmed gone. |

## Test tails

```
npm test                      Test Files 415 passed | 3 skipped (418)   Tests 4964 passed | 31 skipped (4995)
npm run test:emulator         Test Files 97 passed (97)                 Tests 1359 passed (1359)
npx tsc --noEmit              exit 0
SKIP_ENV_VALIDATION=1 npm run build   exit 0
```

## Decisions logged

- GATE: deploy phase 0 to production. Proceeded because all four gates were green and the production probe passed after deploy.
- `orgIds` is still accepted on **self-create**, but only as a subset of `["crc","brotherslazaroff"]`. Cached pre-P0 browser bundles still send it on sign-up, and refusing it would break new sign-ups on those iPads. It grants nothing: membership is claim-based, and `sync-claims` overwrites it from the claim. Phase 2 removes it when sign-up moves to `/api/auth/join`.
- The client sign-up code (`ensureUserProfile`) is unchanged in P0. Dropping its `orgIds` now would change which tenant's People list shows a new pending user before phase 2 replaces the model, which BL would see.
- Self-**delete** of one's own `users/{uid}` stays allowed, as before. A recreated document can only be pending.
- Restore target is the Firestore emulator, not a new Firebase project. A managed import into a new project would need billing on it, which is a money question; the emulator proves the export is whole at no cost. Phase 5's `nava` rehearsal also runs against this emulator restore.
- Cosmetic: when the doc role is above the claim and `orgIds` also drifted, `sync-claims` reports the doc role in its `role` field with reason `orgids_synced`. No caller reads it (drift repair checks `res.ok` only), and the claim is not raised. Left as is.

## Needs Daniel

Nothing.
