# Bet 2: chart lineage (versions, not siblings), backend and MCP

Evidence: `research/mcp-authoring.md` MCP-10, MCP-18 and MCP-19. Daniel's ruling (2026-10-31):
a revised chart applies to FUTURE setlists only. Past setlists keep their exact chart, played keys
are kept, and standing choices follow the new version.

## Goals
1. **Lineage on library rows.**
   - Add `lineageId` (the first version's fileId) and `supersedes` / `supersededBy` on
     `library_index` rows. The fields are additive.
   - The newest non-archived version of a lineage is its "current".
2. **Every intake path can declare a version:** `upload_chart`, the signed-URL and chunked
   finalize, `import_chart_from_drive`, `sync_chart_inbox` items, `save_scraped_chart` and
   `create_chart` (it already has `revisionOf`). Each takes `revisionOf:<fileId>`. The new row
   inherits `lineageId` and `partGroup`, and the old row gets `supersededBy` and is archived (still
   readable).
3. **Revision effects (fixes MCP-10).**
   - Only setlists whose eventDate is today or later re-point to the new version.
   - They keep the row's played key and title (`syncMetadata:false`).
   - Past setlists are untouched.
   - `service_standing` choices and profile rows pointing at the old fileId move to the new one.
4. **The dedupe refusal offers a version first (MCP-19).** When intake trips the 0.85 name dedupe,
   the `richError` lists the matching existing chart(s) and says to "pass `revisionOf:<fileId>`
   if this is a new version". `force:true` remains for a genuine sibling.
5. **One key rule on a chart change (MCP-18).**
   - `update_track{songId}` and `swap_chart` follow the same rule: keep the row's played key only
     when the author gave one; otherwise take the chart's written key.
   - Both return `keyChanged:{from,to}`.
   - Document the rule in both tool descriptions.
6. **Memory follows lineage.** History, the "usual" logic and `recall` resolve a fileId to its
   lineage's current version when filling a draft. Past setlists still show their exact fileId.
7. **Lineage back-fill.** An ops-only `backfill_chart_lineage` under F-05 (dryRun by default)
   proposes lineage links for obvious siblings: the same partGroup with names differing only by
   "v2", "updated", "DRAFT", "(updated PDF)" or a date. The dry run lists pairs; a real run needs
   `force:true`. The lead runs the dry run and decides.

## Rules
- Org-scoped everywhere (both tenants), with an emulator test proving the other tenant can't see
  or link.
- The Overlays contract fields are unchanged.
- Never choose a setting nobody chose; versions of the SAME chart only.
- New tools go into `tool-access.ts`. The back-fill also goes into `OPS_TOOLS`.
- Do NOT touch UI files (`src/app`, `src/components`). Another builder is restyling them.
