# PAUL Handoff

**Date:** 2026-05-13 (evening — post v60-12 ship + v7.0 planning)
**Status:** paused (Daniel-explicit pause)

---

## READ THIS FIRST

You have no prior context. This document tells you everything you need.

**Project:** centralreform.live — CRC Music (Reform Jewish synagogue setlist + perform app)
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

This session: shipped v60-11 fully (production backfill + push) + shipped v60-12 fully (rules deploy + push) + planned v7.0 milestone structure. **v6.0 milestone is 12 of 12 phases LOOP COMPLETE**, blocked only on Daniel-loop UAT carry-forwards across the upcoming Fri PM + Sat AM worship cycle. v7.0 — Document-Driven Setlist Creation — is structurally created (8 phases in 6 waves) but does NOT start until v6.0 closes via `/paul:complete-milestone`.

---

## Current State

**Version:** v6.0 (12 of 12 phases LOOP COMPLETE; PENDING-UAT close)
**Active milestone:** v6.0 Tracks Single-Source-of-Truth — milestone-close gate cleared from code-readiness + production-deploy perspectives
**Next milestone planned:** v7.0 Document-Driven Setlist Creation (structure created; does NOT start until v6.0 closes)

**Git state:** master synced with origin/master @ `04499a4` (`feat(v60-12-01): public read on tracks/*...`).

Recent commits (in order):
- `04499a4` feat(v60-12-01): public read on tracks/* + perf-view hook + emulator rules test
- `22492e1` docs(v7.0): create v7.0 milestone structure
- `e3fa5f1` docs(v60-11-01): AC-3 production --apply complete; 131 docs backfilled
- `291ea95` docs(v60-11-01): backfill commit SHA + Git State block in STATE.md
- `101d619` feat(v60-11-01): shortcut-aware songs mirror + subscribe.ts self-heal

**Loop Position (v60-12 — current):**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [LOOP COMPLETE + DEPLOYED 2026-05-13]
```

---

## What Was Done This Session

1. **Resumed from prior 2026-05-13 handoff** (archived to `.paul/handoffs/archive/`).
2. **Planned + audited + applied + unified + pushed v60-11** (shortcut-aware songs mirror + subscribe.ts self-heal):
   - Pre-APPLY architectural audit caught 5 spec issues (A1 title strip, A2 status clobber, B1 batch pattern, B2 scope-name, C2 void prefix) — all patched into PLAN before code work.
   - Daniel-authorized production backfill: `npx tsx scripts/backfill-shortcuts-songs.ts --apply` wrote 131 docs (songs total 364 → 495). Marker `system/v60-11-backfill` set.
   - "Lechu Goldman" doc spot-checked via `scripts/diag/diag-lechu-goldman.ts` — now exists at songs/1jgs72zw...VJj with title "Lechu Goldman.pdf" (verbatim per A1 audit fix).
   - 3 commits pushed: `101d619` feat + `291ea95` docs + `e3fa5f1` docs (AC-3 PASS).
3. **Planned v7.0 milestone via /paul:discuss-milestone + /paul:milestone:**
   - Theme: "Feed a doc, get a setlist. AI parses, the system resolves, the form fills the gaps."
   - 8 phases in 6 waves: image-chart support / recordings model / per-track media affordances / doc upload / Gemini extraction / resolve+bind / interview+commit / best-practice audit.
   - 12 constraints locked at creation (Firebase Storage for recordings; .docx/.pdf/.txt only; structured form not chat; etc.).
   - Daniel-tacked-on features baked in: chart click-through in editor (v70-03), image-chart support (v70-01), best-practice audit phase (v70-08).
   - Phase directories created at `.paul/phases/v70-*` (8 empty dirs ready for /paul:plan).
   - Commit: `22492e1`.
4. **Planned + audited + applied + unified + deployed + pushed v60-12** (public tracks visibility):
   - Daniel UAT report: incognito browser → centralreform.live → upcoming setlist → "Perform" → "No tracks yet".
   - Two-layer bug: firestore.rules `tracks/{trackId}` required `isMember()` AND `useSetlistPerformance` skipped the snapshot listener for unauthenticated users.
   - Pre-APPLY architectural audit cleared 5 concerns.
   - Fix: rules `allow read: if isMember()` → `allow read: if true` (writes unchanged); hook guard simplified from `if (!setlistId || !user) return` → `if (!setlistId) return`; added `@firebase/rules-unit-testing@^5.0.1` dev dep + 8-scenario emulator rules test (GREEN); existing hook test reversed to match new contract.
   - `firebase deploy --only firestore:rules --project crcmusiccharts` — rules compiled clean, released.
   - Commit `04499a4` pushed; Vercel auto-deploys the hook change.

---

## What's In Progress

**Nothing in-flight.** Everything is committed, pushed, deployed. Daniel pauses cleanly.

---

## Open UAT Carry-Forwards (Daniel-loop, worship cycle Fri PM + Sat AM)

These are NOT in-flight work — they're scheduled Daniel-verification gates per v51-04 codified pattern. After they clear, v6.0 milestone closes via `/paul:complete-milestone`.

| AC | What to verify | Setup |
|----|----------------|-------|
| **v60-11 AC-4** | Picker shows "Lechu Goldman.pdf" + ≥2 other previously-missing shortcuts within ~1s when typing prefix | Open any setlist → trigger chart-binder → type "Lechu" |
| **v60-12 AC-4** | Incognito browser at centralreform.live → click "Perform" on upcoming setlist → tracks render + PDFs render | Wait for Vercel deploy of `04499a4` (~2-3 min after push); then fresh-incognito Chrome |
| **v60-09 AC-3** | Two-device live propagation: rename/archive/upload on Mac iPad → see on Mac within ~1s | Open library section on both devices simultaneously |
| **v60-10 AC-6** | Mobile AddBar sticky-bottom on iPad/iPhone Safari (landscape + portrait) + virtual keyboard hide | Open setlist editor on iPad; tap "+ Song"; tap input to trigger keyboard |
| **Issue 2** | Setlist-missing cascade diagnostic — does "Failed — retry — This setlist isn't on the server" recur AFTER clearing site data? | Chrome → Site settings → centralreform.live → Clear browsing data + re-sign-in. If issue persists post-clear → v60-13 candidate (sync-engine resilience) |
| **v60-01..v60-08** accumulated carry-forwards | Smoke against deployed commits during normal worship-cycle use | Daniel does his normal Friday + Shabbat workflow |

---

## What's Next

**Immediate (this weekend):** Daniel runs the worship-cycle UAT above. Resume after Daniel reports outcomes.

**After UAT clears:** Run `/paul:complete-milestone` to close v6.0 → opens v7.0 → first phase to plan is v70-01 (image-chart support; PNG/JPEG/HEIC; ~prereq for v70-05 doc-extraction canary because the May 15 Shir Shabbat doc references `dodi li (sher).png`).

**If Daniel reports new UAT issues:** Route via the v51-04 in-phase follow-up pattern:
- v60-11-style picker issue → v60-11-02 follow-up plan
- v60-12-style public-perform issue → v60-12-02 follow-up plan
- Setlist-missing cascade persists → v60-13 emergent phase (sync-engine client-Firestore resilience)
- PDF rendering fails for public users → v60-13 candidate (chart Storage URL auth gate)

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state — UAT carry-forwards captured |
| `.paul/ROADMAP.md` | v6.0 milestone (12 phases LOOP COMPLETE) + v7.0 planned (8 phases not started) |
| `.paul/MILESTONES.md` | v5.4 + prior milestone history |
| `.paul/phases/v60-11-shortcut-aware-songs-mirror/v60-11-01-SUMMARY.md` | v60-11 closure |
| `.paul/phases/v60-12-public-tracks-visibility/v60-12-01-SUMMARY.md` | v60-12 closure |
| `.paul/phases/v70-01-image-chart-support/` | First v7.0 phase dir (empty; awaits plan) |
| `firestore.rules` | Production-deployed; tracks/{trackId} now publicly readable |
| `src/hooks/use-setlist-performance.ts` | Listener now mounts for public users |
| `src/lib/songs/__tests__/firestore-rules-tracks.emulator.test.ts` | First emulator-backed rules test; template for future rules edits |
| `src/lib/songs/__tests__/subscribe.emulator.test.ts` | v60-09 listener canary |
| `scripts/backfill-shortcuts-songs.ts` | v60-11 backfill (already applied; marker prevents re-run without --force) |
| `scripts/diag/diag-lechu-goldman.ts` | Production diagnostic; safe READ-only |

---

## Resume Hooks (for fresh Claude)

- Daniel runs from Windows (PowerShell + Bash via WSL). Paths `C:\Users\dsbog\centralreform.live\sheet-music-app\`.
- Repo: github.com/RavBogard/sheet-music-app — branch `master` (Daniel's production; per memory `feedback_git_push`).
- Vercel auto-deploys from master push.
- Firebase project: `crcmusiccharts`.
- Today is 2026-05-13 (Wed). Worship cycle: Fri PM + Sat AM.
- `/paul:audit` is BROKEN in this repo per memory `feedback_no_paul_audit` — perform manual architectural audit inline; do NOT route to /paul:audit even though the skill registry lists it.
- Per memory `feedback_paul_phase_commits` — entire `.paul/phases/{phase}/` dir staged together on phase commit.
- Per memory `feedback_firebase_cli` — `firebase deploy --project crcmusiccharts` is automatable (rules/indexes/functions); NOT a human-action checkpoint.
- HFG counter at 0/3 (held throughout v6.0 via emulator coverage on every data-layer phase).
- 12 constraints locked for v7.0 in `.paul/ROADMAP.md` "Next Milestone Planned" section — do NOT re-litigate at milestone open; they were Daniel-locked at /paul:discuss-milestone.

---

## Notable Quotes (Daniel directives baked into v7.0)

- **"do it right"** — no time pressure on v7.0; quality > speed
- **"i don't care"** (on recording storage choice) — I picked Firebase Storage to match v1.6 chart pattern
- **"form"** (interview UX) — structured form NOT chat
- **"that's mostly markings to help us identify eg which version of veshamru it is. notes"** — recording attribution goes into a `notes` field
- **"7"** — major version bump to v7.0
- **"when I'm editing a setlist and a chart is bonded to a track, I need a way to be able to click on that chart while editing it and see it. it should open in a new window"** — folded into v70-03
- **"right now it's not letting me take a PNG file or other image file and display it as a chart. I'd like to change that"** — folded into v70-01 (Wave 0 prereq for the doc-extraction canary)
- **"I'd like to add in a best-practice audit at the end"** — v70-08 phase; 5 dimensions (security / accessibility / performance / code quality + data integrity / UX consistency); reuses v5.4 architectural-audit pattern

---

## Resume Instructions

1. **Read this handoff first.** It supersedes any stale context.
2. **Read `.paul/STATE.md`** for the latest position.
3. **Run `/paul:resume`** — workflow detects the most-recent handoff (this file) and routes appropriately.
4. **If Daniel reports UAT outcomes:**
   - All UAT clears → `/paul:complete-milestone` to close v6.0 → `/paul:plan` for v70-01 to start v7.0.
   - UAT issue surfaces → diagnose → classify (intent/spec/code) → route to in-phase follow-up plan (v60-X-02) OR new emergent phase (v60-13).
5. **If Daniel asks for new work unrelated to v6.0 UAT:** Treat as v7.0 / v60-13+ candidate per scope; don't reopen closed v6.0 phases.

---

*Handoff created: 2026-05-13 evening by Claude Opus 4.7 (1M context). Session paused at Daniel's request post-v60-12 ship + v7.0 planning. v6.0 milestone awaits worship-cycle UAT (Fri PM + Sat AM); v7.0 structure ready to plan on milestone close.*
