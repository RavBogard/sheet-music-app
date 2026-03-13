# Project State: Auth & Access Audit

## Project Reference
**Core Value**: Musicians see only what they need; the public gets instant, frictionless access.
**Current Focus**: Project Initialization & Roadmapping

## Current Position
**Phase**: None
**Plan**: None
**Status**: Initialized
**Progress**: [░░░░░░░░░░░░░░░░░░░░] 0%

## Performance Metrics
- **Auth Reliability**: TBD (Goal: 100% session persistence during services)
- **Permission Leaks**: TBD (Goal: 0 occurrences of unauthorized UI visibility)
- **Public Link Friction**: TBD (Goal: < 2 clicks to reach public song chart)

## Accumulated Context
### Decisions
- **D-01**: Using `proxy.ts` (Next.js 16) for robust session management.
- **D-02**: Using Firebase Custom Claims for O(1) server-side RBAC.
- **D-03**: Hiding privileged UI elements at the Server Component (RSC) level.

### Todos
- [ ] Approve Phase 1 roadmap and begin planning.
- [ ] Reproduce "stale session" bug on mobile iOS.
- [ ] Audit Firestore rules for "Edit" access protection.

### Blockers
- None currently.

## Session Continuity
- **Last Action**: Roadmap created and requirements mapped to phases.
- **Next Turn**: Wait for user approval of ROADMAP.md and then start Phase 1 planning.
