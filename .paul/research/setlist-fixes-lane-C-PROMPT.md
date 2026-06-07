# Lane C — Stop baking "(unmatched)" into track titles

**Wave:** setlist-fixes (from Shavuot-Yizkor live-session bug report, 2026-05-20)
**Risk tier:** 1 (standard — small data-shape change with a downstream consumer + UI surface)
**Base SHA:** `a5fcc3132` (verify against `.coord/shared/master-tip.md`)
**Lane id:** `setlist-fixes-c-unmatched-status`
**Est:** ~1.5–2 hr

Closes **Bug 8**.

---

## Why

When a liturgical template expands and a slot has no matching chart, the code appends
"(unmatched)" to the track TITLE string and writes a note. Daniel saw a permanent track
titled "Leslie Cohen's Hallelujah (unmatched)". The "(unmatched)" label is baked into the
display title and pollutes both display and any future title-based search. The unmatched
state should be a structured field, not title-string mangling.

## Scope (verified targets) — `src/lib/liturgical-templates.ts`

- **`:485`** currently sets `title: \`${slot.label} (unmatched)\``. Change so the title stays
  CLEAN (`title: slot.label`) and the unmatched state lives in a structured field, e.g.
  `status: "unmatched"` (or `unmatched: true` — pick whatever matches the existing track-row
  type; check `src/types/models.ts` for the track shape and add the field there if needed).
- **`:487`** keeps the resolution note (`No matching file found. Search for: ...`) — the note
  is the right place for instructions; leave it.
- **`:514`** currently RE-DERIVES the query by stripping `(unmatched)` back off the title:
  `slot.queries = [track.title.toLowerCase().replace(/\s*\(unmatched\)\s*$/, '')]`. This is
  the load-bearing dependency on the title-mangling. Rewrite it to read the clean title
  directly (no strip needed) and gate on the new `status`/`unmatched` field instead.
- **Test `:229` in `src/lib/liturgical-templates.test.ts`**: the existing test asserts
  `t.title.includes('(unmatched)')`. Update it to assert the new structured field
  (`t.status === 'unmatched'` / `t.unmatched === true`) AND that the title is now clean
  (does NOT include "(unmatched)").

## Downstream check (do this — it's why this is Tier 1, not Tier 0)
- Grep the whole repo for `(unmatched)` and `unmatched` BEFORE you finish. Any UI component,
  perform view, or other consumer that detects the unmatched state by string-matching the
  title must be switched to read the new field. If a consumer renders the title, confirm it
  now shows the clean label (and, if it should still visually mark unmatched rows, wire it to
  the new field). Report every consumer you found + how you handled it in the SHIP-NOTICE.

## Out of scope / hard rules
- Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`,
  `error-envelopes.ts`.
- Do NOT touch `index.ts`, `library.ts`, `clone-setlist.ts`, `setlist-write.ts`,
  `server-tracks-write.ts` (other lanes). This lane should be self-contained in
  `liturgical-templates.ts` + its test + any downstream consumer you find.

## Tests + ship
- Run the liturgical-templates test + any consumer test you touched.
- Gates: `npm run test` (0 fail), `next build --webpack` `SKIP_ENV_VALIDATION=1` (exit 0).
  (Emulator only if a consumer you touch has emulator coverage.)
- Push `feat/setlist-fixes-c-unmatched-status:master`, OVERWRITE `master-tip.md`,
  SHIP-NOTICE to `.coord/inbox/auditor.md` + copy to `supervisor.md`.
- This lane is unlikely to touch `index.ts`, so no cross-lane claim needed — but READ
  `claims.md` before editing and FETCH right before ship (master will have moved under you
  as A/B/D ship). Cherry-pick onto fresh origin/master per the narrow-lane caveat.

## Deployed-surface / functional REPRO (required in SHIP-NOTICE)
Show a template-expansion (unit/emulator is fine here since this is template logic, not an
MCP-only surface) producing an unmatched slot whose track has a clean title + the new
`status`/`unmatched` field, and the re-derived query at `:514` still works. If a UI consumer
changed, describe the before/after rendering.
