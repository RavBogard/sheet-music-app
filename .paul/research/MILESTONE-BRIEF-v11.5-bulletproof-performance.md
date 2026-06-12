# Milestone brief — v11.5 "Bulletproof Performance" (2026-06-11)

**For:** `/paul:discuss-milestone`. Supersedes `RUN3-TRIAGE-2026-06-11.md`
(its items are folded in here). Sources: run-3 reports (M + B),
`DESIGN-AUDIT-2026-06.md`, `FEATURE-MCP-OPPORTUNITIES-2026-06.md`,
`DANIEL-WISHLIST-2026-06.md`. Oracle: ACCESS-POLICY v0.4.

## Ratified decisions shaping this scope (Daniel, 2026-06-11)

- **Doctrine:** bulletproof > novel; web app = performance + quick edits.
- **H2 foot-pedal page-turns: SKIPPED** ("not our thing").
- **H1 chart fit: auto-fit + per-chart calibration override.**
- **F2 in-Perform shared key change: FUNDED** (mid-service key changes are common).
- **Photo-of-paper-chart import: FUNDED in v11.5** (L-sized, own phase).
- Identity-deepening (mural-led CRC, BL swagger) is a **parallel Antigravity
  mockup track** — NOT in this milestone. See `ANTIGRAVITY-MOCKUP-SPEC-2026-06.md`.

## Phase 1 — Tenancy + anon correctness (P0/P1, smallest first)

1. **H4 — CRC header on broslaz** `/perform/setlist/[id]` (hard invariant-1
   leak): shared `DesktopHeader`/`MobileHeader` hardcodes `/logo.jpg` +
   "CRC Music" instead of `getOrgBranding(orgId)`. VERIFY FIRST which layout
   renders on detail vs list routes. Add a regression cell. (S)
2. **H5 — anon chord-cache path**: anon `GET` works but cache **write** 401s →
   recompute every load + console noise (includes run-3 B-10's PATCH 401).
   Align with D-Q2 (anon transpose open, rate-limited). (S–M)

## Phase 2 — The performance surface (the headline)

3. **H1 — landscape auto-fit + calibration override**: auto fit-to-width/height
   chooses per orientation; a leader-saved per-chart calibration (zoom/crop
   offset) overrides. Acceptance must include the real `.docx`-derived charts
   (evidence: literal-100% render wasting a third of the iPad). UAT across
   source types (MusicXML, clean PDF, scan, home-typeset). (M–L)
4. **F2 — in-Perform shared key change (leader-only)**: change the broadcast
   key (and optionally swap a chart) without exiting Perform. The authoring
   flow's autosave pattern is the model (it tested excellent). Distinguish
   clearly from per-device transpose. Leaders only; D6-style gating. (M)
5. **H7 — `/perform` cold-open performance + F1 "tonight" entry**: field p75
   LCP 2924 / FCP 3551 / TTFB 1632 / CLS 0.13 on the entry route while
   sibling routes are green. Root-cause TTFB first (server fetch), then the
   "big obvious tonight" entry treatment (route straight to the most-relevant
   set from cold open). (M)
6. **H3 — seekable audio**: HTTP Range support on the audio endpoint
   (run-3 B-11; wishlist "audio/recordings awkward"). (S–M)

## Phase 3 — Photo-of-paper-chart import (funded L)

7. **New MCP path: photo → normalized → bonded chart.** A leader photographs
   a paper chart; the system deskews/crops/normalizes to a stand-readable PDF,
   creates the library row (org-stamped, provenance "photo import"), and bonds
   it. Design questions for the plan phase: ingestion route (Drive-staging the
   photo is the natural transport — reuses the proven import path), server-side
   normalize pipeline, where AI assist fits (deskew/contrast vs full OCR —
   start with image normalization, NOT text OCR), and how H1's calibration
   model applies to photo-sourced charts. VERIFY FIRST what `scrape_chart_from_url`
   / `salvage_chart_bytes` infrastructure is reusable. (L)

## Phase 4 — Hygiene & harness (fold of run-3 triage + design findings)

8. M-11: `contact_not_found` → 404 (error contract). (S)
9. M-10: `publish_setlist` schema description → D8 contract. (S, doc)
10. Library hygiene: delete the two `[role-*] tiny` rows + the ingested
    `.DS_Store`; **isTest/junk filter on consumer library browse AND the
    bind-chart picker** (both confirmed showing junk); non-chart-file guard at
    ingestion; verify `delete_chart` for authors; consider `list_setlists({includeDeleted})`. (M)
11. H8: `cleanup_all_test_data` cascade releases monitor-bus assignments
    (orphaned uid on a real bus observed). (S)
12. F-8: `orgIds` option on `create_test_account` (cross-tenant authoring
    becomes harness-testable). (S)
13. M-12: chunked-upload session TTL → ~60 min + tool descriptions document
    Drive-staging as the primary agent path. (S)
14. Permanent test `.docx` fixture in the app Drive folder (unverified
    conversion branch from run 3). (S)
15. Band_leader-tier bearer for Daniel's Claude Code MCP config (three runs
    blocked on member-tier; document the setup). (S, ops)

## Phase 5 — Consumer polish quick wins (from the design audit)

16. Q3: branded, QR-aware error copy on both hosts ("This sign-in code expired
    or was used — ask for a fresh QR"). (S)
17. Q4: anon `/setlists` — hide write controls (invariant-6) + suppress junk
    drafts from the anon archive. (S–M)
18. Q5: chart titles never show raw filenames (".pdf"/".docx") on consumer
    surfaces. (S, data+display)
19. Q6: BL subtitle vocab "Public sets", not "Public setlists". (S)
20. F4: key badges on broslaz setlist rows (CRC has them; a transposing band
    needs them more). (S)

## Deferred (explicitly NOT this milestone)

- F3 library browse density/filters (M) — v11.6 candidate with search
  ergonomics (thumbnails, composer/recency metadata).
- F5 comms design layer — waits on the Antigravity mural/BL mockups.
- STATE's pre-existing candidates (recordings org-scoping, signed-URL
  org-stamp, SERVICE_TYPE_LABELS, v7.0 fold-forward) — discuss-milestone
  decides fold vs defer.
- Authed-broslaz design pass + cross-org leader wall UI check — next stress run.

## Verification expectations

Every fixed item gets a regression cell or test; H4 and the library-junk filter
get stress-prompt cells; H1/F2/photo-import get Daniel UAT on the real iPads
(7-tablet fleet) before milestone close. Per-executor BUG-ID ranges in any new
stress prompts.
