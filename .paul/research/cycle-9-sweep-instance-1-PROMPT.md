# Cycle-9 Sweep — Instance 1: Band-facing Perform mode + iPad UX

**Read `cycle-9-sweep-PARENT.md` first.** Sign `from cycle-9-instance-1`.
uidPrefix: `c9i1`. Bearer: pool row `ASSIGNMENT=cycle-9-instance-1`.

## Why this is the most important axis

The band onboards onto iPads in Perform mode. This is the consumer surface
Daniel wants "bulletproof and easy and intuitive." Probe it like a band member
on an iPad on a Friday night with imperfect wifi.

## Surface

- `/perform`, `/perform/[fileId]`, the SetlistCards / Upcoming-Services view,
  chart-bind picker, `PerformanceToolbar` (transpose / annotate / zoom /
  metronome), song-to-song navigation, gig-packet print, public setlist view
  `/perform/setlist/<id>` (public BY DESIGN — see PARENT §4).

## Method

Use the in-sandbox Playwright harness (`cycle-4/harness/`, reuse
`lib/probe.mjs`) at **iPad-Mini AND iPhone-15 viewports**. Auth via
`/api/auth/test-session` for a cookie session (musician role). Remember
META-003: cookie ≠ Web-SDK auth, so client data may not hydrate — observe
DOM/layout/interaction, and use MCP/server reads for data ground-truth.

## Probes (golden path + edge cases)

1. **Tonight's setlist loads.** Musician opens `/perform`, sees the upcoming
   Friday-eve / Shabbat-morning service, opens it. Cards render, no overflow/
   truncation at iPad-Mini width (C7I2-001 was a title-truncation regression —
   confirm it's still fixed).
2. **Open a chart.** Tap a bonded track → chart renders. Time it. (C7I2-002 was
   a forever-spinner regression on `/perform/[fileId]` — confirm the 15s
   timeout + retry + Back + Library affordances still appear on a slow/missing
   chart.)
3. **Navigate song-to-song**, transpose, zoom, metronome, annotate — each
   toolbar action works + persists where expected.
4. **Edge — chart still loading / missing / shortcut-bond:** what does a band
   member see? Spinner forever? Clear error? A track bonded to a broken
   shortcut-mimetype row (cf C8I2-005)?
5. **Edge — empty / huge setlist:** 0-chart setlist; a 30-row Shabbat-morning
   service with ~16 unbonded section markers — does the UI stay usable?
6. **Edge — offline / slow network:** throttle; does Perform degrade gracefully
   (the Dexie/`use-setlist-performance` snapshot path)?
7. **Public view:** open `/perform/setlist/<id>` unauthenticated — renders the
   public setlist (intended). Confirm no console errors / broken layout.
8. **Print:** gig-packet print layout at the band's likely paper size.

## What good looks like

Every golden-path tap works on iPad-Mini; every failure mode shows a clear,
actionable state (never an infinite spinner or a blank screen). Flag anything a
non-technical band member would get stuck on as at least MED.

Reminder: `[[feedback_no_cover_art]]` — there should be NO song/setlist cover
art; max-density text rows. If you see cover art, that's a finding.

Cleanup: any test fixtures via `cleanup_all_test_data({prefix:"c9i1"})`.
Deliverables + HANDOFF per PARENT §6.
