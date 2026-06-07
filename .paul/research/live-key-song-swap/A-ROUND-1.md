# A-ROUND-1 — Daniel's answers (verbatim + synthesis)

**From:** Daniel (direct in coder-5 session, supervisor-relay bypassed)
**Captured by:** coder-5
**Time:** 2026-05-23T20:50Z

---

## Verbatim

> **1)** I'm playing guitar and leading the service as a rabbi. There are
> other musicians there with iPads. I'll turn to the other musicians and
> tell them we're doing a different piece, or doing it in a different key,
> etc... things are switching all the time. This happened 2-3x during
> services this week.
>
> **2)** Both happen at times.
>
> **3)** b, d, e.
>
> **4)** No. Part of the problem is that I'm not really looking at the iPad
> myself during services. I'm looking at my siddur.
>
> **5)** On the bima, leading services, with a guitar and a siddur. I don't
> have an iPad that I can access easily.
>
> **6)** c [just re-edit, no special undo].
>
> **7)** I'm not using Claude mid-service, and neither are the musicians or
> band directors.

---

## Synthesis (key load-bearing facts for the design space)

1. **Daniel has NO live-authoring surface and won't get one.** Hands: guitar
   + siddur. Eyes: siddur. The MCP-via-Claude-Desktop path that I assumed
   might be the authoring surface is **not used at all mid-service** by
   anyone (Q7). The propagation pipe exists but is unused live.

2. **The change frequency is HIGH — 2-3x per service.** This is not an
   edge case; it's a routine workflow. Whatever the answer is, it has to
   survive being used 2-3x in 60-90 minutes of music.

3. **The current authoring surface IS verbal.** Daniel turns to musicians
   and tells them. That's the working mechanism — voice in the room. The
   musicians act on it however they each act on it (mental transpose,
   tap-transpose on their iPad, ignore the chart and play from ear).

4. **Daniel doesn't need a trust signal (Q4) AND doesn't need an undo
   surface (Q6).** Whatever ships can't ask Daniel to do ANYTHING on a
   device. He's not looking at one.

5. **Both key changes AND song swaps happen (Q2).** No scope-cut to
   keys-only.

6. **Daniel's fragility worries (Q3) — b/d/e:**
   - **(b) Cached chart shows old key after a "key changed" event** → this
     hints at the PDF-vs-MusicXML chart-format question. PDF charts CAN'T
     re-render in a new key — the chart graphics are bytes. Only MusicXML
     (via OSMD) and chord-text overlays can dynamically transpose. So a
     band-leader-pushes-key-change feature on a PDF chart would label "now
     in B♭" while the chart graphics still show D — exactly (b).
   - **(d) Edit lands on wrong row** → "this one" reference ambiguity when
     the change is communicated verbally and acted on remotely. If a band
     leader hears "let's do this one in B♭" while looking at row 5, but
     Daniel meant row 7, the change lands on the wrong song.
   - **(e) iPad asleep, woke-from-sleep shows wrong state** → the
     KeepAwakeToggle I just shipped (559c6c84d) partially addresses this,
     but it's user-activated per-session.

7. **Daniel did NOT pick (a) WiFi-stale or (c) no-ack-receipt.** Consistent
   with him not looking at the iPad — he's not going to notice or react
   to either.

## Design-space implications

The honest read: **Daniel's literal ask ("a way to change that up for
everyone in their charts") cannot be authored BY DANIEL.** No hands, no
eyes, no device. So there are only two shapes that can possibly satisfy
the ask:

- **Delegation:** band leader (Randy / David) hears Daniel's verbal call
  and is the authoring hand — taps once on their iPad to push to all
  other iPads.
- **Per-musician self-serve:** every musician handles their own
  transpose/swap on their own iPad when they hear Daniel. No propagation.
  Status quo for chord-chart transpose (already in `useMusicStore` +
  `PerformanceToolbar`); doesn't really exist for song-swap.

And **DROP / status-quo** stays on the table — verbal-only call is the
working mechanism today and survives 2-3x/service. The question is
whether the iPads showing CORRECT info matters more than just the
musicians playing the right notes.

Open factual questions that gate the recommendation:
- Are most charts PDF or MusicXML? (Determines whether key-changes can
  even re-render. Project memory says MusicXML is strategic-preferred,
  but I don't know the deployed mix.)
- Are Randy / David hands-free enough to tap an iPad mid-service?
- When Daniel switches "a song" — is the new song already in tonight's
  setlist (just played out of order), or is it a song NOT in the plan?

→ Q-ROUND-2 covers these.
