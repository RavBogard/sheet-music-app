# Lane: roster-mcp — "who's playing tonight" read surface for MCP

**Coder:** coder-3
**Tier:** 1 (read-only MCP tool) — BUT cross-user data (it surfaces *other*
musicians' assignments, unlike the per-uid setlist tools), so the role gate is
load-bearing and the auditor will verify it at the deployed surface.
**Base:** `origin/master` @ `4047e1242` (cut a FRESH worktree off origin/master).
**Worktree:** `sheet-music-app-roster-mcp/`  **Branch:** `feat/roster-mcp`

---

## Why this lane exists

The app already has a full **scheduling subsystem** — REST API
(`src/app/api/scheduling/*`: assign / unassign / respond / suggest /
suggest-band / history / calendar-feed / remind), a `/schedule` UI, the
`scheduling_assignments` + `musician_availability` Firestore collections (with
live composite indexes), `src/lib/scheduling-firebase.ts`, and the
`SchedulingAssignment` model. **None of it is exposed via MCP.** So when Daniel
or David (both `band_leader`, both authoring via Claude Desktop) ask "who's
playing tonight / for this Shabbat?", Claude has no tool to answer.

This lane closes that gap with **one read-only MCP tool**. Authoring the
weekly setlist via MCP is Daniel's primary flow; knowing the roster alongside
it is the missing piece.

**In scope (Phase 1):** read the roster of *assigned* musicians for a service.
**Explicitly OUT of scope (defer to a later lane):** swap-in/availability
*suggestion* intelligence (that reuses `/api/scheduling/suggest-band`), and any
MCP *writes* (assign/unassign). Read-only this pass.

---

## The data (verify each against deployed source before coding)

- **Collection:** `scheduling_assignments`
- **Type:** `SchedulingAssignment` at `src/types/models.ts:192`. Fields you'll
  surface:
  - `id`, `setlistId`, `setlistName` (denormalized), `eventDate`
    (`FirestoreDate | null`), `serviceType?` (`'friday_night' |
    'shabbat_morning' | ...`)
  - `musicianUid`, `musicianName`, `musicianEmail`, `musicianPhone?`,
    `instrument?`
  - `status: 'pending' | 'confirmed' | 'declined' | 'cancelled'`,
    `autoConfirmed`
  - audit: `assignedBy`, `assignedByName`, `assignedAt`, `notifiedVia?`
- **`eventDate` is denormalized onto every assignment**, so "who's playing
  tonight" can query assignments by an `eventDate` window directly — you do NOT
  need to join `setlists`.
- **Server query pattern to mirror:** `src/app/api/scheduling/assign/route.ts`
  (`db.collection('scheduling_assignments').where('setlistId','==',…)
  .where('status','in',['pending','confirmed'])`) and
  `src/app/api/scheduling/history/route.ts`. Use the Admin SDK
  (`initAdmin` / `getFirestore` from `@/lib/firebase-admin`) — the
  `scheduling-firebase.ts` helpers are client `onSnapshot` subscriptions, so
  read them for field/shape reference but write a server-side query in your tool.

## The tool

ONE tool. Since the scope question (key off a setlist vs. key off a date) was
left open, support **both** with optional params and a sensible default:

```
get_roster({
  setlistId?: string,    // roster for one specific service (use after list_setlists / get_setlist)
  from?: string,         // ISO date — assignments on/after
  to?: string,           // ISO date — assignments on/before
  status?: ('pending'|'confirmed'|'declined'|'cancelled')[],  // default ['pending','confirmed']
  limit?: number         // default 50, cap 200
})
```

- If `setlistId` given → roster for that setlist (ignore date window).
- Else if `from`/`to` given → assignments in that window.
- Else (no args) → **upcoming**: `eventDate >= today`, soonest first. This is
  the "who's playing tonight / this week" default.
- Group/return per service: `{ setlistId, setlistName, eventDate, serviceType,
  musicians: [{ name, instrument, status }] }[]` — shape it so a human-readable
  "who's on" answer falls out naturally. Decide the exact grouping; document it
  in the tool `description` (descriptions are the contract — see how
  `list_setlists` / `search_library` write theirs in `index.ts`).
- Dates out as ISO strings (match `list_setlists` convention).

## Role gate (load-bearing — this is cross-user data)

`list_setlists`/`get_setlist` are per-`uidFrom(extra)` so they need no gate.
**`get_roster` exposes other musicians' names/instruments/contact**, so it MUST
gate to **trusted-leader (admin + band_leader)**:

- Reuse the `isTrustedLeader(roles)` pattern from
  `src/lib/mcp/tools/library-upload.ts:66` (and `library-upload-session.ts:86`).
  Resolve the caller's roles from `users/{uidFrom(extra)}` (see how
  upload/monitor tools resolve roles).
- A non-trusted caller (musician/member) must get a **`richError`** envelope
  returned via `jsonResult` — surfaces as `result.isError:true` with prose,
  NEVER a JSON-RPC `error.code`. Use a clear code like `roster_forbidden` with a
  hint. (This is the [[feedback_mcp_validation_shape]] standing rule — don't
  ship a gate that throws -32xxx.)
- Decide whether to drop `musicianEmail`/`musicianPhone` from the payload even
  for trusted leaders unless asked (lean default = name + instrument + status;
  contact only on an explicit `includeContact: true`). Keep PII minimal.

## Files

- **NEW:** `src/lib/mcp/tools/roster.ts` (the `getRoster(uid, args)` impl +
  role resolution + query). Lane-private.
- **SHARED — CLAIM IT:** `src/lib/mcp/tools/index.ts` — register `get_roster`
  inside `registerReadTools()` (the block at ~line 214). Import your fn at top.
  Handler shape exactly like the siblings:
  `async (args, extra) => jsonResult(await getRoster(uidFrom(extra), args))`.
  **Claim the `registerReadTools` region in `shared/claims.md` before editing.**
- **NEW:** emulator test `src/lib/mcp/__tests__/mcp-roster.emulator.test.ts`
  (assigned-roster read + the role gate refusal path + the date-window vs
  setlistId branches + empty-state).

### Shared-file coordination
`index.ts` is the one shared file. Right now coder-1 (lane-c2) is dry-run-only
(touching no `src/`) and coder-2 is confined to `SmartScoreViewer.tsx`, so
`index.ts` is currently free — but **claim the region** and ship narrow
(single commit) so a cherry-pick is clean if origin moves. Use the narrow-lane
cherry-pick push (master-tip.md §narrow-lane caveat), not a full rebase.

## Hard rules

- DO NOT touch: `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`,
  `error-envelopes.ts` (consume `richError` from `@/lib/mcp/error-envelopes`,
  don't edit it). Don't touch coder-1's delete surface or coder-2's
  `SmartScoreViewer.tsx`.
- Read-only. No assign/unassign/respond writes this lane.
- Isolation: clean any test fixtures **by id**, NEVER `cleanup_all_test_data`
  ([[feedback_sandbox_test_isolation]]). If you create test accounts, pass a
  `uidPrefix` and match it at cleanup.
- MCP curls hit `https://www.centralreform.live/api/mcp` (apex strips auth).

## Gates (all required before SHIP-NOTICE)

1. `npm ci` in the fresh worktree (shared install is broken — per-worktree ci).
2. unit + `npm run test:emulator` + `next build --webpack` (exit 0).
3. **Deployed prod REPRO** (needs the pool ROOT bearer from Daniel at this gate):
   - call `get_roster` as a **band_leader** → returns the roster for a seeded
     service (assigned musicians, correct grouping/dates);
   - call as a **musician/member** → `roster_forbidden` (`isError:true`);
   - the no-arg "upcoming" default returns the right window.
   Seed via existing scheduling assign path or a fixture; clean by id.
4. SHIP via narrow-lane cherry-pick → **SHIP-NOTICE to auditor + copy
   supervisor**. Update `shared/master-tip.md` on push. Release your claim.

## Open input from Daniel (don't block ACK on it)
The by-setlist-vs-by-date scope was left open → this prompt picks "support both,
default upcoming." If Daniel later wants it narrower, that's a description/param
trim, not a redesign. Flag the `includeContact` PII default in your ACK so he
can veto it.
