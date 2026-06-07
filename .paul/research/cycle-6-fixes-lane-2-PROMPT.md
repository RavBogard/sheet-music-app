# Cycle-6-fixes Lane 2 — Template MCP CRUD pack (criterion 8 of green rubric)

> **Coder lane prompt** — not a cowork instance prompt. Single focused
> code lane. Single commit preferred for SHIP-NOTICE atomicity;
> multi-commit OK if logically separable (e.g. CRUD core + clone).
>
> **Wave A repair scope** (replaces original Wave A dispatch — Lane 0 + Lane 4
> were dead-on-arrival per pre-flight 2026-05-19T20:25Z). Wave A becomes
> Lane 1 (coder-2 gig-packet) + Lane 2 (this lane, coder-1) + Lane 5
> (coder-3 unauth-edge refined).
>
> **This is the green-rubric criterion-8 lane** — David flow depends on
> templates. Without dedicated template tools, the "clone Randy Shabbat
> morning" / "B'nai Mitzvah" / "Shir Shabbat" weekly authoring pattern
> stays manual. Closes `[[feedback_mcp_template_management]]` memory gap.

---

## §0 — Identity, branch, scope

**Lane:** `cycle6-fixes-lane-2-template-mcp`
**Branch:** `feat/cycle6-fixes-2-template-mcp` (cut from current `origin/master` at lane start)
**Output:** master push when SHIP-NOTICE acceptable.

**No bearer needed.** Validation is unit + emulator tests; production probe is `tools/list` against `/api/mcp` post-deploy.

**Scope:** ship 6 new admin/band_leader MCP tools for setlist-template CRUD:
- `list_templates(filter?: {templateType?, ownerUid?})` → array
- `get_template(templateId)` → full template doc
- `create_template({name, templateType?, serviceNotes?, tracks?})` → `{templateId}`
- `update_template(templateId, patch)` → `{templateId, changed: boolean}`
- `delete_template(templateId)` → `{templateId, deleted: true}`
- `clone_setlist_from_template(templateId, {newName, newEventDate?, copyServiceNotes?})` → `{setlistId, sourceTemplateId, trackCount, ownerId, ownerName}`

Trusted-leader rate-limit bypass applies (admin + band_leader). dryRun-default on writes per F-05 standing rule.

**SHIP-NOTICE protocol (Daniel-ratified 2026-05-19 — non-negotiable):** include a `## Repros` section pasting each REPRO block from §6 verbatim. Auditor BLOCK-TEARDOWNs without it.

---

## §1 — Data model decision (Daniel-defaulted, coder may surface CONCERN)

**Default:** new Firestore collection `setlistTemplates/{templateId}` distinct from `setlists/{setlistId}`.

```
setlistTemplates/{templateId}: {
  name: string
  templateType?: string                   // e.g. 'shabbat-morning', 'bnai-mitzvah'
  serviceNotes?: string
  tracks: Array<{type, title, key?, bpm?, leadMusician?, referenceLink?, notes?, songId?, fileId?, fileName?}>
  ownerId: string                         // creator uid
  ownerName: string
  createdAt: serverTimestamp
  updatedAt: serverTimestamp
  version: number                         // increment on update
}
```

**Why a separate collection (not `setlists.isTemplate: true`):**
- Templates have no `eventDate` / `isTest` semantics; cleaner schema.
- list_setlists doesn't accidentally surface templates in `/perform` listings.
- Cleanly distinguishable in Firestore rules + indexes.

**Alternative (if you find this design wrong on trace):** flag `isTemplate: true` on the existing `setlists/{setlistId}` collection and filter throughout. Cheaper to implement but harder to keep distinct. Surface as CONCERN if you want to take this path.

---

## §2 — Reference: existing `clone_setlist` (similar shape)

The existing `clone_setlist` MCP tool (registered in `src/lib/mcp/tools/index.ts` around line 2116 area; source elsewhere in `tools/`) does setlist-to-setlist cloning with very similar semantics to `clone_setlist_from_template`. Read it end-to-end before designing `clone_setlist_from_template` — the patterns (track-row construction, owner derivation, version: 1, name='Copy of <source>') largely transfer; the differences are:
1. Source is `setlistTemplates/{templateId}`, not `setlists/{setlistId}`
2. `eventDate` does NOT carry over (templates don't have one); pass `newEventDate` optionally
3. `templateType` from source becomes the new setlist's `templateType`
4. `version` starts at 1 on the new setlist

The other CRUD tools have simpler shapes — straightforward Admin SDK reads/writes with role-gate.

---

## §3 — Files you'll likely touch

- `src/lib/mcp/tools/templates.ts` (NEW) — all 6 tools in one module
- `src/lib/mcp/tools/index.ts` — register the 6 tools (admin + band_leader)
- `firestore.rules` — new `match /setlistTemplates/{templateId}` block (admin + band_leader write; read for admin + band_leader; deny for musician + member)
- `firestore.indexes.json` — if `list_templates` filter uses composite indexes (e.g. `templateType + ownerUid + updatedAt`)
- `src/lib/mcp/__tests__/mcp-templates.emulator.test.ts` (NEW) — emulator test suite
- Possibly `src/lib/mcp/server-songs.ts` or shared helper if track-row construction can share code with `clone_setlist`

---

## §4 — Coord coordination contract

- Lane 1 (coder-2) touches `src/lib/mcp/tools/library-download.ts` + `src/lib/drive/*` — fully disjoint.
- Lane 5 (coder-3) touches `src/app/accessibility/**` + legal-nav component — fully disjoint.
- You touch `src/lib/mcp/tools/index.ts` to register the 6 new tools. **If Lane 1 also touches index.ts** (it shouldn't — gig-packet is in-place edit), last-pusher rebases + re-runs tests. Single-commit narrow-lane cherry-pick caveat applies.

**Claim discipline:** claim `src/lib/mcp/tools/index.ts` + `firestore.rules` in `.coord/shared/claims.md` with TTL 3h when you start the registration commit. Release on push.

---

## §5 — Binding rules (read before starting)

1. **SHIP-NOTICE `## Repros` section is MANDATORY** (decisions.md 2026-05-19T~19:30Z Decision 1). Paste each REPRO-L2-* block from §6 verbatim. Auditor BLOCK-TEARDOWNs without it.
2. **Auditor verdicts are BINARY** (ACCEPT or BLOCK-TEARDOWN; no DEFER).
3. **Single-commit narrow lane → cherry-pick over fresh origin/master** at push time, not rebase (master-tip.md narrow-lane caveat).
4. **dryRun-default + force-gated on writes** per F-05 standing rule (`[[feedback_dryrun_is_observability]]`).
5. **Pre-flight EVERY claim before writing code** per `[[feedback_cowork_prompt_verify_before_write]]`. Supervisor pre-flighted Lane 2 scope at 2026-05-19T20:25Z and confirmed no `list_templates`/`get_template`/`create_template`/`update_template`/`delete_template`/`clone_setlist_from_template` exists at `3e640a905`. But trace `clone_setlist` source before designing — your trace is authoritative.

---

## §6 — REPRO blocks (paste verbatim into SHIP-NOTICE)

```
### REPRO-L2-tools-registered (C6C-001..006 surface check)
preconditions: master post-ship, MCP endpoint deployed at https://www.centralreform.live/api/mcp
steps: POST /api/mcp with method=tools/list (admin bearer)
expected: response.result.tools[] contains list_templates, get_template, create_template, update_template, delete_template, clone_setlist_from_template
observed_pre_fix: response.result.tools[] does NOT contain any template_* tool

### REPRO-L2-create-template (C6C-003)
preconditions: admin bearer, empty setlistTemplates collection
steps: tool=create_template with {name:'Test Shabbat Morning', templateType:'shabbat-morning', tracks:[{type:'song', title:'Hashkiveinu', key:'D'}]}
expected: result {templateId: <newId>, name, ownerId, version:1}, Firestore doc exists at setlistTemplates/<newId> with provided fields + serverTimestamps
observed_pre_fix: tool not registered → unknown_tool error

### REPRO-L2-list-templates (C6C-001)
preconditions: at least 1 template doc in setlistTemplates collection
steps: tool=list_templates with {} (no filter)
expected: result.templates[] array including the test template with summary fields {templateId, name, templateType?, trackCount, ownerName, updatedAt}
observed_pre_fix: tool not registered

### REPRO-L2-update-template (C6C-004)
preconditions: existing template doc
steps: tool=update_template(<templateId>, {name:'Renamed Template', serviceNotes:'updated notes'})
expected: result {templateId, changed: true}; Firestore doc reflects updated name + serviceNotes + bumped version + updatedAt; idempotent (re-run returns changed:false)
observed_pre_fix: tool not registered

### REPRO-L2-delete-template (C6C-005)
preconditions: existing template doc
steps: tool=delete_template(<templateId>)
expected: result {templateId, deleted: true}; Firestore doc removed; idempotent (re-run returns deleted:false or not_found envelope)
observed_pre_fix: tool not registered

### REPRO-L2-clone-from-template (C6C-006 — biggest payoff)
preconditions: existing template doc with 2-3 tracks; admin or band_leader bearer
steps: tool=clone_setlist_from_template(<templateId>, {newName:'2026-05-23 Shir Shabbat', newEventDate:'2026-05-23'})
expected: result {setlistId: <new>, sourceTemplateId, trackCount:<N>, ownerId, ownerName}; new setlist doc exists at setlists/<setlistId> with same trackCount, eventDate set, version:1, isTest:false
observed_pre_fix: tool not registered → unknown_tool

### REPRO-L2-role-gate (negative — non-admin/non-band_leader)
preconditions: musician or member bearer
steps: tool=create_template (or any write)
expected: result.isError:true with content "forbidden_role" or equivalent rich envelope
observed_pre_fix: tool not registered → unknown_tool (different error class)
```

---

## §7 — Effort estimate

3-4h. The 5 CRUD tools are straightforward Admin SDK CRUD with role-gate; `clone_setlist_from_template` is the largest piece but `clone_setlist` is the template (pun intended). Most time is in emulator-test scaffolding + firestore.rules + write-discipline (dryRun-default).

---

## §8 — Hard NOs

- Do NOT touch `src/lib/mcp/tools/library-download.ts` (Lane 1 territory).
- Do NOT touch `src/app/accessibility/**` (Lane 5 territory).
- Do NOT modify the existing `clone_setlist` source — only READ it for reference.
- Do NOT add `isTemplate: true` to the existing `setlists` schema unless the trace surfaces a CONCERN-worthy reason; default is the separate collection.
- Do NOT auto-populate templates from existing setlists (no migration in this lane; Daniel does manual template authorship via the new MCP tools after ship).
