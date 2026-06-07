# Q-ROUND-1 — live key / song swap interview

**From:** coder-5 (lane `live-key-song-swap-interview`, Tier-0 INTERVIEW + DESIGN-DISCUSS)
**To:** Daniel (relayed by supervisor)
**Round:** 1 of up to 3
**Started:** 2026-05-23T20:30Z

---

## Quick context (so my questions are about the gap, not the basics)

I read the surfaces. Two things are worth naming up-front so we don't talk past
each other:

1. **The realtime pipe already exists.** When a track row's `key` changes in
   Firestore, `useSetlistPerformance` → `startSnapshotListener` → Dexie →
   `useLiveQuery` should re-render the chart row on every iPad subscribed to
   that setlist within ~Firestore propagation latency (typically <2s for
   responsive networks, longer on weak iPad WiFi). So we likely DO have the
   "change one place, everyone sees it" pipe.

2. **There are TWO conceptual "key changes"** and the answer-shape differs:
   - **A. Catalog-level** (`update_song`) — change the song's CANONICAL key
     in `songs/{id}.defaults.key` + `library_index`. Affects every future
     setlist that bonds this song. Persistent. NOT what you'd want mid-service
     if you're "trying G this week."
   - **B. Setlist-level** (`update_track`, or `propose_setlist_changes` +
     `commit_staged_changes` with an `update` proposal) — change THIS
     service's track row only. `tracks/{trackId}.key = 'G'`. Doesn't touch
     the catalog. THIS is almost certainly what "live key swap" means.

   I'm assuming you mean (B) — confirm in the answers if I'm wrong.

That framing changes the questions below. If the pipe already works, the
real question is **does it FEEL reliable to you**, or **have you never
tried it because you didn't know it worked**?

---

## Questions

### Q1. Walk me through the last time this hurt.

Most recent service where you wanted to switch a key or a song live and the
band's iPads didn't get the message. What was the song, what was the change
("we're doing this in G instead of A" / "let's swap in Mizmor L'David for
the meditation"), what device was in your hand at that moment, and what
actually happened? Did you try to change it from Claude Desktop on your
phone? From your iPad? Did you announce it verbally and skip the propagation
entirely?

I want the *story shape*, not a hypothesis. "It was Yedid Nefesh, we tried
B-flat, I told the band verbally, Randy played from his head, the iPads
still showed C, the bassist played in C until the second verse" — that
kind of detail. The shape tells me whether this is a propagation problem,
a discovery problem, or an "I never trusted the pipe so I worked around it"
problem.

### Q2. Key swap vs song swap — same workflow, or two different problems?

- **Key swap** = "tonight we're doing Yedid Nefesh in B-flat instead of C."
  Same chart, displayed in a different key. (Maybe: re-rendered transposed,
  maybe: literally rebound to a different chart that's in B-flat already if
  the bond exists.)
- **Song swap** = "we're not doing Mizmor L'David tonight, we're doing
  Hashkivenu instead." Different track entirely, different chart.
- **Song insert** = "let's add Adon Olam after the kaddish."
- **Song skip** = "we're not doing track 7 tonight" (no replacement, just
  skip).

Are these all the same urgency? Same "fragile or it doesn't ship" bar? If
v1 covers ONLY key swaps and not song swaps, does that solve 80% of the
real need, or are song swaps the harder-and-more-important half?

### Q3. What does "fragile" mean to you concretely?

Pick the failure mode that would make you say "yeah, drop this":

  (a) One iPad shows the OLD key because its WiFi was flaky for 4 seconds
      → bassist plays the wrong chord changes for the first verse.
  (b) ALL iPads pick up the change instantly but the page-3 chart row had
      cached the chord chart pre-key-swap and shows wrong chords until
      you tap-refresh.
  (c) The change goes through but you can't tell whether it landed —
      no visible signal on YOUR end that "yes, the change is live on
      everyone's screen."
  (d) Edit arrives but on the WRONG song (you meant to change "Lecha
      Dodi" key, but it landed on the next track because of an off-by-one
      or stale UI state).
  (e) iPad sleeps mid-service (a la wake-lock bug, but in this domain:
      the change came in while the iPad was locked, woke-from-lock UI
      shows wrong state until tap-to-refresh).

These have very different infra implications. (a) is "Firestore latency
on weak WiFi" — basically unsolvable. (c) is "we need an ack receipt
surface." (d) is "we need a confirm-before-commit gate." (e) is "we need
a re-fetch on wake-from-sleep."

What's the showstopper for you?

### Q4. Trust signal — do you need to SEE that the band saw it?

When you push the change, do you need a visible "6/6 iPads acked the new
key" on YOUR surface? Or is silent best-effort OK ("I told Claude, Claude
told me 'done', I trust it")? If you need a receipt, what's the granularity:

  - "Setlist updated" — generic, just confirms the write went through.
  - "Track key updated" — confirms the right field changed.
  - "Band iPads updated" — confirms downstream clients have seen the
    change. (This is the hardest one; requires per-client ack writes
    or counting Firestore listener-callbacks, neither of which currently
    exists.)

### Q5. Authoring device — where are you when the live change happens?

You're on the bimah, the band's playing, you realize you want to change
something. What's in your hand?

  - Your iPad on a music stand (UI button on the Perform surface)?
  - Your phone (Claude Desktop voice/text → MCP)?
  - Nothing (you walk back to the stand between songs)?
  - Randy or David has the band-leader iPad and YOU verbally tell them
    to change it on THEIR end?

If your iPad is your hand-held during service, a one-tap "transpose this
song up/down a step for everyone" button on the Perform surface might be
the highest-velocity authoring surface. If you're on Claude Desktop via
phone, `update_track` MCP plus an `ack_setlist_change` receipt tool is the
right shape. They're not the same build.

### Q6. Revert window — when you make a wrong call.

You change Lecha Dodi to B-flat, you realize 5 seconds later it should
have been A. What's the undo flow you'd want?

  - One-tap undo (track-row-level)?
  - "Open Claude, tell it to revert" (no separate undo surface)?
  - "Re-do the change command with the right value" (no special revert,
    just another edit)?

This shapes whether we need a track-version-aware undo stack, or whether
"just re-edit" is acceptable.

### Q7. Have you actually tried `update_track` (or `propose_setlist_changes` →
`commit_staged_changes`) mid-service from Claude Desktop?

This is the critical question. The pipe exists. It writes to Firestore.
Firestore propagates. iPads should see the change within ~1-2s on good
WiFi.

If you've tried it and it didn't propagate / propagated too slowly / failed
silently / showed wrong state: that's an INFRA bug, and we know what to
investigate (snapshot-listener, useLiveQuery, Dexie LWW, iPad-WiFi gotchas).

If you've never tried it because you didn't trust it or didn't know it
existed: that's a DISCOVERABILITY + TRUST-SIGNAL problem, and the build
shape is "make a one-tap UI button on the Perform header that wraps the
existing MCP call, with a visible ack" — much cheaper than building new
infra.

The honest answer to this question probably bounds the whole feature
size.

---

## What I do NOT need answers to in this round

- "Should we build it?" — that's MY recommendation in DISCUSSION.md, not
  your call here.
- "What's the implementation?" — wrong question for this round.
- "What about real-time chord-by-chord broadcasting?" — explicitly out of
  scope per the prompt.

---

**Reply path:** Supervisor relays your answers to
`.paul/research/live-key-song-swap/A-ROUND-1.md`. After I read those I'll
either ship Q-ROUND-2 (sharper, shorter) or jump straight to DISCUSSION.md
if Round 1 is already conclusive.

from coder-5
