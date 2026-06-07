# ⚠️ OBSOLETE — DO NOT PASTE — Instance C answered the same question 2026-05-18T18:48Z

> **This re-prompt is now redundant.** Instance C's weekly-flow walk
> already probed the C5C-006 shortcut-merge question end-to-end and
> recorded VERDICT FAIL at finding `C6C-008` (HANDOFF at
> `C:\Users\dsbog\centralreform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-6\instance-C\HANDOFF-TO-SUPERVISOR.md`
> §2 bullet 2). The cycle-5 Lane 2 SHIP at `5c546920d` did NOT actually
> fix the gig-packet shortcut-merge path — Lechu Goldman.pdf still
> drops to `missingCharts[]` with `Unsupported content type:
> application/vnd.google-apps.shortcut`.
>
> Bearer `crl_live_a7f359ca...` (slot #5) is back in the spare pool and
> was never burned. Marked OBSOLETE 2026-05-18T~19:00Z by supervisor.

---

# Cycle-6 Instance A HEADLINE re-prompt — C5C-006 Lechu Goldman gig-packet shortcut-merge validation (~20min) — SUPERSEDED

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Stays untracked in git per the standing rule for cowork prompts.
>
> **This is the tight re-prompt** after cycle-6 4-way wave aborted at
> P0 §3.4 (uidPrefix gap + 4 other deploy gaps documented in
> `[[feedback_cowork_prompt_verify_before_write]]`). The full 4-way
> wave is being rewritten against verified-deployed MCP surface.
>
> This re-prompt closes the single highest-value question while the
> full rewrite happens. No harness. No test-account minting. No
> parallel-instance isolation (you run alone). MCP-only path.

---

## §0 — Identity, bearer, output

**You are Instance A (headline re-run).** Single Claude Desktop
session, ~15-25min focused depth.

**DRIVER_BEARER (admin, FRESH — slot #5 in supervisor pool):**
```
crl_live_a7f359ca6d0913d821dd8d36664fed9c04eb2b94c3c03077a35707e2df090fe3
```
Treat as burned by end of run. Never echo. Supervisor rotates after.

**Production target:** `https://www.centralreform.live/` (use `www.`
explicitly — apex 307→www strips Authorization header).

**Output dir:** `C:\Users\dsbog\centralreform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-6\instance-A-headline\`

**Findings prefix:** `C6A-HDLN-NNN`.

**Test-data tagging:** every setlist you create has `isTest:true` +
title starts with `6A-hdln-`. No test users minted (admin bearer
does everything). Cleanup at end: per-setlist `delete_setlist`.

---

## §1 — Ratified policies primer (READ FIRST)

| Policy | Memory cite | Summary |
|---|---|---|
| Chart access | [[feedback_chart_access_policy]] | public-from-in-app intentional |
| Setlist contents public | [[feedback_setlist_public_policy]] | public by design |
| MCP-first authoring | [[user_mcp_is_primary_author_workflow]] | MCP-only path |
| F-05 dryRun-default | [[feedback_dryrun_is_observability]] | dryRun first on writes |
| Bridge | CRIT-003 deferred | bridge/** untouched (NA for this probe) |

---

## §2 — Mission (single load-bearing question)

**Did C5C-006 Lechu Goldman gig-packet shortcut-merge actually
deliver?** Specifically: when a setlist contains a track bound to a
chart whose underlying Drive file is a **shortcut** (not a native
Doc/PDF), does `generate_gig_packet` MERGE the shortcut-target's PDF
content into the packet — not appendix it, not skip it, not error?

This was cycle-5 Lane 2's headline ship. Auditor confirmed code-shape;
cowork confirms behavior end-to-end.

---

## §3 — Prerequisites handshake (TIGHT — block on real blockers only)

### §3.1 — MCP connection sanity
`list_library({limit:1})` via DRIVER_BEARER. GREEN if a row returns. BLOCK if 401/error.

### §3.2 — Find a shortcut-bonded chart in the existing library

Two paths, try in order:

**Path A — known chart name.** Search the existing library for "Lechu" / "L'chu" / "L'chu N'ran'na" / Lechu Goldman:
- `list_library({limit:200})` then grep titles for "lechu" (case-insensitive)
- Capture the `fileId` for any match.

**Path B — any Drive shortcut.** If no Lechu match, find ANY existing library chart whose `fileId` resolves to a Drive shortcut (look at `get_song({songId})` or chart metadata for shortcut indicators — `mimeType: 'application/vnd.google-apps.shortcut'` or a `shortcutDetails` field).

GREEN if you have at least one shortcut-bonded chart's `fileId` + `title`. **If neither Path A nor Path B produces a candidate**, post:

> 🛑 BLOCKED — no shortcut-bonded chart found in library. Need Daniel
> to (a) point at a specific shortcut fileId, OR (b) import a fresh
> Drive shortcut for this probe.

Then `await user_input`.

### §3.3 — Confirmation before P1
Post:
> ✅ Headline-A prereqs green. Probe candidate: `<title>` (fileId `<id>`, shortcut: yes). Starting P1 gig-packet merge probe.

---

## §4 — Probe (single P1 phase)

### Step 1 — Create test setlist
`create_setlist({date:"2026-05-22", title:"6A-hdln-lechu-shortcut-merge", isTest:true})`. Capture `setlistId`.

### Step 2 — Add a track bound to the shortcut chart
`add_track_to_setlist({setlistId, songName:"<title>", chartFileId:"<shortcut-fileId>"})` — or whatever signature the deployed tool expects. Confirm response shape `{ok, trackId, order, track:{...}}` per C5C-016 ship. Capture `trackId`.

### Step 3 — Generate gig packet
`generate_gig_packet({setlistId})`. Capture the response — should include a downloadable PDF URL or a base64 PDF or a Storage path.

### Step 4 — Verify the PDF contains the merged chart
Open the resulting PDF (download if URL, decode if base64). Inspect:
- **Total page count** vs expected (1 cover/title page + N chart pages, depending on packet structure).
- **Chart presence:** does the shortcut-bonded chart's pages appear EARLY (merged inline with the setlist track order) or LATE (appendix)? Or are they MISSING entirely (skip-path failure)?
- **Page rendering quality:** are the chart pages legible, properly oriented, not blank?

Capture: page count, where the Lechu (or candidate) chart appears, screenshot or extracted text of first chart page.

### Step 5 — Per-call cleanup
`delete_setlist({setlistId})`. Confirm response success. (No test users minted, so no `revoke_test_account` needed.)

---

## §5 — Verdict + HANDOFF

### Verdict (binary)
- **PASS** if shortcut-bonded chart's PDF is MERGED into the packet at the track's setlist-order position, rendered legibly.
- **FAIL** if missing entirely, errored, or rendered as a blank page / opaque placeholder.
- **PARTIAL** if appendix'd at the end instead of merged inline (still works but not what C5C-006 promised).
- **CONCERN** if you couldn't establish ground truth (e.g., couldn't get a shortcut fileId, couldn't render PDF, ambiguous result).

### HANDOFF file
Write `HANDOFF-TO-SUPERVISOR.md` at output dir with:
1. Run window (start → end ISO).
2. **Verdict + 1-line evidence sentence at top.**
3. Probe candidate (title + fileId) — was it Lechu or fallback?
4. Setlist Id + gig-packet PDF path (or base64 first ~200 chars for record).
5. Page count + chart-position-in-PDF.
6. Screenshot or extracted text of the relevant chart page.
7. Any tool-shape surprises (parameter names, response shapes that differed from `[[project_mcp_status]]` expectations) — surface as findings.
8. Reminder: rotate DRIVER_BEARER (slot #5) + scrub this prompt + cleanup confirmed.

---

## §6 — Hard boundaries

- **MCP only.** No browser. No harness. No Playwright.
- **NO mutations to real prod data.** `isTest:true` on the setlist + per-call cleanup at end.
- **NO `force:true`** on anything.
- **NO bearer in any artifact.** Never echo.
- **NO test-account mint.** Admin bearer does everything; no uidPrefix concern.
- **NO commit of this prompt with bearer intact.**

---

## §7 — Standing rules (lean)

- Bearer never echoed.
- Setlist `isTest:true` + title prefix `6A-hdln-`.
- Per-call cleanup via `delete_setlist` at end.
- F-05 dryRun-default applies if you write to library (you shouldn't for this probe).
- Memory entries `[[feedback_sandbox_test_isolation]]` + `[[feedback_cowork_real_harness]]` are partially INVALIDATED at master `3e640a905` per `[[feedback_cowork_prompt_verify_before_write]]` — ignore their schema claims; trust the actually-deployed surface.

---

## §8 — Go signal

Daniel pastes. First action:
1. Acknowledge receipt + start §3 handshake.
2. Verify §3.1, §3.2; BLOCK only if §3.2 finds no shortcut candidate.
3. Post §3.3 confirmation, proceed.

Daniel can walk away after §3.3; HANDOFF lands at §5.

Go.
