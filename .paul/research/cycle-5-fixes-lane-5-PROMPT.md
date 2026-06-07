# Cycle-5-fixes Lane 5 — MCP envelope drift + UX polish

You are `cycle5-fixes-5-mcp-envelope`, a coder lane in the cycle-5-fixes
parallel wave. Source-of-truth scoping:
`sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` (Lane 5).

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-5-mcp-envelope`
- **Branch:** `feat/cycle5-fixes-5-mcp-envelope`
- **Worktree:** `sheet-music-app-cycle5-fixes-5-mcp-envelope/`
- **Base SHA:** `6dbc106bc`
- **Estimated:** 3-4h

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/README.md` + `shared/master-tip.md` +
   `shared/decisions.md` (focus 2026-05-18T18:45Z REG-002 cycle-3
   envelope sweep — this lane closes the few remaining drift sites
   that the cowork audit surfaced).
2. Read `sheet-music-app/.coord/agents.md` — find your row.
3. Read this prompt's referenced triage Lane 5 section.
4. ACK msg-001 to supervisor inbox.

## §3 — Scope (11 findings)

From triage Lane 5:

- **C5C-001 + C5C-002 MED** — `/api/drive/metadata` + `/api/library/list`
  return flat `{error:"..."}` on 401/403. Fix: wrap with
  `createApiHandler`'s `richError` (or equivalent factory used by
  cycle-3 envelope sweep at `2b8762f97`). Emit `machine_code:
  'invalid_bearer'` or `'session_required'` per cycle-3 vocabulary.
- **C5C-005 MED** — `publish_setlist` default-recipient derivation
  includes `test-*` prefix uids. Fix: filter `^test-` (and/or `[TEST]`
  displayName prefix) from default-audience derivation. If autonomous
  tests want test recipients, require explicit `recipients` array.
- **C5C-010 LOW** — `list_setlists` sorts by write timestamp not
  eventDate. Fix: add `sort:'recent_write' | 'recent_event'` param
  (default `recent_write` for back-compat). David's discover-template
  step wants `recent_event`.
- **C5C-011 LOW** — `list_setlists` row shape lacks `publishedAt`.
  Fix: add `publishedAt: string | null` to the row shape. Cheap
  server-side (already on the document).
- **C5C-014 LOW (META becomes feature)** — No unified "who's playing
  & leading this week" pivot. NEW MCP tool
  `list_service_personnel({setlistId|eventDate})` returning
  `{scheduling_assignments: [...], vocal_leads: distinct(track.leadMusician)}`.
  Register in `src/lib/mcp/tools/index.ts`.
- **C5C-016 LOW** — `add_track_to_setlist` returns sparse
  `{trackId, order}` vs `update_track` returning full track echo. Fix:
  return full track echo (same shape as `update_track`).
- **C5A-003 MED** — `create_setlist` lacks `isTest:true` arg. Fix:
  add optional `isTest:boolean` (defaulting false). NO heuristic on
  `test-` prefix (too surprising for real setlists named
  "test-rehearsal").
- **C5A-B4-aien LOW** — `list_review_queue.config.anthropicConfigured`
  field name stale post-Gemini-swap. Fix: rename to
  `aiProviderConfigured` (single name, no transitional alongside);
  add `provider:'gemini'|'anthropic'|null` discriminant on
  `get_ai_config` return.
- **C5B-006 LOW** — Unauth error envelopes leak internal endpoint
  names (`/api/mcp/oauth/mint-test-token`) + MCP tool vocab in
  `hint` fields. Fix: branch hint on caller context (in-app + bearer →
  full hint; bare HTTP unauth → generic 'Sign in to continue.'). OR
  strip MCP refs from production envelopes entirely. **Daniel-discussion.**
- **C5B-017 LOW** — POST `/login` returns bare 405 empty body. Fix:
  return JSON envelope `{ok:false, error:{code:405,
  machine_code:'method_not_allowed', message:'Use POST
  /api/auth/test-session for programmatic sign-in.'}}`. Set Allow
  header.
- **C5D-011 LOW** — `salvage_chart_bytes` returns code:500 for
  client-precondition refusals. Fix: 422 for `no_source_available`,
  `invalid_source_url`, `invalid_source_mime`, `source_too_large`.
  Reserve 500 for genuine server faults (`storage_upload_failed`,
  `firestore_write_failed`). Add unit test asserting code:422.

## §4 — Hard boundaries

- **NO touch to** repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- **NO touch to** `src/lib/mcp/errors.ts` / `error-envelopes.ts` —
  envelope foundation read-only (cycle-3 ratification). Use the
  existing `richError` factory.
- **NO touch to** Lane 2's `src/lib/mcp/tools/library-upload.ts` (Drive
  upload section) without HEADS-UP — they have C5C-006/007/008/009/015.
  C5D-011 salvage handler IS your territory but may live in same file —
  coordinate via claims.md to interleave edits.
- **NO mutations to real prod data.**

## §5 — Tests + build (required before push)

- Rich-envelope conformance unit tests on the 11 affected
  endpoints/tools (existing pattern in
  `src/__tests__/mcp/rich-envelope-shape.test.ts` if it exists, else
  create).
- Multi-instance audience-filter unit test for `publish_setlist` —
  fixture with `test-*` uids should be filtered out of default-audience.
- `list_setlists` schema test for `sort` + `publishedAt` fields.
- `list_service_personnel` new tool test against fixture roster+VL
  data — verify both `scheduling_assignments` AND `vocal_leads` keys
  populate.
- `create_setlist` `isTest:true` round-trip test.
- `salvage_chart_bytes` 422 verdict for `no_source_available`.
- Emulator suite full green.
- `next build --webpack` clean; full unit suite green.

## §6 — Push protocol

1. `git fetch origin && git rebase origin/master`.
2. Re-run tests + emulator suite.
3. `git push origin feat/cycle5-fixes-5-mcp-envelope:master`.
4. SHIP-NOTICE to supervisor inbox with:
   - Final SHA.
   - Per-endpoint rich-envelope conformance matrix (11 rows).
   - `publish_setlist` audience-filter verification (dryRun output
     before/after with `test-` users included/excluded).
   - `list_setlists` sort + publishedAt smoke test.
   - `list_service_personnel` new tool test result.
   - `create_setlist` isTest round-trip.
   - Worktree teardown request.

## §7 — Daniel-discussion items

- **C5B-006 strip-vs-branch hints.** Default: branch on caller context
  (in-app + bearer → keep MCP refs in hints; bare HTTP unauth → strip).
  If Daniel prefers a simpler "strip-all-MCP-refs-from-prod" rule, easy
  pivot.

## §8 — Coordination contract

- Claim `src/lib/mcp/tools/setlist-read.ts` (list_setlists changes).
- Claim `src/lib/mcp/tools/setlist-write.ts` (create_setlist isTest,
  add_track_to_setlist response shape).
- Claim `src/lib/mcp/tools/setlist-publish.ts` (audience filter).
- Claim `src/lib/mcp/tools/library-upload.ts` (salvage 422 — coordinate
  with Lane 2's Drive-upload edits via TTL claims).
- Claim `src/lib/mcp/tools/library-review/list_review_queue.ts` +
  `src/lib/mcp/tools/ai-config.ts` (anthropicConfigured rename).
- Claim `src/lib/mcp/tools/index.ts` (register `list_service_personnel`
  + any new schema additions).
- Claim `src/app/api/drive/metadata/route.ts` +
  `src/app/api/library/list/route.ts` (envelope wraps).
- Claim `src/app/api/auth/test-session/route.ts` +
  `src/app/api/drive/file/[fileId]/route.ts` (C5B-006 hint branch).
- Claim `src/app/login/page.tsx` server-action handler (C5B-017 405
  envelope) — HEADS-UP Lane 3 which has the login footer C5B-009.

Go.
