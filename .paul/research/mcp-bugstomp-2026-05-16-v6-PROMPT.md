# CRC Music — Focused Bug-Stomp v6 (W-04 Concurrency Surface + Bond Parity)

**Goal:** Verify the surface that has shipped since the 2026-05-16 v5 bugstomp report. Specifically the W-04 optimistic-concurrency layer (Plans 01/02/03), the bond-validation parity work (F-01 + bulk_update_tracks parity), the publish_setlist semantics changes, and the iPad consumer-flow fixes (F-07/F-08/F-11/F-14/F-17). Skip anything that touches the W-01 propose-then-confirm surface — that work is in-flight and won't exist to test.

**Target:** Production `https://www.centralreform.live` (apex 307s to www).
**MCP endpoint:** `https://www.centralreform.live/api/mcp`.
**Identity for all tests:** Daniel Bogard (admin), UID `93Xn3DbS0bSNb8zmfzLyfOMX1A13`. Verify with `list_monitor_buses` returning `isPrivileged: true`. If a token swap happens mid-run, abort and report.

**Branch tip expected:** `da84be4ab` or later. **Tool count expected:** 36 (the 35 from v5 + `wait_for_setlist_change` from W-04 Plan 01).

---

## Scope vs v5

**IN scope (changed since v5):**
- Every write path's `version` + `lastModifiedAt` stamping (W-04 Plan 01)
- `lastSeenVersion` optional gate on update_track / update_setlist / remove_track / reorder_setlist / delete_setlist / bulk_update_tracks / publish_setlist (Plans 02 + 03)
- `stale_version` envelope shape on rejection (Plan 02 + 03)
- `track_not_found` envelope shape (Plan 02 E-002 polish)
- `bulk_update_tracks` atomic pre-flight with per-row `staleRows[]` (Plan 03)
- `publish_setlist` version bump on commit + `lastSeenVersion` gate (Plan 03)
- `wait_for_setlist_change` long-poll tool (Plan 01)
- `update_track` songId validation (F-01)
- `bulk_update_tracks` songId validation parity (F-01 followup)
- `publish_setlist({dryRun: true})` no longer refusing on broken-bond pre-flight (F-05)
- `verify_setlist_charts` `phantomBonds` vs `orphanedMarked` split (F-04)
- Zod validation errors returning `{error}` envelope, not raw -32602 (F-02)
- PDFViewer log dedup (F-07), 503 silent retry (F-08), audio-mime guard (F-17)
- `/library` "No chart-body text matches" relabel (F-11)
- ChartSuggestions PDF-bonus gated on score>0 (F-14)
- `list_monitor_buses` description clarifying bridge.clients counts (F-13)
- `get_chart_status` description matching actual envelope (F-15)
- `repack-track-order.ts` migration script (data-only; verify by reading a long-lived setlist's track `order` values)

**OUT of scope (skip):**
- ALL W-01 surface (`setlist-staging.ts`, `bond-corrections.ts`, AGENT-GUIDE.md, propose-then-confirm tools) — doesn't exist yet, will surface in v7
- Anything in `bridge/**` (CRIT-003 still deferred per policy)
- Drive/file auth tightening (closed by chart-access policy)
- The 0.85 fuzzy-dedup threshold (operator-override via `force: true` is the standing escape hatch)
- Full chart upload re-verification (covered exhaustively in v5; just spot-check that the path still works end-to-end)

---

## Operating principles

Identical to v5:

1. **Triage as you go.** Severity tags: CRIT / HIGH / MED / LOW / NOTE. Stop-the-world on CRIT (anything that breaks Daniel's MCP-first weekly flow OR the band's iPad consumer flow before Friday's service).
2. **Verification discipline.** Every claim of failure needs the exact tool call + verbatim error envelope/console output + suspected cause (5-min budget) + suggested fix shape.
3. **Authority:** Same as v5 — `⚠️ BUGSTOMP YYYY-MM-DD <suffix>` setlists/charts you create, NO publish to non-bugstomp setlists, NO SMS/email outside dryRun, NO monitor-write tests if a setlist for today exists.
4. **Cleanup contract:** `search_library({query: "⚠️ BUGSTOMP"})` → `[]` at end. `list_setlists({limit: 20})` → no bugstomp entries.
5. **Budget triage:** ~8 phases below. Smaller than v5 (only ~half the surface). Target ~2-3 hours.

---

## Phase 1 — W-04 concurrency gates (the headline)

For each of the 7 gated write paths, exercise BOTH the happy and stale-version branches.

**Gated paths:**
- `update_track`
- `update_setlist`
- `remove_track`
- `reorder_setlist`
- `delete_setlist`
- `bulk_update_tracks` (atomic + best-effort)
- `publish_setlist`

**For each:**
1. **Happy: omit `lastSeenVersion`** → write commits, no rejection. (Verifies pre-W-04 callers + HTTP route still work.)
2. **Happy: pass matching `lastSeenVersion`** → write commits. Response envelope echoes new `version`.
3. **Stale: pass too-low `lastSeenVersion`** → response is `{error: "stale_version", currentVersion, lastSeenVersion, hint, setlist?: {lastModifiedBy, lastModifiedAt}}`. Confirm:
   - No write landed (re-read the row, version unchanged).
   - For `bulk_update_tracks` atomic mode: response includes `staleRows[]` listing which rows were stale.
   - For `bulk_update_tracks` best-effort mode: stale rows fail per-row, valid rows commit.

**Bonus probe for `wait_for_setlist_change`:**
1. Call `wait_for_setlist_change({setlistId, lastSeenVersion: N})` where N is BEHIND the current version → returns immediately with the current version.
2. Call `wait_for_setlist_change({setlistId, lastSeenVersion: <current>, timeoutSec: 5})` then quickly issue an `update_track` from another tool call → the wait should wake on the bump. (May need parallel tool calls.)
3. Call with `timeoutSec: 5` and no concurrent write → returns at the timeout with `{ok: true, timedOut: true}`.
4. Confirm `publish_setlist` bumps the version (W-04 Plan 03 contract): wait-observer should wake on publish.

---

## Phase 2 — Bond-validation parity (F-01 + bulk parity regression)

The MCP-first weekly authoring flow lives or dies on songId validation. Confirm all 5 song-bonding write paths reject bogus songIds at the plan stage.

1. **`add_track_to_setlist({songId: "totally-bogus"})`** → `{error: "Song totally-bogus not found"}`. (Pre-existing; verify still works.)
2. **`swap_chart({newSongId: "totally-bogus"})`** → `{error: "Song totally-bogus not found"}`. (Pre-existing.)
3. **`bulk_add_tracks` with one bogus songId in atomic mode** → whole batch rolled back, the bad row's result.error names the bogus id.
4. **`update_track({patch: {songId: "totally-bogus"}})`** → `{error: "Song totally-bogus not found"}`. (F-01 — must reject; pre-F-01 this silently bonded.)
5. **`bulk_update_tracks` atomic with one bogus songId** → whole batch rolled back, bad row's error names the bogus id.
6. **`bulk_update_tracks` best-effort with one bogus songId on row A and a valid rebond on row B** → row A fails, row B commits.

If ANY of these silently writes the bogus songId, that's CRIT — orphan-manufacture hole reopened.

---

## Phase 3 — publish_setlist (F-05 + B-003 + Plan 03 gate)

1. **dryRun on a clean setlist** → `{ok: true, dryRun: true, chartHealth.bondedCount, chartHealth.unhealthy: []}`. No notifications dispatched.
2. **Real publish on a clean setlist** (use a `⚠️ BUGSTOMP` setlist with real bonded charts) → commits. Confirm:
   - `publishedAt` set on the setlist doc (first publish).
   - `version` bumped on the setlist doc (W-04 Plan 03 — was previously stale post-publish).
   - `lastModifiedBy` + `lastModifiedAt` set.
3. **Real publish on a setlist with one broken bond (no `force`)** → `{error: "Publish refused: 1 bonded chart(s) ..."}` naming `force: true` in the message. No write happened (publishedAt unchanged).
4. **dryRun on the same broken-bond setlist (no `force`)** → `{ok: true, dryRun: true, chartHealth.unhealthy: [{...}]}`. F-05: refuse-gate must NOT fire on dryRun. (Pre-F-05 this returned the refuse error.)
5. **`lastSeenVersion` stale on publish** → `{error: "stale_version", ...}`. No write. Confirm publishedAt unchanged.

---

## Phase 4 — verify_setlist_charts (F-04 phantom-bond split)

1. Pick a `⚠️ BUGSTOMP` setlist; bond one row to a real songId, another row to a deliberately-bogus songId (via the F-01 hole closure — should be impossible now to bond a bogus songId; use `update_track`'s rejection path to confirm). If you CAN'T manufacture a phantom bond via MCP, that's actually a positive signal — note it.
2. If you have a setlist with a known phantom bond (e.g. an old test setlist), run `verify_setlist_charts({setlistId, markOrphaned: true})`. Confirm:
   - `phantomBonds` count > 0
   - `orphanedMarked` reflects only fileIds that had a library_index row to flip
   - `library_index` does NOT have any new blank docs created for phantom fileIds (`list_library` shouldn't grow)
3. Run without `markOrphaned` → `phantomBonds` still reports (visibility for hygiene triage).

---

## Phase 5 — iPad consumer flow (F-07/F-08/F-11/F-14/F-17)

Run via Claude for Chrome on Daniel's signed-in session. **Screenshot every page.**

1. **`/perform/setlist/<id>` for a real upcoming setlist with bonded PDF + image + text rows** — each chart renders. PDF: no react-pdf "Failed to load PDF". Image: rendered. Text: monospaced.
2. **Broken-bond row** — tap it. Expected: clean "Failed to load PDF / HTTP 404" with Retry button + suggestions.
   - **F-07:** broken-bond click produces 1 console error per unique (url, msg) — NOT 4. (Pre-F-07 was 4× per broken bond.)
   - **F-08:** broken-bond first fetch may 503 (cold-start); silent retry happens; only the final 404 logs.
   - **F-14:** suggestions in the panel below should be name-relevant (or empty + "We couldn't find any obvious matches"). NOT alphabetical-first-N of the entire PDF catalog.
3. **Audio-bonded row (F-17):** find or create a row bonded to an audio file. Tap. Expected: error message reads "This row is bonded to an audio file (audio/..., not a chart. Re-bind to a PDF chart, or change the row type away from 'song'.)" — NOT "InvalidPDFException: Invalid PDF structure".
4. **`/library` page search (F-11):** type "shalom" in the search box. The "Within song content" panel should label as "No chart-body text matches" when no content matches, NOT "No content matches". The title-search panel above renders matches if any.

---

## Phase 6 — Zod validation envelope (F-02)

Pick 3 tools across reads/writes and pass intentionally-bad inputs. Each should return a `{error: "..."}` envelope, NOT a raw `MCP error -32602` protocol error.

1. `create_setlist({name: ""})` → `{error: "Validation error — name: ..."}` (string, inside a normal `result` envelope).
2. `update_track({setlistId: "x", trackId: "y", patch: {}})` → `{error: ...}` envelope.
3. `list_setlists({limit: -5})` → `{error: ...}` envelope.

If ANY of these surfaces as JSON-RPC `-32602`, F-02 regressed.

---

## Phase 7 — Weekly authoring with version-bumps visible

End-to-end exercise of the new W-04 semantics in Daniel's actual flow.

1. `get_setlist(lastWeekId)` — note the `version` field.
2. `create_setlist({name: "⚠️ BUGSTOMP v6 weekly"})` — response echoes `version: 1`.
3. `bulk_add_tracks(newId, tracks)` for 6 rows — response echoes the new setlist version after the writes.
4. `update_track(newId, trackId, {key: "G", lastSeenVersion: <current>})` → commits. Confirm `version` bumped on both the row and the parent setlist.
5. `update_track(newId, trackId, {key: "F", lastSeenVersion: <stale>})` → stale_version envelope.
6. `publish_setlist({setlistId: newId, dryRun: true})` — verify the dryRun report. Confirm the response includes `version` for the setlist.
7. `delete_setlist(newId)` — cleanup. (No `lastSeenVersion` so it commits last-writer-wins.)

If the version stamping is missing or off-by-one anywhere, flag.

---

## Phase 8 — Cleanup + report

1. **Cleanup gate:**
   - `search_library({query: "⚠️ BUGSTOMP"})` → `[]`
   - `list_setlists({limit: 20})` → no bugstomp entries
2. **Re-confirm CRITs** if any found.
3. **Write report** to `outputs/bugstomp-v6-report-2026-05-16.md`.

---

## Report format

Same structure as v5:

```markdown
# CRC Music Bug-Stomp v6 Report — <date>

## Verdict
One-sentence summary. If CRITs found, say so. If clean, say "W-04 surface + F-01..F-17 bond/iPad fixes all verify in production."

## Phase pass/fail table
| Phase | Subject | Verdict | Notes |
|-------|---------|---------|-------|

## Findings (severity order)

### <ID> — <one-sentence title> (<SEVERITY>)
**Surfaces in:** <phase / tool>
**Repro:** ...
**Observed:** ...
**Suspected cause:** ...
**Suggested fix:** ...
**Blast radius:** ...

## Phase 6 watchdog summary
| Page | Errors | Warnings | 4xx/5xx | Notes |

## Performance numbers
| Probe | Measurement | Target | Status |

## Particularly want to know
- Did the W-04 stale_version envelope shape match across all 7 gated paths?
- Did any of the 5 song-bonding paths accept a bogus songId? (CRIT if yes.)
- Did publish_setlist bump version on commit as Plan 03 specified?
- Did wait_for_setlist_change wake on publish?
- Did the iPad consumer flow regress on F-07/F-08/F-11/F-14/F-17?

## Phases not run
List skipped phases + reason.

## Artifacts
- Screenshots
- Cleanup confirmation
```

---

## Final notes for cowork

- This is an autonomous run, smaller scope than v5. Decide order within phases.
- Cleanup last; that's the only hard ordering.
- If you discover something the prompt didn't anticipate, include under `## Discoveries beyond the prompt`.
- Don't fabricate. Skipped = say skipped. Suspected = mark suspected.
- **Skip the W-01 surface entirely.** The propose-then-confirm tools (`stage_setlist_change`, `commit_staged_changes`, `record_bond_correction`, etc.) don't exist yet on the production endpoint. Don't probe them.
