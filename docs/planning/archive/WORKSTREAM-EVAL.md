# WORKSTREAM-EVAL.md — MCP-PLAN Phase 0

**Date:** 2026-05-14
**Scope:** Investigation only. No code changes, no branches, no installs.
**Question:** Can the in-flight v7.0 milestone and the MCP server build run in parallel in two Claude Code instances?

**Bottom line:** **Parallel-with-care.** ~80% of the MCP build (auth, route, read tools, settings UI, tests, deploy) has zero milestone overlap. One genuine collision — the setlist *write* path — is deferrable (MCP ships reads first) and resolvable with an explicit ownership rule. Sequential would waste 1–3 working days serializing non-overlapping work.

---

## 0.1 Stability check

| Check | Result | Notes |
|---|---|---|
| `npm run build` | ✅ **PASS** (exit 0) | `next build --webpack`, ~23s compile, 81/81 static pages. Only warnings: protobufjs/libheif "critical dependency" (known, harmless), Sentry `sentry.client.config.ts` deprecation. This is the real gate (TS errors fail it). |
| `npm test` | ⚠️ **KNOWN BASELINE** (exit 1) | 1678 passed / **52 failed** / 40 skipped. All 52 failures are in 10 `SetlistGrid.*.test.tsx` files. |
| `npm run lint` | ⚠️ **PRE-EXISTING** (exit 1) | 11 errors, 24 warnings. Errors concentrated in the same dead `SetlistGrid` code + minor style nits (`prefer-const`, `ban-ts-comment` in `gemini.ts`/`sw.ts`, `no-console` in `charts/scrape`). Not wired into `next build`. |
| Working tree | ✅ Committable | Only `HANDOFF.md` untracked + `src/build-info.json` touched by the build script. No half-applied refactors. |

**Verdict: stable enough to proceed — the instability is known, documented, and isolated to dead code.**

The 52 test failures are *not* a regression. `.paul/ROADMAP.md` and `.paul/STATE.md` repeatedly cite the suite as **"1650/52"** and **"1649/52 (zero new regressions)"** — i.e. 52 failing is the accepted green baseline. The cause: `SetlistGrid.tsx` is a **dead TanStack-table component**; `MobileRowCard.tsx` is the sole live setlist-editing path (flagged explicitly as tech debt in the v70-03 ROADMAP entry). The failing tests target the dead component. The same dead code accounts for most lint errors (`react-hooks/refs`, `react-hooks/purity`).

**Implication for the parallelism question:** this dead-code zone is a *non-issue* for both workstreams as long as neither touches `SetlistGrid.tsx` — and neither needs to. It should NOT block the eval. Recommend the user acknowledge the baseline rather than treating `npm test` exit 1 as a stop-the-world failure.

---

## 0.2 In-flight milestone

| | |
|---|---|
| **Name** | **v7.0 — Document-Driven Setlist Creation** ("Feed a doc, get a setlist") |
| **Source docs** | `.paul/ROADMAP.md`, `.paul/PROJECT.md`, `.paul/STATE.md` (PAUL workflow state); `.paul/MILESTONE-CONTEXT.md` was consumed at milestone open |
| **Opened** | 2026-05-13 (via `/paul:complete-milestone` of v6.0) |
| **Progress** | **5 of 8 phases complete** |

**Done (5):**
- v70-01 Image-chart support (PNG/JPEG/HEIC upload, viewer, print embed)
- v70-02 Recordings data model (`recordings/{id}` collection + rules + index)
- v70-03 Per-track media affordances (chart click-through, recording-bind UI)
- v70-04 Doc upload + text extraction (`extractDocumentText` — .docx/.pdf/.txt)
- v70-05 Gemini structured extraction (`extractSetlistStructure` — text → `{ sections[], tracks[] }`)
- (+ emergent hotfixes v60-13 sync-engine resilience, v60-14 mobile date picker — both closed)

**In progress:** None actively. v70-05 is COMPLETE + transitioned. The queued next action is a **Daniel-directed jump to v70-09** (out of roadmap sequence).

**Remaining (3 roadmap phases + 1 inserted):**
| Phase | Focus | State |
|---|---|---|
| **v70-09** | Setlist metadata editor — edit setlist name/date (closes long-standing "Issue 2"). `/ui-ux-pro-max` BLOCKING. Daniel-directed, out of sequence — done next. | Not started |
| **v70-06** | Resolve + missing-chart + recording-match — library fuzzy match w/ confidence scoring, routes missing charts to `/api/library/upload`, pre-creates `recordings/*` docs | Not started |
| **v70-07** | Interview form + setlist preview + commit — structured form for parser-unfillable fields; **commit writes via existing `createSetlistService` + `applyEdit` fanout** | Not started |
| **v70-08** | Best-practice audit + remediation (security / a11y / perf / quality / UX). **Milestone close BLOCKED on this.** | Not started |

---

## 0.3 MCP-readiness scan

### `bridge/` folder verdict: **LEAVE ALONE**

`bridge/` is the **CentralReform X32 Monitor Bridge** — a standalone Electron desktop app (v3.1.0) that bridges musicians' iPad WebSocket connections to OSC/UDP commands for a Behringer X32 mixer. It has its own `package.json`, `node_modules`, `Dockerfile`, `build/`/`dist/`/`release/`, and an Inno Setup installer. It is **not** a prior MCP attempt and has zero relation to setlists or Claude. It is the "Mixer" hardware feature. **MCP must not touch it.** (The app side of it is `src/app/api/bridge/*` — also unrelated to MCP.)

### AI Chat Assistant — ⚠️ **DOES NOT EXIST**

**This is the most important finding for the MCP build.** `README.md` advertises *"AI Chat Assistant — Natural language setlist management (create, add songs, schedule)"* and *"AI: Google Gemini (OCR, chat)"*. **There is no chat assistant in the codebase** — no chat route, no chat component, no `src/lib/ai/`. The README claim is aspirational/stale.

What actually exists (the v7.0 doc-import pipeline, the closest thing to "natural language setlist management"):

| Function / route | File | Role |
|---|---|---|
| `extractDocumentText()` | `src/lib/setlist-import/extract-document.ts` | .docx (mammoth) / .pdf (pdfjs) / .txt → raw text |
| `POST /api/setlists/import/extract-document` | `src/app/api/setlists/import/extract-document/route.ts` | route wrapper for above |
| `extractSetlistStructure()` | `src/lib/setlist-import/extract-structure.ts` | raw text → Gemini → Zod-validated `{ sections[], tracks[] }` |
| `POST /api/setlists/import/extract-structure` | `src/app/api/setlists/import/extract-structure/route.ts` | route wrapper for above |
| import `parse` / `execute` routes | `src/app/api/setlists/import/{parse,execute}/route.ts` | older CSV/text import path |

**Consequence:** MCP-PLAN's premise *"tool handlers delegate to the AI Chat Assistant's existing functions"* is **partially invalid**. There is no assistant to wrap. MCP tools must wrap the **actual setlist data layer** instead (below).

### Setlist handler functions — what MCP tools would actually wrap

**Reads — server-side, Admin SDK (✅ directly callable from an MCP route):**
- `src/lib/server-setlists.ts` — `getUpcomingSetlists()`, `getRecentSetlists()`, `getAllSetlists()`, + aliases `getUpcomingPublicSetlists`, `getRecentPublicSetlists`, `getPersonalSetlists(uid)`, `getAllPublicSetlists`
- `src/lib/server-library.ts` — `getServerLibrary()`; also `GET /api/charts/search`
- `src/lib/songs/` — `defaults.ts`, `prime.ts`, `subscribe.ts`

**Writes — ⚠️ client-side, Firebase *client* SDK (NOT callable from a server MCP route):**
- `src/lib/setlist-firebase.ts` — `createSetlistService(userId, userName)` returns `{ createSetlist, updateSetlist, deleteSetlist, duplicateSetlist, subscribeToSetlist, subscribeToAllSetlists, getDefaultForServiceType, setDefaultForServiceType, findLastMatchingService }`. These call `addDoc`/`onSnapshot`/`doc` from the **client** SDK.
- Server-side write routes that *do* use the Admin SDK: `POST /api/setlist/rename`, `/api/setlist/delete`, `/api/setlist/publish`, `/api/setlist/transfer`, `/api/setlists/import/execute`
- Scheduling: `src/lib/scheduling-firebase.ts` — `assignMusicians()`, `respondToAssignment()`, `unassignMusician()`, `generateCalendarFeedToken()`; `/api/scheduling/*` routes

**⚠️ Key architectural finding:** the only consolidated setlist *write* business logic (`createSetlistService`) is **client-SDK**, so an MCP server route cannot call it. MCP write tools (Phase 4b) would need either (a) a new server-side Admin-SDK setlist-write module, or (b) an isomorphic refactor of `createSetlistService`. **This is real, non-trivial new work — not a thin wrapper — and it is the same write path v70-07 builds on.** This is the single High-risk overlap (see matrix).

### Firestore schema summary (`src/types/models.ts` + `firestore.rules`)

- **`setlists/{id}`** — `name, date, eventDate?, updatedAt?, trackCount, songCount?, fileIds?, ownerId?, ownerName?, rabbi?, serviceNotes?, musicians?, isTemplate?, templateType?, transferredAt?, previousOwnerId?, assignedUids?, hydrated?`. Rules: **read = public (`if true`)**; create = signed-in; update/delete = owner | band_leader | admin. Subcollections: `history/` (append-only immutable), `emailEvents/` (server-only).
- **`tracks/{id}`** — top-level collection, FK `setlistId`. `id, title, fileId?, fileName?, mimeType?, audioFileId?, audioFileName?, key?, tune?, notes?, referenceLink?, type (song|header|reading|prayer|transition|note), duration?, bpm?, leadMusician?, transposition?, description?, performer?, estimatedMinutes?, pageNumber?`. Rules: read = public; create/update/delete = band_leader | admin.
- **`songs/{id}`** — library entries (no dedicated interface in `models.ts`; managed via `src/lib/songs/*`, mirrored from `library_index` by the sync-engine). Rules: read = member; write = band_leader | admin.
- **`recordings/{id}`** — `songId?` (FK → `songs/{id}`), `notes`, Firebase Storage path. Rules: read = member; write = band_leader | admin. Composite index `songId + createdAt`.
- **`users/{uid}`** — `uid, email, displayName, photoURL?, role (admin|band_leader|musician|member|pending|denied), soundEngineer?, canUpload?, musicianProfile?, createdAt?, lastLoginAt?`. Subcollections: `setlists/`, `songPreferences/`, `annotations/`, `preferences/`, `notifications/`.
- **Schedule** = **`scheduling_assignments/{id}`** (server-only write via Admin SDK; `tier`, `status (pending|confirmed|declined|cancelled)`, `setlistId`, `musicianUid`, `eventDate`, …) + `musician_availability/`, `scheduling_history/`. Indexes on `setlistId+musicianUid`, `musicianUid+status`, `status+eventDate`.
- Other: `templates/`, `config/*` (`congregation`, `admins`, `monitor`, `featured`, `defaults`), `auditLogs/` (server-only), `songUsage/`, `live_sessions/`, `publicSetlists/`, `tasks/`, `library_index/` (server-only, `if false`), bridge collections, `monitor-live/*`, `system/globalAlert`. Catch-all `match /{document=**} { allow read, write: if false }`.

### Auth pattern for `/api/*` routes

- **`src/lib/api-auth.ts`** — `requireAuth(req, role?, optional?)` / `withAuth(req, role?, optional?)`. Reads `Authorization: Bearer <token>`, calls `verifyIdToken` (Firebase Admin), returns `AuthResult { uid, email, token, role, isAdmin, isBandLeader, isMusician }`. Role hierarchy: `admin > band_leader > musician > member > pending`.
- **`src/lib/api-wrapper.ts`** — `createApiHandler({ role?, requireAuth?, schema? })` wraps handlers, injects `ctx.auth: AuthResult`, `ctx.body`, `ctx.req`. Most routes use this; some streaming routes use `wrapWithRequestId`.
- **MCP fit:** MCP-PLAN's `verifyBearer → { uid }` maps cleanly onto the existing `{ uid }` shape. But MCP bearer tokens are **not** Firebase ID tokens — so MCP adds a *parallel, additive* auth path: a new `src/lib/mcp/auth.ts` doing `sha256(token)` → `mcpTokens` collection lookup → resolved `uid`, then handing that `uid` to the same downstream functions. It does **not** modify `api-auth.ts`. Low conflict.

---

## 0.4 Overlap matrix

| Area | MCP will touch? | Milestone (v70-09/06/07/08) touches? | Conflict risk |
|---|---|---|---|
| `firestore.rules` | Yes — add isolated `mcpTokens` server-only block | v70-08 audit *reviews* rules; v70-09/06/07 unlikely to edit | **Low** — different block; merge trivial |
| `firestore.indexes.json` | No — token lookup is a single-field `where`, no composite index | v70-06 may add fuzzy-match indexes | **None** |
| `src/app/(main)/settings/**`, `src/components/settings/**` | Yes — new "Claude / MCP access" section + `createMcpToken`/`revokeMcpToken` server actions | None — v70-09 is the *setlist* editor, not settings; v70-06/07/08 don't touch settings | **None** |
| `src/lib/setlist-firebase.ts` — `createSetlistService` / setlist **write** path | Yes — MCP write tools (Phase 4b) need server-side setlist mutation; today's only writer is client-SDK | Yes — v70-07 commits "via existing `createSetlistService` + `applyEdit`"; v70-09 uses `updateSetlist` for name/date | **HIGH** — both workstreams reshape the same write path |
| `src/lib/server-setlists.ts` (reads) | Yes — read tools wrap `getUpcomingSetlists` etc. | v70-06/07 may *read* these; unlikely to change signatures | **Low** |
| `src/lib/setlist-import/**` | Maybe (optional dedupe of extract logic — recommend NOT) | Yes — v70-06 + v70-07 are the core consumers/extenders | **Medium** → Low if MCP drops the optional dedupe |
| `src/lib/server-library.ts` + `/api/charts/search` | Yes — `search_library` tool wraps these | Yes — v70-06 fuzzy-match likely extends library search | **Medium** |
| `src/app/api/setlists/import/**` routes | Maybe | Yes — v70-06/07 extend these | **Medium** |
| `src/lib/scheduling-firebase.ts` + `/api/scheduling/*` | Maybe — `schedule_setlist` tool (only if in scope) | None of v70-09/06/07/08 touch scheduling | **Low** |
| `package.json` / lockfile | Yes — `@modelcontextprotocol/sdk`, `mcp-handler` | Likely — v70-06 may add a fuzzy-match dep | **Low** — different deps; lockfile merge is routine |
| `src/types/models.ts` | Maybe — `McpToken` type | v70-06/07 may add resolution/interview types | **Low** — additive |
| `src/app/api/mcp/**`, `src/lib/mcp/**` | Yes — all new | No | **None** |
| `src/components/setlist/**`, `MobileRowCard.tsx` | No | Yes — v70-09 + v70-07 heavily | **None** |
| `bridge/`, `src/app/api/bridge/**` | No (leave alone) | No | **None** |
| `SetlistGrid.tsx` + its tests (dead code) | No | No | **None** — but neither should touch it; it's the source of the 52-test baseline |

**Tally:** 1 High, 3 Medium (2 reducible to Low), 5 Low, 6 None.

---

## 0.5 Recommendation

### **Parallel-with-care**

**Why not "parallel-safe":** the setlist **write path** is a genuine High-risk row. MCP write tools and v70-07's commit flow both need to reshape the same logic — and today that logic (`createSetlistService`) is client-SDK only, so *someone* has to author a server-callable version. Two instances independently rewriting that path = guaranteed merge pain. This needs a real coordination decision, not light touch.

**Why not "sequential":** roughly **80% of the MCP build has zero milestone overlap** — token auth (`src/lib/mcp/auth.ts`, `mcpTokens` collection + rules), the MCP route (`src/app/api/mcp/route.ts`), all **read** tools (wrap `server-setlists.ts` / `server-library.ts`), the settings-page MCP section, unit/auth tests, deploy. Serializing all of that behind v70-09 → v70-06 → v70-07 → v70-08 burns 1–3 working days of wall-clock for no conflict-avoidance benefit.

**The High row is deferrable.** MCP-PLAN already ships **reads first (Phase 4a)** and gates writes (Phase 4b) behind a stop point. MCP read tools touch the write path **not at all**. So the collision doesn't even exist until MCP Phase 4b — by which time v70-09 (small) and likely v70-06 are merged, and v70-07's commit-path design is known.

**Coordination rules for the parallel path (to put in `WORKSTREAMS.md`):**
1. **Milestone branch owns** `src/components/setlist/**`, `src/lib/setlist-import/**`, `src/app/api/setlists/import/**`, and — critically — **the setlist write path** (`createSetlistService` / any new server-side write module). MCP does **not** refactor these.
2. **MCP branch owns** `src/app/api/mcp/**`, `src/lib/mcp/**`, the settings-page MCP section, the `mcpTokens` `firestore.rules` block, and the two new package deps.
3. **MCP ships reads first and pauses before Phase 4b.** Before MCP builds write tools, the two streams have one explicit conversation: *who authors the server-side setlist-write module, and what's its signature.* Recommended: the **milestone branch** authors it (v70-07 needs it anyway); MCP write tools then *consume* it. This turns the High row into a Low one.
4. **MCP drops the optional `setlist-import` dedupe** (MCP-PLAN 0.4 / Phase 3 "possible refactor for dedupe") — not worth the Medium-risk contact.
5. **Merge order:** MCP reads + auth + settings + deploy merge to `master` first (smaller, self-contained, no write-path contact). Milestone rebases. MCP write tools (Phase 4b) get built *last*, on top of the merged write module.
6. **Shared files** (`firestore.rules`, `firestore.indexes.json`, `package.json`, `src/types/models.ts`): coordinate-before-edit, end-of-day rebase, re-run `npm run build`.
7. **Abort criteria:** if shared-file conflict resolution exceeds ~30 min/day, collapse to sequential.

### Wall-clock estimates

*Caveat: these are Claude-Code-session-paced, not calendar days, and assume the Friday-PM→Sunday deploy freeze is respected. v7.0 history: 5 phases in ~2 focused days.*

| Path | Estimate | Notes |
|---|---|---|
| **Sequential** | **~5–8 working days** | Milestone remainder (v70-09 + v70-06 + v70-07 + v70-08) ≈ 3–5 days, *then* MCP Phases 2–7 ≈ 2–3 days. Fully serialized; no coordination cost but no overlap savings. |
| **Parallel-with-care** *(recommended)* | **~4–6 working days** | ≈ max(milestone 3–5d, MCP 2–3d) + ~0.5–1d for the write-path coordination + reconcile. Saves ~1–3 days. Costs: a second Claude Code instance + the coordination rules above. |
| Parallel-safe *(rejected)* | would *claim* ~3–5d | Ignores the write-path High row — would blow up at MCP Phase 4b with a hard merge conflict. Not viable as-is. |

---

## 0.6 Deliverables checklist

- [x] Stability confirmed (with documented caveat: `npm test` 1678/52 and lint 11-err are the known baseline, isolated to dead `SetlistGrid` code)
- [x] Milestone identified (v7.0, 5/8 done, source `.paul/`, remaining v70-09/06/07/08)
- [x] `bridge/` decision — **leave alone** (X32 mixer bridge, unrelated)
- [x] AI Chat Assistant handlers list — **finding: assistant does not exist**; real setlist data layer documented with file paths
- [x] Firestore schema summary (setlists, tracks, songs, recordings, users, scheduling)
- [x] Auth pattern documented (`requireAuth`/`createApiHandler`)
- [x] Overlap matrix filled in (1 High / 3 Medium / 5 Low / 6 None)
- [x] Recommendation: **parallel-with-care**, with reasoning + per-path wall-clock estimates
- [x] `WORKSTREAM-EVAL.md` committed at repo root

**STOP. Awaiting user's path decision (parallel-with-care vs sequential) before any Phase 1 setup.**
