---
phase: v50-01-architecture
plan: 01
type: research
wave: 1
depends_on: []
files_modified: [".paul/phases/v50-01-architecture/ARCHITECTURE.md"]
autonomous: false
---

<objective>
## Goal
Lock the architectural decisions for the v5.0 local-first editor rewrite into a single sign-off document (`ARCHITECTURE.md`) so subsequent phases (v50-02 sync engine, v50-03 song catalog, v50-04 editor UI) can execute against a stable, agreed-upon foundation without re-litigating choices mid-build.

## Purpose
v5.0 is a from-scratch rewrite of ~8,400 LOC of editor surface and the ~1,300 LOC of save-path machinery underneath it. The cost of choosing the wrong local-first library, editor library, or doc model only surfaces in v50-04 when we're mid-cutover and the band has no working editor. This phase pays the design tax up front so the build phases are mechanical, not exploratory.

## Output
`.paul/phases/v50-01-architecture/ARCHITECTURE.md` — a single document with locked decisions, rationale, and rejected alternatives. No application code, no test code, no UI components ship in this phase.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Source Files (read-only — informs decisions, not modified)
@sheet-music-app/src/types/models.ts
@sheet-music-app/src/lib/setlist-firebase.ts
@sheet-music-app/src/hooks/use-setlist-logic.ts
@sheet-music-app/src/lib/setlist-flush.ts
@sheet-music-app/src/lib/setlist-draft.ts
@sheet-music-app/src/components/setlist/v2/SetlistEditorV2.tsx
@sheet-music-app/src/hooks/use-setlist-performance.ts
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | required | Before Task 3 (spreadsheet editor UX wireframes) | ○ |

**BLOCKING:** /ui-ux-pro-max MUST be loaded before Task 3. Other tasks (stack research, schema/state-machine design) are pure architecture work and do not require it.

## Skill Invocation Checklist
- [ ] /ui-ux-pro-max loaded (run command or confirm) — required before Task 3
</skills>

<acceptance_criteria>

## AC-1: Stack decisions documented with rationale
```gherkin
Given the v5.0 milestone requires a local-first foundation and a spreadsheet-shaped editor
When ARCHITECTURE.md is opened
Then it contains a "Stack Decisions" section that names the chosen local-first library (one of: Dexie + hand-rolled outbox, LiveStore, RxDB, TanStack Query Persister) and the chosen editor library (one of: TanStack Table + custom cells, AG Grid community, hand-rolled), each with a comparison matrix covering bundle size, IDB API ergonomics, sync-engine flexibility, mobile/touch story, and licensing — and an explicit "rejected because" line for each non-chosen option
```

## AC-2: Data model, state machine, schemas, and migration approach defined
```gherkin
Given the editor will be rebuilt against a new sync engine and a new song catalog
When ARCHITECTURE.md is opened
Then it contains:
  - A "Doc-in-IDB Model" section choosing JSON-blob vs. normalized rows, and last-writer-wins vs. CRDT (Yjs/Automerge), with rationale
  - A "Sync Engine State Machine" section with named states (Idle / Saving / Saved / Failed-with-retry / Queued / Conflict) and labeled transitions
  - A "Song Catalog Schema" section defining `songs/{id}.defaults: { key, lead, bpm }` plus rolling history shape, propagation rules (when reads happen, when writes happen, conflict resolution if a song is in two open setlists at once), and granularity (per-song global vs. per-(song, leadMusician) vs. per-(song, rabbi))
  - A "Migration Approach" section choosing in-place mutation of `setlists/*` vs. parallel collection + switch, with a rollback story
```

## AC-3: Spreadsheet editor UX wireframes capture key interactions
```gherkin
Given the new editor must feel spreadsheet-shaped (cell editing, dropdowns, tab/enter nav, drag reorder)
When ARCHITECTURE.md is opened
Then it contains a "Spreadsheet Editor UX" section with wireframes (ASCII or attached image refs) covering:
  - Default desktop view (tabular rows, cell anatomy, header)
  - Cell-edit interactions (click, double-click, tab, enter, escape, dropdown invocation)
  - Row reorder (drag handle on desktop, long-press on touch)
  - Add-row / delete-row behaviors and where focus lands after each
  - Touch/tablet variant (cell sizing, dropdown invocation, reorder)
  - Sync indicator placement (Saved / Saving / Failed-with-retry / Queued)
  - "Remote changed" reconciliation banner placement and the keep-mine / take-theirs control
  - Empty state (new setlist with zero rows) and the "Make next week's" action
```

## AC-4: User signs off on ARCHITECTURE.md before any code lands
```gherkin
Given ARCHITECTURE.md is complete and contains all sections from AC-1, AC-2, and AC-3
When the user reviews the document
Then the user either approves it (unblocking v50-02) or requests specific revisions, and the resume-signal records which
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Stack research and decision matrix</name>
  <files>.paul/phases/v50-01-architecture/ARCHITECTURE.md</files>
  <action>
    Research and document stack choices in two sections of ARCHITECTURE.md:

    **Local-first library** — compare the four candidates (Dexie + hand-rolled outbox, LiveStore, RxDB, TanStack Query Persister) on:
    - Bundle size (gzipped, after tree-shake) for the subset we'd actually use
    - IDB API ergonomics (raw vs. wrapped vs. ORM-y)
    - Sync-engine flexibility (do we have to adopt their sync model, or can we wire our own outbox?)
    - Conflict resolution primitives offered (CRDT, last-writer-wins helpers, version vectors)
    - Mobile/touch stability (any reports of IDB issues on iPad Safari)
    - Licensing and maintenance health (last release, GitHub activity, paid tier requirements)
    Use Context7 / WebFetch / WebSearch as needed for current data — DO NOT trust 2024 mental models for a 2026 decision.

    **Editor library** — compare TanStack Table + custom cell editors, AG Grid (community edition only — confirm what's gated to enterprise), and hand-rolled. Same evaluation axes plus:
    - Cell-editor extensibility (custom dropdown for Key/Lead/Type)
    - Drag-reorder support (built-in vs. plugin vs. DIY)
    - Touch behavior (column resize on touch is a known pain point)
    - Keyboard navigation (tab/enter/arrow) out of the box vs. wire-it-yourself
    - Headless vs. styled (we want full control over styling)

    Output: "Stack Decisions" section with a comparison matrix per library family + explicit chosen option + "rejected because" lines for each non-chosen option. Cite sources where it matters.

    Do NOT install any packages. Do NOT modify package.json. This task only writes to ARCHITECTURE.md.
  </action>
  <verify>ARCHITECTURE.md "Stack Decisions" section exists with two matrices and one chosen option per family + rejected-because lines for non-chosen</verify>
  <done>AC-1 satisfied: stack decisions documented with rationale</done>
</task>

<task type="auto">
  <name>Task 2: Data model, state machine, schemas, migration</name>
  <files>.paul/phases/v50-01-architecture/ARCHITECTURE.md</files>
  <action>
    Add four sections to ARCHITECTURE.md:

    **Doc-in-IDB Model** — decide between JSON-blob-keyed-by-setlist-ID vs. normalized row tables (`tracks`, `setlists`, `songs`). Decide between last-writer-wins (sufficient for single-leader workflow) vs. CRDT (Yjs/Automerge). State the decision and the trade-off. Document the IDB schema (object stores, indexes, key paths) at the level a Phase v50-02 implementer can build from.

    **Sync Engine State Machine** — name every state (e.g., `Idle`, `Dirty`, `Saving`, `Saved`, `Conflict`, `Failed`, `RetryQueued`, `Offline`). Label every transition with its trigger (e.g., `userEdits → Dirty`, `flushTimerFires → Saving`, `serverAccepts → Saved`, `serverRejectsVersion → Conflict`). Diagram in ASCII or Mermaid. Specify retry policy (exponential backoff, max attempts, dead-letter on permanent failure). Specify the truthful sync indicator's mapping from state → user-visible label.

    **Song Catalog Schema** — define `songs/{id}.defaults: { key, lead, bpm }` and the rolling history shape (e.g., `recent: [{ key, lead, bpm, setlistId, performedAt }]` with cap N). Specify propagation rules:
    - Read: when a track is added to a setlist, are defaults pulled at add-time only, or every render?
    - Write: when a track's key/lead/BPM changes in a setlist, when does it write back to the song's defaults? On every save? On explicit "remember this" button? On setlist-publish?
    - Conflict: if a song is in two open setlists at once and both are edited differently, which wins for the catalog default?
    - Granularity: per-song global, or per-(song, leadMusician), or per-(song, rabbi)? Pick one and explain.
    Define the Firestore rules implications (who can write to `songs/{id}.defaults`).

    **Migration Approach** — choose between (a) one-shot in-place mutation of `setlists/*` documents, (b) write to a parallel `setlistsV2/*` collection and atomic switchover, or (c) dual-read / lazy migration on first edit. State the rollback story for each. Pick one. Document the script's idempotency guarantees and how we verify pre/post counts. Specify the song-catalog backfill (walk every existing setlist, write song defaults from most-recent occurrence).

    Do NOT write the migration script in this task. Do NOT write the IDB schema as code. This is a design document, not implementation.
  </action>
  <verify>ARCHITECTURE.md contains all four sections; each section names an explicit chosen option with rationale; no implementation code present</verify>
  <done>AC-2 satisfied: data model, state machine, schemas, and migration documented</done>
</task>

<task type="auto">
  <name>Task 3: Spreadsheet editor UX wireframes</name>
  <files>.paul/phases/v50-01-architecture/ARCHITECTURE.md</files>
  <action>
    BLOCKED until /ui-ux-pro-max is loaded. Confirm the skill is loaded before proceeding.

    Add a "Spreadsheet Editor UX" section to ARCHITECTURE.md with wireframes (ASCII art is sufficient; image attachments fine if helpful). Cover:

    - **Default desktop view**: tabular layout, header row with column names (Order / Type / Title / Key / BPM / Lead / Notes / Chart), cell anatomy showing dividers/padding/font, sticky header on scroll
    - **Cell-edit interactions**:
      - Single-click → cell selected (visible focus ring)
      - Double-click or Enter → cell enters edit mode (or dropdown opens for Key/Lead/Type)
      - Tab → commit + move right; Shift-Tab → commit + move left
      - Enter → commit + move down; Shift-Enter → commit + move up
      - Esc → discard edit, restore prior value
      - Type-to-filter dropdown for Key (12 chromatic + sharps/flats), Lead (musicians from setlist + library), Type (song / reading / prayer / transition / section header)
    - **Row reorder**: drag handle column on the left (desktop); long-press anywhere on row to start drag (touch); visual drop indicator
    - **Add-row**: empty placeholder row at bottom; clicking it focuses Title cell and inserts a new row above the placeholder
    - **Delete-row**: row context menu (right-click on desktop, swipe-left on touch); confirms only on rows with content
    - **Multi-select / batch edit**: Shift-click range, Cmd-click toggle; batch action bar shows for 2+ selected (delete, change Type)
    - **Touch/tablet variant**: bigger cell hit targets (≥44px), no hover states (use focus instead), dropdown opens as bottom sheet on small screens
    - **Sync indicator**: top-bar position; states `Saved` / `Saving…` / `N unsaved (last synced Ns ago)` / `Failed — retry in Ns` / `Offline — queued` / `Conflict — review`; colors and icons per state
    - **"Remote changed" reconciliation banner**: appears when the sync engine detects server-side changes that conflict with local edits; modal with three-pane (local / remote / merged preview) and per-field "keep mine / take theirs" controls
    - **Empty state**: new setlist with zero rows; prominent "Make next week's setlist" / "Start from scratch" / "Use a template" actions
    - **Mobile-only flow**: how a one-handed phone user adds a song, changes a key, reorders — flag any concessions vs. desktop

    Apply /ui-ux-pro-max principles for color/contrast, hit-target sizing, focus states, and accessibility (WCAG AA minimum, keyboard nav, screen reader labels).

    Do NOT write any React components or styles. This task produces wireframes/specs only.
  </action>
  <verify>ARCHITECTURE.md "Spreadsheet Editor UX" section covers every bullet from the action list; wireframes are concrete enough that a Phase v50-04 implementer can build from them without re-deciding interactions</verify>
  <done>AC-3 satisfied: spreadsheet editor UX wireframes documented</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    `.paul/phases/v50-01-architecture/ARCHITECTURE.md` — sign-off document covering Stack Decisions, Doc-in-IDB Model, Sync Engine State Machine, Song Catalog Schema, Migration Approach, and Spreadsheet Editor UX.
  </what-built>
  <how-to-verify>
    1. Open `.paul/phases/v50-01-architecture/ARCHITECTURE.md`
    2. Confirm every section listed in AC-1, AC-2, AC-3 is present and concrete (not hand-wavy)
    3. Sanity-check the chosen stack against your gut: would you be comfortable building v50-02 (sync engine) on the chosen local-first library? would you be comfortable building v50-04 (editor) on the chosen editor library?
    4. Check the song-catalog propagation rules match your intent (sticky `key` / `lead` / `bpm` move with the song until explicitly changed)
    5. Check the migration approach has a rollback story
    6. Check the wireframes feel spreadsheet-shaped — not just "the old editor with a grid skin"
  </how-to-verify>
  <resume-signal>
    Type "approved" to lock decisions and unblock v50-02.
    Type "revise [section]: [what to change]" to request specific edits.
  </resume-signal>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- Any file under `sheet-music-app/src/**` — this phase produces a design doc, not code
- `package.json` / `package-lock.json` — no new dependencies install in this phase
- `.paul/ROADMAP.md`, `.paul/STATE.md`, `.paul/PROJECT.md` — those update during PLAN-creation and UNIFY, not mid-task
- Other phase directories (`.paul/phases/v50-02-*`, `v50-03-*`, etc.) — out of scope

## SCOPE LIMITS
- No application code, no test code, no Firestore rules edits, no migration scripts
- No installing packages or running build commands
- No making decisions that aren't in the AC list (e.g., don't pre-decide Phase v50-04 component file structure)
- ARCHITECTURE.md is the only artifact this plan produces

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `.paul/phases/v50-01-architecture/ARCHITECTURE.md` exists
- [ ] All AC-1, AC-2, AC-3 sections present and concrete
- [ ] User has typed "approved" at the checkpoint
- [ ] No files outside `.paul/phases/v50-01-architecture/` modified
- [ ] No packages installed; no source code changed
</verification>

<success_criteria>
- ARCHITECTURE.md sign-off complete (user approved)
- Stack decisions locked: one local-first library + one editor library named with rationale
- Doc-in-IDB model, sync state machine, song catalog schema, migration approach all documented with explicit choices
- Spreadsheet editor UX wireframes concrete enough to build from
- v50-02 (sync engine) is unblocked to plan next
</success_criteria>

<output>
After completion, create `.paul/phases/v50-01-architecture/v50-01-SUMMARY.md` covering:
- Final stack choices (one line each)
- Key data-model and propagation decisions (3-5 bullets)
- Migration approach chosen + rollback story (1 paragraph)
- UX-direction summary (1 paragraph)
- Any decisions deferred to a later phase, and why
- Open questions that surfaced during design and are tracked elsewhere
</output>
