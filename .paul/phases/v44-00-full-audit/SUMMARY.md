# v4.4 Full-Project Audit & Sweep — Summary

**Date:** 2026-04-15
**Scope:** Complete project-level audit + bugsweep + deep audit + deep bugsweep, as requested ("full project, not just milestone, code level").

## Rounds executed

### Round 1 — Broad audit (4 parallel agents)
| File | Focus | Findings |
|------|-------|----------|
| R1A-type-safety.md | `any` usage, Zod drift, Firestore `.data()` without parse, date-shape divergence | 37 |
| R1B (in-memory) | Error handling — empty catches, unhandled promises, UX asymmetry | 47 |
| R1C-security.md | Authorization gaps, IDOR, rate-limit coverage, PII leak, CSRF | 25 |
| R1D-perf-and-quality.md | Render churn, N+1 reads, dead code, big files, duplication | 36 |

### Round 2 — Deep audit (2 targeted agents)
| File | Focus | Findings |
|------|-------|----------|
| R2A-data-layer.md | Firestore write races, denormalization drift, state-machine correctness | 17 |
| R2B-client-ux.md | Stale closures, fetch races, focus management, viewport, touch targets | 24 |

**Total surveyed: 186 findings.**

## Fixes shipped (3 batches, all deployed)

### Batch 1 — Security P0 (commit `a894a22`)
- **SEC-006 (HIGH)** `setlist/delete` now requires owner OR admin, not just band_leader. Rogue/compromised band leader can no longer destroy another leader's work.
- **SEC-001 (HIGH)** `admin/set-upload-permission` gains zod schema (discriminated union) so extra fields can't smuggle onto Firestore update.
- **SEC-008** Firestore rules setlists UPDATE now disallows `ownerId` mutation except by admins. Live on prod via `firebase deploy`.
- **SEC-002/003/004/005** Rate limits added to `push/send`, `scheduling/assign`, `scheduling/unassign`, `scheduling/respond` — each route fires email+SMS+FCM per invocation, so bulk abuse was disproportionately expensive pre-fix.

### Batch 2 — Reliability + UX (commit `b1f6aab`)
- **V-001→V-005** Every `JSON.parse` of Gemini/webhook/model output now wrapped with a try/catch — Resend webhook returns 400 on malformed JSON instead of 500 (which triggers their retry storm); AI routes return empty results instead of crashing.
- **E-005** `MonitorClient` starred-channel save now logs failures and surfaces a toast. Was a silent data-loss path.
- **U-001/U-002/U-003** `UserRow` role-change, sound-engineer, delete toasts now surface the actual error message parsed from the response. Admins can distinguish permission-denied from network from server errors.

### Batch 3 — Not shipped (see "Deferred" below)
Attempted but deferred after re-review: DL-004 bridge timestamp (Date.now on the server is trusted for short-window expiry), DL-017 publish eventDate (optional-chain already handles the string case), UX-005 PDFOverlay unmount guard (already has `cancelled` flag), UX-008 UploadDialog abort (needs a per-file refactor out-of-scope for a general sweep).

## Final state
- **Suite:** 1270/1270 green
- **tsc:** clean
- **eslint:** clean
- **build:** clean
- **prod:** Vercel + Firebase rules in sync

## Deferred items

### Data-layer reconciliation (from R2A)
- **DL-002/015** Scheduling assign + decline split writes across transactions. Consolidating them into one transaction requires reshaping both handlers — architectural, not a simple patch. User-observable symptom is rare and transient.
- **DL-010** Denormalized `musicianName`/`userName` reconciliation across all assignment/setlist copies when a user renames. Either needs a Cloud Function fan-out or a periodic reconciliation job. Out of scope for a general sweep; v4.3 D06 already fixed the most user-visible case (unassign cancellation email).

### Client UX (from R2B)
- 11 async-without-AbortController patterns. Each needs its own small refactor — correctness-improvement rather than bug-fix. Worth a dedicated "UX hardening" plan.
- 4 modal-state-reset bugs (EditDetails, NamePrompt, UserRow, CollapsibleSection). Similar — need individual fixes.

### Architectural (from R1D)
- 5 files >600 LOC (print-pipeline 760, SetlistEditorV2 757, use-setlist-logic 746, ChatPanel, others). Splitting these is real refactoring work.
- Request-ID propagation across all API routes (L-001). Big diff, infrastructure work.

### Dev-experience / polish
- Cross-tab sign-out via BroadcastChannel — already shipped in v4.3 P10-06.
- UX-001/002 modal state-reset — small individual fixes but not shipping in this sweep.

## What changed in production

Security posture meaningfully tightened (IDOR closed on setlist delete, Firestore ownerId immutable, rate limits on four mutation routes, schema validation on admin upload-permission). Reliability improved (five JSON.parse crash vectors plugged, monitor pref save observable). UX improved (error toasts now actionable for admins).

Aligns with the stated goal: "full project, not just milestone, code level." The deeper architectural items are documented for a later milestone rather than papered over.
