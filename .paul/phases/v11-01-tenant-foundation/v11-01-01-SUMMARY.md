---
phase: v11-01-tenant-foundation
plan: 01
status: complete
result: PASS (3/3 tasks, 3/3 ACs)
---

# v11-01-01 SUMMARY — Org model + tenant registry + membership claims

## Outcome
Established the v11.0 tenant primitives with **zero CRC behavior change** (additive + optional + backward-compatible). All 3 tasks PASS; both verify gates green.

## What was built
- **`src/lib/org/types.ts`** — `OrgId` (string alias) + `Org` interface (`id`, `name`, `domain`, `createdAt?`).
- **`src/lib/org/registry.ts`** — `DEFAULT_ORG_ID = "crc"`, static `ORGS` registry (crc→centralreform.live, brotherslazaroff→brotherslazaroff.live), `getOrg()`, `isKnownOrg()`, `resolveOrgIdByDomain()` (lowercases, strips `www.`/`:port`; unknown/localhost/*.vercel.app → crc).
- **`src/lib/org/membership.ts`** — `getOrgIdsFromClaims()` (missing/empty/malformed → `["crc"]` — the backward-compat contract), `userInOrg()`, `getUserOrgIds(uid)` (Admin SDK lazy-imported so the module stays unit-test-pure).
- **`src/types/models.ts`** — optional `orgId?: string` added to `Setlist`, `SetlistTrack`, `Recording` (with v11-01 doc comments; intentionally NOT required).
- **`src/app/api/admin/set-role/route.ts`** — schema extended with optional `orgIds: string[]`; rejects unknown org ids (400) before any write; merges `orgIds` into custom claims **only when supplied**, spreading `existingClaims` first so `role` (and any prior orgIds) is never dropped.
- **Tests** — `src/lib/org/__tests__/registry.test.ts` (6) + `membership.test.ts` (5).

## Verification (run fresh)
- `npx vitest run src/lib/org` → **11/11 passed** (registry 6, membership 5).
- `npx tsc --noEmit` → **EXIT 0**, no new errors (AC-1).
- AC-2 (domain resolution incl. www/port/unknown/localhost/vercel) + AC-3 (claims default-to-crc + userInOrg gating) verified by the suites; set-role additive merge verified by tsc + code review (full route emulator test deferred to v11-01-02 per plan).

## Deviations / concerns
- None. No checkpoints. Plan executed as written.
- **Environment note:** this checkout's `node_modules` was incomplete (typescript/vitest missing) — ran `npm install` (1871 pkgs, exit 0) before verifying. Future sessions on this machine: deps now present.

## Decisions realized (baked in, not checkpointed — engineering calls within ratified scope)
- **Membership via custom claims, NOT a per-read `orgs/{orgId}/members` lookup** — consistent with the existing global-role claim model + zero rules-lookup cost. Role stays GLOBAL in v11.0; `orgIds` is the membership/scoping envelope only (no per-org roles yet).
- **`orgId` stays OPTIONAL on types** — required-ness is a rules concern (v11-01-02), enforced only after the v11-01-03 backfill stamps existing CRC docs. This is what makes the change deployable now with no CRC regression.
- **Backward-compat default**: missing `orgIds` claim ⇒ `["crc"]`, so no claims migration is needed for existing users.

## Next in phase
- **v11-01-02** — org-scoped Firestore rules + `@firebase/rules-unit-testing` emulator tests (cross-org write denied / same-org allowed / public read preserved). Consumes orgId field + membership model. Carries the phase's HFG emulator coverage.
- **v11-01-03** — CRC backfill (stamp orgId="crc" on existing setlists/tracks/songs/recordings/library_index + seed orgs/{crc,brotherslazaroff} docs; dry-run/apply/rollback + marker `system/v11-add-orgid`). MUST run before v11-01-02's strict rules deploy.
