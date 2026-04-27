# PAUL Handoff — v51-01 picker rework complete; paused before v51-02

**Date:** 2026-04-27
**Status:** paused (user clearing context)
**Branch:** master
**Last commit:** `70abfff` (phase-close commit; pushed task commits earlier at `304e940`)

---

## READ THIS FIRST

You have no prior context. This document tells you everything you need.

**Project:** sheet-music-app (CentralReform.live) — web app for Central Reform Congregation's worship band. Tablet-first; iPads on music stands during live services.

**Core value:** Musicians can instantly access setlists, transpose charts, and control their monitor mix — live on any device, no paper or prep needed.

**CRITICAL CULTURAL CONTEXT:** CRC is a **Reform Jewish synagogue**. Worship cadence is **Friday evening (Erev Shabbat) + Saturday morning (Shabbat)**. NOT Sunday. See `~/.claude/projects/C--Users-dsbog-CentralReform-live/memory/project_shul_cadence.md`.

---

## Current State

| Field | Value |
|-------|-------|
| package.json version | 2.11.20 (decoupled from PAUL milestone naming) |
| PAUL milestone | v5.1 — Editor UX Polish (band-onboarding gate) |
| Milestone progress | 1 of 4 phases complete |
| Phase | v51-01 ✅ COMPLETE |
| Plan | None active |
| Loop | PLAN ✓ → APPLY ✓ → UNIFY ✓ |

Other open milestones (no action required):
- **v5.0** Bulletproof Editor 🟡 PENDING UAT — close path is v5.1 ships → Daniel UAT → `/paul:audit-milestone v5.0`
- **v5.0-hotfix** ✅ COMPLETE 2026-04-27, archived at `.paul/milestones/v5.0-hotfix-ROADMAP.md`

---

## What Was Done This Session

1. `/paul:resume` → restored from prior handoff (v5h-01-03 paused)
2. Closed v5h-01-04 postmortem (`.paul/postmortems/v5h-01-save-loss.md`); UNIFY → phase-close → `/paul:complete-milestone v5.0-hotfix` → archived; tag `v5.0-hotfix` created
3. `/paul:discuss-milestone` → 5 rounds of 3 questions synthesized v5.1 scope: tablet-first editor polish; band-onboarding gate
4. `/paul:milestone v5.1` → created milestone with 3 phases initially; user added 4th (editor readability) late → final 4 phases:
   - **v51-01** Picker rework — ✅ COMPLETE (this session)
   - **v51-02** Editor readability + visual hierarchy (desktop + tablet)
   - **v51-03** Smart create-setlist wizard (date-aware via Hebcal)
   - **v51-04** Vocal Lead rename + Daniel-loop UAT codification + print smoke
5. `/paul:plan` v51-01-01 + `/paul:apply` (with `/ui-ux-pro-max` gate satisfied) + `/paul:unify` → phase v51-01 closed
6. Picker rework shipped to production master at commit `304e940`; Vercel deploying

---

## v51-01 Decision Recorded

**tabs-suppress** (Radix Tabs Major|Minor + suppress ChartBind keyboard on touch).

Database-backed via /ui-ux-pro-max:
- shadcn `<Tabs>` is the right primitive (avoid custom segmented control)
- "Hover vs Tap" rule (HIGH severity) → primary interactions should be tap not auto-focused input
- Symmetric "no keyboard until deliberate tap" rule across all 6 sites

Logged in `.paul/STATE.md` Decisions table.

---

## What's In Progress

Nothing in progress. Phase v51-01 cleanly closed. Code shipped to prod. Suite 1492/1492. Ready to start v51-02.

---

## What's Next

**Immediate:** `/paul:plan` to create `v51-02-01` (editor readability + visual hierarchy plan).

**Phase v51-02 scope** (per ROADMAP.md):
- Tighten setlist editor density on desktop + tablet (rows currently too spaced; visual hierarchy doesn't help eye find title vs key vs lead vs type vs notes)
- Row height: ~56px → ~40-44px desktop, ~44-48px tablet (preserve 44px-min touch targets per v50-05-04)
- Cell padding: tighten horizontal + vertical
- Visual hierarchy: title weight/size > key (still prominent; key-left from v1.6 P3 stays) > lead/type (secondary) > notes (tertiary)
- Section differentiation (welcome / opening / etc.) — currently plain grouping rows; lift to visually distinct
- Column emphasis: title wider; type/key narrower
- WCAG AA cross-check via jest-axe at end (same pattern as v50-05-05)

**Out of scope for v51-02:**
- Mobile parallel render path (`Mobile*.tsx` — separate component tree from v50-05-05) — NOT touched
- Picker internals (just shipped in v51-01)
- Performance view (good enough per /paul:discuss-milestone Q6)

**`/ui-ux-pro-max` BLOCKING** for v51-02 per SPECIAL-FLOWS.md — invoke at APPLY entry before any code change. Likely 1 plan, ~4-6h.

**After v51-02:** v51-03 (smart wizard) → v51-04 (rename + UAT codify + print smoke) → Daniel UAT for next Erev Shabbat → invite band → first-week smoke → `/paul:audit-milestone v5.0`.

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state (read first on resume) |
| `.paul/ROADMAP.md` | v5.1 milestone + 4 phases |
| `.paul/PROJECT.md` | Requirements (incl. v51-01 entry under Validated this cycle) |
| `.paul/phases/v51-01-picker-rework/v51-01-01-PLAN.md` | The plan that just shipped |
| `.paul/phases/v51-01-picker-rework/v51-01-01-SUMMARY.md` | What got built (lessons + decisions + commits) |
| `.paul/postmortems/v5h-01-save-loss.md` | Save-loss postmortem (5 lessons + 5 action items, mostly opportunistic) |
| `.paul/milestones/v5.0-hotfix-ROADMAP.md` | Archived completed milestone |

Source code surfaces likely touched in v51-02:
- `src/components/setlist/grid/SetlistGrid.tsx` — main desktop/tablet table
- `src/components/setlist/grid/cells/*.tsx` — TextCell, KeyCell, LeadCell, TypeCell, ChartCell, DragHandleCell
- `src/components/setlist/grid/SetlistGridTopBar.tsx`
- `src/components/setlist/grid/BatchActionBar.tsx`
- `src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx` (jest-axe coverage)

---

## Commits This Session

| Commit | Description | Pushed? |
|--------|-------------|---------|
| `744073c` | chore(milestone): create v5.1 — 3 phases | local |
| `0ff16aa` | chore(milestone): expand v5.1 to 4 phases — add editor readability | local |
| `6671254` | feat(v51-01-01): TouchOrPopover always-anchored Popover | ✅ pushed |
| `c11a5c4` | feat(v51-01-01): DropdownCell mode + BulkPopover discrete | ✅ pushed |
| `304e940` | feat(v51-01-01): KeyCell chromatic Major\|Minor Tabs | ✅ pushed |
| `70abfff` | feat(v51-01): picker rework complete — close phase | local (phase-close + PLAN/SUMMARY artifacts) |

Earlier same-day session commits also local: `62298c0` (v5h-01-04 postmortem) + `a0f036d` (v5.0-hotfix milestone close + tag `v5.0-hotfix`).

**Push reminder for resume:** Production has the picker fix (304e940). Local-only commits are PAUL state (milestone create + 4-phase expand + phase-close + earlier hotfix close + tag) — none of them affect production deploy. Push at user's discretion.

---

## Resume Instructions

1. Run `/paul:resume` — it'll detect this handoff, load STATE.md, and route to `/paul:plan` for v51-02
2. Or explicitly: `/paul:plan` to start v51-02-01 (editor readability)
3. `/ui-ux-pro-max` will be BLOCKING at APPLY entry — invoke before any code change

---

## Standing User Preferences (from auto-memory)

- Push to `origin master` (not `master:main`); deploy via Vercel; no preview branches
- Tablet-first application; band on iPads on music stands
- Reform Jewish synagogue — Friday night + Shabbat morning; not Sunday
- "Vocal Lead" not "Lead"/"Leader" (per-song role); rabbi "Led by:" on print is distinct
- App must be "bulletproof and easy and intuitive" before band onboarding
- Explicitly stage `.paul/phases/{phase}/` dir on PAUL commits (don't orphan PLAN/SUMMARY files)
- Run `next build` not just `tsc` for verification (catches Next.js App Router export violations)

---

*Handoff created: 2026-04-27 at end of v51-01 close session.*
*Single next action on resume: `/paul:plan` for v51-02-01 (editor readability + visual hierarchy).*
