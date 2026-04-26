---
phase: v50-02-amputation
plan: 01
type: execute
wave: 1
depends_on: ["v50-01-architecture/01"]
files_modified:
  - "src/components/setlist/ChatPanel.tsx"
  - "src/lib/chat-store.ts"
  - "src/lib/chat-prompt.ts"
  - "src/app/api/chat/**"
  - "src/components/performance/SwapPicker.tsx"
  - "src/components/performance/SwapBottomSheet.tsx"
  - "src/components/performance/SwapToast.tsx"
  - "src/components/performance/SwapButton.tsx"
  - "src/components/performance/LeaderConsole.tsx"
  - "src/app/live/**"
  - "src/lib/song-groups.ts"
  - "src/types/songGroup.ts"
  - "src/lib/setlist-firebase.ts"
  - "src/types/user.ts"
  - "firestore.rules"
  - "package.json"
  - "**/*.test.{ts,tsx}"
autonomous: true
---

<objective>
## Goal
Delete the AI chat assistant and the live-swap UI surface from the codebase in their entirety. The replacement for "live swap" is real-time setlist sync (lands in v50-03/v50-06; not built here). Net deletion target: ~3,000 LOC. After this phase, `grep` for amputated symbols returns zero hits, `next build` passes, and the full test suite remains green.

## Purpose
v5.0 is a from-scratch rewrite of the setlist editor on a local-first foundation. Both the AI chat assistant (which the user does not know about or use) and the live-swap UI surface (an over-engineered v3.0 + v4.0 redesign whose function is replaced by the new sync engine for free) are dead weight that would only complicate the rewrite if dragged along. Amputating them up front shrinks the navigable codebase, cuts test maintenance, and leaves a smaller surface for v50-03..v50-07 to operate on.

## Output
Three atomic deletion commits on master, each verified by tests + build + grep:
1. `feat(v50-02): delete AI chat assistant`
2. `feat(v50-02): delete live-swap UI surface + /live receiver`
3. `feat(v50-02): delete song groups + canLiveSwap permission system`

No new application code lands. No replacement built — the sync engine in v50-03 will provide the live-swap functionality as a side effect.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Prior Work (binding architecture)
@.paul/phases/v50-01-architecture/ARCHITECTURE.md
# §7 Amputation Scope is the deletion inventory and the order of operations for this phase.

## Source Files (to delete or amputate from)
@sheet-music-app/src/components/setlist/ChatPanel.tsx
@sheet-music-app/src/lib/chat-store.ts
@sheet-music-app/src/lib/chat-prompt.ts
@sheet-music-app/src/lib/setlist-firebase.ts
@sheet-music-app/src/types/models.ts
@sheet-music-app/firestore.rules
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | optional | This phase is destructive (deletion only) — no design work. Skill not required for execution; scoped back in for v50-05 (editor UI build). | ○ |

**Note:** SPECIAL-FLOWS.md says "/ui-ux-pro-max required for any phase that touches frontend UI/UX." Strict interpretation requires it; pragmatic interpretation excludes pure deletion phases. Treating as optional here per the destructive-not-creative rationale.
</skills>

<acceptance_criteria>

## AC-1: AI chat assistant fully removed
```gherkin
Given the codebase contains ChatPanel.tsx, chat-store.ts, chat-prompt.ts, /api/chat/* routes, and chat-related Firestore rules
When the amputation is applied
Then `grep -ri 'ChatPanel\|chat-store\|chat-prompt\|/api/chat' src/` returns zero hits
And `grep -ri 'chatHistory\|chat_messages' firestore.rules` returns zero hits
And the full test suite passes (no chat-tagged tests remain; non-chat tests unaffected)
And `next build` succeeds with zero errors and zero new warnings
```

## AC-2: Live-swap UI surface fully removed
```gherkin
Given the codebase contains SwapPicker, SwapBottomSheet, SwapToast, SwapButton (any extant), /live/[id] receiver page, and LeaderConsole live-mode entry
When the amputation is applied
Then `grep -ri 'SwapPicker\|SwapBottomSheet\|SwapToast\|SwapButton' src/` returns zero hits
And `src/app/live/` directory does not exist
And `grep -ri 'LeaderConsole' src/` returns zero hits OR the component has been pared to non-swap functions only (audited and documented in commit message)
And the full test suite passes
And `next build` succeeds
```

## AC-3: Song groups + canLiveSwap permission system fully removed
```gherkin
Given the codebase contains liturgicalSlot field on Track, config/songGroups Firestore doc + admin UI, canLiveSwap field on user profile + custom-claim mirror, Firestore rules for swap-only writes (affectedKeys hasOnly tracks/liveState/trackCount + isNotTooFrequent), and the swapTrack() function with all its callers
When the amputation is applied
Then `grep -ri 'liturgicalSlot\|canLiveSwap\|config.songGroups\|swapTrack\|isNotTooFrequent' src/` returns zero hits
And `firestore.rules` contains no `affectedKeys().hasOnly()` carve-out for setlists referencing tracks/liveState/trackCount, no isNotTooFrequent helper, no canLiveSwap-gated rules
And the full test suite passes
And `next build` succeeds
And `tsc --noEmit` clean
```

## AC-4: Three atomic commits land on master
```gherkin
Given the three deletion tasks (Task 1: chat, Task 2: live-swap UI, Task 3: song groups + canLiveSwap)
When all tasks complete
Then git log on master shows exactly three new commits with messages prefixed `feat(v50-02): delete ...`
And each commit individually passes tests + build (so a bisect can land mid-phase if needed)
And the final `git diff HEAD~3 HEAD --stat` shows ~3,000 net deletions, near-zero insertions
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Delete AI chat assistant</name>
  <files>
    src/components/setlist/ChatPanel.tsx,
    src/lib/chat-store.ts,
    src/lib/chat-prompt.ts,
    src/app/api/chat/**,
    src/components/setlist/v2/SetlistEditorV2.tsx (remove chat-trigger button + import),
    firestore.rules (chat-related rules),
    package.json (audit chat-only dependencies — keep Gemini OCR deps),
    **/*.test.{ts,tsx} (chat-tagged tests)
  </files>
  <action>
    Inventory then delete:
    1. Use `grep -ri 'ChatPanel\|chat-store\|chat-prompt\|/api/chat\|chatHistory\|registerOnApplyEdits' src/` to enumerate every reference.
    2. Delete the files: `ChatPanel.tsx`, `chat-store.ts`, `chat-prompt.ts`, the entire `src/app/api/chat/` directory tree.
    3. Remove every import of these modules from remaining files (likely `SetlistEditorV2.tsx` toolbar entry and possibly setlist-editor mount point). Remove the toolbar button(s) that opened the chat panel.
    4. Remove chat-tagged tests entirely (don't comment out — delete). Reference test names: any test file with `chat` in the path, or any `describe('chat...')` blocks within shared test files.
    5. Audit `firestore.rules` for chat-collection rules (e.g., `match /chat/{...}` or `match /chatHistory/{...}`) and remove them. Note: do NOT deploy rules in this phase — that's a separate operational step the user runs.
    6. Audit `package.json` dependencies. The Gemini OCR pipeline is KEPT (used by chord detection in v3.x). Only remove deps used EXCLUSIVELY by chat. Run `grep -ri '<dep-name>' src/` for each candidate to confirm zero non-chat callers before removing. If unsure, leave the dep — bundle-size cleanup is a separate concern.

    After deletion:
    - Run `npm test -- --run` (full suite must pass)
    - Run `npx next build` (must succeed, zero new warnings)
    - Run `npx tsc --noEmit` (must be clean)
    - Verify: `grep -ri 'ChatPanel\|chat-store\|chat-prompt\|/api/chat' src/` returns zero hits

    Avoid:
    - Touching the `Gemini` SDK or OCR pipeline (kept for chord detection)
    - Touching `withAuth` or any of the api-client patterns chat happened to use (other routes may rely on them)
    - Touching `AsyncLocalStorage` request-ID instrumentation (v4.4 P5 — chat USED it, but other routes use it too)

    Commit:
    `feat(v50-02): delete AI chat assistant`
    Body: list deleted files; note any deps removed (or "no deps removed — none chat-exclusive"); confirm zero grep hits + tests + build green.
  </action>
  <verify>
    grep -ri 'ChatPanel\|chat-store\|chat-prompt\|/api/chat\|chatHistory' src/ returns zero hits;
    npm test -- --run passes;
    npx next build succeeds;
    npx tsc --noEmit clean
  </verify>
  <done>AC-1 satisfied: AI chat assistant fully removed</done>
</task>

<task type="auto">
  <name>Task 2: Delete live-swap UI surface + /live receiver</name>
  <files>
    src/components/performance/SwapPicker.tsx,
    src/components/performance/SwapBottomSheet.tsx,
    src/components/performance/SwapToast.tsx,
    src/components/performance/SwapButton.tsx,
    src/components/performance/LeaderConsole.tsx (audit; pare or delete),
    src/app/live/** (entire directory),
    src/app/perform/setlist/[id]/page.tsx (remove SwapButton/Picker mounts),
    **/*.test.{ts,tsx} (swap-tagged tests)
  </files>
  <action>
    Inventory then delete:
    1. Use `grep -ri 'SwapPicker\|SwapBottomSheet\|SwapToast\|SwapButton' src/` and `grep -ri 'LeaderConsole' src/` to enumerate references. NB: some of these components may already be absent — v4.0 P1 ("Teardown Old Live System") was supposed to remove LeaderConsole + SwapButton + SwapBottomSheet + SwapToast; v3.4 P1 may have re-mounted some. Don't assume; verify.
    2. Delete every component file in `src/components/performance/` that exists and matches Swap*. Delete `LeaderConsole.tsx` if it exists AND its only purpose is live-mode/swap entry.
       - **If LeaderConsole has functions beyond live swap** (e.g., service step-through, current-song highlighting, monitor entry): pare it to the surviving functions only and document the choice in the commit body. If unsure whether something is load-bearing for the performance view, KEEP it — performance view stays untouched per ARCHITECTURE §7.3.
    3. Delete the `src/app/live/` directory entirely (the `/live/[id]` receiver page + any layout/loading siblings).
    4. Remove every import + JSX mount of the deleted components from `src/app/perform/setlist/[id]/page.tsx` (and any other consumers grep surfaces). The performance page should compile and render without these — current-song state stays as the existing local React `useState<number | null>(null)` per STATE.md L52 reference.
    5. Delete swap-tagged tests entirely.

    After deletion:
    - Run `npm test -- --run`
    - Run `npx next build`
    - Run `npx tsc --noEmit`
    - Verify: `grep -ri 'SwapPicker\|SwapBottomSheet\|SwapToast\|SwapButton' src/` zero hits; `ls src/app/live/` no such dir.

    Avoid:
    - Touching `PDFOverlay`, `PerformanceToolbar`, `MetronomeControl`, `TempoFlash`, or anything in the performance/transposition/monitor toolbars (KEPT — performance view stays untouched)
    - Touching `swapTrack()` in setlist-firebase.ts (deferred to Task 3 along with the song-groups + canLiveSwap cleanup)
    - Touching `liturgicalSlot` field on Track (deferred to Task 3 — that's a data-shape change; this task is UI-only)

    Commit:
    `feat(v50-02): delete live-swap UI surface + /live receiver`
    Body: list deleted files; note LeaderConsole disposition (deleted vs. pared); confirm performance view still renders (you'll see this via tests + build).
  </action>
  <verify>
    grep -ri 'SwapPicker\|SwapBottomSheet\|SwapToast\|SwapButton' src/ returns zero hits;
    [ ! -d src/app/live ];
    npm test -- --run passes;
    npx next build succeeds;
    npx tsc --noEmit clean
  </verify>
  <done>AC-2 satisfied: live-swap UI surface fully removed</done>
</task>

<task type="auto">
  <name>Task 3: Delete song groups, canLiveSwap permission, and swapTrack() callers</name>
  <files>
    src/lib/song-groups.ts (and any .ts file under src/lib/ song-groups-related),
    src/types/songGroup.ts (and any types/* with songGroup or liturgicalSlot),
    src/types/models.ts (Track type — remove liturgicalSlot field if present),
    src/types/user.ts (UserProfile — remove canLiveSwap field),
    src/lib/setlist-firebase.ts (remove swapTrack() function entirely),
    src/lib/auth.ts / src/lib/auth-claims.ts (remove canLiveSwap custom-claim mirror),
    Admin UI for song groups (likely src/app/(admin)/songs/groups/page.tsx or similar — grep to find),
    Admin UI for canLiveSwap toggle on UserRow,
    firestore.rules (remove affectedKeys().hasOnly() carve-out for setlists with tracks/liveState/trackCount; remove isNotTooFrequent() helper; remove any canLiveSwap-gated rules),
    Firestore data: leave `config/songGroups` doc in place (cleanup happens in v50-07 migration; don't manipulate prod data here)
  </files>
  <action>
    This task removes the data + permission infrastructure that backed the v3.0 swap system. After Tasks 1+2 the UI is gone; this task removes the schema, types, server-side helpers, and Firestore rules.

    Inventory:
    1. `grep -ri 'liturgicalSlot' src/` — every consumer of the field on Track
    2. `grep -ri 'canLiveSwap' src/` — every consumer of the permission
    3. `grep -ri 'swapTrack\|swapLiveTrack' src/` — function definition + every caller
    4. `grep -ri 'songGroups\|song-groups' src/` — module + admin UI
    5. `grep -ri 'isNotTooFrequent' firestore.rules` — rule helper
    6. `grep -ri 'affectedKeys' firestore.rules` — find swap-only carve-out

    Delete in this order (each step + verify):
    a. **`liturgicalSlot` field**: remove from `Track` type in `src/types/models.ts` (and any Zod schema mirror). Remove from any setlist-creation/import code that sets it. Existing track data on Firestore that has the field is harmless (Firestore is schemaless); v50-07 migration will scrub if desired.
    b. **`swapTrack()` function**: confirm zero callers (Task 2 should have removed them; if any remain, find why before deleting). Then delete the function definition + any associated tests.
    c. **`canLiveSwap` field**: remove from `UserProfile` type, from custom-claim mirror code (`auth-claims.ts` or wherever roles are mirrored), from any API route that sets/reads it. Remove the admin toggle in UserRow. Existing claim values on production users are harmless; they won't cause errors, just become no-ops.
    d. **Song groups module**: delete `src/lib/song-groups.ts`, `src/types/songGroup.ts`, the admin UI page, any related hooks (e.g., `use-song-groups.ts`).
    e. **Firestore rules**: in `firestore.rules`, remove the `affectedKeys().hasOnly(['tracks', 'liveState', 'trackCount'])` carve-out, the `isNotTooFrequent()` helper, and any rule that gates writes by `canLiveSwap`. Keep the standard band-leader/admin update rules. Note: do NOT deploy rules in this phase.
    f. Run tests + build + tsc after each substep — incremental verification catches misses.

    Final verification:
    - `grep -ri 'liturgicalSlot\|canLiveSwap\|songGroups\|swapTrack\|swapLiveTrack\|isNotTooFrequent' src/ firestore.rules` returns zero hits
    - `npm test -- --run` passes
    - `npx next build` succeeds
    - `npx tsc --noEmit` clean

    Avoid:
    - Touching `soundEngineer` permission (KEPT — used by monitor mix, unrelated to swap)
    - Manipulating production Firestore data (`config/songGroups` doc, user `canLiveSwap` claims). Migration script in v50-07 handles cleanup.
    - Touching the `setlists/{id}/history` audit subcollection (separate from swap UI; informational; let v50-07 decide)
    - Removing the `useMusicStore` (zustand) — orthogonal concern

    Commit:
    `feat(v50-02): delete song groups + canLiveSwap permission system`
    Body: enumerate deleted modules + types + Firestore rule blocks; flag that production Firestore data (`config/songGroups`, user `canLiveSwap` claims) is intentionally left for v50-07 migration cleanup; flag that `firestore.rules` deployment is a separate operational step (not done in this commit).
  </action>
  <verify>
    grep -ri 'liturgicalSlot\|canLiveSwap\|songGroups\|swapTrack\|swapLiveTrack\|isNotTooFrequent' src/ firestore.rules returns zero hits;
    npm test -- --run passes;
    npx next build succeeds;
    npx tsc --noEmit clean
  </verify>
  <done>AC-3 satisfied: song groups + canLiveSwap permission system fully removed</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- **Performance view chrome** — `src/app/perform/setlist/[id]/page.tsx` keeps its read-only setlist render, PDFOverlay, transposition toolbar, monitor mix, BPM/metronome, gig-packet print entry. Only remove direct mounts of the deleted Swap* components.
- **AI chord detection (Gemini OCR)** — `src/lib/auto-key.ts`, `src/app/api/auto-key/*`, anything related to chord detection. The Gemini SDK stays; only chat-specific dependencies (if any exist) go.
- **Auth, library, schedule, monitor mix, gig packet print** — entirely out of scope; do not touch even if grep surfaces accidental matches.
- **AsyncLocalStorage request-ID instrumentation** (v4.4 P5) — used by chat AND by other routes; keep it.
- **Setlist editor surface** (`use-setlist-logic.ts`, `setlist-flush.ts`, `setlist-draft.ts`, `SetlistEditorV2.tsx`) — these are deleted in v50-05 (cutover phase), NOT this phase. Touch only the chat-trigger button if mounted.
- **`setlists/*` Firestore documents** — no mutations. `liturgicalSlot` field stays on existing docs harmlessly until v50-07 migration.
- **`config/songGroups` Firestore document** — left in place; v50-07 migration cleans it.
- **`canLiveSwap` user custom claims on prod** — left in place; harmless once code stops reading them.

## SCOPE LIMITS
- No new application code — destructive deletions only.
- No new dependencies; only remove deps that are demonstrably chat-exclusive (rare).
- No Firestore rules deployment in this phase — `firestore.rules` is edited but not deployed; user runs `firebase deploy --only firestore:rules` separately at their discretion (per existing operational pattern).
- No production data manipulation — v50-07 migration handles orphan-data cleanup.
- No replacement built — "live swap = real-time setlist sync" lands in v50-03 + v50-06.
- /ui-ux-pro-max NOT required — this is destructive, not creative work.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] Three commits on master, each prefixed `feat(v50-02):`
- [ ] AC-1 grep verification: zero hits for chat symbols
- [ ] AC-2 grep verification: zero hits for swap UI symbols + `src/app/live/` does not exist
- [ ] AC-3 grep verification: zero hits for `liturgicalSlot|canLiveSwap|songGroups|swapTrack|swapLiveTrack|isNotTooFrequent` across src/ and firestore.rules
- [ ] `npm test -- --run` passes (final state)
- [ ] `npx next build` succeeds (final state)
- [ ] `npx tsc --noEmit` clean (final state)
- [ ] Performance view manually loads without runtime errors (visit `/perform/setlist/{any-id}` in a browser session OR confirm via existing performance-view tests if they cover the route)
- [ ] `git diff HEAD~3 HEAD --stat` shows net deletions ~3,000 LOC
</verification>

<success_criteria>
- AI chat assistant fully removed (AC-1 satisfied)
- Live-swap UI surface fully removed (AC-2 satisfied)
- Song groups + canLiveSwap permission system fully removed (AC-3 satisfied)
- Three atomic commits with clean bisectable history (AC-4 satisfied)
- Performance view continues to render and function (no regression)
- Codebase ~3,000 LOC lighter; v50-03 (sync engine) plans against the smaller surface
</success_criteria>

<output>
After completion, create `.paul/phases/v50-02-amputation/v50-02-SUMMARY.md` covering:
- Net LOC deletion (final `git diff HEAD~3 HEAD --stat` total)
- Per-task commit hashes
- LeaderConsole disposition (deleted entirely vs. pared to non-swap functions vs. didn't exist)
- Any chat-exclusive npm dependencies removed (or noted as "none")
- Surprises encountered (components/symbols that were already absent vs. expected)
- Firestore rules diff summary (rules edited but not deployed)
- Confirmation that v50-07 migration backlog now includes: `config/songGroups` doc cleanup + user `canLiveSwap` claim scrub
- Readiness signal for v50-03 (sync engine plan can proceed against the new, smaller surface)
</output>
