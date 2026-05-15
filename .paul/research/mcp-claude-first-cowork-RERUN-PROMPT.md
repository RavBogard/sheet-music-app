# MCP Claude-First Eval — Cowork RE-RUN (targeted)

**Date:** 2026-05-15 post-Wave-6 ship
**Reason:** The first cowork run had a stale tool-discovery cache and reported `delete_chart`, `get_matrix`, and the widened `add_track_to_setlist.type` enum as missing. All three are live on master (`6fe3de2e`) and deployed via Vercel. This is a focused re-run to verify the actually-shipped surface and tighten three task verdicts.

**Production MCP:** https://www.centralreform.live/api/mcp
**Pre-run requirement:** Daniel reconnects / refreshes the MCP connector in Claude Desktop (or web) so tool discovery picks up the current schema. The tool count should be **22**, not 20.

---

## Send this to cowork-Claude

```
You are running a TARGETED re-run of the MCP claude-first eval. The
prior run had a stale tool-discovery cache and reported some live
tools as missing. This run verifies the actual surface and tightens
three task verdicts. Your prior report stands for the unaffected
tasks; only these specific items get re-evaluated.

Endpoint: https://www.centralreform.live/api/mcp
You are authorized as Rabbi Daniel (admin role).

================================================================
PART 0 — TOOL DISCOVERY VERIFICATION
================================================================

Before anything else, enumerate the tools you can see. Expected: 22
tools total. The three that MUST be present (the prior run thought
they were missing):

  - delete_chart(fileId)
  - get_matrix(matrixIndex?)
  - add_track_to_setlist with type enum that includes
    'reading' | 'prayer' | 'transition' | 'note' (not just song/header)

For each of those three, report:
  - PRESENT / MISSING
  - schema you see (if your client surfaces it)

If any of the three is still missing after the connector refresh,
STOP — that means a deploy is broken on Daniel's side and the
re-run is moot. Report the gap and end the run there.

================================================================
PART 1 — RE-RUN AFFECTED TASKS
================================================================

--- Task 1-redo: Clone-and-tweak (fidelity check) ---
Find Daniel's most recent Shabbat setlist that contains at least
one row typed `reading` or `prayer` (the May 15 service had a
Dvar Torah reading and a Silent Prayer). Create a new setlist
titled "⚠️ EVAL T1R — Clone Fidelity Check" for next Friday.
Replicate the source setlist row-for-row using the WIDENED type
enum — every reading row in the source becomes a reading row in
the clone, every prayer becomes prayer, every transition becomes
transition.

Compare against your prior T1 run where rows got rewritten as
type:'song' free-text. Report:
  - completion: yes / partial / no
  - whether the type enum widening fully closes the fidelity gap
  - any remaining fidelity loss
  - tool_calls + transcript

Cleanup: delete this setlist via delete_setlist at the end of this
task.

--- Task 4-redo: Insert reading + transition (semantic check) ---
On a freshly-created throwaway setlist (title "⚠️ EVAL T4R —
Insert Semantic"), add 3 song rows, then:
  - insert a reading titled "V'ahavta" at position 2 with
    type:'reading'
  - insert a transition titled "Niggun" at position 3 with
    type:'transition'

Verify via get_setlist that the inserted rows actually carry
type:'reading' and type:'transition' (not type:'song'). Compare
against your prior T4 attempt where these came back as song rows.

Cleanup: delete this setlist.

--- Task 7-redo: Library cleanup (delete_chart sweep) ---
This task does the full cleanup the prior run couldn't.

Step 1. Sweep your own leftover EVAL charts from the prior run:
  - upload-5f993fa9-89bb-43a4-8686-97b8a0339959 (T5 Carlebach)
  - upload-650361ae-8f1f-4633-a5fb-85aaaa5d9961 (T6 Direct Upload)
Call delete_chart on each. Report ok / error per id.

Step 2. Sweep the 9 leftover STRESS TEST charts from the
2026-05-15 stress test (these were Daniel-personal cleanup items
from the prior cycle):
  - upload-a0c31045-2e0c-4153-92a9-d13bc1ca96ee (CORE PROBE)
  - upload-bb13317e-7db4-433d-baff-76d7f3bf178a (SUPPLEMENTAL PROBE)
  - upload-d7f4d5f4-1142-475e-81b1-393bc6edf43d (Adon Olam)
  - upload-5bfac6d1-544f-48fd-92b4-db4b614413d1 (PDF chart)
  - upload-fc466d13-6a30-4ad8-8fe7-5fcc14b375ed (MusicXML)
  - upload-d2724f75-a8cf-43a9-9746-d4b69582af28 (Adon Olamx)
  - upload-841fe659-c29e-4d82-9da3-c0841278e9a6 (bad mime)
  - upload-5caf2ede-c877-4ebd-b341-d91f9d16e653 (not base64)
  - upload-66dd16e4-74b3-43d0-adf6-72c3040a4514 (scraped Amazing Grace)

For the two CURATED-CATALOG ones (CORE PROBE, SUPPLEMENTAL PROBE),
BEFORE you call delete_chart, call get_song on each and report
their `collection` field. This is regression evidence for the
Wave 4 G-3 admin gate:
  - If `collection: "core"` or `collection: "supplemental"` is set
    on those docs, the G-3 gate either wasn't enforced at upload
    time or was bypassed somehow.
  - If they got rejected at upload and only landed as something
    else (or don't exist), G-3 is fine.

Then call delete_chart on each of the 9. As admin you should be
able to delete from any collection. Report ok/error per id.

Step 3. Verification: search_library({query: "EVAL"}) and
search_library({query: "STRESS"}) should both return [] at the
end. Report the final search result.

================================================================
PART 2 — REGRESSION PROBE: G-3 ADMIN GATE
================================================================

Now that delete_chart works, exercise the full G-3 admin-gate
loop one fresh time to confirm Wave 4 is healthy in production:

1. As admin, upload_chart to collection 'core' with title
   "⚠️ EVAL G3R — Core Probe" and a tiny PDF. Expect: ok.
2. Confirm via get_song that the new fileId has
   collection: "core".
3. delete_chart on that fileId. Expect: ok.
4. Try the same with collection 'supplemental'. Expect: ok →
   confirm via get_song → delete_chart.

If any step fails, surface as a finding with the full error.
This isn't a stress test — it's a single-pass regression to
confirm the deployed Wave 4 path matches what we shipped.

================================================================
PART 3 — REGRESSION PROBE: get_matrix
================================================================

X32 hardware is still offline. Run get_matrix({}) anyway and
report the response shape. Expected behavior:
  - If the bridge has a cached mixer state: returns
    { matrices: [{index, name, fader, on}, ...] }
  - If no state: returns
    { error: "Mixer state not available — is the bridge online?" }

Either is fine. The point is to confirm the tool is REACHABLE
and returns a sensible envelope. Report what you see.

Also try get_matrix({matrixIndex: 1}) and get_matrix({matrixIndex:
99}) — the first should return one matrix or the not-available
error; the second should return either a "matrix 99 not found"
error or the not-available error (depending on bridge state).

================================================================
PART 4 — REPORT
================================================================

Produce a compact markdown report titled:

  # MCP Claude-First Eval — Cowork RE-RUN Report

Sections:
  - Part 0: Tool discovery (present/missing per tool)
  - Part 1: Re-run results (T1R, T4R, T7R per scorecard format)
  - Part 2: G-3 regression
  - Part 3: get_matrix regression
  - Part 4: Final library state
  - Part 5: Verdict — does the widened type enum + delete_chart +
    get_matrix surface materially change your overall claude-first
    viability read? (1 paragraph; the main report stands otherwise)

End with one sentence: do the previous report's top-priority
missing tools (clone_setlist, update_track, bulk_update_tracks,
publish_setlist, soft-delete) still stand as written? (Yes/no +
one-line caveat if anything moves.)
```

---

## Post-run instructions for Daniel

Save the re-run report as `sheet-music-app/.paul/research/mcp-claude-first-cowork-RERUN-REPORT.md` and hand it back. I'll fold its findings into the SYNTHESIS doc as a "stale-cache caveat resolved" sub-section.

## Pre-run sanity

- [ ] Reconnect / refresh the MCP connector in your Claude Desktop / web settings — the tool discovery is the cause of the issue.
- [ ] Confirm 22 tools visible before Part 0 starts.
- [ ] If any of `delete_chart` / `get_matrix` / widened type enum is still missing after refresh, STOP and ping me — that would be a real shipping bug.
