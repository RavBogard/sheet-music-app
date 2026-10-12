# RETURN — Multi-tenant phase 2 (membership and roles), 2026-10-12

Executor: Claude Code (Opus 5.5), with an Opus design pass and four Opus lanes (rules and personas; identity core; MCP and server writers; browser). Branch `claude/multitenant-2026-10-12`, merged to `master`.
Shipped: `29795be7` (app, deploy step 1) and production rules from `firestore.rules` and `storage.rules` at that commit (deploy step 3).

Design: `work/P2-design.md`.

## Gate

**PASS.**

1. **Emulator rules suite.** `npm run test:emulator` passes: 109 files, 2,037 tests. Within that:
   - The persona suite (`src/test/rules/`, 609 cases) refuses every cross-tenant attempt in the handoff's list and allows every must-still-work case.
   - Mutation check: putting back one `isAdmin() ||` bypass makes 17 cross-tenant tests fail.
2. **BL probe.** `scripts/dev/e2e-bl-tenant-probe.mjs` passes **19/19** in production. Every count matches the baseline except BL `list_musicians`, which is now 7 (was 9). The two dropped are Daniel and Drew. Both are admins whose BL access ruling 5 removes, and both have an instrument on their profile, so the musician list showed them. Output: `golden/bl-probe-p2.txt`.
3. **Throwaway accounts see what they saw before.** New tool `scripts/dev/rules-persona-probe.mjs` signs in seven throwaway accounts through the browser path (ID token over REST, against the deployed rules): CRC admin, band leader, musician, member and pending; BL band leader and musician. It ran before any rules change and after step 3.
   - **Every same-tenant read and write is unchanged.**
   - **All 60 differences are intended** (`golden/persona-diff-p2.txt`):
     - (a) Cross-tenant reads, writes and Storage reads are now refused, including the CRC-admin bypass ruling 5 removes.
     - (b) Queries without an `orgId` filter are refused. This closes the security finding below.
     - (c) The `users` list moved behind `/api/tenant/people`.
     - (d) Pending accounts can no longer create setlists, read chart objects, or read `config/defaults` and `config/monitor`.
     - (e) BL accounts no longer read CRC's `config/defaults` (they have their own `config/defaults__brotherslazaroff`) or the CRC mixer config.
     - (f) Everyone can read their own membership.
     - (g) `templates where orgId==crc` returns the 3 templates now that they carry `orgId`.
   - The accounts were deleted after the run.
4. **Admins migrated per ruling 5.** See "Accounts changed" below.
5. **Signed-out pages.** The golden HTTP capture, including the MCP instructions on both hosts, is identical to the phase 1 before-capture.
6. **Runtime errors.** Vercel reports none in the hour after the deploys.

## Checklist

| Item | Result |
|---|---|
| Stamp untagged rows first, with manifest and undo; Storage metadata too; backup first | PASS. Exports `multitenant-2026-10-12-pre-p2` and `-pre-p2-deploy` were taken first. 488 rows stamped. Tracks, live sessions and tasks take their setlist's tenant (34 tracks are BL); songUsage and digitized charts take their chart's; the rest are crc. 1,180 library objects got `metadata.orgId` (82 BL). Templates (3) and auditLogs (167) took crc. Undo for each is rehearsed on the emulator; manifests are in `manifests/`. A second pass after the people migration found nothing left unstamped. |
| `memberships/{tenant}__{uid}`, written by the server only | PASS. `src/lib/org/membership-types.ts` (with `denied`), `memberships-write.ts` `setMembership`. Each change also writes an audit row. |
| One function rebuilds claims `{po?, m, se?}`, keeps legacy `role`/`orgIds`, fails near 1000 bytes, revokes on removal | PASS. `src/lib/org/claims.ts` `rebuildClaims`, with the limit at 900 bytes; the largest production claim set is 93 bytes. A grep-gate test keeps `setCustomUserClaims` in `claims.ts` only. Server routes and MCP read the membership record, not the claim. |
| Platform owner `platform/owners` plus `po`; `SUPER_ADMIN_UID` and `config/admins` fold in | PASS. `platform/owners = [Daniel]`. The `SUPER_ADMIN_UID` read is removed from code. `config/admins` (a dead uid) is deleted, with a manifest. |
| One helper replaces `readUserRole` | PASS. `src/lib/org/access.ts`: `getTenantAccess`, `readTenantRole`, `hasTenantRole`, `getTenantMembership`, `listTenantMembers`. `readUserRole` is gone. Every MCP role decision uses the token's tenant, and web routes use the host's. |
| Rules rewrite with a tenant check on every listed collection | PASS. `firestore.rules`: single-document `get` on setlists and tracks stays public; setlist `list` stays signed-in. List rules require `orgId`, with no crc default. |
| Mixer in rules | PASS. Commands require musician or above in the bridge's tenant (crc), plus the sound-engineer/bus rules. Only Daniel holds a bus, so nobody loses access. |
| `storage.rules`: `library/**` reads require membership in the object's `orgId` | PASS, deployed. Objects without metadata read as crc. The chart route `/api/library/file/[id]` is Admin SDK and was checked unchanged for both tenants. |
| Every `isAdmin() \|\|` bypass becomes platform-owner only | PASS. |
| Sign-up: no role or tenant writes from the browser; `/api/auth/join` creates a pending membership for the host tenant only | PASS. |
| Pending requests in `/manage` People; per-tenant role select; signing in at another tenant creates a request there only | PASS. The crc/bl/both menu is replaced by a role select for the current tenant, with Approve/Decline, a Requests and a Denied filter, and "Remove from {tenant}". |
| Migrate people per ruling 5, manifest and undo, every account listed | PASS. Below. |
| Retire `scripts/issue-bl-bearer.mjs` | PASS. Deleted, and `scripts/ops/set-role.js` with it. |
| Emulator persona suite with the Storage emulator | PASS (see Gate). `test:emulator` now starts Storage. |

## Accounts changed (people migration, 2026-10-12T20:15Z)

54 memberships for 38 accounts. That count includes the 7 throwaway probe accounts, deleted afterwards along with their memberships. Every account kept its legacy claims, rewritten to match. Manifest: `manifests/migrate-memberships-2026-10-12T20-15-10-417Z.json`. Undo: `npx vite-node -c vitest.config.ts scripts/ops/multitenant/migrate-memberships.ts -- --undo <manifest> --apply`.

| Account | Before (claim) | After (memberships) |
|---|---|---|
| Daniel `93Xn3DbS` | admin, crc+BL | crc admin; **platform owner** |
| David Lazaroff `HTks9a8Y` | admin, crc+BL | crc admin, BL admin (ruling 5 override, stored as data in `platform/membershipMigration`) |
| Karen `6Ej2hgTr` | admin, crc+BL | crc admin only (ruling 5) |
| Drew `DINwaB86` | admin, crc+BL, sound engineer | crc admin, sound engineer, only (ruling 5) |
| Drew (engineer account) `wZ1BAJXt` | admin, crc+BL | crc admin, sound engineer, only (ruling 5). The sound-engineer flag comes from the users doc, which the mixer read before. |
| crcmusic@ `gRWqLaYI` | admin, crc+BL | crc admin only (ruling 5) |
| Bryn `Tc6ezs2W` | band_leader, crc+BL | crc and BL band_leader |
| 12 musicians (`3fOf76Ar`, `6PXdZ6W1`, `6gpjgStn`, `7hMUGg0e`, `Bj2I6WmF`, `M4R0vwHx`, `SvNOUNrj`, `a8NIMPei`, `jL4nJqpv`, `judIpOF9`, `lsZI14nI`, `v0SOmze7`) | musician, crc+BL | crc and BL musician |
| 7 musicians (`20lL3BJw`, `8MHZmxm4`, `JoZS86SH`, `MKWAhvYQ`, `XgSCiYt4`, `gIHr5d79`, `wpgVcRzu`) | musician, no orgIds (crc) | crc musician |
| 3 members (`N8jaz8ks`, `r6UChcbq`, `wZOrhLlF`) | member, no orgIds (crc) | crc member |
| 2 pending (`V5q4VFiE`, `jLozHK4f`) | no claims; doc pending, both tenants | crc and BL pending |

## Security finding (reported during the session; closed by step 3)

Lane 1 found that the production rules leaked other tenants' data to any signed-in member who ran a query without an `orgId` filter from the browser console:
- every tenant's songs, to a CRC musician;
- contacts and scheduling assignments and history, to band leaders.

The cause was the "missing orgId means crc" default in the list rules. The persona probe confirmed it in production before step 3: a CRC musician read 300 songs unfiltered. After step 3 those reads are refused.

A second gap turned up while building the probe. The **Storage rules deployed since 2026-02-15** let any signed-in account, pending included, read every chart object. The stricter `storage.rules` in the repo had never been deployed. Chart bytes are public by id through `/api/library/file/[id]` by design, so the exposure was small. Step 3 deployed the per-tenant Storage rules.

The automated commit review flagged one more issue. `provisionTestAccount` checked the caller's role in one tenant but could place a test account in any tenant. Fixed in `ab4c4909`: each requested tenant needs band leader or above there. An emulator test covers it.

## Commits

| Commit | What it is |
|---|---|
| `df8b6b3d`, `7f09c2ed` | Firestore and Storage stamps, with manifests |
| `b1b8804a` | Design and identity API signatures |
| `132fc22c`, `55f7328d`, `1a5ec7af`, `2d3e869c`, `b2e9787a` | Lane 2: identity core, auth/session/proxy, join/people/set-role, claim writers, migration scripts |
| `4a831078`, `8ec018d6`, `1d6c5d06`, `826cf882` | Lane 1: rules, persona suite, step-1 additive rules, existing rules tests |
| `bd969474`, `ba0093eb` | Lane 3: MCP tenant roles, server writers stamp `orgId` (also into Storage metadata) |
| `7ef33d95`, `30e83200` | Lane 4: browser queries scoped to the tenant, track stamping, per-tenant role in the browser, People |
| `5535462a`, `ab4c4909`, `61ae200c` | Lead fixes after the merge: test-account tenant checks, allSites only for the platform owner, tenant-aware `getTenantMembership` for recipient filters and profile walls |
| `80c7519d`, `9607de4e` | Persona probe and before-capture; golden capture fix |
| `492ecfb6`, `6efffc82` | Manifests for step 0 and step 2 |
| `29795be7` | Merge to `master` (app deploy, Vercel `dpl_39VQrbCrmAA9cRQ6Qnbx7sVvbxSr`) |

## Test tails (at `61ae200c`, the shipped code)

- `npx vitest run`: Test Files **469 passed** | 3 skipped (472); Tests **5364 passed** | 31 skipped.
- `npm run test:emulator`: Test Files **109 passed** (109); Tests **2037 passed** (2037).
- `npx tsc --noEmit`: exit 0.
- `rm -rf .next && SKIP_ENV_VALIDATION=1 npx next build --webpack`: exit 0. `login-bundle`: 1 passed.

## Deploy sequence as run

| Step | What ran |
|---|---|
| 0 | Export, then the two indexes (setlists `orgId+eventDate`, auditLogs `orgId+timestamp`). Seeded `platform/owners` and `platform/membershipMigration`, and stamped templates and auditLogs. |
| 1 | Step-1 additive rules (a pure addition to the old file), then the app. Checks: goldens identical; the persona probe changed only the new own-membership read and the newly stamped templates. |
| 2 | `migrate-memberships --plan`, reviewed, then `--apply`. Then `config/admins` removed and a straggler pass (none found). |
| 3 | Full `firestore.rules` and `storage.rules`, followed by the persona probe, the BL probe, goldens with MCP, and the runtime-error check. |

Rollback for rules: redeploy the previous rules files. For the migration, the undo manifest restores claims byte-identically; rehearsed on the emulator.

## Decisions

1. **Who joins which tenant.** People were mapped by their **token's** tenants, not the users-doc `orgIds`. The doc's `['crc','brotherslazaroff']` was the half-working sign-up default, and the rules never honoured it. The BL roster is the same under either mapping, apart from ruling 5. Pending accounts get pending in both tenants, so they stay visible in both People lists as before.
2. **List rules require `orgId`, with no crc default.** This departs from the design's `get('orgId','crc')` to close the security finding. Every row is stamped, so filtered queries return the same rows.
3. **The mixer reads the crc membership** (the bridge's tenant) for every bridge tool. A BL-only band leader has no CRC mixer controls; nobody held them before.
4. **Removing someone from a tenant signs them out everywhere.** Revoking refresh tokens is account-wide; for up to an hour the rules still see the old claim, while server routes and MCP see the removal at once.
5. **Ops and test-account housekeeping tools** treat "admin" as admin of the token's or host's tenant. Narrowing them to the platform owner is phase 4.
6. **Visible corrections the tenant filters cause**, all following from the handoff's tenant checks:
   - BL gigs no longer appear in CRC's next-gig tab.
   - BL reads its own default-setlist pointer.
   - A non-admin band leader's schedule view now shows rows; the old rules left it empty.
   - Pending accounts lose the reads listed in Gate item 3.
7. **The legacy-claim fallback stays in for now.** The rules accept tokens without `m`, and the server falls back for accounts not yet migrated. The design's step 5 removes it after a quiet day; carried below.

## Carried forward

- **Step 5:** remove the `hasM()` fallback in both rules files, and the legacy fallback in `getTenantAccess`. Then stop writing legacy claims and users-doc mirrors once nothing reads them. Do it after a day of the `admin-consistency` cron showing no account without `m`. Planned for the start of phase 3, or phase 9 at the latest.
- **Third-tenant priming in server entry points** (carried from phase 1). Phase 3 adds it where the host or token tenant is resolved.
- **`resolveMintOrg` still falls back** to a user's first tenant. Phase 4 removes it, per the design.
- **No composite indexes** for the pre-existing queries SA1 (`musicianUid, status, assignedAt desc`) and TK1 (`assigneeId, status, createdAt desc`). Not new; logged.

## Needs Daniel

Nothing blocking. For your information: the security finding above, and the two ruling 5 effects you'll notice. Karen, Drew and crcmusic@ no longer see Brothers Lazaroff, and BL's musician list no longer shows you or Drew.
