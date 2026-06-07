# Cycle-6-fixes Lane 1 — Gig-packet shortcut-merge fix (THE user-felt regression)

> **Coder lane prompt** — not a cowork instance prompt. Single focused
> code lane. Single-commit narrow lane preferred.
>
> **Part of cycle-6-fixes Wave A** (3 parallel lanes: 0 / 1 / 4).
> Siblings: Lane 0 (MCP test-tooling unblock), Lane 4 (npm audit).
>
> **This is the user-felt-now regression.** David has been printing
> Friday packets with Drive-shortcut-bonded charts silently missing
> since cycle-5. Close this and the most visible cycle-5 false-positive
> goes away.

---

## §0 — Identity, branch, scope

**Lane:** `cycle6-fixes-lane-1-gig-packet`
**Branch:** `feat/cycle6-fixes-1-gig-packet` (cut from `origin/master` at lane start)
**Output:** single-commit push.

**DRIVER_BEARER (admin, for MCP testing the fix):**
```
crl_live_a69b5caca5bd0ca9a062549e4e60f087b8b9b10e199565f7ea8b134cea3fdb62
```
Burn at lane end. Never echo.

**Scope:** close C6C-008 / C5C-006 — Drive-shortcut-bonded charts get dropped from `generate_gig_packet` output with envelope `Unsupported content type: application/vnd.google-apps.shortcut`. They land in `missingCharts[]` instead of being merged into the PDF. Lechu Goldman's `1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj` is the canonical repro target.

**Out of scope for this lane (deferred):** `suggest_band` 500 (C6C-009) — Instance C reported this, but supervisor pre-flight 2026-05-19 found zero `suggest_band|suggestBand` matches in `src/`. Tool may be at a different name OR not yet implemented. Daniel triages separately; not in Lane 1 scope.

**SHIP-NOTICE protocol (Daniel-ratified 2026-05-19):** include `## Repros` section pasting REPRO-L1-gig-packet-shortcut-merge verbatim. Auditor BLOCK-TEARDOWNs without it.

---

## §1 — Where the bug lives

**File:** `src/lib/mcp/tools/library-download.ts`

**Function:** `generateGigPacket` (line 290 onward).

**Bug location:** lines 416-427. The mimeType fall-through `else` branch (line 420) pushes ANY content-type that isn't pdf/jpeg/png/heic/musicxml/text to `missingCharts[]` with reason `Unsupported content type: <ct>`. Drive shortcuts arrive with `contentType = "application/vnd.google-apps.shortcut"` and hit this branch.

**Upstream call:** `fetchFileById(fileId, indexMimeHint)` at line 364 returns `{ buffer, contentType }`. For shortcuts, this returns the shortcut metadata, NOT the target file's bytes. The shortcut needs to be RESOLVED (followed) to its target — then the target's bytes flow through the existing merge logic.

---

## §2 — The fix (recommended approach)

**Approach A (preferred — server-side shortcut resolution at fetch boundary):**

Modify `fetchFileById` (probably in `src/lib/drive/` or `src/lib/storage/` — coder traces) so that when the Drive Files API returns `mimeType === "application/vnd.google-apps.shortcut"`, the function transparently follows `shortcutDetails.targetId` and re-fetches the target. The downstream gig-packet merge code stays unchanged; shortcuts become invisible to it. This is the right architectural layer — chart access policy per `[[feedback_chart_access_policy]]` already treats shortcut and target equivalently in the in-app context.

**Approach B (lane-local — handle the shortcut mimeType in library-download.ts):**

Add a new branch BEFORE line 420's catch-all `else`:
```typescript
} else if (/vnd\.google-apps\.shortcut/.test(ct)) {
    // Resolve shortcut → re-fetch target → loop back through mimeType branches
    const resolved = await resolveShortcutToTarget(fileId)
    if (!resolved) {
        missingCharts.push({ trackId, title: rawTitle, fileId, reason: "Drive shortcut target unresolvable (deleted / permission denied / circular)" })
    } else {
        fetched = await fetchFileById(resolved.targetId, resolved.targetMimeHint)
        // recurse one level into the mimeType branches with the resolved bytes
        // ... (refactor needed; consider extracting the branch logic into a helper)
    }
}
```

Approach A is cleaner. Approach B is more local but introduces recursion concerns. **Coder picks based on tracing `fetchFileById`** — if A is small (5-line change in the fetcher), go A. Otherwise B.

**Either approach:** handle shortcut-of-shortcut (Drive supports chains) with a max-depth-1 follow (prevents infinite loops). Emit `missingCharts` entry if depth exceeded.

---

## §3 — Hard boundaries

- DO NOT touch `bridge/**` (CRIT-003 deferred).
- DO NOT change the gig-packet PDF output format (track order, page layout, missingCharts appendix structure) — only fix the shortcut-resolution gap.
- DO NOT silently swallow shortcut-resolution failures. Permission-denied / deleted-target / circular-chain ALL surface in `missingCharts` with rich reason text.
- DO NOT delete or modify the Lechu Goldman library row (`fileId 1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj`) — it's the canonical repro and lives in production.
- DO NOT bake the bearer into any committed file.
- DO NOT push without filing SHIP-NOTICE with `## Repros`.

---

## §4 — Prerequisites handshake

Before P1:
- `cd sheet-music-app && git fetch origin && git checkout -b feat/cycle6-fixes-1-gig-packet origin/master`
- `npm install` + `npm run test:emulator` for baseline green
- Read `src/lib/mcp/tools/library-download.ts` end-to-end (line 290 onward for `generateGigPacket`).
- Trace `fetchFileById` to its source (probably under `src/lib/drive/` or `src/lib/storage/`). Decide Approach A vs B based on the fetcher's structure.
- Confirm Daniel's existing Lechu Goldman fileId is reachable via your DRIVER_BEARER: `tools/call download_chart {chartId:'76dda851-...'}` (or whichever lookup path; library-download.ts will show you the call shape).

---

## §5 — Phases
- **P0** — branch + baseline + read library-download.ts + trace fetchFileById
- **P1** — implement the fix (Approach A or B)
- **P2** — emulator regression test: import a Drive shortcut fileId fixture, generate a gig packet, assert shortcut content is MERGED inline (not in missingCharts). May need a test fixture in `src/lib/mcp/__tests__/fixtures/` if not present.
- **P3** — manual probe at production via DRIVER_BEARER: replicate REPRO-L1 below; confirm PDF contains Lechu content
- **P4** — full suite + build clean; SHIP-NOTICE prep with `## Repros`

---

## §6 — Acceptance criteria

- Emulator regression test: gig-packet with a shortcut-bonded track → PDF contains target content inline, not in `missingCharts`.
- Manual production probe: REPRO-L1 below executes PASS at the deployed surface.
- Shortcut-of-shortcut (depth >1) → graceful missingCharts entry with clear reason.
- Deleted/permission-denied target → graceful missingCharts entry with clear reason (NOT a silent skip; NOT a crash).
- No regression in existing gig-packet behavior on native PDF / image / text-score / musicxml charts.

---

## §7 — Repros to paste in SHIP-NOTICE `## Repros` section

```
### REPRO-L1-gig-packet-shortcut-merge (C6C-008 / C5C-006 regression close)
preconditions: production MCP, admin bearer; existing library chart bonded to a Drive shortcut fileId. Canonical fixture: Lechu Goldman, library song UUID 76dda851-02b7-434f-a36b-f5b99c5fb1bd, Drive fileId 1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj
steps:
  1. tools/call create_setlist {name:'6fixes-l1-probe', eventDate:'2026-05-25', isTest:true}
     → capture {setlistId}
  2. tools/call add_track_to_setlist {setlistId:<id>, songId:'76dda851-02b7-434f-a36b-f5b99c5fb1bd', title:'L\'Chu N\'Ran\'Nah'}
     → capture {trackId}
  3. tools/call generate_gig_packet {setlistId:<id>}
     → capture {pdfUrl OR base64} + {missingCharts:[]}
  4. Download PDF; inspect pages.
expected:
  - response.missingCharts is empty (or does NOT contain the Lechu fileId)
  - PDF contains Lechu chart pages merged inline at the track's setlist-order position
  - PDF total page count = expected (typically cover + N chart pages)
observed_pre_fix:
  - response.missingCharts contains [{fileId:"1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj", reason:"Unsupported content type: application/vnd.google-apps.shortcut"}]
  - PDF omits Lechu pages entirely (no Lechu content present anywhere — neither inline nor in any appendix)

### REPRO-L1-shortcut-of-shortcut (defensive edge case)
preconditions: a Drive shortcut whose target is itself a shortcut (Daniel may need to construct in a test folder if not in library)
steps: same shape as REPRO-L1-gig-packet-shortcut-merge but with the depth-2 shortcut fileId
expected: missingCharts entry with reason like "Drive shortcut chain exceeded max-depth-1" — NOT a crash, NOT silent skip
observed_pre_fix: if Approach A naively recurses, infinite loop. If status quo, lands in missingCharts with the original "Unsupported content type" reason.

### REPRO-L1-deleted-shortcut-target (defensive edge case)
preconditions: a Drive shortcut whose target was deleted (or permission revoked)
steps: import the shortcut fileId; generate gig-packet
expected: missingCharts entry with rich reason ("Drive shortcut target unresolvable: deleted" or similar)
observed_pre_fix: silent skip OR crash depending on path
```

---

## §8 — Standing rules

- Rich-error envelope per cycle-3 sweep (REG-001/002/003).
- Drive failure modes per Lane 2 C5C-009 — preserve the rich envelope contract.
- F-05 dryRun-default unchanged.
- No `force:true` use.
- Bearer never echoed.
- Commit message: `fix(gig-packet): cycle-6-fixes Lane 1 — Drive shortcut resolution at fetch boundary (closes C6C-008 / C5C-006)`.
- Worktree teardown after auditor ACCEPT + Daniel go-ahead.

---

## §9 — Go signal

1. Acknowledge + start P0.
2. Trace fetchFileById; pick Approach A vs B.
3. P1 → P4 in order.
4. File SHIP-NOTICE with `## Repros`.

Daniel walks away after P0 confirmation; auditor + teardown handle the back end.

Go.
