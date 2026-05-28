# Cycle-11 cowork — Lane M2 PROMPT: Stickiness + state-divergence probe matrix

> **Drafted 2026-05-28 against deployed surface at origin/master `8390b31aacd47e39b7389c01c6e09b71c70f4a03`** — every route, component, MCP tool name, e2e spec, and helper cited below verified via `git ls-tree` / `git cat-file -p` against the dispatch SHA per `[[feedback_cowork_prompt_verify_before_write]]`. Read `.coord/cycle-11-CHARTER.md` once first (north-star, the 4 anchor moments, the 3 NEW bug-classes, the 7 anti-patterns, the no-ship-freeze run policy).
>
> **One-line gist (charter §7):** *"Anchored on Daniel's 3 NEW bug-classes (stickiness, fresh-tablet, auth-divergence). Methodically probe a finite matrix: (action × surface × identity-state × reload-mode) → did it stick / did it match / did the other identity see it? Report = matrix-of-divergence with cells colored pass/regression + repro recipes that withstand a fresh-tablet redo."*

---

## §0 — You are cowork-Claude (cycle-11, lane M2)

You are a single-thread cowork-Claude session, **~75 min real wall-clock** (per `[[feedback_cowork_real_harness]]` — NOT a walk-away; CFC + chrome.debugger DOES NOT WORK). Your job is to **methodically traverse a state-divergence matrix** on the deployed app at `https://www.centralreform.live` and emit a **matrix-of-divergence report**.

You are NOT auditing a screen. You are checking, cell by cell, whether a change a musician makes **(stuck × visible × consistent)** across reload, across surface, across identity. Every cell is a tiny user moment: "musician transposes to D, refreshes, did the chart come back in D or E?" The matrix is the methodology — exhaustive enough to catch the stickiness/cache/auth-divergence classes that single-state probes miss; small enough that one cowork session can complete the core ~70 cells.

**The methodological bet (charter §0 + §3):** past cycles tested in ONE identity state (Daniel signed-in, hot cache). All three bug-classes Daniel named are INVISIBLE to a single-state probe — stickiness needs reload, fresh-tablet needs no-cache, auth-divergence needs ≥2 identities. The matrix encodes the missing dimensions as explicit axes.

---

## §1 — Anchor moments graded (charter §1)

Every cell tags ≥1 anchor moment. A cell that grades zero moments is a class violation (AP-1) and you don't write it. The four moments:

- **A1 — Setup-time chart prep** (cells where the writer/leader prepares before service; the moment fails if the reader-iPad shows stale/missing data first thing in the morning)
- **A2 — Between-songs scramble** (cells where the musician re-reads the same surface mid-service; the moment fails if a hot reload or sibling iPad shows different state)
- **A3 — Mid-service key/song change** (cells where the leader mutates a track or order during the service; the moment fails if the change is local-only or snap-backs)
- **A4 — Sanctuary edge** (cells under fresh-tablet / offline / unauthenticated-public / cross-device conditions)

Tagging shape on every cell: `[A1/A3]` etc.

---

## §2 — The three NEW bug-classes (charter §2)

Each cell probes ≥1 class. The matrix is structurally designed so each row dimension lights up a class:

- **Stickiness regressions** — Persistence-mode axis (D). The "writes and reloads" probe.
- **Fresh-tablet cache divergence** — Identity-state axis (C) ∋ {fresh-incognito, fresh-tablet}. The "no SW, no cache, no auth" probe.
- **Auth-state divergence** — Identity-state axis (C) ∋ {unauth, musician, member, band_leader, admin}. The "same surface, different role" probe.

A cell may probe multiple classes (e.g., a fresh-tablet × cold-reload × member-role cell probes all three).

---

## §3 — The matrix axes (finite + enumerable)

### Axis A — Actions (10 canonical user mutations)

Verified against `src/lib/mcp/tools/index.ts` registry @ origin/master; client-side actions verified in-component.

| ID | Action | Vehicle (verified path) | Tier-2 caveat |
|----|--------|-------------------------|----------------|
| **A.1** | **Transpose key** in Perform | `PerformanceToolbar.tsx` TransposerMenu (UI) | client state — observe persistence after reload |
| **A.2** | **Swap bound chart** | MCP `swap_chart` (registered `src/lib/mcp/tools/index.ts`) | writes prod — use `c11m2-*` fixture setlist only |
| **A.3** | **Reorder tracks** | MCP `reorder_setlist` | fixture only |
| **A.4** | **Annotate chart** (finger draw) | `PDFOverlay.tsx` → annotation layer in `PerformanceToolbar` | client state — likely ephemeral; that *is* the finding if it doesn't persist |
| **A.5** | **Edit track metadata** (key/bpm/notes/leadMusician) | MCP `update_track({patch:{key,bpm,notes,leadMusician,songId,position,...}})` (verified `src/lib/mcp/tools/setlist-write.ts:185-190,449-478`) | fixture only |
| **A.6** | **Add a track** | MCP `add_track_to_setlist` (or `bulk_add_tracks`) | fixture only |
| **A.7** | **Remove a track** | MCP `remove_track` | fixture only |
| **A.8** | **Leader edits setlist metadata** (name/eventDate/serviceType/rabbi/serviceNotes) | MCP `update_setlist` | fixture only |
| **A.9** | **Monitor wedge change** | MCP `set_send_level` / `set_send_mute` / `set_bus_fader` / `assign_monitor_bus` | ⛔ **NO live X32 writes** — visual-shape only on `/monitor`; never call the write tools unless desk is on AND Daniel confirms (`[[project_mixer_feature]]`, `[[feedback_terminology]]` wedges-not-IEM) |
| **A.10** | **Save chart "16/16"** (post-upload library cache class) | MCP `upload_chart` → `finalize_chart_upload` → `list_library` / `search_library` re-read | fixture only; the C10I1-005 cache-staleness class |

### Axis B — Surfaces (6 observation points)

| ID | Surface | Verified path |
|----|---------|---------------|
| **B.1** | `/perform/setlist/<id>` musician view | `src/app/perform/setlist/[id]/page.tsx` + `SetlistPerformClient.tsx` |
| **B.2** | `/perform` public landing | `src/app/perform/page.tsx` → `PublicSetlistListing` (client useAuth + `MAX_PUBLIC_SERVICES=5` cap) |
| **B.3** | `/dashboard/setlists/<id>` editor | (dashboard route — exists; SetlistGrid is a do-not-touch zone but READING the editor view is in-scope) |
| **B.4** | MCP read tool | `get_setlist` / `list_setlists` / `get_song` / `search_library` / `list_library` |
| **B.5** | Gig-packet print | `src/app/api/setlist/print/{public,personal,prepare}/route.ts` |
| **B.6** | `/monitor` — **visual-shape only** | (no API call; render audit) |

### Axis C — Identity states (8 observers)

| ID | Identity | How to mint |
|----|----------|-------------|
| **C.1** | Daniel-signed-in dev baseline | use his real session if Daniel hosts the run; else skip — this is the cell that "always passes" by definition |
| **C.2** | band_leader fresh | `create_test_account({role:"band_leader", uidPrefix:"c11m2"})` → `mintSession({baseUrl, bearer:resp.token, uid:resp.uid, firebaseAuth})` (Web-SDK signin per `cycle-4/harness/lib/probe.mjs:70-126`) |
| **C.3** | musician fresh | same pattern, `role:"musician"` |
| **C.4** | member fresh | same pattern, `role:"member"` |
| **C.5** | admin via admin-test-session | `POST /api/auth/admin-test-session` with header `x-mcp-admin-test-session-secret: <secret>` (Daniel sets `MCP_ADMIN_TEST_SESSION_SECRET` in Vercel; route returns 503 if unset → mark cell `⊘ skipped — secret unset`). Verified `src/app/api/auth/admin-test-session/route.ts:80-89`, 1h TTL, `admin_test:true` claim |
| **C.6** | unauthenticated guest | Playwright context, no `storageState`, no cookies. Probes B.2 + B.5 (public/print public path) + any-other intentionally-public surface |
| **C.7** | fresh-incognito | Playwright context: `storageState:undefined`, `serviceWorkers:'block'`, `extraHTTPHeaders:{}`. Probes the SW-not-installed, Firestore-cache-cold path |
| **C.8** | fresh-tablet | `ipad-webkit` project (820×1180 WebKit) + fresh-incognito modifiers. Closest deterministic proxy for "first-touch-of-the-week 11" iPad" per `[[project_band_ipad_hardware]]` |

> **★ META-003 status (current reality, NOT the stale memory):** `cycle-4/harness/lib/probe.mjs:70-126` `mintSession` now AWAITS `signInWithCustomToken(firebaseAuth, customToken)` when given `firebaseAuth` (META-003 mitigated). The Web SDK *does* hydrate. **`/api/auth/test-session` cookie alone still does NOT** — you MUST pass `firebaseAuth` to `mintSession`. This is the central design constraint: every C.2-C.5 cell uses `mintSession({firebaseAuth})`, never raw `test-session` cookie alone, or the client listeners stay cold and the matrix lies. (The `[[feedback_cowork_real_harness]]` memory entry mentions META-003 as a "blocker" — that was true at write-time; it is no longer the design constraint. The new design constraint is *don't forget firebaseAuth*.)

### Axis D — Persistence modes (8 reload/divergence transitions)

| ID | Mode | How |
|----|------|-----|
| **D.1** | Read-after-write | observe in same context immediately; no reload |
| **D.2** | Hot reload | `page.reload()` (or F5) — same context, keeps storage + SW |
| **D.3** | Cold reload | `context.close()` + new context from same `storageState` — keeps storage, may re-init SW |
| **D.4** | Cross-session | sign out (`/api/auth/logout`) + sign back in (mint fresh) — re-fetches everything from Firestore |
| **D.5** | Cross-identity, same surface | musician A writes; musician B (separate context) reads B.x |
| **D.6** | Cross-device, same identity | two `ipad-webkit` contexts, same `storageState`, both observe — proxy for iPad-A vs iPad-B |
| **D.7** | Cron-tick wait | trigger `verify-chart-bond-health` / `admin-consistency` cron via `/api/cron/admin-consistency` (verified runs `*/15 * * * *` per `[[project_ai_cost_baseline]] / vercel.json`) — proves cron-dependent state propagates |
| **D.8** | Fresh-incognito | new context, no `storageState`, no SW, no Firestore cache — re-fetch pure |

---

## §4 — Cell selection: the CORE MATRIX (~70 cells)

The full Cartesian (10×6×8×8 = 3840) is intractable. The **core matrix** below is the cell set you MUST run; it's anchored on bug-class × moment coverage so every class lights up across multiple actions. Cells beyond the core are optional "depth-dive."

A cell is written as `M.<class>.<action>.<persistence>` for stickiness, `M.FT.<action>.<surface>` for fresh-tablet, `M.AD.<surface>.<identity>` for auth-divergence. Each carries `[anchor]` tags.

### §4.1 — Stickiness sub-matrix (Class S) — 30 cells

Each row = one action. Each column = one persistence mode the change SHOULD survive. Tier-2 caveat: every write goes through a `c11m2-*` uidPrefix-scoped fixture; clean up at end of run.

| Action ↓ \ Persistence → | D.1 r-a-w | D.2 hot | D.3 cold | D.4 x-session | D.5 x-identity | D.6 x-device | D.7 cron-tick |
|--------------------------|-----------|---------|----------|---------------|----------------|--------------|---------------|
| **A.1 transpose** [A2/A3] | ✓expected | ?probe  | ?probe   | ?probe        | ?probe         | ?probe       | n/a           |
| **A.2 swap chart** [A1/A3] | ✓        | ?       | ?        | ?             | ?              | ?            | ?probe        |
| **A.3 reorder** [A1/A3]   | ✓         | ?       | ?        | ?             | ?              | ?            | n/a           |
| **A.4 annotate** [A2]     | ✓         | ?       | ?        | n/a           | ?              | ?            | n/a           |
| **A.5 edit metadata** [A1] | ✓        | ?       | ?        | ?             | ?              | ?            | n/a           |
| **A.6 add track** [A1]    | ✓         | ?       | ?        | ?             | ?              | ?            | ?probe        |
| **A.8 leader edit setlist** [A1] | ✓  | ?       | ?        | ?             | ?              | ?            | n/a           |

(`?probe` = cell to traverse; `n/a` = mode doesn't apply to action; `✓expected` = trivially true if write succeeds — counts as one cell but a fail here = a write-path bug, not a stickiness bug.)

Cell count: 7 actions × ~5-6 modes each = 30 cells. PROMPT enumerates each cell explicitly in the report template (§7). The probe pattern per cell is:

```js
// Pattern: stickiness probe (matrix cell M.S.<action>.<persistence>)
async function probeStickiness(cell) {
  const ctx = await openContext(cell.identity);         // C.2-C.8 per axis
  const before = await readSurface(ctx, cell.surface);  // B.x baseline
  await mutate(ctx, cell.action);                       // A.x via MCP or UI
  await applyPersistence(ctx, cell.persistence);        // D.x reload/wait
  const after = await readSurface(ctx, cell.surface);
  return { stuck: deepEqual(extractField(after, cell.action.field), cell.action.newValue),
           regressed: deepEqual(extractField(after, cell.action.field), before.value),
           diverged: !stuck && !regressed };
}
```

(The PROMPT specifies the cell catalog; the implementation lane writes the probe script at `cycle-4/harness/probes/cycle-11-m2-stickiness.spec.ts`.)

### §4.2 — Fresh-tablet sub-matrix (Class FT) — 20 cells

For each action × each surface the action's effect should appear on, run the surface under **C.7 fresh-incognito + C.8 fresh-tablet**, comparing to **C.1 Daniel-signed-in baseline** to detect "works on dev, dead on tablet."

| Surface ↓ \ Identity → | C.1 dev | C.6 unauth | C.7 fresh-incognito | C.8 fresh-tablet |
|------------------------|---------|------------|---------------------|-------------------|
| **B.1 /perform/setlist/<id>** [A1/A2/A4] | ✓ | per role | ?probe | ?probe |
| **B.2 /perform landing** [A1/A4] | ✓ | ?probe | ?probe | ?probe |
| **B.3 /dashboard editor** [A1] | ✓ | n/a | n/a (auth req'd) | n/a |
| **B.4 MCP read** [A1] | ✓ | n/a | n/a | n/a |
| **B.5 gig-packet print** [A1] | ✓ | ?probe (public path) | ?probe | ?probe |
| **B.6 /monitor** [A4] | ✓ | n/a | n/a | per band_leader |

Cell count: 6 surfaces × ~3-4 fresh-states each = ~20 cells. Pattern:

```js
// Pattern: fresh-tablet probe (cell M.FT.<surface>.<identity>)
async function probeFreshTablet(cell) {
  const ctx = await browser.newContext({
    storageState: undefined,
    serviceWorkers: 'block',                  // CRITICAL: blocks SW from hydrating
    viewport: cell.identity === 'C.8' ? { width: 820, height: 1180 } : undefined,
    ...(cell.identity === 'C.8' ? { ...devices['iPad Pro 11'] } : {}),
  });
  // No auth bootstrap if cell.identity is C.6/C.7/C.8 unauth or auth-via-UI
  await ctx.newPage().goto(cell.surfacePath);
  return await observeSurfaceHealth(ctx, cell.surface); // {first-paint-ok, content-rendered, no-blank, no-error-boundary}
}
```

### §4.3 — Auth-divergence sub-matrix (Class AD) — 20 cells

For each surface × each identity state, observe what's visible / forbidden / different. The point: catch surfaces that *should* be public but accidentally require auth, AND surfaces that show a different role too much / too little.

| Surface ↓ \ Identity → | C.6 unauth | C.3 musician | C.4 member | C.2 band_leader | C.5 admin |
|------------------------|-----------|--------------|------------|------------------|-----------|
| **B.1 /perform/setlist/<id> (published)** | expect: VIEWABLE | VIEWABLE | VIEWABLE | VIEWABLE (+edit) | VIEWABLE |
| **B.1 /perform/setlist/<id> (unpublished)** | expect: 404 | depends | depends | VIEWABLE | VIEWABLE |
| **B.2 /perform landing** | expect: VIEWABLE + Sign-In card | VIEWABLE no card | VIEWABLE no card | VIEWABLE no card | VIEWABLE no card |
| **B.3 /dashboard editor** | expect: redirect to login | VIEWABLE read-only? | VIEWABLE read-only? | VIEWABLE editable | VIEWABLE editable |
| **B.4 MCP `list_setlists`** | expect: 401 | 200 own scope | 200 own scope | 200 broader | 200 all |
| **B.5 gig-packet print (public)** | expect: 200 | 200 | 200 | 200 | 200 |
| **B.6 /monitor** | expect: 401 | depends on monitor access | depends | VIEWABLE | VIEWABLE |

Each cell observed → divergence if actual ≠ expected. Especially valuable: cells where Daniel's signed-in dev box masks an accidental auth requirement.

Pattern:

```js
// Pattern: auth-divergence probe (cell M.AD.<surface>.<identity>)
async function probeAuthDivergence(cell) {
  const ctx = await mintIdentity(cell.identity); // including no-mint for C.6
  const resp = await fetchSurface(ctx, cell.surface); // HTTP code + DOM shape + listing/error
  return classify(resp, cell.expected);          // {match, divergent_more_access, divergent_less_access, broken}
}
```

---

## §5 — Boot order

1. Read `.coord/cycle-11-CHARTER.md` end-to-end (the shared frame).
2. Read THIS PROMPT end-to-end.
3. Read `cycle-4/harness/README.md` for the `npm run stress` flags + probe-batch + `mintSession` reality.
4. Pull master tip: `git log -1 origin/master` — note the SHA; re-confirm `MAX_PUBLIC_SERVICES=5` and `swap_chart` in registry haven't drifted from this PROMPT's `8390b31aac` baseline.
5. **Boot pre-flight (HARD-BLOCK → BLOCKER supervisor + stop):**
   - `npm run stress -- --dry-run` resolves the ipad-webkit projects.
   - `GET https://www.centralreform.live/perform` → 200, renders `PublicSetlistListing`.
   - `cycle-4/harness/out/` writable.
   - If `MCP_ADMIN_TEST_SESSION_SECRET` is in your env, confirm `POST /api/auth/admin-test-session` returns 200 (not 503) with a `1h` TTL session — else mark C.5 cells `⊘ skipped — secret unset` upfront.
6. Mint your test counterparties up-front:
   - `create_test_account({role:"band_leader", uidPrefix:"c11m2"})` → bearer + uid (the band_leader)
   - `create_test_account({role:"musician", uidPrefix:"c11m2"})` → bearer + uid (musician A)
   - `create_test_account({role:"musician", uidPrefix:"c11m2"})` → bearer + uid (musician B, for D.5 cross-identity)
   - `create_test_account({role:"member", uidPrefix:"c11m2"})` → bearer + uid
   - For each, `mintSession({baseUrl, bearer, uid, firebaseAuth})` to seed a Playwright context with a Web-SDK-authed cookie.
7. Mint your fixture setlist via the band_leader bearer:
   - `create_setlist({name:"M2 matrix fixture c11m2", isTest:true})` → fixtureSetlistId
   - `bulk_add_tracks({setlistId, tracks:[…])` — seed ~6 tracks from the catalog (search via `search_library({query:"adon", limit:3})`), bond them via `swap_chart` so chart-bound cells have something to probe.
8. Run the core matrix (~70 cells) — pattern §6.

---

## §6 — Run flow (~75 min total budget)

| Phase | Time | What |
|-------|------|------|
| Boot + pre-flight + counterparty mint | ~10 min | §5.5-§5.7 |
| **Stickiness sub-matrix (Class S, 30 cells)** | ~25 min | one action at a time; reuse fixture setlist; one Playwright context per identity reused across persistence modes |
| **Fresh-tablet sub-matrix (Class FT, 20 cells)** | ~15 min | parallel `browser.newContext` calls; SW-block + viewport overrides |
| **Auth-divergence sub-matrix (Class AD, 20 cells)** | ~15 min | fan out across 5 identity contexts; one HTTP+DOM probe each |
| Cleanup + write report | ~10 min | `delete_setlist({id:fixtureSetlistId, force:true})` → `cleanup_all_test_data({prefix:"c11m2"})` → verify empty |

**One cell takes ~30 sec.** If a cell takes > 2 min, mark it `⊘ slow — defer to depth-dive` and move on.

**Cell artifacts per finding (only for divergences, not passes):**
- 1 screenshot of the diverged surface
- 1 screenshot of the expected (signed-in baseline) for compare
- the exact MCP request/response JSON OR Playwright action sequence

Stickiness in particular: **always grab the before/after diff** so the divergence is reproducible from the report.

---

## §7 — Output shape

Write to `.paul/research/cycle-11-m2-matrix/RUN-<iso>/`:

1. **`HANDOFF.md`** — leads with the **colored matrix table** (one row per cell, ~70 cells; columns: cell-id, action, surface, identity, persistence, anchor-moments, bug-class, expected, observed, verdict). Then per-divergence expansion (Findings §8).
2. **`cells.jsonl`** — one JSON line per cell, machine-parseable (this is the AP-3 secondary; the matrix table is primary).
3. **`artifacts/`** — screenshots + JSON dumps named `<cell-id>-(before|after|expected|actual).png` / `.json`.
4. **HANDOFF-COMPLETE** to `.coord/inbox/supervisor.md` signed `from cycle-11-m2-matrix`, CC auditor.

### Matrix table format

```markdown
| Cell ID | Class | Action | Surface | Identity | Persistence | Moments | Expected | Observed | Verdict |
|---------|-------|--------|---------|----------|-------------|---------|----------|----------|---------|
| M.S.A1.D2 | S | transpose → D | /perform/setlist/<id> | musician C.3 | hot reload D.2 | A2,A3 | chart loads in D | ✓ |
| M.S.A1.D3 | S | transpose → D | /perform/setlist/<id> | musician C.3 | cold reload D.3 | A2,A3 | chart loads in D | ✗ snapped back to E |
| M.S.A4.D2 | S | annotate ✏ | /perform/setlist/<id> | musician C.3 | hot reload D.2 | A2 | annotation persists | ✗ ephemeral (no persistence layer) |
| M.AD.B1u.C6 | AD | — | /perform/setlist/<unpublished-id> | unauth C.6 | n/a | A1,A4 | 404 | △ 200 with empty body |
| M.FT.B2.C7 | FT | — | /perform landing | fresh-incognito C.7 | n/a | A1,A4 | viewable + sign-in card | ✓ |
| … | | | | | | | | | |
```

Verdict legend (charter+M2 calibration):
- **✓** pass — cell behaves as expected
- **△** partial — sticky-for-author-only, partial-persistence, delayed
- **✗** divergence — finding (write up in §8 below)
- **—** N/A — cell unreachable in this state
- **⊘** skipped — environment gap (e.g., admin secret unset)

### Findings (per-divergence)

For each `✗` or load-bearing `△`:

```markdown
### F-M2-<NNN> — <one-line moment-anchored title>
- **Cell:** M.S.A1.D3
- **Class:** Stickiness regression
- **Moments:** A2, A3 (between-songs, mid-service key-change)
- **Surface:** /perform/setlist/<id>
- **Identity:** musician C.3 (fresh `mintSession`)
- **Action:** transpose to D via PerformanceToolbar TransposerMenu
- **Persistence:** D.3 cold reload
- **Expected (user terms):** "I change the key to D. I close my browser. I reopen. The chart is still in D."
- **Observed (user terms):** "I change the key to D. I close my browser. I reopen. The chart is back in E."
- **Repro (5-step):**
  1. mintSession as musician C.3
  2. open /perform/setlist/<fixtureId>
  3. open TransposerMenu, transpose +1 semitone (E→D — yes, lower; example)
  4. context.close() then browser.newContext({storageState:prevState}) then re-open
  5. observe initial render: chart key reverted to E
- **Severity:** HIGH (A2/A3 — actively breaks the mid-service key-change scenario)
- **Hypothesis:** transpose is client-only state in `useMusicStore` and not persisted to Firestore. Confirm in `src/lib/music-store` or wherever the zustand store lives.
- **Ship-class:** HOLD-POST-SERVICE (touches Perform render state + likely needs Firestore schema change)
- **Artifacts:** `artifacts/M.S.A1.D3-before.png`, `artifacts/M.S.A1.D3-after.png`
```

### WHAT-WE-LEARNED (charter §3 AP-4)

A short section after Findings:
- "What the matrix taught us about how state propagates in this app." (Concrete observations distilled from the cells.)
- "Where stickiness is structurally absent vs structurally present" (e.g., MCP-write actions persist; client-UI-state actions like transpose/annotate don't).
- "Auth surfaces that surprised us" (the unauth-shows-200 / signed-in-dev-masking cells).
- "Recommendations for the fix wave" (which findings are worth their own lane).

---

## §8 — Anti-patterns explicitly broken (charter §3 — required disclosure)

This PROMPT intentionally breaks:

- **AP-7 (single-state probe).** The methodology IS the multi-identity-state probe. The matrix axis C alone forces ≥5 identities per cell-set. *This is the central break.*
- **AP-1 (class-violation findings).** Every cell carries an anchor-moment tag and a user-terms expected/observed pair. A cell with no moment is not written.
- **AP-3 (JSONL primary).** The matrix-with-colored-cells doc is PRIMARY; `cells.jsonl` is the secondary machine-readable companion — not the headline artifact.
- **AP-5 (audit-the-app stance).** Even though the SHAPE is a matrix, every cell is phrased as a tiny user moment ("I transpose to D, refresh, did it stick?"), not a DOM observation.

(M2 does NOT break AP-2 — coverage is intentionally broad, not deep-per-surface. M1's narrative methodology breaks AP-2; M2 leans into matrix breadth.)

---

## §9 — Auth + sandbox policy (binding)

- **uidPrefix:** `c11m2` for every minted account. Lowercase, 5 chars.
- **Create-side param `uidPrefix`; cleanup-side param `prefix`** (same value). Verified `src/lib/mcp/tools/test-tokens.ts:969,1074-1081`.
- **NEVER** call `cleanup_all_test_data` without `prefix` — sweeps sibling sessions (`[[feedback_self_inclusion_test_fixtures]]`).
- **Tier-2 caveats:** A.9 monitor writes are **visual-shape only** unless Daniel confirms board-on. Never call `set_send_level` / `set_send_mute` / `set_bus_fader` against the real X32 in this lane.
- **No bearer/secret in any file** under `sheet-music-app/` — redact as `***redacted***` in HANDOFF.
- **Cleanup before HANDOFF-COMPLETE:**
  1. `delete_setlist({id:fixtureSetlistId, force:true})`
  2. `cleanup_all_test_data({prefix:"c11m2"})`
  3. Verify zero residual: `list_test_accounts()` ∩ `c11m2`= ∅; `search_library({query:"c11m2"})` empty.

---

## §10 — Hard out-of-scope (do NOT probe)

- `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `error-envelopes.ts` (do-not-touch zones).
- F-002 lyric-search (feature dropped `3155fb2881`).
- Live X32 monitor writes (A.9 is visual-shape only).
- Admin role priv-esc paths beyond what `MCP_ADMIN_TEST_SESSION_SECRET` exposes (no test-tokens hack).
- `publish_setlist` to real recipients (fixture only).

---

## §11 — Success criterion

The PROMPT is "ran successfully" iff:
- ≥60 of the core ~70 cells were traversed (≥85% coverage).
- Every divergence has its 5-step repro + before/after artifacts.
- The WHAT-WE-LEARNED section names ≥3 structural observations (not just bug counts).
- Cleanup verified empty.
- HANDOFF + HANDOFF-COMPLETE landed in supervisor inbox.

Auditor verification: per-divergence reproducibility on a fresh `npm run stress` re-fire. If a divergence isn't reproducible, it gets `△` not `✗`.

---

*from coder-3 (lane M2)*
