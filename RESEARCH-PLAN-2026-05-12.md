# Research Plan — Pre-existing Issues + Realtime Collab Pivot

**Purpose:** Produce a credible, architecture-grounded **Fix Plan** (call it `FIX-PLAN-V2.md`) that addresses everything in [PREEXISTING-ISSUES-2026-05-12.md](PREEXISTING-ISSUES-2026-05-12.md), plus the realtime collaboration pivot the user requested (replace the per-conflict modal with Google-Docs-style merge).

**Why a research plan first, not a fix plan first:** the v1 BUGFIX-PLAN failed because subagents fabricated parts of the architecture (a `useSetlistLogic` hook, `TrackSheet.tsx`, a `performSave` debounce — none of which exist). The fix plan looked credible but would have wasted days of implementation on the wrong abstractions. This plan exists to prevent that recurrence by forcing architecture-from-source mapping *before* prescription writing.

---

## Operating principles (the anti-hallucination contract)

These apply at every step. Any deviation invalidates the deliverable.

1. **Read the source.** Every architectural claim cites a real file + line that exists at HEAD. If you can't open it, you can't cite it.
2. **Distinguish belief from evidence.** Three categories in every output:
   - **Verified** — read in the source, quoted or paraphrased with line ref.
   - **Inferred** — likely true based on patterns, but not directly verified. Flag with "(inferred)".
   - **Open** — unknown; needs investigation or a user decision.
3. **No subagent-as-architecture-oracle.** Subagents can search and summarize, but every *load-bearing* architecture claim must be re-verified by direct Read of the named file. If a subagent's claim doesn't match the file, the file wins.
4. **Cite git history when relevant.** `git log --oneline -- <path>` and `git blame` are first-class research tools. If a constraint is documented in a commit message, cite the SHA.
5. **Surface contradictions explicitly.** If the code disagrees with a comment, a test, a CLAUDE.md, or a prior commit message, name the contradiction. Don't reconcile silently.
6. **Plan reviews are independent.** Final synthesis is reviewed by a fresh agent with no prior context, holding the plan to the operating principles above. If it can't verify a claim from the doc + the repo, the claim doesn't ship.

---

## My decisions on the open questions (so research is unblocked)

- **Q1 (Tombstone TTL):** include a TTL prune. 30 days, run on engine startup before the first pump. Cheap defensive measure; the alternative (unbounded growth) has a long tail. Will revisit if Phase D collab pivot replaces the tombstone mechanism.
- **Q3 (Migrate in-cell `ChartBindPopover` to Dialog):** yes, migrate. Single code path for binding, fewer overlays to maintain, no behavior loss. Lower priority than data-integrity work.
- **Q2 (Reconciliation modal → Google-Docs collab):** user-driven; deferred to Phase D. The modal stays in place as an interim safety net until D ships.
- **Q4 / Q5:** these go into Phase C as investigations (clearFirestoreIndexedDB + outbox safety; `_shutdownRecoveryScheduled` semantics).

---

## Phases

Each phase has: input, method, deliverable, success criteria.

### Phase A — Inventory & cluster

**Input:** PREEXISTING-ISSUES-2026-05-12.md, plus the user-driven Phase D pivot.

**Method:** classify each issue along three axes:
- **Domain:** sync engine / persistence / overlays / types / build / etc.
- **Risk:** data-loss / user-visible bug / hygiene.
- **Dependency:** does X need Y decided first? (e.g., tombstone TTL depends on whether D replaces tombstones.)

**Deliverable:** `RESEARCH/CLUSTERS.md` — a table of issues grouped into clusters with a clear "ship now" vs "wait for collab pivot" split.

**Success criterion:** every issue from the source doc appears exactly once; clusters have clear scope.

**Estimate:** half a session.

---

### Phase B — Architecture map (the load-bearing one)

**Input:** the codebase at HEAD.

**Method:** read end-to-end key flows and write what's *actually* true. Not what the v1 plan assumed.

Specific traces to map:
1. **Local write path:** user cell edit → `applyEdit` (write.ts) → Dexie tx (entity row + outbox + tombstone if delete) → engine pump → `commitOutboxRow` → Firestore.
2. **Cross-device read path:** Firestore → `snapshot-listener.ts` → guards (outbox-pending, tombstone, LWW) → `db.put`/`db.delete` → `useLiveQuery` → React render.
3. **Server-priming on open:** server fetch (where?) → `SetlistGridHydrator` props → hydrator transaction → guards.
4. **Conflict / reconciliation path:** `VersionMismatchError` → outbox `'failed'` → `ReconciliationProvider` → modal → `engine.resolveConflict` → re-pump.
5. **Recovery paths:** `firebase.ts` IDB-wipe-on-assertion-failure; `controllerchange` reload; `_shutdownRecoveryScheduled`.
6. **Auth flow:** how does the engine get a token; what does `refreshAuthToken` do; how does it interact with the AuthError branch.
7. **Service worker:** when does it update; what does it actually cache; controllerchange behavior under in-flight writes.

For each flow:
- Files involved (verified-existing).
- Key functions with line refs.
- Invariants (what must hold; what would break if we change X).
- Edge cases the code explicitly handles (and why — cite commits).
- Edge cases the code *doesn't* handle (open issues).

**Deliverable:** `RESEARCH/ARCHITECTURE-MAP.md` — the single source of truth for what the system does today. Subsequent phases reference it.

**Success criterion:** a reader can answer "what happens when a user edits a track offline, then comes back online while another tab has also edited the same track" by reading only this doc + the cited files.

**Estimate:** 1-2 sessions. This is the most important phase; don't shortcut.

---

### Phase C — Per-cluster investigation

**Input:** Phase A clusters + Phase B architecture map.

**Method:** for each cluster, one mini-research doc following this template:

```
# Cluster: <name>

## Issues in scope
- <issue 1 with line refs>
- <issue 2>

## Files involved
<list with line refs>

## What the code actually does (verified)
<paragraph; quote critical code where ambiguous>

## What might be wrong (with confidence)
<each suspected issue with: Verified | Inferred | Open>

## Fix options
<2-4 options, with tradeoffs>

## Recommended fix
<with rationale + cost estimate>

## Verification plan
<how would we prove the fix works; what tests; what manual steps>

## Out-of-scope-but-related
<anything we found but won't fix in this cluster>
```

**Clusters to expect (anticipated from Phase A; final list determined by A):**

- **C1 — Outbox safety & recovery primitives.** `_shutdownRecoveryScheduled` semantics. `clearFirestoreIndexedDB` scope (does it touch `crc-local`?). 3-second SW reload. Hardcoded recovery timeouts.
- **C2 — Test harness fixes.** Why 14+ tests fail on `findByTestId('drag-handle')` — likely a shared harness setup gap. Worth fixing first because every subsequent fix is harder to verify without working tests.
- **C3 — Type debt.** `jest-axe` types, implicit `any` in test callbacks, SW types.
- **C4 — Dead code from Bug 1/2/3.** `isMobile`, possibly `ChartBindPopover`, possibly `subscribeToSetlist` in setlist-firebase. Verify each is dead before removing.
- **C5 — Comment/code contradictions.** The `_shutdownRecoveryScheduled` "debounced" claim. Any others Phase B surfaces.
- **C6 — Save-state machine semantics.** Is `dirty` reachable? Should `'Saving…'` show server-ack timing? Is `saved` tooltip correct?
- **C7 — Tombstone hygiene.** TTL prune design, observability, dead-letter interaction.

**Deliverable:** `RESEARCH/CLUSTER-<n>-<name>.md` per cluster.

**Success criterion:** each cluster doc can stand alone as input to a junior engineer who's never touched the code — they should be able to do the fix without reverse-engineering the system from scratch.

**Estimate:** 1 session per cluster, parallelizable where clusters are independent.

---

### Phase D — Realtime collab pivot research

This is the big architectural one. **Treat it as its own workstream** — it interacts with several Phase C clusters (tombstones, reconciliation modal, conflict path).

**Goal:** the user wants editing semantics like Google Docs / Notion — two people editing the same setlist sees each other's changes merge automatically, no modal, no precondition conflicts that block writes.

**Method:**

#### D.1 — Survey the technology space

Compare:
- **Y.js** — mature CRDT library; large ecosystem; persisters for IndexedDB + Firestore via y-firestore or via custom binding.
- **Automerge** — CRDT; smaller ecosystem but well-typed; recent v2 is performance-competitive.
- **Loro** — newer CRDT focused on text + structured docs; Rust core via WASM.
- **Liveblocks** — managed service (paid); turns Firestore into a sync backend with CRDT semantics; SaaS dependency.
- **No CRDT, just better LWW:** field-level LWW with operational hints (e.g., merge fields rather than whole rows; resolve at field grain). Cheapest; doesn't get true concurrent-text editing.

For each: cost, integration complexity, what currently breaks, what survives, persistence story (offline-first), Firestore relationship.

#### D.2 — Current data model audit

Read all setlist + track field shapes (`src/lib/local/types.ts`, `src/types/api.ts`). For each field, classify:
- **Atomic** (e.g., `bpm: number`, `key: string`) → LWW is fine; no merge needed.
- **Text-collaborative** (e.g., `notes`, `title`) → wants character-level merge.
- **Set-like** (e.g., `musicians[]`) → wants set merge.
- **Ordered** (e.g., `tracks[]` via `order: number`) → wants fractional-index or move-aware merge.
- **Structural** (delete / add / reorder) → wants intent-aware merge.

#### D.3 — Network layer fit

Does Firestore stay or get replaced?
- Y.js can persist via custom adapters. Storing CRDT updates in Firestore docs as binary or base64 is possible; latency is roughly the same as today.
- Alternative: replace Firestore for setlist docs (keep it for auth + non-collab data); add a WebRTC mesh or a Yjs websocket server. Bigger lift; better UX.
- Hybrid: Y.js with Firestore as the *durability layer* and direct peer sync (or a relay) for low-latency presence.

#### D.4 — Migration story from LWW (current)

Two big questions:
- Is the cutover **per-document** (each setlist becomes CRDT-formatted) or **global** (whole app switches)?
- What happens to existing setlists in Firestore? Do they need a one-shot migration write?

Also: does the outbox engine still exist? If yes, what does it carry — CRDT updates instead of patches? If no, what replaces offline durability?

#### D.5 — Identify what CHANGES in PREEXISTING-ISSUES.md if we ship CRDT

After CRDT lands:
- Reconciliation modal: **deleted** (no more `VersionMismatchError`).
- Tombstones: **redesigned** as CRDT delete markers (Y.js handles this natively).
- `clearFailedOutboxRows` / retry: **may be irrelevant** depending on D.3.
- Save-state machine: simplifies to `synced | unsynced | offline`.
- "Failed — retry" UX: **goes away**; CRDT writes don't fail with version mismatch.

The fix plan should NOT spend effort on issues that the collab pivot moots — that's the dependency analysis Phase A flags.

**Deliverable:** `RESEARCH/COLLAB-PIVOT.md` with:
- Recommended tech choice + rationale.
- Migration roadmap (3-6 months realistic).
- Per-field merge strategy.
- Interaction map: which PREEXISTING-ISSUES items survive vs become moot.

**Success criterion:** the recommendation is defensible against pushback. Costs and tradeoffs are concrete, not handwaved.

**Estimate:** 2-3 sessions. Touches API design, UX, and infrastructure.

---

### Phase E — Synthesis: write `FIX-PLAN-V2.md`

**Input:** all of Phase A-D outputs.

**Method:** compose a sequenced, prioritized plan. Structure:

```
# Fix Plan v2

## Sequencing rationale
- Tier 1: ship-now data-integrity (does not depend on Phase D).
- Tier 2: ship-now hygiene (cleanup, types, dead code) — parallelizable.
- Tier 3: collab pivot (Phase D recommendation).
- Tier 4: post-pivot cleanup (issues that re-shape after Tier 3).

## Per-fix template
Each fix has:
- Goal (one sentence)
- Files + line refs
- Diff sketch (not literal code — what changes conceptually)
- Verification plan
- Rollback story
- Tier
- Dependencies
- Estimate
```

**Deliverable:** `FIX-PLAN-V2.md`.

**Success criterion:** a reviewer can disagree productively. No "magic" steps. Each fix has a verification path. Tier assignments justified.

**Estimate:** 1-2 sessions, after Phases A-D land.

---

### Phase F — Independent review

**Input:** `FIX-PLAN-V2.md` + the research docs.

**Method:** spawn a fresh agent (no prior context) with this prompt:

> Verify the attached fix plan against the cited files. For every claimed line ref, confirm it exists at HEAD. For every architectural claim, confirm the code supports it. Flag every claim that you cannot independently verify, every hallucinated file/function, every contradiction between the plan and the source. Don't fix; just audit.

**Deliverable:** `RESEARCH/PLAN-AUDIT.md` — gaps, hallucinations, contradictions.

**Success criterion:** zero unverified load-bearing claims in the final plan.

**Estimate:** half a session.

---

## Deliverable artifacts (final set)

```
RESEARCH/
  CLUSTERS.md              (Phase A)
  ARCHITECTURE-MAP.md      (Phase B — most important)
  CLUSTER-1-recovery.md    (Phase C, one per cluster)
  CLUSTER-2-test-harness.md
  CLUSTER-3-type-debt.md
  CLUSTER-4-dead-code.md
  CLUSTER-5-contradictions.md
  CLUSTER-6-save-state.md
  CLUSTER-7-tombstone-hygiene.md
  COLLAB-PIVOT.md          (Phase D)
  PLAN-AUDIT.md            (Phase F)
FIX-PLAN-V2.md             (Phase E — the deliverable for the team)
```

---

## Anti-hallucination checks (built into every research output)

Every research doc carries this footer:

```
## Verification footer
Files cited and verified at HEAD as of <SHA>:
- <file>:<line range> — checked at <ISO date>
- ...

Claims unverified at writing time (must be resolved before Phase E):
- <claim> — why unverified, who to ask
- ...
```

This makes auditability cheap: Phase F just walks the footers and re-checks at the new HEAD.

---

## Recommended sequencing

```
Phase A (clusters)              ─┐
Phase B (architecture map)       ├── prerequisites
Phase D (collab pivot research) ─┘   ▼
                                Phase C (per cluster) — parallelizable
                                     ▼
                                Phase E (FIX-PLAN-V2)
                                     ▼
                                Phase F (audit)
```

A + B + D can run in parallel (B is read-heavy, D is survey-heavy). C is gated on A + B (need clusters defined and architecture mapped). E is gated on C + D.

---

## What this plan deliberately does NOT do

- It does not start writing fixes. The deliverable is a fix plan, not a fix.
- It does not pre-commit to a CRDT library. Phase D produces a recommendation; the team chooses.
- It does not promise schedules — the estimates are session-counts, not calendar dates.
- It does not re-investigate Bugs 1/2/3 — those shipped in [BUGFIX-PLAN-2026-05-12.md](BUGFIX-PLAN-2026-05-12.md).

---

## Decisions made (2026-05-12)

User locked these inputs to Phase D so research can proceed without
re-asking:

- **Tech choice: self-hosted Y.js** (not Liveblocks). Rationale: small
  user base; avoid vendor lock-in + per-MAU pricing; Y.js is mature,
  MIT-licensed, integrates cleanly with the existing Firebase stack as
  a durability adapter.
- **Migration: one-shot, ASAP.** User is effectively the sole active
  user right now, so the risk of bulk converting existing setlists is
  acceptable. This deletes the gradual / lazy-hydration code path from
  scope and simplifies the cutover significantly.
- **Offline-first: non-negotiable.** Must match or exceed the current
  outbox engine's durability (survive tab-close, force-quit, multi-tab,
  offline). Y.js + `y-indexeddb` + a Firestore-as-durability adapter is
  the working hypothesis.
- **Presence: deferred to v2.** Ship merge semantics first; live cursors
  and "who's editing now" are a follow-up. Y.js's awareness protocol
  makes adding presence later cheap.

## Open inputs that still need to surface during research

- Per-field merge strategy (Phase D.2 — needs the data-model audit).
- Whether the outbox engine survives in some form post-pivot or gets
  retired entirely (Phase D.3 / D.4 — depends on whether Y.js's IDB
  persister + a Firestore-update-log adapter fully replaces it).
