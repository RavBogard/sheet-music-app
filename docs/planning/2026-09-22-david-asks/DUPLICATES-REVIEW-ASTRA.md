# Integration review of the duplicates report

September 22. Daniel reported the completed Cowork survey. The report is now present; the active implementation return says it was present at session start. This review clarifies evidence quality, not an additional approval gate for verified work already authorized.

## Correction before applying item 3

The report's LIKELY label is a candidate classification, not proof of duplicate content. L1/L2 have equal file sizes; L3/L4 have similar sizes. Neither condition proves that full chart content, arrangement, instrumentation, key, lyrics or annotations match. The handoff's intended deduplication must be based on confirmed equivalence before a row is retired or a bond moved.

The report says no fingerprint field exists because library listings did not return one. That conclusion is too broad. The audit W3 return explicitly records the completed content-hash pass for both tenants and the byte-identical Brothers Lazaroff pair. Use the existing hash-aware read/dedupe dry-run path or compare actual complete chart bytes/content. Do not rerun a backfill just because the listing projection omits hashes, and do not infer that Drive-hosted charts escaped the earlier pass from size coincidences.

## Disposition

- L1/L2: compare current full-content hashes or actual complete files. Equal size is only a lead. If equivalent, use the original handoff's current bond-count/canonical rule, not an unverified survey recommendation.
- L3/L4: compare complete charts, including revisions, page count, key, parts and annotations. If meaningful differences remain, keep both and report them for review. Do not silently reinterpret a small revision as redundant.
- POSSIBLE groups: unchanged hold; produce review evidence, no automatic merging. The report uses abbreviated IDs in many rows: resolve full unique identifiers, never pass abbreviated strings to a mutation.
- You're My Heaven (Tonight): explicit Daniel hold still applies even though prior evidence identifies equal bytes. The survey recommendation to keep one row does not lift that hold. Keep its separate PDF format too.
- Cross-tenant copies, alternate keys, text/PDF formats, full scores versus parts and morning/evening words are not duplicate records merely because they share a title or song.

If eligible equivalence cannot be established, mark the group unresolved and continue item 4; do not block useful independent work. If any report-only classification has already been applied, inspect the recorded undo run and resulting bonds immediately, compare full content, and recover any unproven merge with the existing audited undo mechanism while preserving intervening user edits. Report actual state rather than assuming either success or damage.

No mutation was performed by this review. The original per-item return remains the record of what the implementation session actually does.
