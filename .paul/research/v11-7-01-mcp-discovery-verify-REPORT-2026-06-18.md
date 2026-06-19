# v11.7-01 — MCP Read/Discovery-Gap Audit: Verify-First Report

**Date:** 2026-06-18 · **Phase:** v11.7-01 (DISCOVERY, verify-first) · **Method:** read-only code verification of deployed MCP source (3 parallel Explore agents), every verdict cited `file:line`. No production code touched.

**Headline:** The audit's P0–P3 behavior claims are **all CONFIRMED**. Two assumptions are **corrected**: (1) `library_signals` is NOT a Firestore collection — it's an in-process event emitter, so P5 is **not cheap**; (2) the `delete_chart` reference-walk lives in `library-upload.ts`, not `setlist-write.ts`. Net scope effect: **P0/P1 committed as planned; the P2–P5 sweep trims to find_setlists_from_template + find_contact (cheap); list_recent_commands (P4) + list_recent_library_changes (P5) are BLOCKED on new infra → defer to v11.8.**

---

## CONFIRMED / REFUTED — per claim

| # | Claim (current behavior) | Verdict | Evidence |
|---|---|---|---|
| P0-1 | `list_musicians` filters on `musicianProfile.instrument` (instrument-less users invisible) | **CONFIRMED** | `roster.ts:114–126` `buildMusicianRow` returns `null` if `!instrument`; applied `roster.ts:227–231` |
| P0-2 | `suggest_musicians`/`suggest_band` draw the same instrument-gated pool | **CONFIRMED** | `roster.ts:660–670` + `797–859` both call `buildMusicianRow` |
| P0-3 | `get_musician_profile` requires a uid you already hold | **CONFIRMED** | `roster.ts:271–318`, arg is `{uid}` only; direct doc lookup |
| P0-4 | write tools (`assign_musician`/`assign_monitor_bus`/`unassign_monitor_bus`/`respond_to_assignment`) take an arbitrary uid, no resolver | **CONFIRMED** (✱ `respond_to_assignment` gates on `assignment.musicianUid === callerUid`, no uid arg) | `roster.ts:925–1043`, `monitor-observability.ts:120–349` |
| P1-1 | no tool for "which setlists reference chart X / songId Y" (brute-force today) | **CONFIRMED** | absent from `index.ts` |
| P1-2 | `delete_chart` refuses on reference + walks an index internally | **CONFIRMED** | **`library-upload.ts:787–846`** — `tracks where fileId==` → distinct `setlistId` → `getAll` parent setlists → live-only count |
| P1-3 | `search_library`/`search_chart_text` scope the LIBRARY not setlists | **CONFIRMED** | `library.ts:295–464` (songs + library_index); `chart-text-search.ts:99–356` (library_index + chordData) |
| P1-4 | no `search_setlists` by trackTitle/leadMusician/templateType | **CONFIRMED** | absent from `index.ts` |
| P2-1 | cloned setlists carry `sourceTemplateId` | **CONFIRMED** | `templates.ts:878` (+944, 987) |
| P2-2 | no reverse `find_setlists_from_template` | **CONFIRMED** | absent |
| P2-3 | `delete_template` does NOT cascade | **CONFIRMED** | `templates.ts:561–599` + comment `:772` (downstream setlists independent) |
| P3-1 | `create_contact` dedupes by email server-side | **CONFIRMED** | `contacts.ts:106–122` (in-memory case-insensitive scan over org) |
| P3-2 | `list_contacts` has no filter param | **CONFIRMED** | `contacts.ts:60–75` |
| P3-3 | no `find_contact` | **CONFIRMED** | absent |
| P4-1 | `get_command_status(commandId)` needs a captured commandId | **CONFIRMED** | `monitor-observability.ts:83–116` reads `monitor-live/commands/acks/{commandId}` |
| P4-2 | command acks TTL-swept ~5min | **CONFIRMED** | `bridge-housekeeping.ts:22` documents `ACK_TTL_MS = 5min`; acks at `monitor-live/commands/acks/{id}`, `CommandAck` shape `server-monitor.ts:372–388` |
| P4-3 | no `list_recent_commands` | **CONFIRMED** | absent |
| P5-1 | `library_signals` is a queryable broadcast backing a change feed | **REFUTED** | it's an **in-process event emitter**, not Firestore — `library-events.ts:85–105` (`onLibraryRowCreated`); no persistent log to query |
| P5-2 | no `list_recent_library_changes` | **CONFIRMED** | absent; `list_review_queue` is admin-only coarse buckets (`library-review.ts:188–274`) |

---

## Asymmetry inventory (feeds 02–07)

| Tool | Data source | Query path | Tenant seam | Gating tier | Feasibility |
|---|---|---|---|---|---|
| **find_user** (P0) | `users` collection (uid/displayName/email/role/musicianProfile.instrument/.schedulingTier/orgIds) | by-role `where role in [...]` ✓ live; by-email exact = in-memory filter (or new `(orgId,email)` index); by-name substring = collection scan + app-side (no index path) | `orgFrom(extra)` + in-memory `rowOrgIds(...).includes(org)` — proven, no leakage (`org-context.ts:28–46`) | `assertEditor` (admin\|band_leader), matching roster reads | **CHEAP–MEDIUM**: role/email viable now (email via in-memory filter at current scale); name substring = scan (document as app-side). **Drop the instrument gate.** |
| _interim_ `includeProfileless` on `list_musicians` | same | drop `if(!instrument) return null` when flag set | same | same | **CHEAP** (~10 lines) — unblocks David immediately |
| **find_setlists_referencing_chart** (P1) | `tracks where fileId==` → live-parent filter | **surface the existing `delete_chart` walk** (`library-upload.ts:787–846`) | setlist/track orgId scope | editor tier | **CHEAP** — ~30-line wrapper, **zero new index** |
| **search_setlists** (P1) | top-level `tracks/{id}` (setlistId FK; title/leadMusician/templateType are top-level fields — `server-tracks.ts:15–18`) | server-side needs composite index on `tracks`; OR app-side filter over `list_setlists`→`get_setlist` | orgId | editor tier | **MEDIUM** — at current scale (≤~50 setlists) **app-side filtering is acceptable**; new index only if it becomes a bottleneck (see Index Decision) |
| **find_setlists_from_template** (P2) | `setlists.sourceTemplateId` | `where orgId== && sourceTemplateId==` | orgId | editor tier | **CHEAP–MEDIUM** — needs new composite index `setlists (orgId, sourceTemplateId)` |
| **find_contact** (P3) | `contacts` (dedupe path already reads it) | `email`/`nameContains` where-clause | `rowOrg` wall (existing) | `assertEditor` | **CHEAP** |
| **list_recent_commands** (P4) | acks are ephemeral (`monitor-live/commands/acks`), TTL ~5min, **no createdAt, not indexed, not org-scoped** | would need a NEW append-only `command-log` collection + bridge write path + index | n/a today | `assertMonitorAccess` | **BLOCKED → DEFER (v11.8)** — requires bridge changes, not an MCP-only add |
| **list_recent_library_changes** (P5) | `library_signals` is in-process only (`library-events.ts`); no persistent rows | would need a NEW persistent `library_changes` collection written by `processChartUpload` + `(orgId, createdAt)` index + TTL | would be orgId | admin (mirror `list_review_queue`) | **BLOCKED → DEFER (v11.8)** — new persistent collection + write path |

---

## search_setlists INDEX DECISION (AC-3)

- **Tracks are a top-level `tracks/{id}` collection keyed by `setlistId`** (`server-tracks.ts:15–18`), not embedded — so trackTitle/leadMusician ARE server-queryable in principle.
- Existing `setlists` indexes (`firestore.indexes.json:18–43`): `(ownerId, date DESC)`, `(orgId, date DESC)`. No `(orgId, createdAt)`, no `(orgId, sourceTemplateId)`, no track-content index.
- **Decision:** for v11.7-03, **start with app-side filtering** (enumerate via the existing `list_setlists`/reference-walk pattern, filter tracks in code) — acceptable at the current catalog scale (≤~50 setlists). Add a composite index **only if** 03 planning judges the scan too costly. **find_setlists_from_template (P2/04) DOES want a new index** `setlists (orgId, sourceTemplateId)` — small, deploy via `firebase deploy` as an AUTO task when 04 ships it. No index work in this phase.

---

## v7.0 fold-forward re-triage (AC-3)

11/13 items still live (≈70% valid), dominated by **in-app library UI tech debt NOT touched by the v11.x MCP/multi-tenant work**: ImporterModal P3 polish + `extractApiError` unification + 40px→44px touch targets (in-app), dead TanStack block in `SetlistGrid` (1797 lines), 3-route doc-import collapse, unused `Recording.durationSeconds`, `recordings/upload` missing caps, `inferServiceType` short-circuit, test-coverage gaps (commit-document handler + ImporterModal). Obsolete/handled: Perform-surface 44px (hardened in v11.x). **Routing:** these are a coherent cluster for **phase v11.7-06** (infra/hygiene) — pull in the cheap ones; the SetlistGrid/doc-import refactors are larger and can stay backlog. Note: `/api/drive/file` weak-auth was a DELIBERATE v70-08-02 non-fix (out of scope), not a regression.

---

## Ready-to-plan verdict per downstream phase

| Phase | Verdict | Notes |
|---|---|---|
| **02 — P0 find_user** | ✅ READY | Drop instrument gate; role+email viable now; name=app-side; `assertEditor` + tenant in-memory filter. Consider shipping the `includeProfileless` interim in the same plan. |
| **03 — P1 setlist reverse-lookup** | ✅ READY | `find_setlists_referencing_chart` = surface the `library-upload.ts:787–846` walk (cheap, no index). `search_setlists` = app-side filter first; index optional. |
| **04 — P2–P5 sweep** | ⚠️ READY, TRIMMED | Commit **find_setlists_from_template** (+ index `(orgId,sourceTemplateId)`) and **find_contact** (cheap). **DEFER list_recent_commands (P4) + list_recent_library_changes (P5) → v11.8** — both need new persistent/bridge infra, not MCP-only adds. Log the deferral. |
| **05 — F3 library density** | ✅ READY | unchanged (UI; /ui-ux-pro-max blocking) |
| **06 — infra org-scoping** | ✅ READY | known gaps (recordings/finalize/anon chord-cache org-scoping) + fold the cheap v7.0 in-app hygiene items |
| **07 — broslaz design pass** | ✅ READY | unchanged (UI; /ui-ux-pro-max blocking) |

**No production code changed this phase** (read-only audit; verified via the agents' read-only tooling).
