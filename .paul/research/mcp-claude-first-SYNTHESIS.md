# MCP Claude-First Eval — Synthesis

**Date:** 2026-05-15
**Author:** Claude Opus 4.7 (this conversation)
**Sources:**
- Codebase pass: `.paul/research/mcp-claude-first-codebase-FINDINGS.md`
- Cowork attempt: `.paul/research/mcp-claude-first-cowork-REPORT.md`
- Targeted re-run pending: `.paul/research/mcp-claude-first-cowork-RERUN-PROMPT.md`

---

## Executive verdict

The Claude-first leader workflow vision is **viable, but blocked behind a small, well-defined cluster of MCP additions.** Both passes — cowork attempting live tasks via MCP, and the codebase walk over leader-side UI surfaces — converge on the **same six missing tools** as the highest-leverage gaps. None of them are research projects; all of them are wrapping jobs on top of existing server-side code paths the UI already calls. Estimated 2-4 weeks of focused work flips the speed inversion: today the UI beats MCP on speed for any task touching >3 rows; with the cluster shipped, MCP beats the UI for the 90%-of-weeks clone-and-tweak workflow, the document-driven import, and the publish/notify endgame.

The frontend doesn't become a pure read-only shell. It becomes **spatial-only** — drag-reorder grids, the calendar, the BatchActionBar multi-select for >20-row edits — plus performance and library browse views. Roughly **3000-4000 LOC of editor-side surface area can credibly retire** as the cluster ships and matures.

One pre-existing data-vocabulary bug surfaced incidentally and should be fixed regardless of where the eval lands: AddBar writes `type: 'section'`, but MCP + importer + performance view + templates all use `'header'`. UI-added section headers render as plain song rows in the performance view today.

## Stale-cache caveat

Cowork's report claimed `delete_chart`, `get_matrix`, and the widened `add_track_to_setlist.type` enum were missing from the live MCP. **All three are live** on `master` (commit `6fe3de2e`) and deployed on Vercel — verified by reading `src/lib/mcp/tools/index.ts` directly. Cowork's connector had a stale tool-discovery cache from before the Wave 4-5 ship. A targeted re-run prompt is staged at `.paul/research/mcp-claude-first-cowork-RERUN-PROMPT.md` to refresh discovery and tighten three task verdicts (T1 clone fidelity, T4 semantic inserts, T7 library cleanup). The re-run is small (~15 min cowork time) and doesn't change the headline priorities below.

The affected findings are clearly tagged `[STALE-CACHE]` throughout this synthesis so future readers can distinguish "the tool was missing" from "the tool was present but cowork couldn't see it".

---

## High-confidence priorities (both passes agree)

The six missing tools below appear in both cowork's wishlist and the codebase coverage matrix. Both passes ranked them as critical or high-severity.

### Tier 1 — Ship next (per-row edit + clone, ~1-2 weeks)

**1. `update_track(setlistId, trackId, patch)`** — the single most consequential gap.

- **Cowork evidence:** bit T2 (bulk vocal-lead — 26 tool calls including a real partial-failure cliff cowork had to manually recover from), T9 (reassign Daniel→Randy), T1 (no way to override library-title when songId is passed). "**The single most consequential gap of this entire eval.**" — cowork verbatim.
- **Codebase evidence:** GAP A-8 (CRITICAL). The editor's inline cell-edit (key, lead, notes, title, type) has no MCP path; every cell change requires remove + re-add today, which loses `trackId` identity and breaks anything holding a reference (rehearsal app, sync state, future comments-on-track).
- **Signature:** `update_track(setlistId, trackId, patch: {key?, leadMusician?, title?, notes?, type?, songId?, referenceLink?, position?})`. Idempotent. Returns the updated row.
- **Complexity:** LOW. Server-side it's a single Firestore doc patch + the parent setlist's `updatedAt` bump. Adds a new tool function in `src/lib/mcp/tools/setlist-write.ts` and a `server-tracks-write.ts::updateTrack` helper.
- **Safety:** none specific; idempotent by design. Add a Firestore rule check for editor role (same as add_track).

**2. `bulk_update_tracks(setlistId, patches: Array<{trackId, patch}>, mode?: "atomic" | "best-effort")`** — pairs with `update_track`; protects against the partial-failure cliff cowork hit live.

- **Cowork evidence:** T2's connector-timeout partial-failure (Adon Olam removed but not re-added → cascading reorder swap → manual reconciliation). E2E step 2 hit the same class of failure on Shalom Alechem. In the UI this category of error is invisible because each cell edit is independent; via MCP, batches need atomicity.
- **Codebase evidence:** GAP A-11. BatchActionBar in the UI is a major leader affordance for multi-select bulk type/key/lead.
- **Signature:** atomic mode runs all patches in a single Firestore transaction (best-effort returns per-row results). Add `dry_run` flag for preview. Add `max_affected` cap.
- **Complexity:** LOW-MEDIUM. Server-side loop or Firestore batch write.
- **Safety:** atomic mode default. `dry_run: true` returns `{willAffect: [...], willFail: [...]}` without writing.

**3. `clone_setlist(sourceId, options)`** — closes the 90%-of-weeks bullseye.

- **Cowork evidence:** T1 took 22 tool calls and ~90s of latency; in the UI Daniel clones in ~30 seconds. "**This is the bullseye-flow gap.**" Also bit the E2E (modeling "similar to last week" without a clone primitive).
- **Codebase evidence:** GAP A-2 (CRITICAL). The dashboard's `handleCloneNextWeekClick` is THE 90%-case workflow per auto-memory.
- **Signature:** `clone_setlist(sourceId, {name, eventDate?, serviceType?, rabbi?, overrides?: {keysByPosition?, leadsByPosition?, removePositions?, replacePositions?: [{position, songId?, title?}]}})`. Optional `dry_run` returns the planned tracks without committing.
- **Complexity:** MEDIUM. Server-side deep-copy of tracks + override layer. Pairs naturally with `update_track` for post-clone tweaks.
- **Safety:** atomic write (all tracks or nothing). `dry_run` default for first call.

**4. Widen `add_track_to_setlist.type` enum** + fix the `section` vs `header` vocabulary bug.

- **Cowork evidence:** [STALE-CACHE] cowork couldn't see the widened enum, so T1's clone lost reading/prayer fidelity and T4's inserts came back as `type:'song'`. The re-run will confirm the widened enum (already shipped Wave 5 G-10) closes this.
- **Codebase evidence:** BUG A-10 (HIGH). The widened enum is shipped, but the UI's AddBar writes `type: 'section'` while MCP + importer + templates + performance view all use `'header'`. Same data field, two vocabularies. `SetlistRow.tsx:29` only matches `'header'`, so UI-added section headers **render as plain song rows in the performance view today.**
- **Action:** TWO separate fixes:
  - a. Codify which vocabulary wins (recommend `'header'` since it matches templates + performance + importer + MCP), then either rewrite AddBar's `'section'` writes to `'header'` OR add a server-side normalizer that aliases `'section'` → `'header'` on every track write.
  - b. Backfill: a one-time script that converts existing `type: 'section'` rows in Firestore to `type: 'header'`. Low-risk; identical render in MobileRowCard (which already accepts both).
- **Complexity:** LOW. Both the alias normalizer and the backfill are <100 LOC each.
- **Safety:** the backfill is one-way (`section` → `header`); easy to reverse if it surfaces a problem. Audit-log the backfill run.

### Tier 2 — Ship within one cycle (end-of-week + safety, ~1 week)

**5. `publish_setlist(setlistId, options)` with dry-run default** — closes the chat-first endgame.

- **Cowork evidence:** T10 confirmed gap. E2E hit `[UI-FALLBACK]` at the final step: "this single missing tool collapses the chat-first narrative right at the finish line — every weekly cycle ends with this handoff."
- **Codebase evidence:** GAP A-16 (CRITICAL). PublishDialog has rich semantics (per-musician email opt-out, subject preview, isPublished badge, notified/emailed/usageRecorded tracking). The UI flow already wraps `/api/setlist/publish`.
- **Signature:** `publish_setlist(setlistId, {recipients?: string[] | "band", channel?: "email"|"slack"|"sms", note?: string, subject?: string, includeChartsPdf?: bool, includeRehearsalLink?: bool, dry_run?: bool = true, scheduleSendAt?: ISO})`. Returns recipient list + rendered email preview on dry-run; actually sends only on explicit `dry_run: false`.
- **Complexity:** MEDIUM-HIGH. Email-template integration + roster resolution + chart-bundle PDF. Most of the server logic is already in `/api/setlist/publish/route.ts`; this wraps it for MCP.
- **Safety:** **CRITICAL.** Emails are irreversible. Default to `dry_run: true`. Require explicit `dry_run: false` to send. Echo the rendered email + recipient list in the dry-run response so the caller can confirm.

**6. Soft-delete model: `delete_setlist({id, softDelete: true})` default + `restore_setlist(id)` + `list_setlists({includeDeleted?})`** — closes the recovery gap.

- **Cowork evidence:** T11 confirmed `delete_setlist` is hard delete with no recovery. "Combined with the absence of `clone_setlist`, this is a real safety hole: a misclick on a long, hand-curated setlist would force Daniel to rebuild from scratch."
- **Codebase evidence:** Pass C top-priority. Also: `delete_chart` is hard delete while the UI archives (status: 'archived') by default — same posture mismatch.
- **Signature:** `delete_setlist({id, softDelete?: bool = true})`, `restore_setlist({id})`, `list_setlists({includeDeleted?: bool = false})`. Set a `deletedAt` field on soft-delete; 24-72h purge job hard-deletes after the window.
- **Apply to charts too:** `delete_chart({fileId, softDelete?: bool = true})` + `restore_chart({fileId})`. Matches the UI's archive-by-default posture.
- **Complexity:** LOW (a deletedAt field + filter + scheduled-function purge).
- **Safety:** audit-log every soft + hard delete. The purge job is the only irreversible step; window-bound it.

### Tier 3 — Ship as roadmap permits (context + scheduling, ~2-3 weeks)

**7. `get_congregation_context()` → {rabbis, vocalLeads, instruments, templates, recentSongs, bandRoster}** — closes 8+ hidden-context gaps in one tool.

- **Cowork evidence:** "[CONTEXT-GAP observed throughout:] the MCP doesn't surface band rosters, recent rehearsal attendance, or 'who usually leads X'." Bit T1, T2, T9, E2E. Cowork's wishlist item 9: `list_musicians()` + `recent_leads_for_song(songId)`.
- **Codebase evidence:** Pass B items B-1 through B-6 + B-11 + B-15 — all closeable by one well-shaped tool.
- **Signature:** `get_congregation_context()` returns a compact JSON blob with `{rabbis: [...names], vocalLeads: [...names], instruments: [...names], templates: [{id, name, type}], recentSongs: [{songId, title, performedCount, lastPerformedAt}], bandRoster: [{uid, name, instrument, email}]}`. Optionally `get_song_lead_history(songId)` returns the per-song "who has led this and when" history.
- **Complexity:** LOW. The data already lives in `congregation-store` + `liturgical-templates.ts` + `SongRecentEntry.performedAt`. This is a denormalized read tool.
- **Safety:** read-only. No per-user gating beyond MCP's existing auth.

**8. Scheduling cluster: `list_assignments`, `assign_musician`, `unassign_musician`, `suggest_musicians`, `suggest_band`** — closes the entire scheduling subsystem.

- **Cowork evidence:** T9 partial — schedule inspection worked via `list_setlists`+`get_setlist` (after cowork inferred how), but the reassignment had no MCP path. Cowork didn't probe further.
- **Codebase evidence:** GAPs A-15, A-25..A-33. Currently all UI-only via `/api/scheduling/*`.
- **Signature:** mirrors the API routes:
  - `list_assignments({setlistId? | musicianUid? | dateRange?})` — read.
  - `assign_musician(setlistId, musicianUid, instrument?)` — write.
  - `unassign_musician(setlistId, assignmentId)` — write.
  - `suggest_musicians(setlistId)` — AI suggest.
  - `suggest_band(setlistId)` — AI suggest full band.
- **Complexity:** MEDIUM. 4-5 tools; wraps existing API routes. The suggest tools may need Gemini integration if not already there.
- **Safety:** assignment writes notify musicians; mirror the same notification semantics as the UI. Probably needs a `notify_immediately: bool = true` flag.

**9. Document-driven import: 3 tools per cowork's T8 design** — closes v7.0's flagship workflow.

- **Cowork evidence:** T8 design probe. Proposed: `import_document_to_outline(fileBase64, mimeType)` → `resolve_outline_to_library(outlineId, mappings?)` → `create_setlist_from_outline(outlineId, options)`. Layered API: simple case = one call, careful case = three.
- **Codebase evidence:** GAP A-6 (HIGH). 6-step pipeline in the UI (`extract-document` → `extract-structure` → `parse` → `resolve` → `commit-document` → `execute`).
- **Complexity:** MEDIUM. Mostly wrapping existing UI's pipeline. The three-tool layering cowork proposed matches the pipeline boundaries cleanly.
- **Safety:** `create_setlist_from_outline` requires an `confirm: outlineId` token. Low-confidence auto-matches surfaced in the response so Claude can flag them.

### Tier 4 — Quality-of-life additions (no rush)

**10. `get_chart_preview(fileId)` returning a thumbnail or first-page text** — closes the "which Lecha Dodi is this?" version-disambiguation gap.

- **Cowork evidence:** T5 picked Carlebach without seeing thumbnails; T1 silently got "Adon Olam (Folk)" when intent was generic "Adon Olam".
- **Codebase evidence:** Pass B-1 + the Pass C "title silently overridden" surprise.
- **Complexity:** MEDIUM. Probably already cached server-side for UI thumbnails.

**11. `search_chart_content(query)`** — lyrics + chord-body search.

- **Codebase evidence:** GAP A-23. UI has `/api/library/search-content`. MCP `search_library` is titles-only.
- **Complexity:** LOW-MEDIUM. Wraps the existing API.

**12. Template tools: `list_templates()`, `create_setlist_from_template(templateId, eventDate, overrides?)`, `save_setlist_as_template(setlistId, name)`** — closes the CreationWizard's template-instantiation gap.

- **Codebase evidence:** GAPs A-1, A-5, A-39. Pass B-6, B-11.
- **Complexity:** LOW-MEDIUM. Templates already live in `liturgical-templates.ts` + saved-template Firestore docs.

**13. `replace_chart(fileId, newFileBase64, newMimeType)`** — iterate on a chart without orphaning library entries.

- **Cowork evidence:** T6 wishlist item.
- **Complexity:** LOW.

---

## Disagreements between passes (worth Daniel's attention)

The two passes are mostly convergent. Two minor disagreements:

**Priority ordering of clone vs update_track.** My codebase pass put `clone_setlist` at #1 because it unblocks the 90% case. Cowork put `update_track` at #1 because every single edit hit the gap and it caused a real partial-failure mid-run. **Recommendation: ship update_track first** even though clone is the more leader-visible win — cowork's argument is right that update_track is foundational to everything else (clone-then-tweak benefits from it; bulk_update_tracks depends on it).

**Severity of bulk atomicity.** My Pass C audit treated partial-failure as MED severity; cowork rated it as the third headline gap of the eval because it experienced one live. **Recommendation: take cowork's read.** Bulk operations with no atomicity will burn leaders mid-workflow once they trust MCP; this needs to be solved BEFORE bulk_update_tracks ships, not after.

---

## Cowork-only findings (the codebase pass missed)

Three findings cowork surfaced that the codebase walk didn't catch:

1. **Connector-timeout / partial-success is a real production failure mode** (T2, E2E step 2). Strengthens the atomicity case for bulk ops. The MCP server should consider returning per-call idempotency tokens so retries are safe.

2. **Library version disambiguation is hidden** — multiple "Adon Olam" / "Lecha Dodi" entries with no preview. The UI shows PDF thumbnails; MCP returns metadata only. Pairs with Tier 4 #10 above (`get_chart_preview`).

3. **Liturgical-section structure isn't first-class** — T3 cowork inferred section anchors from header rows; a global reorder would break the service structure. Worth considering a `tracks.{type:'header'}.sectionAnchor: bool` or a `reorder_setlist({sectionAware: true})` mode that reorders only within sections.

## Codebase-only findings (cowork didn't probe)

Two findings cowork didn't surface (because it can't see the UI):

1. **BatchActionBar's multi-select-then-apply pattern is a UI-only affordance** that fundamentally doesn't translate to chat. Once `bulk_update_tracks` ships, the UI's batch surface could either retire OR be re-wired to fire MCP calls under the hood. The latter keeps the spatial UX while consolidating server-side write logic.

2. **The frontend-shrink ROI is real but not transformative.** ~3000-4000 LOC retirement once the Tier 1+2+3 cluster ships. Most savings: PublishDialog (~400), CreationWizard (~300), UploadDialog+ScraperModal (~400), SetlistDashboard write paths (~300), Schedule writes (~500), BatchActionBar (~250). Frontend doesn't become read-only — it becomes "spatial-only" (grids, calendars, drag-reorder, multi-select for very-large setlists) + performance/browse views.

---

## Prioritized roadmap (PAUL-phase sized)

Recommend grouping these as discrete PAUL phases. Each is sized to fit one focused 1-2 week phase with clear UAT criteria.

| Phase | Scope | Deliverable | Dependencies |
|---|---|---|---|
| **MCP-CF1** | update_track + bulk_update_tracks (atomic + dry-run) | 2 tools; closes per-row edit gap; resolves partial-failure cliff | none |
| **MCP-CF2** | clone_setlist | 1 tool; closes 90%-week bullseye | MCP-CF1 (for post-clone tweaks) |
| **MCP-CF3** | type-enum normalizer + `section`/`header` backfill | normalize on write + one-time backfill; ENG-only, no new MCP tools | none — can run in parallel |
| **MCP-CF4** | publish_setlist (dry-run default) + soft-delete + restore_setlist + restore_chart | safety + end-of-cycle | MCP-CF1 (publish_setlist payload uses per-track data) |
| **MCP-CF5** | get_congregation_context + get_chart_preview | hidden-context closure | none |
| **MCP-CF6** | Scheduling cluster (list_assignments, assign, unassign, suggest, suggest_band) | 5 tools; closes /schedule subsystem | none |
| **MCP-CF7** | Document-driven import (3 tools per T8 design) | 3 tools; closes v7.0 flagship | MCP-CF1 (resolved-outline rows benefit from update_track) |
| **MCP-CF8** | Templates (list_templates, create_setlist_from_template, save_as_template) | 3 tools; closes CreationWizard gap | MCP-CF2 (template-instantiation reuses clone primitives) |
| **MCP-CF9** | search_chart_content + replace_chart + library bulk ops | quality-of-life | none |

**Suggested order:** MCP-CF1 → MCP-CF3 (parallel) → MCP-CF2 → MCP-CF4 → MCP-CF5 → MCP-CF6 → MCP-CF7 → MCP-CF8 → MCP-CF9.

**Critical-path estimate:** MCP-CF1-4 (the speed-inversion-flip cluster) = ~3 weeks. After that, Claude beats UI for the 90% week and the publish endgame.

---

## Frontend-shrink staging (parallel to MCP work)

As each MCP-CF phase ships and stabilizes, the corresponding UI surface can retire. Suggested order — small wins first to build confidence:

1. **UploadDialog + ScraperModal** (already MCP-covered since Wave 3 + 5) → retire NOW. ~400 LOC saved.
2. **SetlistMetaEditSheet** (already covered by update_setlist Wave 1 + Wave 6 echo) → retire NOW. ~150 LOC.
3. **CreationWizard** → retire after MCP-CF8. ~300 LOC.
4. **PublishDialog** → retire (or shrink to read-only state display) after MCP-CF4. ~400 LOC.
5. **BatchActionBar** → re-wire to MCP after MCP-CF1 (don't delete; keep spatial selection, fire MCP under the hood). ~0 LOC saved but consolidates write logic.
6. **ImporterModal** → retire after MCP-CF7 and after cowork validates the doc-import flow. ~600 LOC.
7. **SetlistDashboard write paths** (clone-next-week, duplicate, save-as-template, transfer) → retire after MCP-CF2 + MCP-CF8. ~300 LOC.
8. **Schedule write paths** (assign UI) → retire after MCP-CF6. ~500 LOC.

**Total surface retirement:** ~2650 LOC of write surface. The corresponding read views (dashboard list, library browse, schedule view, calendar, perform/setlist preview) stay.

---

## Locked decisions (Daniel, 2026-05-15)

The five open questions are resolved. These constraints feed directly into the CF-phase plans.

1. **Soft-delete window: 72h.** Covers a Friday-misclick → Monday-morning notice cadence. Accumulates more filtered-list Firestore reads than 48h, but at CRC's scale (a few dozen setlists, hundreds of charts) the cost is negligible. Applies to both setlists and charts. The purge job hard-deletes at the 72h boundary.

2. **publish_setlist reuses `/api/setlist/publish`.** Wraps the existing route's body (same pattern Wave 3 used for `library/upload` and `charts/scrape`). Per-musician opt-out, Resend + push + SMS, isPublished/notified/emailed/usageRecorded tracking all carry over unchanged. The MCP tool surface adds dry-run default + recipient echo in the dry-run response.

3. **`header` wins; `section` retires.** Server-side normalizer aliases `'section'` → `'header'` on every track write (handles in-flight UI traffic during rollout). One-time backfill script rewrites existing Firestore rows where `type === 'section'` to `type === 'header'`. AddBar+TypeCell+BatchActionBar then refactor to emit `'header'` directly; the normalizer can stay as a defense-in-depth alias or retire after the UI refactor.

4. **`clone_setlist` signature: atomic with tweaks for common cases.** `clone_setlist(sourceId, {name, eventDate, overrides: {replacePositions, removePositions, leadsByPosition}})` — one tool call, atomic write. Anything more complex (key changes, type changes, custom titles, BPM edits) chains via `bulk_update_tracks` after.

5. **Document-import: ship both APIs.** Three-call layered pipeline (`import_document_to_outline` → `resolve_outline_to_library` → `create_setlist_from_outline`) per cowork's T8 design, plus a happy-path shortcut (`import_setlist_from_document(fileBase64, mimeType, options)`) that runs all three under the hood when no negotiation is needed. Both wrap the same server-side pipeline; the shortcut is a thin wrapper.

---

## Re-run confirmation (appendix)

The targeted re-run completed with a refreshed connector — all 22 tools visible, no missing schemas. Three stale-cache verdicts moved from "partial" to "yes":

- **T1R clone fidelity:** widened type enum fully closes the prior fidelity loss. 19-row source cloned row-for-row with `reading`/`prayer` rows preserved as first-class types. Confirms the Wave 5 G-10 widening is healthy in production.
- **T4R semantic inserts:** `V'ahavta` (reading) and `Niggun` (transition) round-trip correctly via the widened enum. No silent coercion to `song`.
- **T7R library cleanup:** all 11 leftover charts (2 EVAL + 9 STRESS) deleted via `delete_chart`. `search_library({query:"EVAL"})` and `search_library({query:"STRESS"})` both return `[]`. Library at baseline.

Plus two regression probes:

- **G-3 admin gate (Wave 4) confirmed healthy in production.** Admin upload to `core` and `supplemental` collections both succeeded; the upload response echoes the correct `collection` field; `delete_chart` reverses cleanly. Round-trip works end-to-end.
- **`get_matrix` confirmed reachable** with a live 6-matrix snapshot. X32 hardware is actually responsive (not offline as the prompt assumed) — bridge is serving live or recently-cached state. `matrixIndex: 99` is schema-rejected before reaching the server (tighter contract than expected). Worth a quick sound-team sanity check on bridge state.

Three small new findings to fold into the roadmap:

- **NEW: `get_song` doesn't echo `collection`.** Catalog placement is only legible via the original `upload_chart` response envelope; after-the-fact audit requires going back to that. Fix: add `collection` to the `get_song` response. Trivial; fold into MCP-CF5 alongside the chart-preview tool, OR ship as a tiny one-line patch immediately.
- **NUANCE: `clone_setlist` urgency reframed.** The 22-call clone in T1R completed without semantic loss, so the ask is now **"ergonomics + atomicity"** rather than "fidelity". Still high-priority (cowork's #3, my #1), but the framing changes: the value is one-call clone-and-tweak with atomic-or-nothing semantics, NOT correctness recovery.
- **CONFIRMATION: bridge is responsive.** Wave 4 G-1/G-2 PUNT decision (fire-and-forget caveats in tool descriptions, no MCP-side staleness guardrail) still stands. The bridge-side `x32Connected` flag is operational. Worth one cycle of "is the bridge actually serving fresh state or stale-cached?" — but doesn't unblock anything immediately.

Cowork's closing verdict: **all five top-priority missing tools (`clone_setlist`, `update_track`, `bulk_update_tracks`, `publish_setlist`, soft-delete) still stand as written.** The headline roadmap doesn't move.

---

## Status of artifacts

- ✅ Codebase findings doc committed (`6fe3de2e`).
- ✅ Cowork report received and analyzed.
- ✅ Re-run prompt + report both complete; appendix folded in above.
- ✅ Library swept to baseline (zero EVAL, zero STRESS).
- ✅ G-3 admin gate confirmed healthy in production.
- ✅ Wave 4 (`get_matrix`, `delete_chart`) + Wave 5 (widened type enum) confirmed reachable via refreshed connector.

The eval is complete. Next step is Daniel's call on which CF phase to start. CF1 (`update_track` + `bulk_update_tracks`) is the recommended first move — foundational for everything else, cowork witnessed the partial-failure cliff live, and it unblocks per-row edits which is the noisiest gap in the current MCP.
