---
phase: v44-06-modal-state
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/setlist/modals/EditDetails.tsx
  - src/components/setlist/modals/NamePrompt.tsx
  - src/components/admin/UserRow.tsx
  - src/components/admin/CollapsibleSection.tsx
  - src/components/performance/SwapPicker.tsx
  - src/components/setlist/modals/__tests__/modal-state.test.tsx
autonomous: true
---

<objective>
## Goal
Fix the four critical "modal state survives close/reopen" bugs flagged by the v4.4 R2B client-UX audit, plus the SwapPicker selection-reset bug. When a modal closes — for any reason — its internal state should be considered scrap; the next open is a fresh render against the latest props. Today, several modals leak stale state into the next interaction (wrong setlist data shown, prior role-confirmation still pending, prior search query still in input).

## Purpose
Closes UX-001, UX-002, UX-011, UX-015, UX-018 from R2B-client-ux.md. These are the most user-visible "weird, why is that there" bugs in the audit. With the band onboarding imminent, modal hygiene matters: a leader who opens NamePrompt to rename setlist B and sees setlist A's name pre-filled will lose trust in the app within a week.

## Output
- EditDetails re-seeds all internal state from props every time `open` transitions false→true.
- NamePrompt clears its input on close (or on the same false→true edge).
- UserRow's pending role-change confirmation clears on cancel/blur/parent re-render.
- CollapsibleSection persists its open/closed state across page navigations via `localStorage`, keyed by a stable `storageKey` prop.
- SwapPicker resets its selected-row state when reopened.
- A regression test suite covers the close-then-reopen invariant for the three setlist modals (admin components are excluded from the test suite per project memory: "Admin panels left unstyled (out of scope)" — bug fix still ships, just not test-locked).
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md
@.paul/phases/v44-00-full-audit/R2B-client-ux.md

## Source Files
@src/components/setlist/modals/EditDetails.tsx
@src/components/setlist/modals/NamePrompt.tsx
@src/components/admin/UserRow.tsx
@src/components/admin/CollapsibleSection.tsx
@src/components/performance/SwapPicker.tsx
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | recommended | Frontend correctness work — same call as v44-03 | ✓ (loaded earlier this session) |

Pure correctness work — no visual, layout, copy, or interaction-design changes. Only fixing "state should reset" invariants. Same scope rationale as v44-03.
</skills>

<acceptance_criteria>

## AC-1: EditDetails re-seeds from props on every open
```gherkin
Given EditDetails has been open and the user typed/changed fields, then closed it (without saving)
When the parent reopens EditDetails with a different setlist's props
Then every internal state field reflects the NEW props, not the prior session's edits
  And the rabbi/notes/date fields all show the new setlist's values
```

## AC-2: NamePrompt input is empty (or seeded from props) on every open
```gherkin
Given NamePrompt was opened with `defaultValue="A"` and the user typed "Annual"
And the user closed the modal without confirming
When NamePrompt reopens with `defaultValue="B"`
Then the input shows "B" (or empty if no defaultValue), NOT "Annual"
```

## AC-3: UserRow role-change confirmation resets on cancel
```gherkin
Given a UserRow shows a pending role-change confirmation ("Change to band_leader?")
When the user clicks Cancel (or the row re-renders due to a parent role list refresh)
Then the confirmation UI disappears and the row returns to its idle state
  And the role select reverts to the user's actual role from the latest props
```

## AC-4: CollapsibleSection persists open state by storageKey
```gherkin
Given a CollapsibleSection rendered with `storageKey="admin.users"` and toggled open
When the user navigates away and back to the page
Then the section remains open
  And different sections (different storageKeys) have independent persistence
  And sections with no storageKey behave exactly as before (in-memory only)
```

## AC-5: SwapPicker resets selection between opens
```gherkin
Given SwapPicker was opened and the user highlighted a candidate via arrow keys
When the user closes SwapPicker (Escape) and reopens it
Then no row is highlighted; selection starts at index 0 (or none, matching first-open behavior)
  And the search query is cleared
```

## AC-6: Regression tests lock the close/reopen invariant for setlist modals
```gherkin
Given the new modal-state.test.tsx
When the suite runs
Then it covers:
  - EditDetails: open with setlistA → modify → close → reopen with setlistB → assert fields show setlistB
  - NamePrompt: open with defaultValue="A" → type "Annual" → close → reopen with defaultValue="B" → assert input value === "B"
  - SwapPicker: open → arrow-down to select index 2 → close (Escape) → reopen → assert selected index is 0 (or none)
  And all pass.
```

## AC-7: Zero regression in 1321 existing tests
```gherkin
When the full vitest suite runs
Then 1321 pre-existing tests still pass
  And ≥3 net tests from modal-state.test.tsx pass
  And `npx tsc --noEmit`, `npm run lint`, `npm run build` are clean.
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: setlist modal state-reset (EditDetails + NamePrompt)</name>
  <files>
    src/components/setlist/modals/EditDetails.tsx,
    src/components/setlist/modals/NamePrompt.tsx
  </files>
  <action>
    **EditDetails.tsx (UX-001):**
    Locate the useState declarations seeded from props. Add a useEffect that re-seeds every state field whenever `open` transitions from false to true (or whenever the keying prop, e.g. `setlistId`, changes). Pattern:
    ```ts
    useEffect(() => {
        if (!open) return
        setName(initialName ?? '')
        setRabbi(initialRabbi ?? '')
        setNotes(initialNotes ?? '')
        setDate(initialDate ?? null)
        // every other field…
    }, [open, setlistId])  // re-seed on open OR setlist change
    ```
    Pick the right key prop (likely `setlistId` or `track.id` — read the file to confirm). DO NOT add `initialName`/etc. to the deps array — that would clobber the user's in-progress edits while the modal is open.

    **NamePrompt.tsx (UX-002):**
    Same pattern for the name input: re-seed `value` (or whatever the input state is called) on every false→true `open` transition. If the modal accepts `defaultValue`, re-seed to that; otherwise reset to empty string.

    Check existing controlled-vs-uncontrolled patterns. If the input is a Radix/shadcn `<Input>`, it's controlled — the useState reset is sufficient.

    Avoid:
    - Re-seeding while the modal is open (would lose user input).
    - Adding `initialName` to deps (same reason).
    - Changing the modal's open/close mechanism, animation, or visuals.
    - Touching the save handler — only resetting state, not changing what gets saved.
  </action>
  <verify>
    - `npx tsc --noEmit` clean.
    - `grep -n "useEffect\|setName\|setValue" src/components/setlist/modals/EditDetails.tsx src/components/setlist/modals/NamePrompt.tsx` — re-seed effect present.
    - `npx vitest run` full suite green (no regression).
  </verify>
  <done>AC-1, AC-2 satisfied (test-locked in Task 4).</done>
</task>

<task type="auto">
  <name>Task 2: admin modal state-reset (UserRow + CollapsibleSection)</name>
  <files>
    src/components/admin/UserRow.tsx,
    src/components/admin/CollapsibleSection.tsx
  </files>
  <action>
    **UserRow.tsx (UX-011):**
    Find the local state holding the pending role change (likely `pendingRole` or `confirmingRole` or similar). Two fixes:
    1. The row's onCancel handler must reset that state to `null`/`undefined`.
    2. Add a useEffect keyed on the user's role from props: `useEffect(() => { setPendingRole(null) }, [user.role])` — so any parent-driven role refresh clears the stuck confirmation.

    **CollapsibleSection.tsx (UX-018):**
    Add an optional `storageKey?: string` prop. Behavior:
    - If `storageKey` is provided: read initial open state from `localStorage.getItem(\`crc.collapse.\${storageKey}\`)`; persist on every toggle.
    - If `storageKey` is omitted: existing in-memory behavior (no persistence). Backward compatible.
    - Wrap the localStorage read in a `useState` lazy initializer guarded by `typeof window !== 'undefined'` to keep SSR safe.
    - Keep the existing default-open prop honored when no localStorage value exists.

    Identify the call sites of CollapsibleSection (grep) and add storageKey props to the ones the audit specifically called out — at minimum the admin sections that should remember their state. If unsure which sites to key, default to passing `storageKey={section.title}` for the top-level admin page sections only. Don't blanket-apply.

    Avoid:
    - Persisting open state for sections without an explicit storageKey (would surprise existing callers).
    - Crashing in SSR — guard all localStorage access.
    - Restyling the section, changing the chevron, etc. Functional fix only.
    - Per project memory ("Admin panels left unstyled — out of scope"): purely functional state-reset, no visual changes.
  </action>
  <verify>
    - `npx tsc --noEmit` clean.
    - `grep -n "localStorage\|storageKey" src/components/admin/CollapsibleSection.tsx` — at least 2 references.
    - `grep -n "pendingRole\|setPendingRole\|user.role" src/components/admin/UserRow.tsx` — reset wired up.
    - `npx vitest run` full suite green.
  </verify>
  <done>AC-3, AC-4 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: SwapPicker selection + query reset (UX-015)</name>
  <files>src/components/performance/SwapPicker.tsx</files>
  <action>
    Locate the state holding the selected/highlighted candidate index (likely `selectedIndex` or `highlightedIndex`) and the search query state.

    Add a useEffect that resets both when `open` transitions false→true:
    ```ts
    useEffect(() => {
        if (!open) return
        setQuery('')
        setSelectedIndex(0)  // or null, matching first-open behavior
    }, [open])
    ```

    Note: v44-03-01 already touched SwapPicker for stale-closure work. Verify your reset doesn't conflict with that fix (the keyboard handler refs are independent from the open/close reset).

    Avoid:
    - Resetting while open (kills user's typing).
    - Changing the empty-state behavior or autofocus logic from v44-03 plan.
    - Touching the swap-execution handler.
  </action>
  <verify>
    - `npx tsc --noEmit` clean.
    - `grep -n "useEffect.*open\|setQuery\|setSelectedIndex" src/components/performance/SwapPicker.tsx` — reset effect present.
    - `npx vitest run` full suite green.
  </verify>
  <done>AC-5 satisfied.</done>
</task>

<task type="auto">
  <name>Task 4: regression test suite for modal state-reset</name>
  <files>src/components/setlist/modals/__tests__/modal-state.test.tsx</files>
  <action>
    New React Testing Library suite. Follow patterns from existing modal/picker tests (grep `src/components/**/__tests__/*.test.tsx` for `userEvent.setup`, `Dialog`, `rerender`).

    Required cases:

    1. **EditDetails re-seeds on consecutive opens with different setlist props**
       - Mount EditDetails open=true with setlistA props
       - Type into name input ("Modified")
       - Rerender with open=false
       - Rerender with open=true and setlistB props
       - Assert: name input value === setlistB.name (NOT "Modified")

    2. **NamePrompt input resets on close/reopen**
       - Mount NamePrompt open=true defaultValue="A"
       - Type "Annual" into the input
       - Rerender open=false
       - Rerender open=true defaultValue="B"
       - Assert: input value === "B"

    3. **SwapPicker resets selection and query on reopen**
       - Mount SwapPicker open=true with a few candidates
       - Type "abc" into search; press ArrowDown twice
       - Rerender open=false
       - Rerender open=true
       - Assert: query input is empty; first row is highlighted (or none)

    Use minimal stub props — no Firebase, no real router. Mock useMusicStore / useCongregation if needed (existing test files show patterns). If a modal pulls heavy dependencies that make standalone testing painful, write a focused harness component above the assertions.

    Avoid:
    - Testing admin components (project policy: admin out of scope for tests).
    - Snapshot tests (brittle for modals).
    - Testing the visual close animation.
  </action>
  <verify>
    - `npx vitest run src/components/setlist/modals/__tests__/modal-state.test.tsx` — 3 cases pass.
    - Full suite ≥1324 green.
    - `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.
  </verify>
  <done>AC-6, AC-7 satisfied.</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- Save handlers — only resetting state, not changing what gets persisted.
- Modal open/close animations, transitions, visuals.
- Admin panel styling (project memory: out of scope).
- Firestore schemas or save-payload shape.
- SwapPicker keyboard logic from v44-03 (refs for handlers stay).
- The 1321 existing tests.

## SCOPE LIMITS
- 5 specific findings only (UX-001/002/011/015/018). Do not chase other UX-NN findings in adjacent files.
- localStorage persistence on CollapsibleSection only — do not blanket-add to other components.
- Admin component fixes ship without test coverage (per project policy on admin scope).
- No new dependencies.
- No refactor of modal infrastructure (e.g., extracting a shared `useResetOnOpen` hook). 5 inlined effects beats one shared hook here.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx vitest run` — ≥1324 green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — clean.
- [ ] Manual smoke (recommended, not required to ship): on the live deploy, open EditDetails on setlist A, close, open on setlist B → fields reflect B. Open NamePrompt twice with different defaults → input shows the latest. Toggle a CollapsibleSection, navigate away, navigate back → state preserved (only on sections that received `storageKey`).
- [ ] All AC satisfied.
</verification>

<success_criteria>
- 5 modal state-reset bugs closed.
- 3 new regression tests lock the setlist-modal invariants.
- Zero regression in 1321 existing tests.
- Zero visual UX change — pure correctness fixes.
- Last band-onboarding-blocker UX wart from R2B's "must fix before release" list cleared.
</success_criteria>

<output>
After completion, create `.paul/phases/v44-06-modal-state/v44-06-SUMMARY.md` with:
- Per-file diff summary.
- UX-NN findings closed.
- Test count before/after.
- Any modals already correctly resetting (documented as "no change needed").
- Commit hashes pushed to origin/master.
- Note on band-readiness: with v44-06 done, all R2B "must fix before release" items are closed.
</output>
