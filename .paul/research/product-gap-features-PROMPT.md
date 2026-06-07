# Lane product-gap-features — coder-6 — Product completeness gap research (READ-ONLY)

Daniel wants to know **what CORE FEATURES are MISSING** that would materially improve the product.
Your half: the functional / user-facing surface + workflow completeness. (coder-5 owns the
non-functional robustness/security half — don't overlap.)

**Lens: band-onboarding readiness + the weekly flow.** The product reality (from memory):
- Daniel **authors via Claude Desktop + MCP** (not the in-app UI) — clone last week's setlist → tweak
  a few songs (~90% same week to week) → publish.
- The **band consumes via Perform mode on 6 shared 11" iPads** — this is the bulletproof-critical
  surface for live Friday-evening / Shabbat-morning services.
- David Lazaroff is a 2nd band_leader; Randy contributes. MusicXML is the strategic chart format.

Judge missing features against "what does the weekly flow + a confident band onboarding actually
need," not abstract feature-completeness.

**Leverage the corpus — do NOT re-derive.** Ingest existing findings first, then find true gaps.

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-product-gap-features -b feat/product-gap-features a5d35f47f
cd ../sheet-music-app-product-gap-features
```
ACK; create `.coord/status/coder-6.md`. READ-ONLY — only write is your findings doc.

## §2 Ingest first
- `.paul/research/` cycle-1..9 reports + TRIAGE (prior feature/usability findings + POLISH backlog).
- The MCP status + weekly-flow + project facts in the CLAUDE.md memory and
  `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/`.
- SKIP the monitor subsystem (freshly audited + being fixed) — reference, don't re-survey.

## §3 Survey for MISSING FEATURES (functional gaps, not bugs)
- **MCP authoring surface (Daniel's flow):** what can't Daniel do via Claude that the weekly cycle
  needs? (templates, clone, publish, gig-packet, roster, library — what's the gap?)
- **Perform mode on iPad (the band surface):** what's MISSING for bulletproof live use on 6 shared
  iPads — setlist navigation, chart binding, transpose/capo, annotations, offline access mid-service,
  multi-iPad consistency, the "who's playing tonight" surface.
- **The weekly clone→tweak→publish cycle:** end-to-end, where are the friction/missing steps?
- **Library / charts:** MusicXML render+transpose completeness (strategic goal), import paths,
  dedup/enrichment gaps that affect users.
- **Onboarding UX** for 6 shared iPads (the band's first run), notifications/publish reach
  (in-app/push/email/SMS), roster/scheduling visibility.

Frame as **missing capabilities**, not defects (defects are the cowork sweeps' job).

## §4 Deliverable
`.paul/research/product-gap-features-FINDINGS.md`:
- **TL;DR** — the 3-5 highest-value missing features for band-readiness + the weekly flow.
- **Prioritized feature-gap map** — each: who-it-serves (Daniel / band / band_leader) · impact ·
  rough effort · **NEW vs already-known/deferred** (cite corpus if known).
- **Recommendations only** — no implementation.
- FACTS vs INFERENCES.

## §5 Seam with coder-5 (product-gap-robustness)
You own functional features + UX completeness. coder-5 owns reliability/security/dependability/
resiliency + infra/observability/backup. Boundary: "a missing capability/UX" = you; "it's not
reliable/observable/recoverable/secure" = coder-5. Don't duplicate. Both skip monitor.

Docs-only commit → FF-push (base a5d35f47f) → master-tip → SHIP-NOTICE (`from coder-6`). Tier-0
research; supervisor synthesizes with coder-5.
