# MCP tool inventory — deployed surface @ origin/master `32dca1a6df`

> Captured 2026-05-26T~17:05Z via `tools/list` against `https://www.centralreform.live/api/mcp`
> (bearer from `node scripts/supervisor-prod-bearer.mjs` per `[[feedback_supervisor_bearer_persistence]]`).
> Cross-referenced against `src/lib/mcp/tools/index.ts` (registerXxxTools call sites) +
> `src/lib/mcp/tools/{mint-admin-bearer,test-tokens}.ts` (standalone registrations).

## Deployed-vs-source parity

- **Deployed tools (tools/list):** 108
- **Source-registered (`server.registerTool` call sites):** 108
- **Source-only (registered but undeployed):** 0
- **Deployed-only (deployed but unregistered in source):** 0

✅ Clean parity — no drift.

Raw: `tools-list-raw.json` (SSE-framed) + `tools-list.json` (decoded).
Per-tool enriched data: `tools-enriched.json`.

## Group breakdown

| Register function                | Count | Source file                             |
|-----------------------------------|-------|------------------------------------------|
| `registerReadTools`              |     7 | `src/lib/mcp/tools/index.ts`             |
| `registerWriteTools`             |    51 | `src/lib/mcp/tools/index.ts`             |
| `registerChartUploadTools`       |    10 | `src/lib/mcp/tools/index.ts`             |
| `registerMonitorTools`           |    19 | `src/lib/mcp/tools/index.ts`             |
| `registerRosterTools`            |    10 | `src/lib/mcp/tools/index.ts`             |
| `registerObservabilityTools`     |     3 | `src/lib/mcp/tools/index.ts`             |
| (standalone — `mint-admin-bearer.ts`) |  3 | `src/lib/mcp/tools/mint-admin-bearer.ts` |
| (standalone — `test-tokens.ts`)   |     5 | `src/lib/mcp/tools/test-tokens.ts`       |
| **TOTAL**                         | **108** |                                          |

> Memory `[[project_mcp_status]]` says "24 tools live" — **stale.** Surface has expanded
> 4.5× since that snapshot. The PROMPT should cite the count from this inventory, not memory.

## Schema features (from `tools/list` inputSchema)

- **Tools exposing `dryRun` param:** 26
- **Tools exposing `force` param:** 24
- **Tools with both (typical refuse-gate pattern):** ~22

The PROMPT should specifically probe `dryRun:true` returns full report without side effects
and `dryRun:false + force:false` triggers refuse-gate on destructive ops per
`[[feedback_dryrun_is_observability]]`. The 26 dryRun-supporting tools are the right surface
for that probe family.

## Role-gate flags (heuristic — from prose descriptions)

> ⚠️ **Caveat:** these flags are extracted from the `description` text in `tools/list`, NOT
> from the handler's role-check code. They're INDICATIVE — the PROMPT should TREAT them
> as hypotheses to confirm via probe, not as ground truth. The actual gate is in the handler
> (e.g. `isTrustedLeader(roles)`, `loadCallerRole(uid).isTrustedLeader`, `assertAdmin`).
> Source-of-truth role gates live in:
> - `src/lib/mcp/tools/uploader-roles.ts` (`isTrustedLeader` predicate: admin OR band_leader)
> - `src/lib/mcp/tools/test-tokens.ts` (top of file: `loadCallerRole` + `assertAdmin` pattern)
> - `src/lib/mcp/tools/bridge-recovery.ts` (`assertAdmin` for bridge_resync/reconnect/selftest/restart/clear_*)
> - Per-tool inline checks (look for `roles` arg pattern in handler signatures)

## Per-tool table

### registerReadTools (7)

| Tool                       | dryRun | force | Notes |
|----------------------------|--------|-------|-------|
| `list_setlists`            |        |       | open to authed callers |
| `get_setlist`              |        |       | open to authed callers |
| `search_library`           |        |       | open to authed callers |
| `get_song`                 |        |       | open to authed callers |
| `list_library`             |        |       | open to authed callers |
| `get_congregation_context` |        |       | open to authed callers |
| `search_chart_text`        |        |       | scopes: metadata + lyrics (post-Phase-4 healing 2026-05-26) |

### registerWriteTools (51)

Setlist CRUD (owner-scoped to caller's own setlists where applicable):

| Tool                          | dryRun | force | Role-gate hint |
|-------------------------------|--------|-------|----------------|
| `create_setlist`              |        |       | admin / band_leader |
| `clone_setlist`               |        |       | admin / band_leader / trusted_leader (rate-limited) |
| `clone_setlist_from_template` |        |       | admin / trusted_leader (rate-limited) |
| `update_setlist`              |        |       | admin / band_leader |
| `add_track_to_setlist`        |        | ✓     | admin / band_leader |
| `bulk_add_tracks`             | ✓      |       | admin / band_leader |
| `reorder_setlist`             |        |       | admin / band_leader |
| `remove_track`                |        |       | admin / band_leader |
| `delete_setlist`              |        |       | admin |
| `recompute_setlist_track_count` |      |       | admin |
| `update_track`                |        |       | admin / band_leader |
| `swap_chart`                  |        |       | (handler-gated) |
| `bulk_update_tracks`          | ✓      |       | admin / band_leader |

Templates:

| Tool                              | dryRun | force | Role-gate hint |
|-----------------------------------|--------|-------|----------------|
| `list_templates`                  |        |       | admin |
| `get_template`                    |        |       | admin |
| `create_template`                 |        |       | admin / trusted_leader (rate-limited) |
| `update_template`                 |        |       | admin |
| `delete_template`                 |        |       | admin |
| `create_template_from_setlist`    |        |       | admin / trusted_leader (rate-limited) |

Publishing + change-staging:

| Tool                            | dryRun | force | Role-gate hint |
|---------------------------------|--------|-------|----------------|
| `publish_setlist`               | ✓      | ✓     | admin / band_leader (member allowed for ?) |
| `get_chart_status`              |        |       | (handler-gated) |
| `wait_for_setlist_change`       |        |       | (handler-gated) |
| `propose_setlist_changes`       |        |       | (handler-gated) |
| `commit_staged_changes`         |        |       | (handler-gated) |
| `preview_publish`               |        |       | admin / musician / member (rate-limited) |

Bond corrections + chart review:

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `flag_bond`                |        |       | (handler-gated) |
| `review_flagged_bonds`     |        |       | (handler-gated) |
| `record_bond_correction`   |        |       | (handler-gated) |
| `verify_setlist_charts`    |        |       | (handler-gated) |
| `review_chart_bonds`       |        |       | (handler-gated) |

Backfill / hygiene (admin-only, dryRun+force standard):

| Tool                            | dryRun | force | Role-gate hint |
|---------------------------------|--------|-------|----------------|
| `dedupe_library`                | ✓      | ✓     | admin |
| `backfill_setlist_test_flag`    | ✓      | ✓     | admin |
| `backfill_library_index`        | ✓      | ✓     | admin |
| `reconcile_library`             | ✓      | ✓     | admin |
| `salvage_chart_bytes`           | ✓      | ✓     | admin |
| `backfill_heal_metadata`        | ✓      |       | admin |
| `backfill_track_mimetype`       | ✓      | ✓     | admin / trusted_leader |
| `backfill_searchable_text`      | ✓      | ✓     | admin |

AI config + enrichment queue:

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `get_ai_config`            |        |       | admin |
| `set_ai_auto_apply`        | ✓      | ✓     | admin |
| `set_ai_threshold`         | ✓      | ✓     | admin |
| `list_review_queue`        |        |       | admin |
| `get_enrichment_suggestion`|        |       | admin |
| `accept_enrichment`        | ✓      | ✓     | admin |
| `reject_enrichment`        | ✓      | ✓     | admin |
| `edit_enrichment`          | ✓      | ✓     | admin / band_leader / musician |
| `edit_library_entry`       | ✓      | ✓     | admin / band_leader / musician |
| `retry_enrichment`         | ✓      | ✓     | admin |
| `dismiss_failure`          | ✓      | ✓     | admin |

Misc:

| Tool                            | dryRun | force | Role-gate hint |
|---------------------------------|--------|-------|----------------|
| `__test_delete_storage_object`  | ✓      |       | admin (isTest:true rows only) |
| `get_correction_stats`          |        |       | admin |

### registerChartUploadTools (10)

| Tool                          | dryRun | force | Role-gate hint |
|-------------------------------|--------|-------|----------------|
| `upload_chart`                |        | ✓     | (handler-gated; isTrustedLeader rate-limit bypass) |
| `import_chart_from_drive`     | ✓      | ✓     | (handler-gated) |
| `request_chart_upload_url`    |        |       | (rate-limited) |
| `finalize_chart_upload`       |        | ✓     | admin |
| `scrape_chart_from_url`       |        |       | (handler-gated) |
| `save_scraped_chart`          |        | ✓     | (handler-gated; supports key/bpm/leadMusician via songDefaults) |
| `update_song`                 | ✓      |       | admin / band_leader / musician (NOT admin-only — cowork #5 widening) |
| `delete_chart`                |        |       | admin |
| `download_chart`              |        |       | (handler-gated) |
| `generate_gig_packet`         |        |       | (handler-gated) |

### registerMonitorTools (19)

Read:

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `list_monitor_buses`       |        |       | admin |
| `get_mix`                  |        |       | (handler-gated; musician owner check) |
| `get_matrix`               |        |       | admin |
| `get_command_status`       |        |       | admin |
| `get_bridge_health`        |        |       | admin |

Write (control surface — requires live X32 desk + bridge):

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `set_send_level`           |        |       | admin OR musician-on-own-bus |
| `set_send_mute`            |        |       | admin OR musician-on-own-bus |
| `set_bus_fader`            |        |       | admin OR musician-on-own-bus |
| `set_matrix_fader`         |        |       | admin |
| `set_matrix_mute`          |        |       | admin |

Bus assignment:

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `assign_monitor_bus`       | ✓      |       | admin / band_leader |
| `unassign_monitor_bus`     | ✓      |       | admin / band_leader |

Bridge recovery (`bridge-recovery.ts` — `assertAdmin`):

| Tool                              | dryRun | force | Role-gate hint |
|-----------------------------------|--------|-------|----------------|
| `bridge_resync`                   |        |       | admin (assertAdmin — band_leader rejected) |
| `bridge_reconnect`                |        |       | admin (assertAdmin) |
| `bridge_selftest`                 |        |       | admin (assertAdmin) |
| `bridge_restart`                  |        |       | admin |
| `bridge_clear_acks`               |        |       | admin |
| `bridge_clear_pending_commands`   |        |       | admin |
| `bridge_get_log`                  |        |       | admin |

### registerRosterTools (10)

| Tool                          | dryRun | force | Role-gate hint |
|-------------------------------|--------|-------|----------------|
| `list_musicians`              |        |       | admin / musician |
| `get_musician_profile`        |        |       | admin |
| `list_musicians_on_date`      |        |       | admin / band_leader / musician |
| `list_service_personnel`      |        |       | admin |
| `list_pending_assignments`    |        |       | admin / musician |
| `suggest_musicians`           |        |       | admin / musician |
| `suggest_band`                |        |       | admin / musician |
| `assign_musician`             | ✓      | ✓     | admin / trusted_leader / musician (rate-limited) |
| `unassign_musician`           | ✓      | ✓     | admin / trusted_leader / musician (rate-limited) |
| `respond_to_assignment`       |        |       | admin / band_leader / musician |

### registerObservabilityTools (3)

| Tool                        | dryRun | force | Role-gate hint |
|-----------------------------|--------|-------|----------------|
| `dump_collection_size`      |        |       | admin |
| `get_web_vitals_summary`    |        |       | admin |
| `get_ai_spend_summary`      |        |       | admin |

### mint-admin-bearer.ts (3) — standalone module

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `mint_admin_bearer`        |        |       | admin + ROOT bearer (depth cap=1, can't mint from a minted bearer) |
| `list_minted_bearers`      |        |       | admin |
| `revoke_minted_bearer`     |        |       | admin |

### test-tokens.ts (5) — standalone module

| Tool                       | dryRun | force | Role-gate hint |
|----------------------------|--------|-------|----------------|
| `create_test_account`      |        |       | admin / musician / member (rate-limited) — supports `uidPrefix` per `[[feedback_sandbox_test_isolation]]` |
| `list_test_accounts`       |        |       | admin |
| `revoke_test_account`      |        |       | (handler-gated) |
| `sweep_orphan_test_data`   | ✓      | ✓     | admin |
| `cleanup_all_test_data`    |        |       | admin — global filter on `test-` prefix; **MUST** pass `uidPrefix` for parallel-instance isolation |

## Standing rules baked into each PROMPT

- **MCP envelope shape** (`[[feedback_mcp_validation_shape]]`): validation surfaces as
  `result.isError: true` with content prose. **NEVER** as JSON-RPC `error.code: -32602`.
  Probes that assert the wrong shape (4th wrong-target F-02 fix) get rejected.
- **Test isolation** (`[[feedback_sandbox_test_isolation]]`): every `create_test_account` call
  passes `uidPrefix: "cowork-mcp-<instanceId>"`; matching `uidPrefix` at `cleanup_all_test_data`
  end-of-run. Parallel instances WILL trample each other otherwise.
- **DryRun is observability** (`[[feedback_dryrun_is_observability]]`): `dryRun:true` returns
  the full report; refuse-gates only fire on real writes.
- **Trusted-leader bypass** (`[[feedback_admin_rate_limit_bypass]]`): admin + band_leader
  caller bypasses rate-limit on `checkUserRateLimit(uid, tier, {bypass: isTrustedLeader})`
  call sites.
- **Setlist contents PUBLIC by design** (`[[feedback_setlist_public_policy]]`): notes /
  tracks / song fields on `/perform/setlist/<id>` are intentional, not PII.
- **Upload atomicity** (`[[feedback_upload_atomicity]]`): every Storage/Firestore mutation
  in PCU surfaces (`upload_chart`, `import_chart_from_drive`, `save_scraped_chart`,
  `finalize_chart_upload`) carries read-verify + compensating-delete + `library_signals`
  broadcast. Probes assert the contract.
- **Catalog dual-read** (`[[project_catalog_dual_read_surfaces]]`): `get_song` /
  `search_library` / `search_chart_text` should agree on key/bpm/lead with `list_library` —
  divergence is a finding.

## Source-of-truth refs

- Registration: `src/lib/mcp/tools/index.ts` (lines 292 / 547 / 2050 / 2412 / 2778 / 3045
  for the 6 group entry points).
- Standalone registrations: `mint-admin-bearer.ts` + `test-tokens.ts`.
- Role helpers: `uploader-roles.ts` (`isTrustedLeader`).
- Validation surface: `src/lib/mcp/errors.ts` + `error-envelopes.ts` (read-only per
  parallel-coord do-not-touch rule).

## Captured artifacts in this directory

- `tools-list-raw.json` — raw SSE-framed `tools/list` response from prod.
- `tools-list.json` — decoded JSON for grep / jq inspection.
- `tools-names.txt` — sorted bare tool-name list (108 entries).
- `tools-enriched.json` — per-tool {group, file, handler, descHints, schemaDryRun, schemaForce}.
- `_groups.json` — register-function → tool-list mapping for re-derivation.
- `_extract-groups.mjs` / `_enrich.mjs` — extraction scripts for re-running on a future SHA.
