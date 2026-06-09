# Phase v11-05 — Cross-tenant collection scoping + CreationWizard vocab — CONTEXT

**Created:** 2026-06-09 (via /paul:discuss)
**Status:** Ready for /paul:plan
**Milestone:** v11.0 Brothers Lazaroff Multi-Tenant (phase 5 of 6)

---

## Why this phase

v11-02 walled the **MCP** layer (reads + writes) and v11-04 closed the entire
**consumer web read surface** (public `/perform`, branding/metadata, authed
dashboard) — both live-verified, CRC byte-identical. What's left are the
collections that were explicitly **deferred** out of those phases because they
weren't on the critical "BL ships + the band can see their setlists" path:

- v11-02-02 deferred: **templates / roster / congregation** read scoping.
- v11-03-03 deferred: **CreationWizard / perform-view / display-card vocab**
  (depended on org-scoped congregation + templates).
- v11-04-03 flagged: **in-app CreationWizard setlist-create `orgId` stamp**.

v11-05 closes all of these. It is data-isolation work, closest in nature to
v11-02 → **emulator-backed rules/scoping tests are mandatory** (quality floor).
v11-06 (cross-tenant isolation security audit, the close gate) follows.

---

## Goals (what success looks like)

1. **Every still-cross-tenant collection is org-scoped, READ + WRITE:**
   - **templates** (read/list — MCP `list_templates` + any web/template surfaces)
   - **roster/musicians**: `users`, `scheduling_assignments`, `musician_availability`
   - **congregation**
   - **service-personnel**
   A BL caller/host sees only BL rows; a cross-tenant fetch hits a not-found wall
   (no `cross_tenant_denied` leak — mirror v11-02's `loadEditableSetlist` chokepoint
   and the get_setlist/get_song not-found pattern). CRC provably unchanged.

2. **In-app CreationWizard setlist-create stamps `orgId`.** CONFIRMED gap:
   `src/lib/setlist-firebase.ts:189` `createSetlist()` writes `ownerId`/`ownerName`
   but **no `orgId`** unless passed via `additionalData`, and
   `src/hooks/use-creation-wizard.ts` (`service.createSetlist(name, finalTracks, {…})`
   at ~line 221) doesn't pass one. Result: an in-app-created setlist carries no
   `orgId` → invisible to the v11-04 `where('orgId','==',org)` dashboard reads.
   Stamp the host/caller org at create (thread `useOrg()` → `additionalData.orgId`).
   MCP create already stamps (v11-02-03), so this is the in-app parity fix.

3. **CreationWizard / perform-view / display-card vocab de-synagogued for BL.**
   Extend the existing `label(org,key)` + `hidesLiturgicalFields()` helpers
   (shipped v11-03-03) to these surfaces: BL sees band terms (no
   service-type / rabbi / congregation liturgical framing); **CRC literally
   unchanged**. Now unblocked because congregation + templates become org-scoped here.

4. **No CRC lock-out.** Defensive backfill (decision 2 below) guarantees existing
   CRC docs stay visible after each read filter flips on.

---

## Approach (decisions — confirmed by Daniel 2026-06-09, baked per autonomy directive)

### Decision 1 — Decomposition: **vertical per-collection slices**
Each plan scopes ONE collection (or tight group) READ+WRITE end-to-end with its own
emulator tests, independently shippable + green on its own. Proposed slices
(plan-phase finalizes exact split/numbering):
- **v11-05-01** — templates (read/list + write scoping)
- **v11-05-02** — roster/musicians (`users`, `scheduling_assignments`, `musician_availability`)
- **v11-05-03** — congregation + service-personnel
- **v11-05-04** — CreationWizard in-app `orgId` stamp + vocab de-synagoguing
  (CreationWizard / perform-view / display-card)
(Chosen over v11-02's two-horizontal-pass pattern to keep blast radius per commit small.)

### Decision 2 — Backfill: **audit + idempotent backfill per collection, BEFORE flipping its read filter**
The scoped reads use equality `where('orgId','==','crc')`; any existing CRC doc
lacking `orgId` silently vanishes from CRC's surface = the **CRC-lockout STOP
condition**. So for EACH collection: (a) dry-run count of unstamped docs, inspect,
(b) stamp `orgId='crc'` on legacy docs with an idempotency marker + a rollback path,
(c) THEN flip the read filter. Extends the v11-01-03 setlists/songs backfill pattern.
Runs as an AUTO task (single owner = the executor), dry-run inspected before `--apply`.

### Decision 3 — Vocab: **include in this phase**, band vocab for BL, CRC unchanged
Reuse `label(org,key)` / `hidesLiturgicalFields()`; no new vocab mechanism.

---

## Key seams / files (verified against deployed code 2026-06-09)

| Seam | Location |
|------|----------|
| Caller-org (MCP): `orgFrom`/`rowOrg`/`stampOrg` | `src/lib/mcp/org-context.ts` |
| Host→org (web): `coerceOrgId` (validates an org id) / `resolveOrgIdByDomain` (host→org) | `src/lib/org/registry.ts` |
| Client org: `useOrg()` / `OrgProvider` | `src/lib/org/org-context.tsx` |
| Vocab helpers: `label(org,key)`, `hidesLiturgicalFields()` | `src/lib/org/vocab.ts` |
| In-app setlist create (NO orgId today — the gap) | `src/lib/setlist-firebase.ts:189`; caller `src/hooks/use-creation-wizard.ts:~221` |
| MCP setlist create (already stamps) | `src/lib/mcp/tools/setlist-write.ts:110` |
| Setlist read filter precedent (`where('orgId','==',org)`) | `src/lib/server-setlists.ts` (lines ~53/87/146/236) + `setlist-firebase.ts:299` |
| Backfill precedent | `src/lib/org/backfill-orgid.ts` (v11-01-03) |
| Reusable isolation probe (for v11-06) | `scripts/e2e-bl-tenant-probe.mjs` (DAVID_BEARER + CRC_BEARER) |

---

## Open questions for /paul:plan to resolve

- **Exact collection inventory per slice** — confirm the precise Firestore
  collection/doc paths and every read/write call site for templates, roster
  (`users` is large — confirm which queries surface it cross-tenant), congregation,
  service-personnel. Grep each before scoping; do NOT trust this list as exhaustive.
- **`users` scoping nuance** — a user may belong to >1 org (David's claim is
  `orgIds:['brotherslazaroff']` by MERGE; CRC accounts have crc). Roster scoping must
  filter by membership, not assume single-org. Confirm the membership shape
  (`src/lib/org/membership.ts` `getPrimaryOrgForMinting`).
- **Backfill blast radius** — dry-run counts per collection drive whether a slice is
  trivial (0 unstamped) or needs a real migration. Plan inspects dry-run first.
- **Firestore rules + composite indexes** — each new `where('orgId','==',…)+orderBy`
  may need a deployed composite index (the `(orgId,date)` index precedent). Enumerate
  + `firebase deploy` as an AUTO task.
- **Templates read surface** — is it MCP-only (`list_templates`) or is there a web
  template picker that also reads cross-tenant? Confirm before scoping.

---

## Constraints / quality floor (v11.0 autonomy directive — Daniel 2026-06-08)

- Run autonomously: auto-proceed plan→plan & phase→phase, auto-commit per phase +
  push to prod `master`, bake decisions into PLANs.
- **Mandatory/blocking:** tsc clean + full suite green + AC proof every task;
  **emulator-backed rules tests** for this data-layer phase; backfills get dry-run +
  idempotency marker + rollback (inspect dry-run before `--apply`).
- **STOP only for:** product ambiguity, an unresolvable quality-gate failure, or a
  discovered cross-tenant **LEAK / CRC lock-out** risk.
- `err-public` invariant still holds: never gate data from musicians/performers
  WITHIN a tenant — scoping is cross-tenant only.
- Deployed-surface probe mandatory for any host→org seam (CRC-default masks BL
  misresolution; no-local-dev → prod is the only place it shows).

---
*CONTEXT.md — persists across /clear. Next: /paul:plan*
