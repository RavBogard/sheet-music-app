# Lane: f3-congregation-context (coder-3) — Tier 1

## Context
F3 from `.paul/research/product-gap-features-FINDINGS.md`: Claude is **stateless about
the congregation** every authoring session — no MCP read tool exposes who the rabbis
are, the service cadence, or recent vocal-lead/song history. Daniel + David author the
weekly setlist via Claude Desktop ([[user_mcp_is_primary_author_workflow]]); this gives
Claude the standing context it currently has to be re-told each time.

Verified at origin/master (`cbf5cd704`):
- Congregation config lives at the `config/congregation` Firestore doc, read server-side
  via `getServerCongregationConfig()` (`src/lib/server-auth.ts`) and client-side via
  `src/lib/congregation-store.ts` (`useCongregation`). `DEFAULT_CONFIG` fallback exists.
- Setlist model carries `leadMusician?` (`src/types/models.ts:51`) + `rabbi?`
  (`:84` "Which rabbi is leading this service").
- MCP read tools register in `registerReadTools(server)` at
  `src/lib/mcp/tools/index.ts:269`. **No existing `get_congregation_context`** (no dup).

## Scope — EDIT
1. **NEW `src/lib/mcp/tools/congregation.ts`** — `get_congregation_context` read tool.
   Returns, in one call:
   - **Congregation config** from `config/congregation` (name, service cadence, rabbi
     list, locale/terminology — whatever the doc carries; fall back to `DEFAULT_CONFIG`
     shape if absent).
   - **Lead history** — recent N setlists (default ~10, most-recent by eventDate) with
     their `rabbi` + `leadMusician` (and per-track vocal-lead if cheaply available),
     so Claude can see "who's led lately / which songs recur." Reuse
     `server-setlists` read helpers; do NOT duplicate query logic.
2. **Register** in `registerReadTools` (`index.ts:269` block). **CLAIM `index.ts`**
   (append-point; coder-4/PGR-04 also appends an MCP tool — disjoint, trivial 3-way).

## Acceptance
- `get_congregation_context` returns config + lead-history in one call (emulator test:
  seed config + a few setlists → assert shape).
- Auth posture **mirrors the sibling read tools** (valid bearer; congregation/setlist
  data is public-by-design per [[feedback_setlist_public_policy]] — match, don't
  over-gate). Rich envelope on refusal.
- "Vocal Lead" terminology, not "Lead"/"Leader" ([[feedback_terminology]]).
- `next build --webpack` clean; emulator green.
- SHIP-NOTICE with a live MCP `tools/list` + a `get_congregation_context` call
  transcript (dogfood-mint a scoped bearer if needed) in `## Repros`.

## Hard rules
Read-only data tool (no writes). Don't duplicate setlist-query logic — reuse existing
helpers. `bridge/**`, `errors.ts`/`error-envelopes.ts` read-only. `@google/genai`
N/A here. Tier 1.
