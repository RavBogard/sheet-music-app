# C9I5-004 — Machine_code consistency map (C8I2-006 follow-up)

**Source of truth:** the rich envelope helper at
`src/lib/mcp/error-envelopes.ts:360` — `forbiddenRoleEnvelope(...)` — emits
`error: "forbidden_role"` plus `callerRole`, `requiredRoles`, `message`,
`hint`. Cycle-2 REG-001b standardized this as the role-refusal shape.

## Tools using the standard `forbidden_role` machine_code

(Empirically observed on prod SHA `db208948f` via musician + member calls):

| Tool                          | Machine_code      | Verdict |
|---                            |---                |---      |
| `list_minted_bearers`         | `forbidden_role`  | ✓ standard |
| `mint_admin_bearer`           | `forbidden_role`  | ✓ standard |
| `get_ai_config`               | `forbidden_role`  | ✓ standard |
| `get_correction_stats`        | `forbidden_role`  | ✓ standard |
| `set_ai_auto_apply`           | `forbidden_role`  | ✓ standard |
| `set_ai_threshold`            | `forbidden_role`  | ✓ standard |
| `recompute_setlist_track_count` | `forbidden_role` | ✓ standard |
| `backfill_library_index`      | `forbidden_role`  | ✓ standard |
| `backfill_setlist_test_flag`  | `forbidden_role`  | ✓ standard |
| `reconcile_library`           | `forbidden_role`  | ✓ standard |
| `sweep_orphan_test_data`      | `forbidden_role`  | ✓ standard |
| `list_musicians`              | `forbidden_role`  | ✓ standard |
| `create_setlist`              | `forbidden_role`  | ✓ standard |
| `update_setlist`              | `forbidden_role`  | ✓ standard |
| `publish_setlist`             | `forbidden_role`  | ✓ standard |
| `delete_setlist`              | `forbidden_role`  | ✓ standard |
| `list_monitor_buses`          | `monitor_access_denied` (tool-specific by design) | ✓ |

## Outliers — `forbidden` (no `_role` suffix)

| Tool                       | Machine_code | Source                                |
|---                         |---           |---                                    |
| `list_test_accounts`       | `forbidden`  | `src/lib/mcp/tools/test-tokens.ts:305` |
| `cleanup_all_test_data`    | `forbidden`  | `src/lib/mcp/tools/test-tokens.ts:573` |
| `create_test_account` *    | `forbidden`  | `src/lib/mcp/tools/test-tokens.ts:144` |
| `revoke_test_account` *    | `forbidden`  | `src/lib/mcp/tools/test-tokens.ts:432` |

\* The two starred rows weren't directly probed in this sweep but the source
strings at the cited lines confirm they emit the bare `forbidden` code with
the bespoke message format (`"<tool> requires admin or band_leader role."`).

All four live in `src/lib/mcp/tools/test-tokens.ts`. That file pre-dates the
REG-001b `forbiddenRoleEnvelope` standardization and never got migrated.

## Recommendation

Standardize the four test-tokens tools onto the `forbiddenRoleEnvelope`
helper. Mechanical change — replace each handcrafted `{ok:false, error:
"forbidden", message:"..."}` with:

```ts
return forbiddenRoleEnvelope({
    callerRole,
    requiredRoles: ["admin", "band_leader"],
    message: "list_test_accounts requires admin or band_leader role.",
})
```

This:
1. Stabilizes `machine_code: "forbidden_role"` across the whole MCP surface
   so agents can pattern-match a single value.
2. Adds the missing `callerRole` + `requiredRoles` + `hint` fields the agent
   needs to self-correct.
3. Closes C8I2-006 (open since cycle-8).

## Other observations during the matrix sweep

- **Zod runs before role gate** on every tool I tested with invalid args
  (`update_setlist`, `delete_setlist`, `cleanup_all_test_data`,
  `assign_musician`, `respond_to_assignment`, `set_bus_fader`,
  `set_ai_threshold`, `recompute_setlist_track_count`). Validation surfaces
  as `result.isError: true` + nested rich envelope `{ok:false,
  error:{code:400, machine_code:"validation_error", message:"Invalid
  arguments…"}}`. Once args are schema-valid the role gate fires correctly.
  This is per `[[feedback_mcp_validation_shape]]`. Minor downside: probing
  the schema is decoupled from probing the gate — but `tools/list` already
  exposes the schema, so this is INFO, not a finding.

- **`forbidden_role` envelope shape on update_setlist** (band_leader allowed,
  musician/member refused):

  ```
  {"ok":false,
   "error":"forbidden_role",
   "message":"MCP write tools require an admin or band leader account.",
   "callerRole":"musician",
   "requiredRoles":["admin","band_leader"],
   "hint":"..."}
  ```

  Correctly populated. ✓
