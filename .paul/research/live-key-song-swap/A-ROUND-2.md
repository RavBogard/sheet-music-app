# A-ROUND-2 — Daniel's answers (verbatim + synthesis)

**From:** Daniel (direct in coder-5 session, supervisor-relay bypassed)
**Captured by:** coder-5
**Time:** 2026-05-23T21:00Z

---

## Verbatim

> **Q1)** Most are PDFs. I would like for this to change eventually, but
> it is currently the case.
>
> **Q2)** I can have 1 person do this. Maybe Bryn.
>
> **Q3)** b. [A song in the catalog but not in tonight's setlist — a fresh
> insert/swap.]

---

## Synthesis (load-bearing for DISCUSSION.md)

1. **PDF-dominant chart mix kills centralized key-change propagation.**
   A PDF is fixed bytes; OSMD/transposition only works for MusicXML and
   text-overlay chord-charts. Pushing "Lecha Dodi in B♭" to all iPads
   when the chart is a PDF in D means every iPad shows the OLD D chart
   graphics with a NEW "B♭" label — exactly the (b) fragility Daniel
   called out. The PDF mix is the deciding constraint. (MusicXML
   migration is a separate strategic effort per
   [[project_musicxml_goal]]; revisit this lane when the mix flips.)

2. **Bryn is a viable authoring hand.** One named, dedicated tapper with
   hands free. Resolves the "Daniel has no authoring surface" deadlock
   for the song-swap half of the workflow — Bryn hears the verbal call
   and is the one who taps. Crucially: Bryn is NOT using Claude
   Desktop (per Q7 round-1), so the authoring surface has to be IN-APP
   on her iPad, not MCP-driven.

3. **Song swaps are mostly FRESH inserts** — pulling a song that wasn't
   in tonight's plan from the catalog. That's the harder case (vs
   re-ordering an existing row), but it's also where the propagation
   story is cleanest: the new chart is its own fileId/bytes, so every
   iPad fetches fresh — no transposition magic needed, no (b) failure
   mode. The new chart renders correctly on every iPad because each
   one pulls the new chart's actual graphics.

## Implications for the recommendation

- **Key changes: DROP centralized propagation.** PDF chart-format makes
  it guaranteed-fragile by Daniel's own (b) criterion. Status quo
  (verbal call + per-musician local transpose where supported, mental
  transpose on PDF) is honestly the safer ship. Revisit when MusicXML
  becomes the chart-format majority.
- **Song swaps: BUILD a Bryn-driven in-app live-insert UI.** The
  fragility risks (b/d/e) are all manageable for fresh inserts:
  (b) doesn't apply (new chart = new bytes), (d) gated by Bryn's
  deliberate tap + confirm-step, (e) addressed by the wake-lock toggle
  already shipped at 559c6c84d.

→ DISCUSSION.md formalizes this split verdict.
