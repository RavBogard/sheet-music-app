# Feature Research

**Domain:** Worship music performance app — outline display and live performance views
**Researched:** 2026-03-01
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features musicians assume exist. Missing these = product feels incomplete vs. a printed Excel outline on the music stand.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Tune/arrangement name on each track** | Musicians identify pieces by tune name ("Friedman Barchu"), not just liturgical title. The Excel outline has this column. Without it, the app is less useful than paper. | LOW | New field on `SetlistTrack`. Planning Center, OnSong, BandHelper all treat song metadata (arrangement, version) as first-class fields. CentralReform already has `key`, `leadMusician`, `notes` — tune is the missing column. |
| **Key display on every track** | Musicians need to know what key to play in at a glance. Every competitor shows key prominently. Already exists in the data model but needs consistent display in outline and live views. | LOW | Already on `SetlistTrack.key`. Needs to be prominent in outline view and print, not just the status strip. |
| **Lead musician / performer per track** | The Excel outline shows who leads each piece. Musicians look at this to know when they're "on." Planning Center, BandHelper, OnSong all show performer/assignee per item. | LOW | Already on `SetlistTrack.leadMusician` and `performer`. Needs prominent display in outline view. |
| **Section headers (liturgical groupings)** | Services follow a fixed liturgical structure (Birchot Hashachar, Shema, T'filah, etc.). Every worship planning tool supports section headers/dividers. Without them, the outline is a flat list. | LOW | Already exists as `trackType: 'header'`. Verified in `SetlistDrawer.tsx` which groups by headers. Just needs proper rendering in outline-first views. |
| **Scannable outline view (live)** | A view showing the full service order at a glance — song name, tune, key, lead — without charts. This is what the paper outline provides. Planning Center Services list view, OnSong set view, BandHelper set list view all provide this. | MEDIUM | Core feature of this milestone. Currently the live view shows one item at a time (chart or FlowItemView). Need a persistent outline that's always accessible. The `SetlistDrawer` partially does this but is hidden behind a sheet trigger. |
| **NOW/NEXT indicator in outline** | Musicians need to know where they are in the service. "What's the current piece? What's next?" Planning Center highlights current, BandHelper shows +1/+2 items, OnSong scrolls to keep current visible. | LOW | `queueIndex` already tracks position. `PerformanceStatusStrip` shows current. Need to extend the outline view to highlight current and show upcoming items clearly. |
| **Printable outline (music-stand format)** | A clean, one-page (or two-page) printed outline for the music stand. This is what the Excel spreadsheet provides today. Must be readable at arm's length. WorshipTools Charts, BandHelper, and OnSong all offer PDF/print export of setlists. | MEDIUM | Print pipeline already generates a cover page outline. Needs redesign to match the Excel format: columns for song, tune, key, lead, section headers. Must fit on letter paper, readable from a music stand. |
| **Drill-down to chart from outline** | When a musician encounters an unfamiliar piece, they need to quickly access the chart. Every digital music stand app (OnSong, Planning Center Music Stand, Charts by WorshipTools) links from setlist to chart. | LOW | Already works via the performance queue navigation. The change is making the outline the default view and charts the drill-down, rather than vice versa. |
| **Foot pedal / keyboard navigation** | Musicians' hands are on instruments. Page turns and song navigation must work with Bluetooth foot pedals (PageDown/PageUp). Every serious music performance app supports this. | LOW | Already implemented in `FlowItemView.tsx` via keyboard handlers for ArrowRight/PageDown/ArrowLeft/PageUp. Works with standard Bluetooth pedals. |
| **Dark mode / stage-appropriate display** | Bright screens distract congregation and other musicians. Planning Center Music Stand has dark mode, OnSong has stage display mode. | LOW | Already using black background in performance views (`bg-black text-white`). No additional work needed. |

### Differentiators (Competitive Advantage)

Features that set the product apart from both paper outlines and generic worship apps. Not required, but valuable for CentralReform's specific use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Outline-first live view (not chart-first)** | Most apps (OnSong, Planning Center Music Stand) default to showing the chart/lyrics. CentralReform musicians look at the outline 90% of the time. Making the outline the primary performance view — with charts as drill-down — matches how this team actually works. No competitor optimizes for this "outline-first" workflow. | MEDIUM | This is the core differentiator for this milestone. Competitors show setlist as navigation to get to charts. CentralReform shows the outline AS the performance view. Requires rethinking the PerformPage to default to an outline mode rather than chart mode. |
| **Congregation-specific tune library** | A curated vocabulary of tune/arrangement names (Friedman, Klepper, Moshav, Shur, etc.) that auto-completes when entering tune data. No generic worship app has a Jewish liturgical tune library. BandHelper and OnSong have generic custom fields but no domain-specific vocabularies. | LOW | Store as a simple Firestore collection or JSON config. Autocomplete in the TrackSheet editor. Reduces data entry errors and inconsistency. Small feature, big usability win. |
| **Per-musician transposition on printed outline** | The print pipeline already transposes charts per musician. Extending this to show transposed keys on the outline itself (e.g., "Guitarist sees Capo 3 / Key of G" while pianist sees "Key of Bb") is something paper outlines cannot do and most apps don't do on the outline level. | MEDIUM | Print pipeline already supports per-musician transposition for charts. Need to extend the outline cover page to show transposed key values using the same music-math engine. Depends on: tune field, print outline redesign. |
| **Smart "lead-in" / cue notes** | The Excel outline has a "Lead in" column — how to start each piece (e.g., "Guitar intro", "Cantor starts, band joins on chorus"). This is more specific than generic notes. BandHelper has custom fields, OnSong has metadata, but none enforce a dedicated cue/lead-in field. | LOW | New optional field on SetlistTrack. Could also be handled via the existing `notes` field with a UI convention, but a dedicated field makes it scannable in the outline. |
| **Liturgical section templates** | Saturday morning services follow a consistent structure. Pre-populating section headers (Pre-service, Awakening, Birchot Hashachar, Shema, T'filah, Torah Service, Concluding) saves setup time. Planning Center has service type templates but not for Jewish liturgy. | LOW | Already partially implemented via `liturgical-templates.ts` and `liturgical-calendar.ts`. Extend to include section headers in template output. |
| **Real-time outline sync across devices** | Leader advances through the outline on their device; all musicians' outlines update to show the same NOW position. Planning Center Music Stand does this for page turns ("Sessions"). OnSong does this via its sync feature. For CentralReform, syncing the outline position (not page turns) is the right granularity. | HIGH | Firestore real-time listeners already exist. Need a shared `currentIndex` document per active performance session. Leader writes, musicians subscribe. The infrastructure exists but the feature layer doesn't. |
| **Cumulative time tracking on outline** | Show elapsed and remaining time per section and total service. BandHelper calculates set duration from song durations. OnSong's Moments feature adds scheduled times. Useful for services that need to end on time. | MEDIUM | `estimatedMinutes` already exists on tracks. Need to sum by section and display running totals on the outline. Pure UI calculation, no new data needed. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific use case and team size.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full MIDI integration** | OnSong and BandHelper use MIDI to control instrument presets, lighting, effects. Seems professional. | 5-10 person worship team at a synagogue does not use programmable guitar rigs or DMX lighting. MIDI adds massive complexity (Web MIDI API is limited, requires native app capabilities). Zero users would benefit. | Keep the metronome BPM field for tempo reference. If MIDI is ever needed, it's a separate product concern. |
| **Backing track player** | OnSong and BandHelper play multi-channel backing tracks synced to the setlist. Seems like a natural extension. | CentralReform uses live musicians, not backing tracks. Adding an audio engine with multi-track mixing is a huge scope increase. Web Audio API limitations on iOS add complexity. | Keep the existing audio file attachment for reference recordings. Musicians listen during practice, not performance. |
| **Lyrics projection / ProPresenter integration** | Planning Center integrates with ProPresenter for congregation lyrics display. OnSong projects lyrics to external displays. | CentralReform uses a siddur (prayer book), not projected lyrics. The congregation reads from printed booklets, not screens. Building lyrics projection serves zero users. | The printed outline for the music stand is the right output format. |
| **Autoscroll / teleprompter mode** | OnSong's teleprompter mode scrolls through lyrics automatically. Seems useful for long pieces. | Musicians using an outline don't need autoscroll — the outline fits on one screen. For the rare chart drill-down, manual page turning (foot pedal) is more reliable than autoscroll, which requires precise tempo matching. | Foot pedal navigation (already built) handles chart viewing. Outline view doesn't scroll because it's a single-screen summary. |
| **Song request / quick-add during performance** | OnSong lets you tap to search and add songs mid-set. BandHelper has a Quick Pick feature. | Jewish worship services follow a fixed liturgical structure. You don't take requests mid-service. The setlist is planned in advance and rarely changes during performance. Adding songs mid-service would create confusion. | The setlist editor (pre-service) is where changes happen. Lock the performance view to the planned order. |
| **Multi-band / multi-project management** | BandHelper supports multiple bands/projects. Seems useful for versatility. | CentralReform is one congregation with one worship team. Multi-project adds UI complexity for zero benefit. | Single-team model is correct. If someone plays in multiple congregations, they use separate accounts. |
| **Complex automation / timeline sequencing** | OnSong's Timeline feature automates page turns, section highlights, MIDI triggers on a timed sequence. | Over-engineering for a worship service where the rabbi may extend a prayer or the cantor may add a repeat. Rigid timelines break when the service flows organically. | The outline + manual navigation respects the organic pace of worship. Cumulative time estimates (differentiator above) give awareness without rigidity. |
| **Stage messaging / flash alerts** | OnSong can flash colored messages to band members' screens for on-stage communication. | In a worship service, musicians communicate with eye contact, nods, and musical cues — not screen flashes. This is a rock-concert feature, not a worship feature. Adding it creates distraction. | The outline's lead-in/cue notes provide pre-planned communication. Real-time communication happens musically. |

## Feature Dependencies

```
[Tune/arrangement field]
    └──required by──> [Outline view (live)]
    └──required by──> [Printed outline redesign]
    └──required by──> [Tune library autocomplete]

[Section headers] (already exists)
    └──required by──> [Outline view (live)]
    └──required by──> [Printed outline redesign]
    └──required by──> [Liturgical section templates]
    └──required by──> [Cumulative time tracking]

[Outline view (live)]
    └──required by──> [NOW/NEXT indicator]
    └──required by──> [Drill-down to chart]
    └──required by──> [Real-time outline sync]

[Printed outline redesign]
    └──enhanced by──> [Per-musician transposed keys]
    └──enhanced by──> [Lead-in / cue notes field]

[estimatedMinutes field] (already exists)
    └──required by──> [Cumulative time tracking]

[Firestore real-time sync] (already exists)
    └──required by──> [Real-time outline sync]
```

### Dependency Notes

- **Tune/arrangement field is the foundation:** Nearly every other outline feature depends on having tune data available. This must come first.
- **Section headers already exist** but need better rendering. No new data work needed.
- **Outline view (live) is the keystone:** The NOW/NEXT indicator, drill-down, and real-time sync all build on top of the outline view existing as a first-class screen.
- **Print outline redesign is independent of live view** but shares the same data (tune, key, lead). Can be built in parallel.
- **Real-time sync is the only HIGH complexity item** and depends on the outline view being built first. It can be deferred without blocking other features.

## MVP Definition

### Launch With (v1) — This Week's Bat Mitzvah

Minimum features needed to replace the Excel outline for the upcoming service.

- [x] Tune/arrangement field on SetlistTrack — the single most critical missing field
- [ ] Outline-first live view — scannable list showing song, tune, key, lead for each track, grouped by section headers, with NOW/NEXT highlighting
- [ ] Redesigned printed outline — clean, columnar format matching the Excel outline (song, tune, key, lead, section headers), readable from a music stand

### Add After Validation (v1.x)

Features to add once the outline is proving useful in live services.

- [ ] Lead-in / cue notes field — after musicians confirm they want this as a separate field vs. using notes
- [ ] Tune library autocomplete — after enough tune names are entered to build the vocabulary
- [ ] Per-musician transposed keys on printed outline — after confirming musicians want personalized outlines
- [ ] Cumulative time tracking — after confirming services are running over and this would help

### Future Consideration (v2+)

Features to defer until the outline workflow is validated and stable.

- [ ] Real-time outline sync across devices — HIGH complexity, needs shared session state, leader/follower roles
- [ ] Liturgical section templates — useful but not blocking, since services mostly reuse the same structure manually

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tune/arrangement field | HIGH | LOW | **P1** |
| Outline-first live view | HIGH | MEDIUM | **P1** |
| Printed outline redesign | HIGH | MEDIUM | **P1** |
| NOW/NEXT indicator in outline | HIGH | LOW | **P1** |
| Drill-down to chart from outline | HIGH | LOW | **P1** |
| Key display (prominent) | HIGH | LOW | **P1** |
| Lead musician display | MEDIUM | LOW | **P1** |
| Section header rendering | MEDIUM | LOW | **P1** |
| Lead-in / cue notes field | MEDIUM | LOW | **P2** |
| Tune library autocomplete | MEDIUM | LOW | **P2** |
| Per-musician transposed keys (print) | MEDIUM | MEDIUM | **P2** |
| Cumulative time tracking | LOW | MEDIUM | **P2** |
| Liturgical section templates | LOW | LOW | **P3** |
| Real-time outline sync | MEDIUM | HIGH | **P3** |

**Priority key:**
- P1: Must have for launch (this week's Bat Mitzvah)
- P2: Should have, add after initial validation
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Planning Center Services + Music Stand | OnSong | BandHelper | CentralReform (Current) | CentralReform (Target) |
|---------|---------------------------------------|--------|------------|------------------------|----------------------|
| Setlist / service order | Full service builder with drag-drop | Set builder with Flow tags | Set list builder with smart lists | Setlist editor with drag-drop reorder | Same (already strong) |
| Tune/arrangement field | Song metadata (version, arrangement) | Custom metadata fields | Custom fields per song | **Missing** | Dedicated tune field |
| Key display | Shown in service plan and Music Stand | Shown in menubar, transposable | Key field in layout, live transpose | Shown in editor, status strip | Prominent in outline view |
| Lead/performer | Assigned positions per team member | Not a core field | Custom fields | `leadMusician` and `performer` fields | Prominent in outline view |
| Section headers | Headers/dividers in service plan | Set breaks and events (Moments) | Text labels for set breaks | `trackType: 'header'` | Formatted in outline view |
| Live outline view | List view in Services app | Set list sidebar, Moments run sheet | Customizable layout with +1/+2 | SetlistDrawer (hidden sheet) | **Primary performance screen** |
| NOW/NEXT tracking | Highlights current item | Current song in menubar, autoscroll | +1/+2 custom fields show upcoming | `queueIndex` + PerformanceStatusStrip | Highlighted in outline view |
| Chart viewing | Music Stand (separate app) | Primary view (chord/lyric display) | Lyrics/chords in main view | PerformerView (PDF/MusicXML) | Drill-down from outline |
| Printed outline | Service plan printable | PDF export of setlist | PDF/HTML email of setlist | Cover page in print pipeline | Redesigned columnar outline |
| Foot pedal | Music Stand supports pedals | Extensive pedal support | MIDI + Bluetooth pedal support | Keyboard/PageDown handlers | Same (already works) |
| Device sync | Sessions (linked page turns) | Cloud sync, wireless streaming | Live sharing (master/slave) | Firestore real-time listeners | Future: outline position sync |
| Metronome | Integrated with tempo per song | Built-in with autoscroll | Visual flash + click sounds | Metronome component exists | Same (already exists) |
| MIDI control | None | Full MIDI send/receive | Extensive MIDI automation | None | **Anti-feature** (not building) |
| Backing tracks | Audio attachments + media player | Multi-channel backing track player | Backing track support | Audio file attachment | **Anti-feature** (not building) |
| Lyrics projection | Integrates with ProPresenter | Built-in projection + AppleTV | None | None | **Anti-feature** (not building) |

## Sources

- [Planning Center Services](https://www.planningcenter.com/services) — MEDIUM confidence (official marketing + feature pages)
- [Planning Center Music Stand](https://www.planningcenter.com/music-stand) — MEDIUM confidence (official product page)
- [OnSong Features](https://onsongapp.com/features/) — MEDIUM confidence (official feature list)
- [OnSong Live Performance Pack](https://www.onsongapp.com/docs/features/live-performance-pack/) — MEDIUM confidence (official manual)
- [OnSong Flow Metadata](https://onsongapp.com/docs/features/formats/onsong/metadata/flow/) — MEDIUM confidence (official manual)
- [BandHelper Features](https://www.bandhelper.com/main/features.html) — MEDIUM confidence (official feature list)
- [BandHelper Performing Tutorial](https://www.bandhelper.com/tutorials/performing.html) — MEDIUM confidence (official tutorial)
- [BandHelper Song Layouts](https://www.bandhelper.com/tutorials/changing_layouts.html) — MEDIUM confidence (official tutorial)
- [Set List Maker Features](http://www.setlistmaker.com/main/features.html) — MEDIUM confidence (official, but product is sunset)
- [Charts by WorshipTools](https://www.worshiptools.com/en-us/docs/123-ch-print) — MEDIUM confidence (official docs)
- [Worship Artistry Features](https://worshipartistry.com/features) — MEDIUM confidence (official feature page)
- [2026 Top Worship Software](https://theleadpastor.com/tools/best-worship-software/) — LOW confidence (roundup article)
- [Worship Team Apps Roundup](https://worshiponline.com/worship-team-apps/) — LOW confidence (roundup article)
- [CCLI SongSelect](https://songselect.ccli.com/) — MEDIUM confidence (official product)
- [Worship Charts: 7 Keys to Great Rehearsal](https://www.markcole.ca/worship-charts-7-keys-to-a-great-rehearsal/) — LOW confidence (blog)
- PROJECT.md context (sample Excel outline format) — HIGH confidence (first-party)

---
*Feature research for: Worship music performance app — outline display and live performance*
*Researched: 2026-03-01*
