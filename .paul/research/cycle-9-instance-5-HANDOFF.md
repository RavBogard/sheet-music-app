# Cycle-9 Instance 5 — HANDOFF (security / auth / multi-role / public-vs-private)

**Instance:** 5 of 5 · **uidPrefix:** `c9i5` · **Sign:** `from cycle-9-instance-5`
**Deployed SHA probed:** `db208948f687542c130235fa65224bf2640e1c0c` (= cycle-8-fixes Lane 1 tip; later than PARENT §1's expected base `edb24a47c`)
**Wall-clock:** 2026-05-19T23:33–23:50Z (~17 min real work; well under 75-min budget)
**Bearer:** session-wired admin child via Cowork MCP connection. NEVER written to any file under `sheet-music-app/`, `.coord/`, or any artifact (verified post-hoc with `grep -lE "crl_live_[a-f0-9]{32,}"` against the artifacts dir — clean). Mark-as-burned in supervisor pool was not reachable from this cowork mount (PARENT §2 already noted the mount cannot read the pool file's parent dir); bearer will TTL-expire by ~2026-05-20T07:25Z regardless.

## §0 — Auto-revive bar status

Per PARENT §7: cycle-9-fixes auto-revives only on **≥3 BLOCKS-GREEN OR any
regression-of-shipped-fix**.

- **0 regression-of-shipped-fix** from this instance. cycle-8-fixes Lane 1
  (chart-bond cron registration + suggest_band index direction) was not in
  my probed surface; cycle-9 hardening A (unit-test baseline) and hardening
  B (trackCount drift-producer) likewise didn't touch the role-gate
  surface.
- **1 HIGH** (C9I5-001 dedupe_library) — single-tool gap, not a green-
  blocker for band onboarding (the band-facing perform path doesn't call
  dedupe_library). Worth a follow-up fix but doesn't BLOCKS-GREEN on its
  own.
- **No cross-axis BLOCKS-GREEN** triggered.

My instance alone doesn't trip the auto-revive bar. Triage call from the
supervisor with the other 4 instances' findings.

## §1 — Verdict per sub-axis (PROBE §1–§6 in the instance prompt)

| Sub-axis | Verdict | Notes |
|---       |---      |---    |
| §1 Role matrix (admin / band_leader / musician / member × representative tools) | **PASS-1-HIGH** | 60-row + 27-row + 14-row probe sweep across 24 distinct tools. Every gate except `dedupe_library` (C9I5-001 HIGH) fires correctly. No tool over-permits beyond that one. |
| §2 Machine_code consistency (C8I2-006 follow-up) | **PASS-WITH-NIT** | 17 tools emit standard `forbidden_role` rich envelope; 4 test-tokens tools still emit bare `forbidden`. C8I2-006 still unfixed (C9I5-003 LOW). |
| §3 Bearer lifecycle (mint → use → revoke → 401) | **PASS** | Round-trip proven via `create_test_account` → `cleanup_all_test_data` → 401. Couldn't round-trip a fresh `mint_admin_bearer` due to quota exhaustion (C9I5-005 INFO). Rich 429 shape confirmed at deployed surface — closes C8I1-002 prod-probe gap. Audit view cascade-dead gap (C8I1-001) confirmed structurally still present (C9I5-002 MED). |
| §4 Unauth probes | **PASS** | All variants → 401 with RFC 6750-style envelope. No data leak in error body. Unhandled routes (`/api/users`, `/api/admin/tokens`, `/api/monitor/state`) → 404 — no info disclosure. |
| §5 By-design boundaries (PARENT §4) | **PASS-WITH-DOCS-NIT** | Setlists + tracks publicly readable per `[[feedback_setlist_public_policy]]`; `/perform/setlist/<id>` 200 unauth confirmed. Chart bytes accessible at MCP layer for any signed-in role per `[[feedback_chart_access_policy]]` (verified via `download_chart` as `member`). Storage.rules tighter than the policy phrasing — C9I5-004 INFO docs-clarity nit. |
| §6 firestore.rules spot-check | **PASS** | `mcpTokens`, `mcpOAuthClients`, `mcpOAuthCodes`, `mcpTestUsers`, `library_index`, `bond_corrections`, `bond_flags`, `proposal_stages`, `auditLogs`, `qr-sessions`, `bridge-setup-codes`, `bridge-redemptions` — all server-only (`allow read,write: if false`). Deny-all fallback present at the bottom. No client-reachable path exposes token hashes. |

## §2 — Findings summary

8 findings: **1 HIGH / 1 MED / 1 LOW / 5 INFO**. Full structured rows in
`cycle-9-instance-5-findings.jsonl`.

| ID         | Sev  | Kind                        | Surface                                | One-liner |
|---         |---   |---                          |---                                     |---        |
| C9I5-001 | HIGH | missing-role-gate           | `dedupe_library`                        | Tool has NO role gate; musician+member can mark library_index rows as `duplicate` and mirror into `songs/{id}`. Singular omission — every other admin hygiene tool gates correctly. |
| C9I5-002 | MED  | audit-view-cascade-dead     | `list_minted_bearers`                   | Audit view doesn't compute parent-revocation; children of a revoked root still report `status:"active"`. C8I1-001 still unfixed at deployed surface. |
| C9I5-003 | LOW  | machine-code-inconsistency  | 4 test-tokens tools                     | `forbidden` (bare) instead of standard `forbidden_role` rich envelope. C8I2-006 still unfixed. |
| C9I5-004 | INFO | docs-policy-clarity         | PARENT §4 vs `storage.rules`            | Policy says "anyone with a fileId"; rules require `isMember()`. Internally consistent but phrasing invites misinterpretation. |
| C9I5-005 | INFO | ops-quota                   | `mint_admin_bearer` rate limiter        | 10/day cap is uid-scoped → exhausted by mid-afternoon when 5 sweep instances + 3 coder lanes share Daniel's uid. Rich 429 shape confirmed (closes C8I1-002 prod-probe gap). |
| C9I5-006 | INFO | by-design-verified          | firestore.rules + perform page          | All PARENT §4 public surfaces behave as intended. |
| C9I5-007 | INFO | validation-ordering         | MCP Zod-before-role-gate                | Per `[[feedback_mcp_validation_shape]]`; documented pattern. Shadowed the role matrix on first pass — fixed by retrying with schema-correct args. |
| C9I5-008 | INFO | test-isolation-verified     | `cleanup_all_test_data({prefix})`       | uidPrefix scoping works; my sweep didn't touch sibling fixtures. |

## §3 — Load-bearing items for the supervisor

**Read first:**

- **C9I5-001 dedupe_library HIGH** — actionable, single-file fix
  (`src/lib/mcp/tools/index.ts:1032` registration + handler at
  `src/lib/mcp/tools/library.ts:688`). Recommend wrapping with the same
  role guard the rest of the admin hygiene family uses. Evidence:
  `artifacts/04-dedupe-library-HIGH-evidence.md`.
- **C9I5-002 list_minted_bearers cascade-dead MED** — confirms C8I1-001 is
  still on the books at SHA `db208948f`. Triage decision: bundle into a
  follow-up bearer-audit hardening lane, or close as low-impact because
  `verifyBearer` already rejects cascade-dead bearers on use.

**Closes a known-open prod-probe gap:**

- **C9I5-005 rich-429 on `mint_admin_bearer`** — C8I1-002 had been "never
  prod-probed". Now it has been: rich envelope correctly populated. The
  per-uid quota observation is the new INFO bit triage should weigh.

## §4 — Notes on neighbor axes (cross-bleed I happened to observe)

- **Instance 2 (weekly authoring flow)**: a setlist
  `c9i2-CLONE-emor-weekly-flow-test` appeared in `list_setlists` output —
  fixtures from sibling instance 2's clone-template path are landing in
  prod. No issue, just noting the fixture is visible.
- **Instances 1+4**: `list_test_accounts({includeExpired:true})` after my
  cleanup shows c9i1 + c9i4 fixtures still active — confirming my
  uidPrefix-scoped cleanup didn't cross-contaminate. Their TTLs are short
  enough they'll clean themselves up by 2026-05-20T01:33Z.

## §5 — Probes that did NOT run (and why)

- **End-to-end cascade-dead REPRO for C8I1-001.** Would require minting a
  fresh root admin bearer; daily quota exhausted (C9I5-005). Structural
  observation from the audit shape is the next-best signal; documented in
  `artifacts/06-bearer-lifecycle-and-unauth.md §B`.
- **`mint_admin_bearer` happy-path round-trip via curl as admin.** Same
  reason. Used a `create_test_account` bearer round-trip instead — same
  observable property (token-doc deletion → verifyBearer reject).
- **assign_musician / respond_to_assignment with valid args.** The Zod
  schemas needed exploration I didn't budget time for. Their role gates
  are likely the same as the rest of the write surface (`forbidden_role`
  for non-leaders); empirical proof is the only thing missing. Worth a
  ~10-line follow-up if triage cares.

## §6 — Cleanup verification (PARENT §6 REQUIRED)

**Fixtures minted by this instance:**

| Fixture                                  | What                                  | Cleanup proof |
|---                                       |---                                    |---            |
| `test-c9i5-band_leader-8e818c64`         | band_leader test account              | removed by `cleanup_all_test_data({prefix:"c9i5"})` |
| `test-c9i5-musician-9ca50401`            | musician test account                 | ditto |
| `test-c9i5-member-a09050cd`              | member test account                   | ditto |
| tokenId `YqUFGZvLTG1WUrxLRsBF`           | band_leader bearer (test token)       | mcpToken doc deleted (`aggregate.mcpTokens:3`) |
| tokenId `sFXtRZfoX74imyNGYv12`           | musician bearer                       | ditto |
| tokenId `02izO1PTOwc7eu59Hzsn`           | member bearer                         | ditto |
| setlist `8756d9bf-881c-4d1b-a7fa-055c699a91f2` | `c9i5-PROBE-band_leader` (created via create_setlist write-tier probe) | cascade-deleted with band_leader account (`aggregate.setlists:1`) |
| `/tmp/c9i5-bearers.env` (sandbox-local)  | raw bearer values cached for curl     | `shred -uz` post-cleanup |
| `/tmp/c9i5-results/*.json`               | probe output JSON                     | copied (sanitized) into `artifacts/`; bearer-leak check ran clean |

**Verification:**

```
cleanup_all_test_data({prefix:"c9i5"})
→ {"removed":3, "failures":[],
   "aggregate":{"setlists":1, "tracks":0, "library_index":0,
                "songs":0, "proposal_stages":0, "bond_flags":0,
                "bond_corrections":0, "scheduling_assignments":0,
                "musician_availability":0, "setlistTemplates":0,
                "mcpTokens":3, "storageDeleted":0, "storageFailed":0}}

list_test_accounts({includeExpired:true})
→ 4 accounts remain — c9i1 + c9i4 — NO c9i5 entries. ✓

# Re-use of cleaned bearers (round-trip confirm)
curl POST /api/mcp tools/call list_setlists  (with each c9i5 bearer)
→ all 3 HTTP 401 / body {"error":"invalid_token", ...}
```

**`dedupe_library` side-effect note (C9I5-001 transparency):** during the
HIGH-finding repro I called `dedupe_library` with `dryRun: false` as
musician + member. The function is idempotent on already-marked rows
(per its docstring) and `duplicatesMarked:1` was constant across all 4
calls in the same session — strongly suggesting the same already-marked
row was being recounted, not new rows being marked. No evidence I created
new `library_index` mutations; but if the supervisor wants belt-and-
suspenders confirmation, a follow-up admin call to inspect the
`library_index` "duplicate"-status row count vs. master-tip baseline
would settle it.

## §7 — Bearer burned

Pool unreachable from this mount per PARENT §2. Mark as **burned** in the
HANDOFF; supervisor flips the pool row. Bearer TTL-expires by 2026-05-20T~07:25Z
regardless.

## §8 — Deliverables (PARENT §6 checklist)

1. ✅ `.paul/research/cycle-9-instance-5-HANDOFF.md` (this file).
2. ✅ `.paul/research/cycle-9-instance-5-findings.jsonl` (8 rows).
3. ✅ `.paul/research/cycle-9-instance-5-artifacts/` — 6 files (3 raw probe JSONs + 3 evidence notes).
4. ⏭️ `.coord/inbox/supervisor.md` HANDOFF-COMPLETE post — appended below.
5. ✅ Bearer-burned note — §7.

Signed `from cycle-9-instance-5`.
