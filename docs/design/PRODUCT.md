# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Band musicians** of Central Reform Congregation (CRC), a Reform synagogue with Friday-evening and
  Shabbat-morning services (never Sunday). They use 11" iPads (820×1180, Safari/WebKit, Home-Screen
  app) at rehearsal and during services. Their job is to open tonight's setlist, see the order, notes
  and keys, and read charts. Adoption is partial: some players are still on paper, out of habit and
  because they doubt its reliability.
- **Daniel (Rabbi Daniel, author) and David (2nd band leader).** Daniel authors through Claude
  Desktop over MCP. The browser app is his and David's surface for **backup authoring, review and
  small edits**, on desktop and iPad.
- **Randy** leads some services. **Drew** is the sound engineer. **Michael** powers the studio PC
  that runs the mixer bridge.
- **Brothers Lazaroff**, a gigging band, is a live second tenant (brotherslazaroff.live) using the
  same app under its own brand.

## Product Purpose
CentralReform.live puts the right charts, in the right order and key, on every musician's iPad for
each service or gig. It replaces paper and stays reliable with no fixes possible mid-service.
Success means every player trusts it enough to put the paper away.

## Positioning
The setlist is authored conversationally (Claude over MCP) with service memory: profiles, standing
choices and song history. The band app is a dependable consumer surface: offline-capable, pre-checked
before the service, and self-healing.

## Operating Context
- **Weekly cadence:** a service is drafted (Shabbat morning, Friday night, Shir Shabbat, B'nei
  Mitzvah), reviewed, and played. Each week is about 90% the same as the last.
- **On stage:** dim stage lighting, gloved or busy hands, no time to troubleshoot.
- **Wedges:** personal wedge mixes come through an X32 bridge (`/monitor`).
- **Family of products:** Overlays (screen graphics), the Beit Mitzvah portal, the shireishabbat
  printed books (page numbers) and the Haftarah sheets.

## Capabilities and Constraints
- **Surfaces:**
  - Perform (setlist list, setlist page, chart viewer for PDF and MusicXML via OSMD).
  - Setlists list and editor.
  - Library.
  - Manage (people, library, sound).
  - Templates.
  - Monitor.
  - Settings.
- **Fixed terms:** "Vocal Lead", never "Lead" or "Leader". Monitors are "wedges", never IEM.
  Setlist-for-a-set is "set" in band mode.
- **Binding rules:**
  - Row order is the author's.
  - Publish is retired.
  - Never propose which setting or melody the band plays.
  - No liturgical text in the repo.
  - No emails or assignment scheduling for Daniel.
  - No photo-of-paper import.
  - MusicXML is the strategic chart format.
- **Multi-tenant:** every shared surface must work for both CRC and Brothers Lazaroff.
- **Out of scope for the visual refresh:** the chart rendering inside the Perform viewer.

## Brand Commitments
- **Identity:** a fresh visual identity is welcome (Daniel, 2026-10-31). Only the product's terms
  and rules above are binding.
- **Density:** the existing preference for dense, text-first rows (track-list style, no cover art)
  stands as a product rule.

## Evidence on Hand
- Live screenshots of every current route at desktop and iPad width:
  `docs/planning/2026-10-31-gap-analysis/research/shots/`.
- Gap-analysis findings: `docs/planning/2026-10-31-gap-analysis/`.
- No testimonials, metrics or usage data exist yet. An in-app page counter is being added. Do not
  fabricate any.

## Product Principles
1. **Trust first.** It must be visibly current, visibly ready offline, and never surprising. Speed
   and visible craft support trust; they never trade against it.
2. **The author decides.** The app recalls choices and never invents a setting or reorders rows.
3. **Stage-grade.** It has to work in dim light on an iPad, with large targets and no
   mid-service troubleshooting.
4. **Dense and calm.** Many rows at a glance, with the important state (fresh, cached, warning)
   encoded clearly.
5. **Both tenants.** Nothing CRC-specific leaks into Brothers Lazaroff.

## Accessibility & Inclusion
- **Claimed standard:** the app claims WCAG 2.1 AA (`/accessibility`).
- **Targets:** 44px touch targets on iPad.
- **Themes:** light and dark both supported.
- **Direction:** RTL-aware reading direction exists (`useReadingDirection`).
