# Cycle-8 Instance 1 — New write/credential surface stress

**Read `.paul/research/cycle-8-cowork-PARENT.md` once first.** This prompt is mission-content only (≤200 lines per Decision 4). Bearer/uidPrefix/harness/standing-rules all live in the PARENT.

**uidPrefix:** `c8i1` · **Bearer:** 1 Daniel-handed ROOT admin bearer · **Wall-clock:** ~90 min · **Finding ID prefix:** `C8I1-NNN`

---

## §0 — Mission

Break the new credential + authoring write surface that shipped in cycle-7-fixes
+ the bearer-mint lane. You are an adversarial agent with a legit root admin
bearer probing for: privilege-escalation holes, missing/incorrect gates, audit-
trail gaps, and authoring-tool correctness under multi-turn LLM-intent pressure.

This instance DOGFOODS `mint_admin_bearer` — minting your own working children
is part of the mission, not just setup.

---

## §1 — bearer-mint security model (the load-bearing probe)

The spec is `.paul/research/bearer-mint-lane-PROMPT.md` (what coder-2 built).
Verify the SHIPPED behavior matches these security invariants AT PROD:

1. **Happy mint + uid inheritance.** `mint_admin_bearer({purpose:"c8i1 probe bearer", ttlSec:3600})` → `{ok:true, bearer, tokenId, ttlExpiresAt, purpose}`. Then USE the minted child on an admin-only call (e.g. `dump_collection_size`) → confirm it resolves as admin (uid inheritance works at deployed surface).
2. **Depth-1 enforcement.** With the MINTED child bearer, call `mint_admin_bearer(...)` → MUST refuse `non_root_bearer_cannot_mint`. If a child CAN mint grandchildren, that's a HIGH privilege-propagation finding.
3. **Root-revocation cascade.** This is the critical one. Mint child A from your root. Confirm A works. Then `revoke_minted_bearer({tokenId:A})` and confirm A immediately 401s on the next call. If feasible without killing your only working bearer, also test: does revoking the ROOT kill its children? (Use a minted child as a disposable "root" only if depth allowed it — it won't, so this sub-test may need an emulator cross-check; note it.)
4. **Role gate.** Mint a musician test bearer (`create_test_account({role:"musician", uidPrefix:"c8i1"})`); call `mint_admin_bearer(...)` with it → MUST refuse `forbidden_role`. Repeat with a `band_leader` test bearer → MUST also refuse (mint is admin-only, NOT trusted-leader-widened). If band_leader CAN mint admin bearers, that's a HIGH finding.
5. **Rate-limit.** Mint up to the cap (10/day per uid per spec); confirm the 11th refuses `rate_limited` with a `resetAtUtc` hint. Don't burn the whole budget if it starves later sub-tests — probe the boundary, then stop.
6. **TTL clamp + purpose validation.** `ttlSec` below 3600 or above 2592000 → `validation_error`. Empty/short/generic `purpose` (e.g. `"x"`, `"test"`) → `validation_error` with `issues[]`. Default ttlSec applied (7d) when omitted.
7. **Audit trail.** `list_minted_bearers()` shows your minted children with `purpose`, `mintedByUid`, `mintedAt`, `ttlExpiresAt`, status — and NEVER leaks `tokenHash` or raw secret. Confirm revoked children show `status:"revoked"`.
8. **Envelope shape.** Every refusal is rich `{ok:false, error:{code, machine_code, message}, ...extras, hint}` surfaced as `isError:true` content, NEVER JSON-RPC `error.code:-32602` (per `[[feedback_mcp_validation_shape]]`).

**CLEANUP IS SECURITY-CRITICAL:** every minted child revoked via `revoke_minted_bearer` before HANDOFF. Never write a raw minted bearer into any file.

---

## §2 — template CRUD round-trips (authoring correctness)

The weekly-flow primitive. Probe under realistic "David clones last week + tweaks" intent:
1. `create_template_from_setlist({setlistId:<real setlist with ≥1 track + section headers>, name:"c8i1 tmpl"})` → confirm `trackCount` matches source, `templateType` inherited if source had one.
2. `get_template({templateId})` → confirm track order + headers + song fields (`key`, `leadMusician`, `fileId`, `fileName`) all preserved.
3. `clone_setlist_from_template({templateId, ...})` → confirm a new setlist materializes with the template's tracks in order. Round-trip integrity: setlist → template → setlist should preserve content.
4. `list_templates()` → confirm your new template appears.
5. Edge cases: create_template from a setlist with 0 tracks; from a setlist you don't own (cross-owner — should it refuse or allow? note actual behavior); template name collision; very long name.
6. `delete_template({templateId})` cleanup.

---

## §3 — publish gates (the audience-leak class — Lane 1 closed these)

C7I1-008 / C7I3-002 were audience-leak findings (test-owner setlist publishing to 18 real humans). Lane 1 shipped Gate 1 + Gate 2. Verify they HELD at prod:
1. **Gate 1 (test_owner_cannot_publish_to_real_humans):** create a test-owner setlist (`isTest`/`c8i1`-prefixed owner); `publish_setlist({setlistId, dryRun:true})` → confirm the dryRun report does NOT enumerate real human recipients; a real (non-dryRun) publish → 403 refusal. Do NOT actually fan out to real recipients.
2. **Gate 2 (cross_owner_publish_forbidden):** as a test caller, attempt to publish a setlist owned by a REAL user → 403.
3. **override-recipients filter:** if `publish_setlist` accepts override recipients, confirm test-owner overrides are filtered/blocked from reaching real addresses.

Any path where a test/non-owner caller reaches a real recipient is a HIGH finding.

---

## §4 — position-clamp + add-track warning (C7I3-003)

`add_track_to_setlist({setlistId, title, type:"note", position:<out-of-range>})` → confirm the `warning` field fires with the clamp message + `order` lands at the clamped slot. Probe negative position, position 0, position == length, position >> length.

---

## §5 — HANDOFF

Write `.paul/research/cycle-8-instance-1-HANDOFF.md` + `-findings.jsonl` + `-artifacts/`. Lead with the bearer-mint security verdict (the highest-stakes axis). Cleanup verification (zero residual minted children / test fixtures / templates) is a required HANDOFF section. HANDOFF-COMPLETE message to `.coord/inbox/supervisor.md` signed `from cycle-8-instance-1`.
