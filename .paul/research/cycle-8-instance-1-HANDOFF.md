# Cycle-8 Instance 1 — HANDOFF (coder-1)

**Author:** coder-1
**Date:** 2026-05-19T22:50Z
**Prod SHA probed:** `edb24a47c10ef37fb216a0a5cb1f867532965e52` (matches `origin/master` HEAD + `master-tip.md`; `/api/version` returned `sha:edb24a47c10ef…, version:7.0.0`)
**uidPrefix:** `c8i1` · **Finding ID prefix:** `C8I1-NNN` · **Wall-clock:** ~80 min
**Bearer used:** 1 Daniel-handed ROOT admin bearer (tokenId discovered incidentally as `by9YfvDgDI0WqZo1IDIc` via §1.2 refusal envelope); wired into the Cowork-side MCP connection — never written to disk. Spawned 1 minted child `OpLJHUoSMRaLwDFsACOj` (revoked) + 2 test accounts under `uidPrefix:c8i1` (swept).

---

## §0 — Bearer-mint security verdict (load-bearing axis)

**ACCEPT** with one MED audit-view bug (corroborates auditor msg-028 follow-up #1).

| Sub-axis | Verdict | Notes |
|---|---|---|
| §1.1 Happy mint + uid inheritance | **PASS** | child bearer minted, used via raw curl on `dump_collection_size` → admin-resolved at deployed surface |
| §1.2 Depth-1 enforcement | **PASS** | child → mint → `non_root_bearer_cannot_mint` 403 rich envelope; cannot mint grandchildren |
| §1.3 Root-revocation cascade | **PASS** (auditor msg-028 prod proof retained) + **C8I1-001 MED audit-view bug corroborated** | I cannot revoke my own root without killing this session; auditor msg-028 already proved cascade at prod via Root B. RZT630CC… still surfaces as `status:'active'` despite Root B revocation. |
| §1.4 Role gate (musician + band_leader) | **PASS** | both → `forbidden_role` 403; mint NOT widened to trusted-leader |
| §1.5 Rate-limit (10/day per uid) | **C8I1-002 INFO** open prod verify | static + emulator + auditor msg-028 cover it; budget-conservation rule applied |
| §1.6 TTL clamp + purpose validation | **PASS** | handler-layer probes via MCP tool: `placeholder` (generic, 11ch) + 8-space whitespace → rich `validation_error` 400 with `issues[]` + hint; Zod-layer covered by auditor msg-028 row 4 + emulator #6/#7 |
| §1.7 Audit trail no-secret-leak | **PASS** | `list_minted_bearers` rows = `{tokenId, parentTokenId, purpose, mintedByUid, mintedAt, ttlExpiresAt, revokedAt, lastUsedAt, status}` — NO `tokenHash`/raw token; `lastUsedAt` correctly stamped after curl reuse |
| §1.8 Refusal envelope shape | **PASS** | every refusal is rich `{ok:false, error:{code, machine_code, message}, ...extras, hint}` in `result.content[].text`; `isError` falsy for business-logic gates; `isError:true` only on Zod-schema validation (per `[[feedback_mcp_validation_shape]]`) |

**No HIGH findings on the credential surface.** Cascade is real-and-checked at verify-time; the only blemish is the cosmetic audit-view miss on cascade-dead status.

---

## §1 — Template CRUD round-trip

**ACCEPT** — round-trip integrity holds; 4 INFO polish items.

| Sub-axis | Verdict | Notes |
|---|---|---|
| §2.1 happy path create_template_from_setlist | PASS | trackCount + templateType inherited |
| §2.2 get_template field preservation | PASS | all 21 tracks; headers + readings + prayer + song fields all preserved (title/key/leadMusician/songId/fileId/fileName) |
| §2.3 setlist → template → setlist round-trip | PASS | clone has `sourceTemplateId` stamp; tracks contiguous order 0..20; new trackIds; content identical |
| §2.4 list_templates visibility | PASS | template surfaces with name/type/trackCount/owner/updatedAt/version |
| §2.5a 0-track source | C8I1-003 INFO | silent acceptance; no warning |
| §2.5b name collision | C8I1-004 INFO | no uniqueness — 2 distinct templateIds with same display name |
| §2.5c very long name | C8I1-005 INFO | no maxLength cap |
| §2.5d cross-owner | C8I1-006 INFO | allowed by spec; caller-as-owner; templateType inherited from source |

Also verified delete_template idempotency: re-deleting `9aef7749-…` returned `{ok:true, deleted:false}` — correct.

---

## §2 — Publish gates (audience-leak class)

**ACCEPT** — both gates fire at deployed surface; defense-in-depth override-filter works.

| Gate | dryRun behavior | real-publish behavior | Verdict |
|---|---|---|---|
| Gate 1 `test_owner_cannot_publish_to_real_humans` | observability returns 18 real recipients **BY DESIGN** (per `[[feedback_dryrun_is_observability]]`, Lane 1 commit msg) | 403 rich envelope; setlistId+ownerId echoed; no fan-out | **PASS** |
| Gate 2 `cross_owner_publish_forbidden` | observability returns 18 real recipients **BY DESIGN** | 403 rich envelope; callerUid+ownerId echoed; no fan-out | **PASS** |
| Override-recipients defense-in-depth | — | test-uid entries dropped via `isTestUid()` filter at setlist-publish.ts ~L573; dispatch guard then refuses `no_valid_recipients` 400 | **PASS** |

C7I1-008 + C7I3-002 audience-leak class confirmed CLOSED at prod SHA `edb24a47c`. NO regression-of-shipped-fix at the deployed surface (Lane 1 still in master's tree).

**META — supervisor please relay to Daniel:** local working tree at `C:\Users\dsbog\CentralReform.live\sheet-music-app\` is OUT OF SYNC with `origin/master`. `src/lib/test-isolation.ts` missing on disk; `setlist-publish.ts` 727L on disk vs 840L in git tree. `git checkout .` or `git pull --ff-only` resyncs. Filed as **C8I1-META-001**. (This caused me a 10-min false alarm during §3 probe before I re-read from git.)

---

## §3 — Position-clamp warning (C7I3-003)

**ACCEPT** — clamp warning fires with the expected message format.

| Probe position | Verdict |
|---|---|
| 0 (valid lo) | PASS, no warning |
| length (valid append) | PASS, no warning |
| 999 (>> length) | PASS, warning fires: `"position clamped from 999 to 5 (insert range is [0, 5] for the post-insert track count of 6)"` |
| -1 (negative) | PASS, Zod refuses with rich `validation_error` 400 + `isError:true` |

C7I3-003 confirmed CLOSED at prod.

---

## §4 — Cleanup verification (security-critical)

**Required HANDOFF section per cycle-8 PARENT §5 standing rule #4 + bearer-mint discipline.**

| Mint/fixture | Cleanup action | Verification |
|---|---|---|
| Minted child `OpLJHUoSMRaLwDFsACOj` (admin bearer for §1.1b–§3.3 curl probes) | `revoke_minted_bearer({tokenId:'OpLJHUoSMRaLwDFsACOj'}) → {ok:true, revoked:true}` | `list_minted_bearers({includeRevoked:true})` shows row `status:'revoked', revokedAt:'2026-05-19T22:49:15.894Z'` |
| Templates (5 — §2.1, 0-track, collision dup, long-name, cross-owner) | `delete_template` × 5; each `{ok:true, deleted:true}`; one re-delete `{ok:true, deleted:false}` idempotent | `list_templates() → {templates:[], total:0}` ✅ |
| Cloned setlist `bf6427a1-…` (21-track round-trip clone) | `delete_setlist({id}) → {ok:true, tracksDeleted:21}` cascade | gone |
| Test accounts (musician + band_leader, uidPrefix `c8i1`) + their owned band_leader setlist `61198f36-…` (6 tracks: 3 original + 3 from §4 clamp probes) + their 2 mcpToken docs | `cleanup_all_test_data({prefix:'c8i1'})` → `{removed:2, failures:[], aggregate:{setlists:1, tracks:6, mcpTokens:2}}` | `list_test_accounts({includeExpired:true}) → {accounts:[]}` ✅ |
| Accidental mutation of real setlist `b12a5221-…` ("Eitan Shabbat Morning 2/21" — pipeline grabbed wrong id during cross-owner setup, added 1 header track) | `remove_track({setlistId, trackId:'5c2279e6-…'}) → {ok:true}` immediately after | net delta zero |

**Zero residual `c8i1-*` / `test-c8i1-*` / minted-by-me tokens.** The minted children that remain in `list_minted_bearers` are NOT mine: 2 are c8i2's active probes (parent `fOs6UciC0ETik9tHv8Aq`), 1 is the auditor's cascade-test child `RZT630CCsIsLLqVn0Zzp` (parent Root B; that's the C8I1-001 audit-view bug evidence itself — not a fixture I created or should revoke).

Raw bearer values: my wired root + my minted child + 2 test-account bearers — none written to any file under `sheet-music-app/`, `.coord/`, or any artifact. (Bash invocations transiently held them in env vars; bash sandbox is ephemeral per-call.)

---

## §5 — Findings summary

| ID | Sev | Surface | One-liner |
|---|---|---|---|
| C8I1-001 | MED | `list_minted_bearers` audit view | Cascade-dead children still show `status:'active'` (corroborates auditor msg-028 #1) |
| C8I1-002 | INFO | `mint_admin_bearer` rate-limit | 10/day cap not actively probed at prod (emulator + auditor cover); deferred to budget rule |
| C8I1-003 | INFO | `create_template_from_setlist` 0-track edge | Silent acceptance; produces empty template |
| C8I1-004 | INFO | `create_template_from_setlist` name uniqueness | No uniqueness check |
| C8I1-005 | INFO | `create_template_from_setlist` name length | No maxLength enforcement |
| C8I1-006 | INFO | `create_template_from_setlist` cross-owner | Allowed by design; documented behavior |
| C8I1-META-001 | META | Daniel local working tree drift | `sheet-music-app/` working tree out-of-sync with `origin/master edb24a47c` |

**No HIGH findings. No BLOCKS-GREEN candidates. No regression-of-shipped-fix at deployed surface.** Per cycle-8 PARENT §6, the auto-revival bar for parallel-wave mode (≥3 BLOCKS-GREEN OR any regression-of-shipped-fix) is **NOT met** by c8i1.

Findings JSONL: `.paul/research/cycle-8-instance-1-findings.jsonl` (7 lines, schema per cycle-7 PARENT §4).

Artifacts:
- `.paul/research/cycle-8-instance-1-artifacts/01-bearer-mint-probes.md`
- `.paul/research/cycle-8-instance-1-artifacts/02-template-crud-probes.md`
- `.paul/research/cycle-8-instance-1-artifacts/03-publish-gates-probes.md`
- `.paul/research/cycle-8-instance-1-artifacts/04-position-clamp-probes.md`

---

## §6 — Notes for auditor

1. **Independent prod-probe re-run viable:** every PASS axis in §0/§1/§2/§3 has a paste-ready REPRO transcript in the matching artifact file. Bearer-mint cascade was NOT re-proven at prod by c8i1 (would require killing the wired root); rely on auditor msg-028 prod evidence + corroborate the C8I1-001 audit view via a fresh `list_minted_bearers({includeRevoked:true, includeExpired:true})`.

2. **C8I1-META-001 is a workstation-state issue, not a code issue** — Daniel's local working tree is stale but `origin/master` is correct. If supervisor wants to verify, `git status` + `wc -l src/lib/mcp/tools/setlist-publish.ts` from Daniel's worktree will show drift; `git diff origin/master -- src/lib/mcp/tools/setlist-publish.ts` will show the 113-line delta (Lane 1's +74 lines + Lane 2 follow-up + other changes between Lane 1 ship and edb24a47c).

3. **Rate-limit budget remaining at HANDOFF:** uid `93Xn3DbS…` has used ~6 mints today (c8i2 ×2 active + auditor cascade-test ×1 active + my OpLJHUoSMRaLwDFsACOj ×1 revoked-but-counted + auditor Tier-2 ×1 revoked-but-counted + coder-2 ship §11 ×1 revoked-but-counted). The cap counts ALL mints today regardless of revoke status (per spec §5 step 5 — rate-limit query reads all `mintedByUid==uid AND mintedAt>=startOfTodayUTC`, no filter on revoke). 4 mints left in this UTC day.

4. **No cross-lane regression sweep run** — c8i1 is discovery-shape, per cycle-8 PARENT §5 #6 ("Stay in your lane; cross-lane regression-sweep is the auditor's job").

— from coder-1
