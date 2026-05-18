---
name: bongo:pause
description: Pause the current parallel-agent role and write a pickup pointer so the next session re-fires cleanly. Auto-detects role from in-session persona.
argument-hint: "[optional role override: boss | auditor | 1-7]"
allowed-tools: [Read, Write, Edit, Bash, AskUserQuestion]
---

<objective>
Write a pickup-pointer artifact for whichever role this session has
been acting as, so a future `/bongo:resume <role>` (or context-cleared
re-fire) has a clean handoff.

**When to use:** Before a context clear, an explicit session end, or
when the context window is filling up and the role wants to preserve
state.
</objective>

<context>
$ARGUMENTS (optional explicit role override; otherwise auto-detect)
</context>

<process>
1. **Identify the current role.**
   - If `$ARGUMENTS` is `boss`, `auditor`, or `1`-`7`, use it directly.
   - Otherwise introspect: the conversation's startup prompt and your
     sign-off pattern reveal whether you are supervisor
     (signs `from supervisor`), auditor (signs `from auditor`), or
     coder-<N> (signs `from coder-<N>`).
   - If unclear after introspection, ask Daniel via `AskUserQuestion`.

2. **Write the pickup pointer for the identified role.**

   - **supervisor** → prepend a new entry to the "Running log" section
     of `sheet-music-app/.coord/SUPERVISOR.md`, following the §A→§F
     PICKUP POINTER shape established by prior entries. Read the most
     recent existing entry as a template — cover: read order, current
     wave state, watch list, Daniel-ops queue, standing decisions, go
     signal for the resumer.

   - **auditor** → prepend a new entry to the "Running log" section of
     `sheet-music-app/.coord/AUDITOR.md`. Mirror the supervisor §A→§F
     structure as a starting template (the auditor pickup-pointer
     shape is less established as of 2026-05-19). Cover: current
     master-tip baseline, open VERIFICATION queue, regression-sweep
     baselines, memory-drift candidates queued, escalations pending.

   - **coder-<N>** →
     (a) append a HEADS-UP message to
         `sheet-music-app/.coord/inbox/supervisor.md` signed
         `from coder-<N>` announcing the pause and any in-flight work
         that needs coord awareness;
     (b) update `sheet-music-app/.coord/status/coder-<N>.md` with
         current task, last commit, held claims, and a
         "PAUSED — re-fire via `/bongo:resume <N>`" marker;
     (c) do NOT tear down the worktree — supervisor handles teardown
         on Daniel's go-ahead per
         `[[feedback_worktree_teardown_timing]]`.

3. **Report to Daniel** — one line:
   `Paused as <role>. Pickup pointer written to <path>. Ready for
   context clear or re-fire via /bongo:resume <role-or-N>.`

4. **Standing rules:**
   - Never push.
   - Never edit `src/`, `bridge/`, `mcp/`, `firestore.rules`, or any
     other production surface.
   - Never modify another role's persistent file
     (`SUPERVISOR.md`/`AUDITOR.md`/`CODER.md` content, or another
     coder's `status/coder-<M>.md` or `inbox/coder-<M>.md`).
   - Pause is read-mostly + targeted append — no destructive ops.
</process>
