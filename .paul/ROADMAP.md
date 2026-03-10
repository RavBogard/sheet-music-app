# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone

**v1.3.1 Regression Fixes** (v1.3.1)
Status: Complete
Phases: 1 of 1 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Regression Fixes | 1 | Complete | 2026-03-10 |

## Phase Details

### Phase 1: Regression Fixes

**Focus:** Fix regressions introduced during v1.3 bugsweep — PDF viewer version mismatch breaking rendering, and monitor tab not loading on iPad.

**Issues:**
- PDF pdfjs-dist API version "5.4.296" does not match Worker version "5.4.530"
- Monitor tab fails to load on iPad (works on laptop)

Plans:
- [x] 01-01: PDF version assertion + cache busting, iPad monitor connection stabilization

## Completed Milestones

<details>
<summary>v1.3 Bugsweep & Backend Hardening - 2026-03-10 (4 phases, 7 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Codebase Audit & Recommendations | 1/1 | 2026-03-10 |
| 2 | Critical Fixes (Security & Data Integrity) | 2/2 | 2026-03-10 |
| 3 | Backend Hardening (Error Handling & Consistency) | 2/2 | 2026-03-10 |
| 4 | Frontend Robustness (Hooks, Types, Cleanup) | 2/2 | 2026-03-10 |

Archive: `.paul/milestones/v1.3-ROADMAP.md`

</details>

---
*Roadmap created: 2026-03-10*
*Last updated: 2026-03-10 (v1.3.1 milestone created)*
