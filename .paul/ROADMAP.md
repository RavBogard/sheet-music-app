# Roadmap: sheet-music-app (CentralReform.live)

## Overview

Deep-dive bugsweep and backend hardening pass on the production v1.2 codebase. Research phase produces audit report with prioritized recommendations, followed by execution phases to fix critical and high-severity issues.

## Current Milestone

**v1.3 Bugsweep & Backend Hardening** (v1.3.0)
Status: In progress
Phases: 3 of 4 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Codebase Audit & Recommendations | 1 | Complete | 2026-03-10 |
| 2 | Critical Fixes (Security & Data Integrity) | 2 | Complete | 2026-03-10 |
| 3 | Backend Hardening (Error Handling & Consistency) | 2 | Complete | 2026-03-10 |
| 4 | Frontend Robustness (Hooks, Types, Cleanup) | 2 | Not started | - |

## Phase Details

### Phase 1: Codebase Audit & Recommendations

**Goal:** Produce a structured audit report with all findings categorized and prioritized
**Depends on:** Nothing (first phase)
**Research:** N/A (this IS the research)

**Scope:**
- Compile all findings from API routes, lib utilities, components, types, and hooks
- Categorize by severity (Critical, High, Medium, Low)
- Prioritize fixes with effort estimates
- Deliver actionable report

**Plans:**
- [x] 01-01: Compile audit report with prioritized recommendations

### Phase 2: Critical Fixes (Security & Data Integrity)

**Goal:** Fix security vulnerabilities and data integrity issues that could cause production incidents
**Depends on:** Phase 1 (audit report guides priorities)
**Research:** Unlikely (fixes are clear from audit)

**Scope:**
- QR auth token binding vulnerability
- AI concurrency deadlock prevention
- Rate limiting gaps on unauthenticated endpoints
- Fire-and-forget notification safety in setlist publish
- Monitor client race conditions

**Plans:**
- [x] 02-01: Security fixes (auth, rate limiting)
- [x] 02-02: Data integrity fixes (concurrency, notifications, race conditions)

### Phase 3: Backend Hardening (Error Handling & Consistency)

**Goal:** Standardize error handling, API patterns, and logging across all routes
**Depends on:** Phase 2 (critical fixes first)
**Research:** Unlikely

**Scope:**
- Standardize error response format across all 55 API routes
- Migrate remaining routes to createApiHandler pattern
- Add Zod validation to unvalidated routes
- Improve error context (replace generic 500s)
- Standardize Firestore timestamp handling

**Plans:**
- [x] 03-01: API handler migration and error response standardization
- [x] 03-02: Validation, logging, and timestamp consistency

### Phase 4: Frontend Robustness (Hooks, Types, Cleanup)

**Goal:** Fix hook dependency bugs, type safety issues, and cleanup patterns
**Depends on:** Phase 2 (some hook fixes depend on backend changes)
**Research:** Unlikely

**Scope:**
- Fix dependency array bugs in critical hooks
- Add mounting/abort checks to async handlers
- Normalize type definitions (FirestoreDate, MonitorConfig, etc.)
- Add error boundaries to key component groups
- Fix memory leak patterns (annotation store, monitor connection)

**Plans:**
- [ ] 04-01: Hook dependency fixes and async safety
- [ ] 04-02: Type normalization and error boundaries

---
*Roadmap created: 2026-03-10*
*Last updated: 2026-03-10 (Phase 3 complete)*
