# W-002 — Trust calibration via specificity signals

**Status:** Planning doc, no code. Derived from `setlist-system-punch-list.md` §W-002 / L-004 / A-005.
**Author:** Claude (planning pass, 2026-05-16)
**Sister docs:** [W-001](W-001-agentic-ux-shape.md) · [W-003](W-003-library-hygiene.md) · [W-004](W-004-bidirectional-sync.md)

---

## 1. Problem framing

In the Chase session, Claude bonded the wrong Hashkivenu and the wrong Veshamru — both with full confidence — because the catalog entries were titled simply `Hashkivenu` and `Veshamru`. The agent had no signal that these were arrangement-ambiguous. A search for `Hashkivenu` returned a single hit; a single hit reads as "found it" to an LLM. The same pattern bit on a generic `Niggun` and an under-specified `Oseh Shalom (camp)`.

The system trusted the agent to be careful; the agent trusted the system to surface ambiguity. Neither happened.

The fix is to put *specificity* — how unambiguously a title points to one piece of music — into the catalog data the agent reads, then operationalize it in the propose-vs-commit interaction shape from W-001. Specificity is computed from features the catalog already has (title structure, count of similarly-named entries, last-used recency) plus content Daniel will enrich during W-003 (composer, arrangement). It doesn't require ML; it's a deterministic score.

Two related signals belong in the same `search_library` / `list_library` envelope upgrade:
- **`titleSpecificity`** — how specific the title itself is (0..1).
- **`siblingsInCatalog`** — how many other catalog entries share the normalized title stem. Single-match-with-generic-title is the highest-risk class from L-004.

This is upstream of the W-001 interaction loop: without these signals, "ask before committing on low-confidence" has nothing to key on.

## 2. Proposed scope

**In:**
- New optional fields on `library_index` entries:
  - `titleSpecificity: number` (0..1, computed at upload time or via backfill).
  - `composer?: string`, `arranger?: string`, `notationSource?: string` (structured, mostly populated by Daniel via W-003 enrichment campaign — but field shape is decided here).
  - `lastUsedInSetlist?: { setlistId, eventDate }` (denormalized, refreshed by a Cloud Function or `recordSongUsage` hook).
  - **`bondCorrectionHistory: { correctedTo: number, correctedAwayFrom: number, lastCorrectionAt?: string }`** (NEW 2026-05-16, supports W-001 learning loop). Pure counters. `correctedTo` increments when the rabbi swaps a flagged bond TO this entry during batch review; `correctedAwayFrom` increments when the rabbi swaps a flagged bond AWAY from this entry. Search ranking applies a small implicit bias: `+correctedTo × 0.05`, `-correctedAwayFrom × 0.05`, clamped. Specificity score is left alone — the bias lives in search ranking, not in the specificity number.
- **`titleContextHints` separate Firestore collection** (NEW 2026-05-16, supports W-001 learning loop). Records preferred-entry-per-context after N=3 consistent picks. Shape:
  ```
  titleContextHints/{normalizedStem}_{contextKey}: {
    stem: "hashkivenu",
    contextKey: "friday-evening",       // serviceType / templateType from setlist
    preferredFileId: "1abc...",
    picks: 3,                            // count of consistent picks
    lastPickAt: "<iso>"
  }
  ```
  Read at `search_library` / `list_library` time to surface the preferred entry as result position 0 when context matches. Updated by the Cloud Function trigger on `record_bond_correction` writes.
- A deterministic specificity scoring rule (decide here, implement in tactical pass). Inputs:
  - Has parens? +0.2.
  - Has hyphen-composer pattern? +0.2.
  - Has known liturgical-piece-only title (Hashkivenu, Veshamru, Mi Chamocha, Oseh Shalom, Adon Olam, Niggun, …)? -0.3.
  - Normalized title is unique in catalog? +0.2; if shared by ≥2 entries, -0.2.
  - Title has ≥3 tokens? +0.1.
  - Title is ALL CAPS or all-lowercase-with-underscore (`shalom_rav`)? -0.1 (low-effort uploads tend to be generic).
- `search_library` / `list_library` enriched response includes `titleSpecificity`, `siblingsInCatalog: number`, `composer`, `arranger`, `notationSource`, `lastUsedInSetlist`, plus the `fileHealthy` field the tactical chart-verify pass already shapes.
- Backfill plan: deterministic rule runs against every `library_index` doc; emits scores; writes a one-time migration. No backfill of composer/arranger here — that's Daniel's W-003 content work.
- Agent guidance (lives in the MCP server's `instructions` block + the W-001 AGENT-GUIDE doc): "If `titleSpecificity < 0.5` AND `siblingsInCatalog > 1`, stop and confirm before bonding. If `titleSpecificity < 0.3`, stop and confirm even on single match."

**Out:**
- Composer/arranger enrichment of the actual catalog rows — that's a Daniel content task (W-003), not engineering.
- Re-tokenizing search (L-003) — adjacent, separate fix; specificity doesn't require it.
- Any title-fixup UI in the browser app.
- ML-based "is this two arrangements of the same liturgical piece" — out of scope; deterministic features only.
- ML or scoring models on `bondCorrectionHistory` — these are integer counters with a fixed linear bias formula. No learning model, no decay schedule beyond what Daniel asks for if needed.

## 3. Explicit open questions for Daniel

1. ~~**Generic-title list — static array or Firestore doc?**~~ **ANSWERED 2026-05-16 (Daniel: "don't care, best practice"):** **Static array** in `src/lib/mcp/title-specificity.ts`, code-versioned and review-able. Rationale: the list of Reform liturgy pieces with multiple arrangement variants stabilizes fast (~20–30 entries), edits will be quarterly at most, and code-side keeps it diffable. Daniel can ask in chat to add an entry any time; takes minutes.

2. ~~**Specificity threshold — `< 0.5` or `< 0.6`?**~~ **ANSWERED 2026-05-16 (Daniel: "your call"):** **Start at `< 0.5`.** Natural midpoint, easy to reason about, instrumented from day one. Adjustment plan: if the flag-rate during the first 4 weeks of real use is `> 40%` of bonds (asking too often), tighten to `0.4`; if wrong bonds are still slipping through to publish, loosen to `0.6`. The threshold is a single constant in `title-specificity.ts` — re-tuning is a one-line PR.

3. **Should `update_track` emit a warning when bonding to a low-specificity songId without an explicit `acknowledgeAmbiguous: true` flag?** Server-side enforcement is strict; agent-side guidance is soft. Both is overkill. Pick one — I'd lean agent-side (avoid the dedup-style flag proliferation).

4. **What's the source of truth for `lastUsedInSetlist`?** Two reasonable answers: (a) `recordSongUsage` is already called on publish — extend it to write back to `library_index` (cheap, denormalized, slightly stale). (b) Compute on the fly by query (always fresh, slower). I'd default (a).

5. **Composer/arranger — free text or structured?** Free text is faster to populate. Structured (`composer: "Klepper"`, `arranger: "Freelander"`) is queryable. Recommend free text strings with no validation — Daniel knows the data better than any schema.

6. **Where does specificity show up in the band's iPad consumer view?** Default proposal: nowhere — it's an agent-facing signal. If you want it visible in chart-bind picker as a "this title is ambiguous" hint, that's a UI followup.

7. **`titleSpecificity` recompute trigger?** Options: (a) on upload only (drifts as catalog grows). (b) on upload + on any new entry that shares a normalized stem (cascades a recompute to siblings). (c) nightly Cloud Function over all entries. Recommend (b) — bounded blast radius, stays fresh.

## 4. Dependencies on tactical fixes currently shipping

**Update 2026-05-16 (parallel session shipped):**
- ✅ **L-001 orphan filter** — `verify_setlist_charts({markOrphaned: true})` + `search_library` orphan-hiding both shipped (commit `e4bea186c`). `siblingsInCatalog` will read from the now-orphan-aware index naturally.
- ✅ **L-003 search tokenizer normalization** — shipped (commit `845bee9d4`). Underscore/case/diacritic normalization is in place on both indexed names and queries. The `normalizedName` field used by `siblingsInCatalog` aggregation should reuse the same normalizer helper to stay in lockstep.
- ✅ **Tactical-fix files** (`file-fetcher.ts`, library tool files, etc.) — all settled at commit `b3f78850a`. W-002's specificity helper can land as a sibling file (`src/lib/mcp/title-specificity.ts`) and be invoked from `processChartUpload` in `library-upload.ts` without merge churn.

**Still open:**
- **L-002 ID canonicalization** — informally tied; if `siblingsInCatalog` counts by `normalizedName`, ID scheme doesn't matter. Decoupled.
- **W-001** is the consumer. No reverse dependency.

## 5. Effort estimate

**M (medium)**, slightly higher than the original estimate after folding in the learning-loop schema.

- Deterministic specificity scorer + unit tests: ~0.5 day.
- `library_index` schema additions (specificity + composer/arranger/notationSource + lastUsedInSetlist + bondCorrectionHistory) + backfill script + Firestore index for `normalizedName`-keyed sibling lookup: ~1 day.
- `titleContextHints` collection + Cloud Function trigger that aggregates correction events into hints after N=3 consistent picks: ~0.5 day.
- `search_library` / `list_library` envelope additions + ranking bias hook (`bondCorrectionHistory` linear bias + `titleContextHints` context-match boost): ~0.5–0.75 day. Coordinate file ownership with parallel session.
- `recordSongUsage` extension to denormalize `lastUsedInSetlist`: ~0.5 day.
- Hook into upload flow (call scorer + sibling recount on new entries): ~0.5 day.
- Emulator tests pinning specificity values + bondCorrectionHistory ranking bias + titleContextHints context-match: ~0.75 day.

Backfill of `composer`/`arranger` is W-003 (Daniel content time), not counted here. The bond-correction writes themselves are W-001's MCP tools (`record_bond_correction`), not counted here either.

## 6. Suggested sequence vs. other Ws

**Ship second**, after the parallel-session tactical fixes settle and before W-001.

Reasoning:
- W-001 (interaction shape) consumes specificity. Building W-001 first means hard-coding "always ask" or "never ask" — both wrong.
- W-002 is mechanical and self-contained. Low risk, high downstream value.
- Doing it second lets the tactical fixes' new `library_index` shape stabilize first, avoiding a merge churn on the same schema.

Order recap:
1. Tactical fixes (parallel session).
2. **W-002 specificity signals (this doc).**
3. W-001 interaction shape.
4. W-004 sync.
5. W-003 hygiene (mostly Daniel content; can run concurrent with 3/4).
