# MCP Claude-First Eval — Cowork Prompt

**Generated:** 2026-05-15 post-Wave-6 ship (22 tools live)
**Production MCP:** https://www.centralreform.live/api/mcp
**Caller identity:** Rabbi Daniel (admin)
**Sibling artifact:** `.paul/research/mcp-claude-first-research-plan.md` (my codebase-side passes)
**Output target:** Daniel will copy your final report into `.paul/research/mcp-claude-first-cowork-REPORT.md`

---

## Send this to cowork-Claude

```
You are a cowork evaluator. The goal: assess how close the CRC Music
MCP server is to being a viable PRIMARY interface for leader/admin
workflows — clone-setlist, edit-setlist, library-upload, schedule, etc.
Rabbi Daniel wants Claude (via MCP) to replace most of the editor UI
over time. The frontend would eventually shrink to read-only and
performance surfaces. Your job is to find out where we are on that
journey today, and what's missing.

Endpoint: https://www.centralreform.live/api/mcp. Your Claude Desktop
or web connector is authorized as Rabbi Daniel (admin role).

Three weighting lenses — apply all three to each task:
  - 40% SPEED — would Daniel finish this faster with you (via MCP) than
    in the current UI? Imagine him on iPad, busy, between meetings.
  - 40% CONVERSATIONAL FIT — is this task naturally chat-shaped, or
    does it want a spatial / drag-drop / multi-select UI?
  - 20% CODEBASE — if this works via MCP, could the corresponding
    editor UI surface be retired (delete / keep / read-only-only)?

There are 22 MCP tools live:

  Setlist reads (4):  list_setlists, get_setlist, search_library, get_song
  Setlist writes (6): create_setlist, update_setlist, add_track_to_setlist,
                      reorder_setlist, remove_track, delete_setlist
  Monitor (8):        list_monitor_buses, get_mix, get_matrix,
                      set_send_level, set_send_mute, set_bus_fader,
                      set_matrix_fader, set_matrix_mute
  Chart ingest (4):   upload_chart, scrape_chart_from_url,
                      save_scraped_chart, delete_chart

Important context:
- "Vocal Lead" is the right term, not "Lead" or "Leader". Daniel and
  Randy are the two regular vocal leads.
- Rabbi "Led by" is distinct from the vocal lead — it identifies the
  clergy leading the service, not the singer.
- CRC is a Reform Jewish synagogue. Friday evening service +
  Shabbat morning service is the weekly cadence (NOT Sunday).
- 90% of weeks Daniel clones last week's setlist and tweaks a few
  songs. The clone-and-tweak flow is the bullseye.
- Library titles include extensions in the catalog (`Lecha Dodi.pdf`).
  MCP strips them for display; you pass the song's id (which is the
  Drive file id) as `songId` to add_track_to_setlist, and it bonds
  the chart automatically.
- All your destructive probes should end with cleanup. Every probe
  setlist / probe chart you create gets deleted by the end of the run.
- Admins (you) bypass per-user rate limits — feel free to be thorough.

================================================================
PART 1 — TASK BATTERY (11 tasks)
================================================================

For each task: ATTEMPT the task via MCP only. If you have to give up,
say so explicitly and explain what stopped you. After each task, fill
in the scorecard below.

Scorecard fields per task:
  - completion: yes / partial / no
  - tool_calls: integer
  - clarifications_needed: 0 / 1 / 2+ (count of times you'd have asked
    Daniel for more info if he were watching)
  - speed_feel: claude_faster / equal / ui_faster — your honest read
  - conversational_fit: chat / mixed / spatial
  - missing_tool_gap: free text describing what MCP affordance was
    missing, OR "none" if everything you needed existed
  - transcript: verbatim list of tool calls + abbreviated results

--- Task 1: Clone-and-tweak ---
Find Daniel's most recent Shabbat setlist. Create a new setlist for
NEXT Friday with the same songs, but: replace song 3 with "Adon Olam"
in G, and drop the closing niggun (whatever's last). Title it
"⚠️ EVAL T1 — Clone Test".

--- Task 2: Bulk vocal-lead assignment ---
On the Task 1 setlist, set the vocal lead for songs 2, 4, and 7 to
"Randy". Set the rest to "Daniel". (If there are fewer than 7 songs,
adjust proportionally — leads on the 2nd, 4th, and 7th-or-last.)

--- Task 3: Reorder by feel ---
On the Task 1 setlist, reorder so that slower / contemplative songs
come earlier and more upbeat songs come later. You'll need to infer
energy from titles, keys, BPM where available. Explain your reasoning
briefly.

--- Task 4: Add a reading + transition mid-service ---
On the Task 1 setlist, insert a reading titled "V'ahavta" after the
current song 3, then a transition row titled "Niggun" right before
the current song 4 (so the order becomes: song1, song2, song3,
V'ahavta reading, Niggun transition, song4, ...).

--- Task 5: Upload from a URL ---
Find chord chart for "Carlebach Lecha Dodi" online via
scrape_chart_from_url, save it to the library titled
"⚠️ EVAL T5 — Carlebach Lecha Dodi", collection "uploads". Then add
it to the Task 1 setlist at position 1 (very first row), key D.

--- Task 6: Direct file upload ---
Create a small valid PDF (any chord chart will do — you can synthesize
a tiny PDF as base64). Upload it titled "⚠️ EVAL T6 — Direct Upload",
mimeType application/pdf, collection uploads, key G, bpm 96. Then add
it to the Task 1 setlist at position 2.

--- Task 7: Library cleanup ---
Search the library for "EVAL" and report what's there. Don't delete
anything yet — that happens in the cleanup phase. Note any
non-EVAL test entries you spot (e.g., leftover stress-test charts
from prior runs).

--- Task 8: Doc → setlist (document-driven import) ---
THIS ONE PROBES A MISSING TOOL. There's no MCP tool for the
document-driven import flow (.docx/.pdf/.txt → extract-document →
extract-structure → resolve → create_setlist). The flow exists in
the UI (ImporterModal). Without trying to build it: describe how
you'd want this exposed as MCP tool(s). Propose 1-3 tool signatures
that would cover this flow. (Skip the attempt; this task is a
design-probe.)

--- Task 9: Vocal-lead schedule ---
Daniel asks: "Who's leading what for the next 3 Shabbats? If I'm
out on the second one, can we reassign my songs to Randy?"
Use list_setlists + get_setlist to inspect the next 3 (or all
upcoming if fewer than 3 exist). Identify which rows would need to
flip from Daniel to Randy on the second upcoming setlist. ATTEMPT
the reassignment. Report whether you could do it cleanly.

--- Task 10: Notify the band ---
Daniel asks: "Send the Task 1 setlist to the band, with a note that
we'll rehearse Wednesday at 7." MCP currently has no notify/publish
tool. Confirm the gap, then describe how you'd want this exposed —
proposed tool signature(s).

--- Task 11: Recovery / accidental-delete ---
Create a throwaway setlist titled "⚠️ EVAL T11 — Throwaway", add 2
tracks to it. Then delete it via delete_setlist. Then attempt to
recover it. Report whether recovery is possible via MCP today, and
what affordance would make this safer (soft-delete? undo window?
restore tool?).

================================================================
DEFERRED — Task 12: Pre-service mix prep (skip this run)
================================================================
The X32 hardware is not available for testing this session. Note the
deferral in your report; run this in the next cycle when Daniel
confirms the X32 is powered on.

Spec for next run: "Check that everyone's monitor bus is set up
properly. Mute the bass send on Randy's mix." Probes list_monitor_buses
+ get_mix + set_send_mute + the still-open fire-and-forget concern.

================================================================
PART 2 — END-TO-END WEEKLY CYCLE
================================================================

Now do a single full weekly cycle, narrating as you go. The scenario:

  Wednesday morning. Daniel says:

    "Set up this Shabbat — Friday evening + Saturday morning. Friday
    is similar to last week's but I want to feature 'Halleluyah' as
    the opening. Saturday is a Bar Mitzvah — the family asked for
    'Y'did Nefesh' and 'Esa Einai'. Randy's leading 'Lecha Dodi' both
    services. Get the band notified by tonight."

Execute this end-to-end via MCP only. Title both setlists with the
"⚠️ EVAL E2E" prefix so cleanup can find them.

For each step, narrate:
  - what you're doing and why
  - any clarifying question you would have asked Daniel
  - any place you HAD to fall back to "Daniel would need to do this
    in the UI" — be honest, mark these clearly with [UI-FALLBACK]
  - any context you wished the MCP had surfaced that it didn't
    (mark these with [CONTEXT-GAP])
  - any handoff where you had to manually bridge tools (mark with
    [HANDOFF])

End the E2E with a one-paragraph verdict: how close to "Claude as
primary leader interface" is this scenario today?

================================================================
PART 3 — CROSS-TASK PATTERNS
================================================================

After the battery + e2e, look back across everything and surface:

  - Gaps that appeared in 3+ tasks (rank by severity)
  - Conversational-fit patterns (which kinds of leader work feel
    naturally chat-shaped vs spatial)
  - Context-the-UI-implicitly-shows that you'd want surfaced via
    MCP (e.g., "I never knew which songs Daniel uses most")
  - Safety / reversibility concerns you noticed (anywhere you
    almost made a mistake you couldn't undo)

================================================================
PART 4 — MISSING-TOOL WISHLIST
================================================================

Concrete proposed MCP tools/affordances, prioritized by how many
tasks each unblocks. For each:
  - proposed tool name + arg signature shape
  - which task(s) it would have unblocked
  - estimated complexity (low/med/high — your gut read)
  - any auth / safety considerations

Examples of the level of specificity I want:
  - `publish_setlist(setlistId, recipients?, note?, mode?)` —
    unblocks T10, would have helped E2E final step. Med complexity
    (needs email-template integration). Safety: confirmation token?
  - `restore_setlist(setlistId)` — unblocks T11. Low complexity if
    backed by soft-delete. Safety: window-bound to 24h?
  - `bulk_update_tracks(setlistId, patches[])` — unblocks T2.
    Low complexity (server-side loop). Safety: dry-run flag.

================================================================
PART 5 — CONVERSATIONAL-FIT VERDICT
================================================================

One section per task type (clone, edit, library, schedule,
publish/notify, monitor). For each, classify:
  - "Chat-shaped" — fits MCP naturally; UI is overhead.
  - "Mixed" — works via MCP but a small UI affordance would help
    (e.g., a confirmation modal, a preview, a multi-select).
  - "Spatial" — genuinely wants a UI (drag-reorder of 20+ rows,
    visual schedule conflict overlay, etc.).

Then a closing paragraph: what's your honest read on whether the
"Claude-first leader workflow" vision is viable for CRC, with the
current tool surface plus the highest-leverage additions you've
proposed?

================================================================
PART 6 — CLEANUP
================================================================

Delete every artifact you created during the eval. List each one
you delete and confirm `search_library({query:"EVAL"})` and
`list_setlists({})`-with-EVAL-filter both return [] at the end.

If you accidentally created a chart in the wrong collection
(core/supplemental — should be blocked by G-3 but worth a probe),
log it as a finding and clean it up.

================================================================
REPORTING FORMAT
================================================================

Produce one big markdown document. Structure:

  # MCP Claude-First Eval — Cowork Report
  ## Part 1: Task battery (11 entries, scorecards + transcripts)
  ## Part 2: E2E narrative
  ## Part 3: Cross-task patterns
  ## Part 4: Missing-tool wishlist
  ## Part 5: Conversational-fit verdict
  ## Part 6: Cleanup confirmation

End with a one-paragraph executive summary at the top (before Part 1)
so Daniel can read the headline first and dive in for detail.

Take this seriously. Daniel is considering pivoting the product's
center of gravity onto MCP, and your report is half of the evidence
he'll use to decide. Be honest about gaps; honest about where the
UI is still better; and concrete about what tools/affordances would
close the gap.
```

---

## Post-run instructions for Daniel

When cowork's report lands:

1. Save it as `sheet-music-app/.paul/research/mcp-claude-first-cowork-REPORT.md`.
2. Hand it back to me here. I'll synthesize against my codebase-side
   research plan and produce `mcp-claude-first-SYNTHESIS.md` with a
   prioritized roadmap.
3. Spot-check the cleanup confirmation in Part 6 — if cowork forgot
   anything, we can sweep it with `delete_chart` / `delete_setlist`
   in the synthesis run.

## Pre-run sanity

- [ ] Production deploy at commit `a817202e` (Wave 6) is READY (verified 2026-05-15).
- [ ] `https://www.centralreform.live/api/mcp` responds.
- [ ] You're connected as Daniel (admin) on the cowork side.
