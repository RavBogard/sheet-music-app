# Lane: live-key-song-swap-interview

**Type:** Tier-0 INTERVIEW + DESIGN-DISCUSS lane. NO code. NO commits. **No premature
design lock-in.**

**Owner:** TBD (first coder to ship + free up). Likely coder-3 (post-eili-eili diagnose)
or coder-1 (post-monitor-sends-desk-verify) on ownership-fit (both have setlist/render
surface history). Supervisor will reset your inbox at fire.

**Status:** 🟡 QUEUED 2026-05-23T~20:55Z. Fires on first SHIP-NOTICE from the active wave.

---

## Daniel's exact ask (verbatim)

> *"spin up a coder to interview me to figure out a solution to an issue that i'm having
> while live.... namely that i'll switch a key or a song, and there needs to be an easy
> and quick way to change that up for everyone in their charts, too. but only if it can
> be easy and reliable. better to not have this, if it is going to make the whole thing
> fragile."*

**Two operative constraints baked into the ask:**
1. **Easy AND quick** — for Daniel (the author) AND for the band (the consumer of the
   chart change). Both halves of the workflow matter.
2. **Easy AND reliable → ship; fragile → DROP.** This is a BUILD-OR-DROP lane. The
   default outcome is DROP if you can't get to a high-confidence "this won't break the
   service" design. Daniel would rather not have the feature than have a flaky one.

## Why interview-shape

This lane is not "go figure out the propagation path and code a fix". It's:
1. **Surface the real workflow gap** Daniel is hitting in service. He gave one sentence;
   the actual scenario shape — when does it happen, what triggers it, what does "switch
   a key" mean concretely vs "switch a song", who needs to see the change first, what's
   the current workaround — is largely unspecified.
2. **Map it to existing surfaces.** We already have MCP tools `update_song`,
   `update_track`, `swap_chart`, `clone_setlist`, `reorder_setlist`. We have realtime
   Firestore listeners on setlist docs (the band iPad Perform mode subscribes to them).
   You need to verify which parts of the workflow already work + which are the actual
   gap.
3. **Design 1-3 shapes** with explicit tradeoffs. One option MUST be "drop / status quo"
   so the build-or-drop call is honest.
4. **Land a recommendation** + tee up the decision for Daniel.

## Interview protocol (async via inbox relay)

You are in a separate session (your own `/bongo:resume <N>` tab). Daniel is in the
supervisor session. Communication is one-way through files:

1. **Write Q-ROUND-1 to `.paul/research/live-key-song-swap/Q-ROUND-1.md`** — 5-8 sharp
   questions. Avoid yes/no; favor "what does X look like for you concretely". Include
   one explicit "what would make this fragile in your mind?" question to surface the
   drop-criteria.
2. **Post a HEADS-UP to `inbox/supervisor.md`** — short note saying "Q-ROUND-1 ready,
   please relay". The supervisor reads it, forwards questions to Daniel in his current
   conversation, and writes Daniel's answers back to
   `.paul/research/live-key-song-swap/A-ROUND-1.md`.
3. **Iterate.** Q-ROUND-2 should be sharper and shorter — pin down the ambiguities from
   round 1. Cap at 3 rounds total unless Daniel signals he wants to keep going. Each
   round: HEADS-UP supervisor; supervisor relays.
4. **Deliver `.paul/research/live-key-song-swap/DISCUSSION.md`** — the synthesized
   requirement, 1-3 design shapes with tradeoff matrix, a build/drop recommendation, and
   the open-questions tail for Daniel to read. SHIP-NOTICE → inbox/supervisor.md (Tier 0,
   no code, no validation needed — this is discussion-product).

## Seed questions (use as starting point; refine)

Don't paste these verbatim — pick the sharpest 5-8 and rephrase to match Daniel's
register.

- **Trigger reality:** When you switch a key live, are you on your iPad? On Claude
  Desktop via your phone/tablet? Walking around with the rabbi-wedge? Walk through the
  last time it happened — what was the song, what was the change, what device drove it?
- **Switch-a-key vs switch-a-song:** Are these the same workflow or different? Switching
  a key = update the song's `key` field + the band's chart re-renders transposed?
  Switching a song = swap the entire track for a different song? Or replace just the
  chart while keeping the row title?
- **Target audience for the change:** Everyone on every iPad? Just the musicians playing
  this song right now? Or also the next song's musicians who are getting ready?
- **Speed bar:** "Quick" — within how many seconds? 2s? 10s? "I tell the band verbally
  and by the time we count in" (~5-15s)? Or sometimes "between the count-in and the
  downbeat" (~2-3s)?
- **Current workaround:** What do you do TODAY when this happens? Announce verbally?
  Tell everyone "open it again"? Skip the change because the propagation isn't there?
- **Failure modes you fear:** What would make this "fragile" — the change not arriving
  on one iPad? Arriving on the wrong song? Arriving but the chart re-render fails? An
  iPad that's offline at the moment of change and shows wrong info when it reconnects?
- **Trust signal:** Do you need to SEE that the band saw the change ("12 of 12 iPads
  have the new key")? Or is silent best-effort fine?
- **Revert path:** If you make the change and realize 5s later it was wrong, can you
  undo it in <2s?
- **MCP-vs-UI:** Right now [[user_mcp_is_primary_author_workflow]] says you author via
  Claude+MCP. Is the live key-swap also Claude+MCP-driven (you tell Claude "change key
  to G")? Or do you want a one-tap UI button on a Daniel-only "live director" surface?
- **Scope-cut for v1:** If we ship just key-changes (not song-swaps) for v1, does that
  cover 80% of your real need? Or are song-swaps the harder, higher-value half?

## Codebase context (what to read BEFORE Q-ROUND-1; sets the design space)

Don't ship a question Daniel can't answer because you didn't read the code first. Read at
`origin/master` `6a313f5dd`+:

1. **MCP tools that already touch this:**
   - `src/lib/mcp/tools/update-song.ts` (shipped via mcp-curation `54c6e1d82` — key/bpm
     update). What's the current write surface? Trusted-leader gated? Dual-surface
     (songs.defaults + library_index per [[project_catalog_dual_read_surfaces]])?
   - `src/lib/mcp/tools/update-track.ts` — does it exist? What setlist-scoped track
     mutations are MCP-driven?
   - `src/lib/mcp/tools/swap-chart.ts` (registered per `registerWriteTools` ~route.ts:68).
     Existing swap path.
   - `propose-setlist-changes.ts` / `commit-staged-changes.ts` — there's an
     ALREADY-EXISTING staged-write surface. Daniel may already use this for non-live
     edits. Is "live mode" a separate path or an existing-path variant?
2. **Realtime listener surfaces:**
   - `src/components/performance/*` — Perform overlay subscription model. Does it
     listen on `setlists/{id}` for live updates? Does it pull track-level deltas? Latency?
   - `src/components/performance/PublicSetlistListing.tsx` + the Perform overlay path —
     the band's iPad Perform view (the public route + the authed musician view).
   - Firestore listeners — what's the cache-vs-snapshot behavior? When the setlist doc
     `version` bumps from a `update_track` call, do all subscribed clients see it
     within how many ms?
3. **Transpose / key-display surface:**
   - `useMusicStore` (zustand) — manages transposition + AI chord state per project
     memory.
   - `PerformanceToolbar` — full toolbar incl. transpose. Per-musician transpose vs
     global key change?
4. **Setlist version + `lastModifiedAt`:**
   - `setlists/{id}.version` field exists (the get_setlist we just pulled shows
     `version: 15`). What's the optimistic-concurrency story? If Daniel and a band
     member both edit at the same instant, what happens?

You don't need to UNDERSTAND every line — just have a working mental model of "what
already happens when Daniel calls `update_song`" so your questions are about the GAP, not
the basics.

## Design tradeoff dimensions (skeletons — fill in the matrix)

In your DISCUSSION.md, the tradeoff table probably needs at least these columns:

| Dimension | Status quo | Build-Minimal | Build-Full |
|-----------|-----------|---------------|------------|
| Author UX | (what Daniel does today) | (one MCP call?) | (one-tap UI button?) |
| Band UX | (refresh manually?) | (auto re-render?) | (visible "key changed" toast?) |
| Latency | ? | <Xs | <Ys |
| Failure mode | (lose change?) | (silent retry?) | (visible "12/12 acked"?) |
| Fragility risk | (none — no feature) | (Firestore listener flake?) | (more code = more surface) |
| Reliance on bridge | (none) | (?) | (?) |
| Test surface | n/a | (small) | (medium) |
| **DROP rationale** | n/a — already dropped | n/a | (Daniel: ?) |

Be honest about fragility. If the only "build" option requires perfect Firestore listener
behavior across 6 NATed iPads with intermittent WiFi during a 90min service, **that's a
DROP recommendation**, not a "we'll make it work" promise.

## What to AVOID

- **Don't propose a fix in Q-ROUND-1.** Ask first. Most "obvious" propagation answers
  miss the real workflow constraint (e.g., maybe Daniel doesn't want auto-propagate
  because he WANTS to verbally announce the change first; ask before assuming).
- **Don't conflate key-change and song-swap.** They share infrastructure but the UX,
  speed, and reliability bars may differ. Treat as two questions until Daniel says
  otherwise.
- **Don't pre-commit to MCP-only or UI-only.** Daniel may want both (MCP for normal
  authoring, a Daniel-only "live director" UI button for in-service speed).
- **Don't widen scope.** This is keys + song swaps for the LIVE service moment. Not
  "real-time everything". Not multi-author collaboration. Not bandleader chat.
- **Don't take more than 3 Q-rounds** without flagging in inbox/supervisor.md. If
  Daniel's answers are taking the interview into ambiguous territory, surface that
  to supervisor for a re-scope.

## Gate / output

- `.paul/research/live-key-song-swap/Q-ROUND-{1,2,3}.md` — your questions, one per round.
- `.paul/research/live-key-song-swap/A-ROUND-{1,2,3}.md` — Daniel's answers, written by
  supervisor on relay.
- `.paul/research/live-key-song-swap/DISCUSSION.md` — synthesized requirement + design
  shapes + tradeoff matrix + build/drop recommendation + open-questions tail.
- SHIP-NOTICE → `inbox/supervisor.md`.

**Action when fired:** ACK in `inbox/supervisor.md` (`from coder-<N>`), then read the
codebase context list, then write Q-ROUND-1.
