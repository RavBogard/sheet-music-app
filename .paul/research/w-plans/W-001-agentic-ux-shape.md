# W-001 — Agentic UX shape for the MCP-first weekly flow

**Status:** Planning doc, no code. Derived from `setlist-system-punch-list.md` §W-001.
**Author:** Claude (planning pass, 2026-05-16)
**Sister docs:** [W-002](W-002-trust-calibration.md) · [W-003](W-003-library-hygiene.md) · [W-004](W-004-bidirectional-sync.md)

---

## 1. Problem framing

The Chase Bar Mitzvah session (2026-05-16) burned ~8 round-trips to converge on a working setlist. The pattern was always the same: Claude bonded confidently, the rabbi opened the chart in the web app, the chart was wrong (or 404'd), the rabbi reported back, Claude bonded again. The AI was operating as a *fast typist*, not a *trustworthy collaborator* — it would commit a bond on flimsy evidence (single search match, generic title, no render check) and the rabbi was the only validator in the loop.

The tactical fixes the parallel session is shipping (chart-render verification, upload-from-path, orphan sweep) remove the worst failure modes but don't change the interaction shape. Even with all those fixes, the agent can still bond a wrong-but-renderable chart from a generic-titled catalog entry, publish, and only learn it was wrong when Randy opens the iPad on Friday.

What's missing is a deliberate **trust-calibration interaction shape** — when does the agent commit vs. propose, how does it surface its own confidence, what's the "AI presents options, rabbi confirms once" loop look like in practice over a chat interface like Claude Desktop.

This is a design problem, not a coding problem. The fix is mostly:
- Agent-side conventions (when to ask before bonding, how to surface uncertainty).
- A small amount of MCP-side metadata (specificity signals from W-002, render-status from the tactical chart-verify fix) feeding those conventions.
- One or two new MCP tools that exist specifically to support a "propose-then-confirm" loop without forcing a separate browser trip.

## 2. Proposed scope

**In:**
- A single canonical **chat-native** interaction loop ("propose → confirm → commit") for the four high-risk write operations: chart bonding (`update_track` with songId change, `bulk_add_tracks` with new songIds), chart upload to curated catalogs, `publish_setlist`, and bulk setlist construction from a clone. Claude is the primary setlist-generation surface; the web app's edit UI stays available only for ad-hoc quick fixes.
- Confidence framing in agent responses: when the agent has high specificity it commits and reports; when low specificity / single-match / generic-title / orphan-risk it stops and asks.
- A staging concept: `propose_setlist_changes` style MCP tool (or an extension of existing dryRun) that lets the agent show the rabbi a *complete* proposed setlist before writing any tracks. Rabbi sees titles, composers, last-used date, render status; replies "yes / change row 7 to X / use the Klepper Hashkivenu instead". Agent then commits in one bulk call.
- A pre-publish "preview-as-band" affordance the agent can trigger and report back on (chart-verify summary + audience count + snapshot diff vs. last publish). Publish becomes one-confirm instead of dry-run-then-real.
- Guidance for when the agent should ASK vs. PROCEED: tied to specificity (W-002) and render-status signals. Default behavior is **commit-and-flag** on low-confidence bonds plus a batch-review pass before publish; only zero-information bonds (no search hit, fabricated songId) hard-stop.
- **Learning loop (NEW 2026-05-16, Daniel-requested):** the batch-review step is the system's training signal. When the rabbi corrects a flagged bond — accepting it, swapping to a different `songId`, or marking it "lead live, no chart" — the correction is recorded as a structured event. Those events feed two deterministic, non-ML signals (lives in W-002):
  1. **`bondCorrectionHistory` per `library_index` entry:** count of times this entry was bonded by the agent and later corrected *away from* (negative) vs. corrected *to* (positive). Entries that keep getting corrected-away-from get implicitly down-ranked in search; entries that get corrected-to get up-ranked. Pure counters, no model.
  2. **`titleContextHints` per ambiguous-stem cluster:** when the rabbi consistently picks "Hashkivenu (Klepper-Freelander)" for Friday-evening setlists and "Hashkivenu (Sulzer)" for Shabbat morning, the system records `{stem: "hashkivenu", serviceType: "friday-evening", preferredFileId: ...}` after N consistent picks (N=3 to start). Next time the agent searches "hashkivenu" in a Friday-evening setlist context, the preferred entry rises to position 0 in results.
- The learning loop is opt-out: every correction event is observable in a per-user log; Daniel can audit or wipe at any time.

**Out:**
- Anything that requires UI changes in the browser app. The browser is the band's surface; the rabbi interacts via Claude Desktop. Web-side affordances (drag-to-bond, preview-as-band button) belong in a separate front-end W and are not in scope here.
- Anything that touches the four tactical-fix files. We consume the output of those fixes; we don't shape them.
- "Notifications when David edits" — that's W-004 sync work.
- Conversational tooling on the agent side (system prompts, Claude.ai instructions). The MCP server can ship *machinery* that supports the loop; it can't dictate how Claude phrases things. Out of MCP scope; in scope only as a recommendation.

## 3. Explicit open questions for Daniel

1. ~~**Where does the rabbi's "confirm" actually happen?**~~ **ANSWERED 2026-05-16:** Chat-only. The vision is Claude as the primary setlist-generation backend; the web app's edit tools stay for quick fixes only. No generated review pages, no web-side confirm UI. Every propose / confirm / commit happens inside the Claude conversation.

2. ~~**Stop-and-ask vs. commit-and-flag?**~~ **ANSWERED 2026-05-16:** Commit-and-flag is the default, with a final "review these N flagged bonds" pass at the end of authoring. Mixed approach allowed — true zero-information bonds (no search hit, fabricated songId) still hard-stop. **Plus new requirement: the flag/review loop must feed a learning / self-healing signal that improves future bonds.** See §2 (learning loop) and W-002 §2 (corrections-feedback signal).

3. **Is "the agent published the wrong setlist" recoverable from the agent's side?** Today there's no `unpublish_setlist`. Do you want one (sends a "scratch that — updated version coming" notification), or is the answer "just re-publish; the band sees live updates"?

4. **Does David get the same trust-calibration UX or a stricter one?** He's a band_leader, not admin, and is the weekly-flow target user. Stricter (more confirms) protects him from authoring mistakes that hit you publicly; same-as-Daniel keeps the experience consistent for both.

5. **Should `publish_setlist` ever be allowed to proceed when chart-verify reports failures?** Today (post tactical fix) it would presumably error or warn. Hard-block is safest. Soft-warn + an explicit `force: true` (mirroring the dedup-override pattern from `feedback_dedup_force_override`) lets you publish anyway when you've already accepted "Niggun row is lead-live, no chart needed".

6. **"Preview as band" — email-to-self or in-app render?** Email-to-self is operationally identical to publish, costs nothing extra, but adds clutter. In-app render route (`/perform/setlist/{id}?preview=true`) needs UI work but is reusable.

## 4. Dependencies on tactical fixes currently shipping

**Update 2026-05-16 (parallel session shipped):**
- ✅ **B-001 chunked upload** — shipped as `request_chart_upload_url` + `finalize_chart_upload` (commit `7eee79927`). Agent now has a signed-URL path for any chart size up to 25 MB. Dep cleared.
- ✅ **A-001 / B-002 / B-003 chart-verify** — shipped as `get_chart_status` + `verify_setlist_charts` + `publish_setlist` pre-flight (commit `f88c8b6c7`). The preview-publish tool in §2 is now THINNER — `publish_setlist({dryRun: true})` already returns the chartHealth report alongside the recipient plan. W-001's "preview-publish" becomes mostly a UX wrapper around the existing dryRun envelope.
- ✅ **L-001 orphan filter** — shipped as `verify_setlist_charts({markOrphaned: true})` + `search_library` hides orphans by default (commit `e4bea186c`). Dep cleared.

**Still open:**
- **W-002 specificity signals** — sister doc. Without specificity scores feeding the agent, "low confidence → ask" has no operationalizable trigger.
- **W-004 optimistic concurrency** — without `lastSeenVersion`, a "propose 21 changes, rabbi confirms 5 min later, commit" loop is racing against David editing in parallel. Hard-fail-with-recovery-hint is acceptable for v1; nicer eventually.

This work is the *integration layer*. With the tactical fixes shipped today, W-001's only remaining prerequisites are W-002 (specificity data) and W-004 (concurrency safety).

## 5. Effort estimate

**M (medium)**. Q1 resolved chat-only, which kept this on the lower side.

- New `propose_setlist_changes(setlistId, proposals[])` tool that records a staged batch and returns a summary envelope: ~1 day.
- New `commit_staged_changes(stageId)` to apply them atomically: ~0.5 day.
- New `preview_publish(setlistId)` combining `verify_setlist_charts` + recipient projection + snapshot diff: ~0.5 day.
- Agent-side conventions doc (when to ask, how to format confidence) shipped as `.paul/AGENT-GUIDE.md` plus injected into the MCP server's `instructions` block: ~0.5 day.
- Emulator tests for stage/commit semantics, expiration, cross-setlist guards: ~0.5–1 day.
- **Learning-loop plumbing:** `flag_bond(setlistId, trackId, reason)` + `review_flagged_bonds(setlistId)` + `record_bond_correction(...)` MCP tools, plus the `bondCorrectionHistory` counter writes in W-002's library-index schema: ~1 day. `titleContextHints` aggregation runs as a Cloud Function trigger on correction events; cheap once W-002's schema is in: ~0.5 day.

No web UI work — propose/confirm/commit is chat-native end to end. **Revised total: ~5 days.**

## 6. Suggested sequence vs. other Ws

**Ship third**, after W-002 (so the agent has specificity to consume) and after the parallel session's chart-verify lands. W-001 is the *integration story* — it presupposes the data it consumes.

Order:
1. Tactical fixes (parallel session, already underway).
2. W-002 specificity signals (data feed).
3. W-001 interaction shape (this doc — consumes #1 and #2).
4. W-004 sync (concurrency adds a polish layer on top of #3).
5. W-003 hygiene pass (parallel, mostly Daniel's content work; benefits all of the above).

W-001 is "what the experience feels like end-to-end". It's last on the data-dependency chain but first in user-perceived value once it lands. Sequencing it third means it's the visible payoff after a stretch of plumbing.
