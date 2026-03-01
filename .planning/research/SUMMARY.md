# Project Research Summary

**Project:** CentralReform.Live — Outline & Stability Milestone
**Domain:** Worship music performance app (Next.js / Firebase / PDF pipeline)
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

CentralReform.Live is a purpose-built worship music management app for a synagogue worship team. This milestone targets three tightly scoped improvements: a redesigned printed service outline, a glanceable live performance view, and incremental TypeScript type-safety hardening. The app already has a mature stack (Next.js 16/React 19/Firebase/TailwindCSS 4/Zustand/pdf-lib), so this is an enhancement milestone, not a greenfield build. The single most important missing data element is a `tune` (arrangement) field on each SetlistTrack — nearly every downstream feature in this milestone depends on that field existing. The recommended approach is a strict bottom-up build sequence: data model first, editor UI second, live view third, print pipeline fourth, type safety last.

The central UX insight across all research is the "outline-first" shift. Competitors (Planning Center, OnSong, BandHelper) default to showing charts/lyrics as the primary performance view. CentralReform musicians use the service outline 90% of the time; charts are occasional reference. Making the outline the default performance screen — with chart access as a drill-down tap — is the primary differentiator of this milestone and directly replaces the Excel spreadsheet musicians currently bring to services. The printed PDF outline needs a corresponding redesign: wider columns, larger type, tune as a first-class column, and pagination for services over 25 items.

The biggest technical risks are all in the print pipeline: a cache hash that does not cover all cover-page fields (meaning musicians reprint and see stale data), cover page overflow for long setlists, and silent error swallowing on the publish/email route. These must be addressed in Phase 1 before any new features ship, because a Bat Mitzvah service failure is unrecoverable. Type-safety work (38 `as any` instances) is real but not time-sensitive and must be sequenced after features to avoid blocking the delivery deadline.

---

## Key Findings

### Recommended Stack

The core stack is locked and does not change for this milestone. The only package swap is replacing unmaintained `pdf-lib@1.17.1` with `@cantoo/pdf-lib@2.5.3` (identical API, actively maintained fork with SVG support). Adding `@pdf-lib/fontkit@1.1.1` enables TTF font embedding (Inter or Source Sans Pro), which is required for readable music-stand typography. All live-view and type-safety work uses existing dependencies — no other packages are added.

`@react-pdf/renderer` was evaluated and rejected: it has persistent, unresolved incompatibilities with Next.js App Router server-side rendering as of March 2026. `pdfmake` and Puppeteer were also rejected as overengineered for a single-page outline. The existing pdf-lib imperative drawing API is well-suited for this structured table use case; the recommended strategy is to improve it, not replace it.

**Core technologies (additions only):**
- `@cantoo/pdf-lib@2.5.3`: PDF generation — active fork of `pdf-lib`, identical API, SVG support
- `@pdf-lib/fontkit@1.1.1`: custom TTF font embedding — enables readable typography in printed outline
- `zod@4.3.6` (existing): extend consistent use across all API routes for request validation
- `@tanstack/react-virtual@3.13.18` (existing): virtualize the outline list in performance view for long setlists
- TailwindCSS 4 + Radix UI (existing): all live-view styling, no CSS-in-JS needed

**Critical version note:** Do not use `@react-pdf/renderer` in any Next.js App Router route handler — confirmed broken across Next.js 13/14/15/16 with no fix timeline.

### Expected Features

The feature research benchmarked against Planning Center Services, OnSong, and BandHelper. CentralReform already has strong foundations (drag-drop setlist editor, Firestore real-time sync, keyboard/foot-pedal navigation, dark performance mode, PDF print pipeline). The gap is in the performance and print output layers.

**Must have for this milestone (P1 — needed before Bat Mitzvah):**
- Tune/arrangement name field on each track — the single most critical missing data field; competitors treat this as a standard metadata column; CentralReform is the only app missing it
- Prominent key display in outline and print — already in data model, needs visual prominence
- Outline-first live performance view — scannable service order as the primary performance screen, charts as drill-down; no competitor optimizes for this workflow
- NOW/NEXT highlighting in outline view — `queueIndex` already exists; needs visual hierarchy in the redesigned outline
- Redesigned printed outline PDF — columnar format matching the Excel spreadsheet (song, tune, key, lead, section headers), readable from 2-3 feet on a music stand
- Section header rendering — already exists as `trackType: 'header'`; needs proper visual weight in outline views

**Should have after validation (P2 — add once outline is in use):**
- Lead-in/cue notes field (dedicated field, not just general notes)
- Tune library autocomplete (congregation-specific vocabulary of tune names)
- Per-musician transposed keys on printed outline (print pipeline already does this for charts)
- Cumulative time tracking per section (data already exists via `estimatedMinutes`)

**Defer to v2+ (P3):**
- Real-time outline sync across devices (HIGH complexity; Firestore infrastructure exists but feature layer does not)
- Liturgical section templates (partially built in `liturgical-templates.ts`; not blocking)

**Anti-features (explicitly not building):**
- MIDI integration — no MIDI rigs on the worship team
- Backing track player — live musicians only
- Lyrics projection / ProPresenter — congregation uses a siddur, not projected lyrics
- Auto-scroll / teleprompter — foot pedal navigation is more reliable
- Song requests during performance — liturgical services have fixed order

### Architecture Approach

The architecture is a 5-layer stack: Presentation (SetlistEditor, PerformView, PrintModal) → State/Hooks (Zustand, useSetlistLogic, queue-utils) → Type/Validation (models.ts, schemas.ts with Zod) → Data Access (setlist-firebase.ts, firebase-admin.ts) → Server/Job (API routes, Inngest, print-pipeline.ts). The canonical `SetlistTrack` type in `types/models.ts` is the single source of truth; Zod schemas in `types/schemas.ts` validate at every Firestore boundary.

The critical architectural finding is that `tune` — the foundational field for this milestone — must be threaded through all 7 layers explicitly: `SetlistTrack` type, `setlistTrackSchema`, `TrackSheet` editor, `SetlistPerformPage`, `QueueItem` + `toQueueItem()`, `PrintTrack` + `buildCoverPage()`, and `/api/setlist/print`. This is ~10 lines of changes spread across 5 files with zero migration risk (Zod `.nullish().catch(undefined)` handles existing documents cleanly). The outline-first performance view change is UI-layer only within `SetlistPerformPage` — the queue/navigation architecture stays unchanged.

**Major components:**
1. `SetlistTrack` (types/models.ts) — canonical data model; all changes flow from here
2. `setlistTrackSchema` (types/schemas.ts) — Zod validation at Firestore boundary; must mirror models.ts
3. `TrackSheet` (component) — track editor UI; add tune input here
4. `SetlistPerformPage` (page component) — live outline view; redesign to outline-first with expand/collapse
5. `buildCoverPage()` (print-pipeline.ts) — PDF cover page renderer; add tune column, fix pagination, fix cache hash
6. `toQueueItem()` (queue-utils.ts) — explicit field bridge from SetlistTrack to QueueItem; add tune mapping
7. `computeContentHash()` (print-pipeline.ts) — PDF cache key; must include all cover-page fields

### Critical Pitfalls

1. **Tune field missing from cache hash** — Adding `tune` to the data model but not to `computeContentHash` means musicians reprint and get stale PDFs. Must add `tune` (and a `CACHE_VERSION` sentinel) to the hash in the same commit as the data model change. This ships broken if not done together.

2. **Cover page overflow for long setlists** — `buildCoverPage()` silently truncates at `yOffset < 60`. Saturday morning services with 25-30 items lose items from the outline. Requires page-overflow logic (new cover page when yOffset is exhausted) before the redesigned outline is trusted by musicians.

3. **Live view tested on laptops, not music stands** — Current code uses `text-[10px]` for some labels. Stage use requires 16px minimum for primary info, 14px minimum for secondary. Physical test required: phone on music stand at 2-3 feet in dim lighting. If musicians give up on the app and return to printed Excel, rebuilding trust takes more time than getting the font sizes right the first time.

4. **Silent `.catch(() => {})` on publish route email** — If the Resend email delivery fails silently, musicians arrive at a Bat Mitzvah with the wrong setlist. The publish route must surface email failures to the UI. This is the highest-consequence bug in the codebase.

5. **Bulk `as any` removal breaks build** — 38 `as any` instances span 3 distinct root causes (Firestore Timestamps, Server/Client prop drilling, API shape mismatches). Fixing them all at once creates unreviewable diffs and compile failures. Fix one category per commit, feature files first, after features ship.

---

## Implications for Roadmap

Based on combined research, 4 phases are recommended. ARCHITECTURE.md's build order is the definitive guide — research across all 4 files converges on the same sequence.

### Phase 1: Data Foundation + Critical Stability

**Rationale:** The `tune` field is the prerequisite for every other feature. Cache hash bugs and silent publish errors are risks in every service until fixed. Zero-risk changes that unblock everything else. Must ship before any user-facing features.

**Delivers:**
- `tune?: string` added to `SetlistTrack`, `setlistTrackSchema`, `QueueItem`, `toQueueItem()`, `PrintTrack`
- `computeContentHash` expanded to cover all cover-page fields + `CACHE_VERSION` sentinel
- Publish route error surfacing for email delivery failures
- `initAdmin()` return value checked in all API routes (fail-fast with 503 instead of cryptic errors)

**Addresses (from FEATURES.md):** Tune field (P1 table stakes)
**Avoids (from PITFALLS.md):** Tune field migration gaps, cache invalidation misses, silent email failure on publish, Firebase Admin init not checked
**Research flag:** Standard patterns — no additional research needed. Architecture is fully specified.

### Phase 2: Outline-First Performance View

**Rationale:** This is the primary user-facing deliverable of the milestone. Requires tune data to exist (Phase 1). The performance view redesign is UI-layer only within `SetlistPerformPage` — no architecture changes needed. The risk is inadequate glanceability testing.

**Delivers:**
- `SetlistPerformPage` redesigned: tune name as hero text, key badge, lead musician, section headers with visual weight
- NOW/NEXT/UP NEXT hierarchy (current item full-size, next item medium, upcoming dimmed)
- Expand/collapse per track (show notes, reference link inline; chart via explicit "Open Chart" tap)
- Font size enforcement: 16px minimum for primary info, no `text-[10px]` for musician-facing content
- Physical testing: phone on music stand at 2-3 feet in dim lighting

**Implements:** `SetlistPerformPage` redesign, Zustand store tune propagation
**Avoids:** Live view unreadable at distance, chart-first anti-pattern
**Research flag:** No additional research needed. Pattern is specified in ARCHITECTURE.md. Testing protocol is the risk mitigation.

### Phase 3: Print Pipeline Redesign

**Rationale:** Can be developed in parallel with Phase 2 since both depend only on the Phase 1 data model. The print output is the other major deliverable — the physical music stand replacement for the Excel spreadsheet. Pagination and layout are the technical focus.

**Delivers:**
- `@cantoo/pdf-lib@2.5.3` replaces `pdf-lib@1.17.1` (identical API, active maintenance)
- `@pdf-lib/fontkit@1.1.1` added for TTF font embedding (Inter or Source Sans Pro)
- `buildCoverPage()` redesigned: tune column, larger type (12-14pt body, 16pt headers), section header visual weight
- Pagination: new cover page when `yOffset` exhausted (supports 30+ track services)
- Row numbering fix: separate song counter that excludes header rows
- Tune display: inline with song title ("Barchu (Friedman)") when tune present, no empty cells when absent

**Uses:** `@cantoo/pdf-lib`, `@pdf-lib/fontkit`, existing `print-pipeline.ts` patterns
**Avoids:** Cover page overflow, stale cache, row numbering counting headers, blank tune column problem
**Research flag:** Standard patterns — pdf-lib drawing API is well-understood. No research needed.

### Phase 4: Type Safety + Technical Debt

**Rationale:** Independent of feature work. Each fix is isolated. Must come after features to avoid blocking the Bat Mitzvah deadline. The live view redesign touches many of the same files, so type fixes interleaved before it reduces merge conflicts.

**Delivers:**
- Firestore Timestamp `as any` fixes (use existing `toDate()` helper, duck-typing on client)
- Server/Client prop drilling `as any` fixes (pre-serialize Timestamps in Server Components)
- API route `as any` fixes (Zod validation at request boundary for all routes)
- Replace 7 remaining silent `.catch(() => {})` with `criticalCatch` / `silentCatch` utilities
- `Promise.allSettled` where individual failures should not break whole page load
- `data()!` non-null assertions replaced with explicit null checks
- `JSON.parse(JSON.stringify())` replaced with typed `stripUndefined()` utility

**Avoids:** Bulk `as any` removal breaking build (fix one category per commit, max 5 files per PR)
**Research flag:** No additional research needed. Patterns are fully specified in STACK.md and PITFALLS.md. Execution discipline (one category at a time) is the risk mitigation.

### Phase Ordering Rationale

- **Phases 1 before everything:** Tune field is a hard dependency for live view, print, and editor. Cache/error fixes are time-sensitive before the Bat Mitzvah service.
- **Phases 2 and 3 in parallel:** Both depend only on Phase 1 data; they modify different files (`SetlistPerformPage` vs `print-pipeline.ts`). Parallelizing shortens delivery time.
- **Phase 4 last:** Type safety is independent of features and should not delay them. Sequencing it after features means fixes can target files already touched, reducing total churn.
- **Anti-patterns to avoid per ARCHITECTURE.md:** Do not rebuild the performance queue system for outline-first mode (UI change only). Do not start type fixes before features. Do not fix all `as any` in one commit.

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 1:** Data model threading is fully documented in ARCHITECTURE.md. Zod patterns are established.
- **Phase 2:** UI redesign stays within existing TailwindCSS/Radix/Zustand stack. Pattern is specified.
- **Phase 3:** pdf-lib drawing API is imperative and well-understood. `@cantoo/pdf-lib` is a drop-in swap.
- **Phase 4:** Type-fix patterns are enumerated by category in PITFALLS.md and STACK.md.

No phase needs `/gsd:research-phase` during planning. All decisions are resolved.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack locked. `@cantoo/pdf-lib` verified on npm (Oct 2025 release). `@react-pdf/renderer` incompatibility verified via open GitHub issues. Fontkit stable for 5 years. |
| Features | HIGH | Based on direct codebase analysis + competitor feature comparison (Planning Center, OnSong, BandHelper). First-party Excel outline format (PROJECT.md) is the ground truth for what musicians need. |
| Architecture | HIGH | Based on direct codebase inspection of all relevant source files. Field-threading map and build order are verified against actual code, not inferred. |
| Pitfalls | HIGH | Grounded in codebase inspection. `computeContentHash` gaps, cover page truncation threshold, and publish route error swallowing are all confirmed in source code line references. |

**Overall confidence:** HIGH

### Gaps to Address

- **`@react-pdf/renderer` long-term:** If CentralReform ever needs a richer PDF layout (multi-column, embedded images), the current imperative pdf-lib approach will become limiting. The Next.js App Router incompatibility may be resolved in a future version. Flag for re-evaluation if the print pipeline needs significant expansion beyond tabular outlines.

- **Real-time outline sync (deferred):** The P3 feature (leader advances outline, all musicians follow) requires shared session state and leader/follower role management. When this moves to active development, it will need its own architecture research — specifically around Firestore write contention and offline resilience.

- **Tune library vocabulary:** The congregation-specific tune autocomplete (P2) requires collecting tune names from actual setlist data. No research done on optimal autocomplete UX for liturgical tune names. Low risk — implementation is straightforward once data exists.

- **Music stand testing protocol:** The physical readability test (phone at 2-3 feet, dim lighting) is recommended but not yet scheduled. This is the highest-risk gap because it cannot be resolved by research alone — it requires the actual device and environment.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/types/models.ts`, `src/types/schemas.ts`, `src/lib/print-pipeline.ts`, `src/lib/setlist-firebase.ts`, `src/app/perform/setlist/[id]/page.tsx`, `src/lib/firebase-admin.ts`, `src/app/api/setlist/publish/route.ts`, `src/lib/queue-utils.ts`
- `.planning/PROJECT.md` — project requirements, Excel outline format reference
- `.planning/codebase/CONCERNS.md` — known issues catalog
- [npm: @cantoo/pdf-lib](https://www.npmjs.com/package/@cantoo/pdf-lib) — version 2.5.3, verified active maintenance Feb 2026
- [npm: @pdf-lib/fontkit](https://www.npmjs.com/package/@pdf-lib/fontkit) — version 1.1.1, stable fontkit adapter
- [Zod v4 docs](https://zod.dev/v4) — performance improvements confirmed
- [GitHub: pdf-lib maintenance status](https://github.com/Hopding/pdf-lib/issues/1423) — confirmed unmaintained since 2021

### Secondary (MEDIUM confidence)

- [Planning Center Services + Music Stand](https://www.planningcenter.com/services) — feature comparison
- [OnSong Features + Live Performance Pack](https://onsongapp.com/features/) — feature comparison
- [BandHelper Features + Performing Tutorial](https://www.bandhelper.com/main/features.html) — feature comparison
- [GitHub: @react-pdf/renderer issues #3074, #2994](https://github.com/diegomura/react-pdf/issues/3074) — Next.js App Router incompatibility confirmed
- Glanceable UI principles for constrained displays — general UX principles, not music-specific

### Tertiary (LOW confidence)

- [2026 Top Worship Software roundup](https://theleadpastor.com/tools/best-worship-software/) — general market awareness only
- [Worship Team Apps Roundup](https://worshiponline.com/worship-team-apps/) — general market awareness only

---

*Research completed: 2026-03-01*
*Ready for roadmap: yes*
