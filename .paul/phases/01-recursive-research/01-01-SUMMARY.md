# Phase 1 — Recursive Research — SUMMARY

**Completed:** 2026-04-13
**Outcome:** 53+ findings, 2 P0s, roadmap delta approved.

## What happened

Two waves of parallel research. Wave 1 dispatched 6 agents across orthogonal angles (bugs, missing UI, errors, pain points, inconsistencies, security). Wave 2 dispatched 3 drill-downs on the biggest uncertainties (storage rules, last-write-wins race, offline truthiness).

## Deliverables

- `WAVE-1-bugs.md` · `WAVE-1-missing-ui.md` · `WAVE-1-errors.md` · `WAVE-1-pain-points.md` · `WAVE-1-inconsistencies.md` · `WAVE-1-security.md`
- `WAVE-1-SYNTHESIS.md`
- `WAVE-2-storage-rules.md` · `WAVE-2-last-write-wins.md` · `WAVE-2-offline-truthiness.md`
- `FINDINGS.md` (ranked, routed)

## P0s confirmed (2)

1. **Last-write-wins on `setlists/{id}.tracks`** — every write is a full-array replace; editor doesn't subscribe. Concurrent edits silently destroy each other's work. Reproducible.
2. **Offline feature is dead and lying** — service worker was removed in v2.5, nothing writes to Cache Storage; "offline ready" pills are structurally false. `use-offline.ts:99–116` counts failed fetches as success.

Both are band-onboarding blockers.

## Roadmap delta (approved)

- 3 new phases inserted: **1.1 Concurrent-edit safety** (~12h), **1.2 Offline truthiness** (~7h), **1.3 Security hardening** (~4h).
- Phases 2–5 scope expanded with ~20 P1s (see FINDINGS.md §routing for exact list per phase).
- Milestone grew from 5 → 8 phases. +21–25h pre-Phase-2 work.

## What surprised us

- No P0 role-leak in the security sweep — Firestore rules are solid.
- The offline feature is worse than the initial bug suggested: it's not a miscounted-downloads bug, it's entire dead infrastructure from a prior cleanup that nobody noticed the UI still referenced.
- No P0 dead ends in the missing-UI sweep — the app has surprisingly few placeholder / stub / log-only handlers in shipping code.

## Next action

`/paul:plan` for Phase 1.1 (Concurrent-edit safety).
