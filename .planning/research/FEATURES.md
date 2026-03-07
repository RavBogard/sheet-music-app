# Feature Research

**Domain:** Worship music setlist platform with personal monitor mixing (Jewish congregation, ~10-15 users)
**Researched:** 2026-03-07
**Confidence:** MEDIUM-HIGH (competitor features well-documented; Jewish-specific tools largely absent from market)

---

## Competitor Landscape Summary

| Competitor | Target | Strengths | Weaknesses |
|------------|--------|-----------|------------|
| **Planning Center Services** | Large churches | Comprehensive scheduling, volunteer management, song library, Music Stand app, real-time live view | Expensive at scale, complex, overkill for 10-person team, no monitor mixing |
| **WorshipTools Charts** | All churches, free | Real-time setlist sync across devices, instant transpose, Nashville numbers, free tier | Requires CCLI subscription for charts, no monitor mixing, no per-instrument auto-transposition |
| **OnSong 2026** | Individual musicians/bands | Best-in-class PDF handling, ChordFlow PDF transposition, iOS-native performance UX | iOS-only, per-user cost, chart-centric not service-centric |
| **SongSelect (CCLI)** | Chart library access | 100,000+ songs, transposable charts, Rehearse/RehearsePlus with stem mixing | Library tool, not a performance app; requires separate integration |
| **MX-Q / MXBus / X32-Q** | Monitor mixing | Proven X32 OSC control over WiFi, 550k+ users (MX-Q), simple UX for musicians | Separate app from setlist — musicians switch between two apps |
| **Mixing Station** | Sound engineers | Full X32 control, layers/DCAs | Power-user complexity, not musician-friendly |
| **Jewish-specific tools** | Synagogues/cantors | Shulmusic.org (archival), Zing Music (streaming) | No dedicated setlist/planning tool exists for worship band setting |

**Key gap identified:** No tool combines (1) service-flow-aware setlist-at-a-glance with (2) per-instrument auto-transposition with (3) integrated personal monitor mixing. This is the CRC app's unique territory. Jewish worship tools are nonexistent in the band/setlist space.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Setlist display with song order | Every competitor has it; musicians need to know what's next | LOW | Must show full service run-of-show, not just songs |
| Song key displayed prominently | Critical for musicians — wrong key = can't play | LOW | Must be per-musician, not just global |
| Tempo / feel indicator | All worship apps show BPM or feel label; musicians need it for internal click | LOW | "Slow ballad," "upbeat," or numeric BPM both useful |
| "What's next" visibility | Musicians must anticipate transitions, not react | LOW | Current song highlighted; next song visible |
| Non-song service items (prayers, readings, transitions) | Synagogue services are not just songs — Shabbat has Torah, D'var, responsive readings | MEDIUM | Planning Center and WorshipTools both support this; CRC absolutely needs it |
| Quick notes per song | Arrangement notes, cues, "repeat chorus 3x" — every app supports this | LOW | Per-song, visible in performance view |
| Offline access | Paper is the benchmark; app must work without venue WiFi | MEDIUM | Service worker + IndexedDB already built in v1 |
| Mobile-first display | Musicians hold phones during services | LOW | Already in v1; needs UX upgrade |
| Setlist creation by leader | One person (Daniel) builds setlists; team consumes | LOW | Admin-only creation; already in v1 scope |
| Auth / role-based access | Standard expectation — some people can edit, most can't | LOW | Already built in v1 with Firebase Auth |
| Song library search | Leaders need to find songs to add to setlists | LOW | Already in v1; needs polish |
| Sheet music / chart access | Secondary but expected — musicians want to pull up a chart if uncertain | MEDIUM | PDF viewer already in v1; chord overlay via AI pipeline |
| Scheduling — who's playing this week | Musicians need to know if they're on for the service | MEDIUM | All major competitors have this; basic version sufficient |
| Push notifications — setlist published | Musicians need to know when a setlist drops | MEDIUM | Planning Center sends automated emails; SMS/push is table stakes |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-instrument auto-transposition** | Every musician sees every chart in their instrument's key automatically — Bb trumpet player sees Bb part, Eb alto sax sees Eb part, guitarist sees capo position — zero manual math | HIGH | No competitor does this automatically. OnSong and WorshipTools require per-song manual transpose. CRC has transposing instruments (trumpet, sax, horn) alongside concert-pitch instruments. The transposition engine already exists in v1 with 100% test coverage. |
| **Personal monitor mixing from phone (X32 integration)** | Each musician adjusts their own in-ear or wedge mix from their phone, directly from the same app they use for setlists — no app switching, no engineer involvement for basic level changes | HIGH | MX-Q/MXBus solve this but are separate apps. Integrating monitor control into the setlist app creates a unified performance tool no competitor offers. X32 OSC over UDP + WebSocket proxy is proven feasible. |
| **Service-flow-aware performance view** | Unlike song-only setlists, the performance view shows the entire Jewish service arc — prayers, Torah portion, D'var, responsive readings, niggunim, closing songs — with timing cues | MEDIUM | Planning Center supports non-song items but for generic churches. A Shabbat service has specific structural elements (Kabbalat Shabbat, Maariv, etc.) that need to feel right, not just generic "item" slots. |
| **Swipe-to-next with full song context** | Swipe forward to advance the setlist; each card shows song title, key, tempo, feel, and quick notes — everything needed to play, nothing extra | MEDIUM | Planning Center's live view exists but is clunky. This should feel like Apple Wallet cards — clean, focused, beautiful. |
| **Google Drive canonical source** | Musicians don't manage uploads — Daniel drops PDFs in Drive, the app auto-discovers and indexes them | MEDIUM | Unique architecture; no competitor does auto-discovery from Drive. Already built in v1; needs hardening. |
| **AI chord detection from PDFs** | App extracts chord symbols from PDF sheet music using OCR+AI, enabling display and transposition of chords that are "baked into" the PDF | HIGH | No competitor does this. OnSong 2026's ChordFlow PDF Transposition is the closest competitor feature (just released). CRC's pipeline (Gemini Flash OCR + correction persistence) is differentiated. |
| **Proactive offline caching per musician** | On setlist publish, the app pre-downloads all relevant charts for each musician in their transposed key — service works even if venue WiFi drops | MEDIUM | IndexedDB caching already in v1; needs to be made proactive (triggered by setlist publish event) rather than reactive (user must open song). |
| **Jewish liturgical awareness** | The app understands that "Ein Keloheinu" is a prayer, not a pop song — can handle Hebrew text, transliteration, liturgical timing, and High Holiday vs Shabbat contexts | HIGH | No competitor addresses this. Long-term differentiator but complex; defer full implementation. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time collaborative setlist editing** | Seems natural for a "team" app | For CRC, one person (Daniel) creates setlists; real-time collaboration adds locking conflicts, complexity, and UI noise for no user benefit | Leader-only creation with instant team broadcast on publish |
| **Full mixer control (house mix) from phones** | Sound engineer might want it; feels powerful | Musicians controlling house mix during a service is dangerous — a guitarist accidentally muting the cantor's mic is catastrophic. Full mixer control requires real X32 expertise and should stay at the board | Lock musician-facing views to monitor buses only; house mix stays on the board or X32-Mix on the engineer's iPad |
| **In-app audio recording** | "Record the service for archives" | Adds storage costs, legal complexity (who owns recordings?), and distracts from performance UX. CRC likely has existing recording workflows | Keep audio recording out of scope; focus on live performance UX |
| **Song catalog management (CCLI-style)** | Churches expect a song database | CRC has ~a few hundred songs in Drive. Building a full catalog management system (tags, categories, popularity tracking) before users exist is premature | Drive serves as the catalog; index it. Add tagging when musicians request it. |
| **Backing tracks playback** | Nice for rehearsal; CCLI Rehearse does this | At 10-15 users with live musicians, backing tracks during service are not the use case. Adds audio latency, licensing complexity, and distracts from core workflows | Link to YouTube/Spotify references for rehearsal; don't build in-app playback |
| **Multi-congregation / SaaS platform** | "What if other synagogues want this?" | Premature scaling destroys focus. Auth model, data model, and UX should all serve CRC first; generalize only after CRC is working perfectly | Build for CRC; multi-tenancy is a v3+ concern |
| **Admin analytics dashboard** | "Let's see which songs are most popular" | No users yet to analyze; premature optimization adds code and maintenance burden without value | When there are 50+ services logged, analytics become meaningful. Defer. |
| **Print pipeline (PDF gig packets)** | "What if someone forgets their phone?" | The entire point of the app is replacing paper. Building a print pipeline undermines the mission and creates a maintenance burden. | Offline-first PWA is the answer to "what if phone issues" — not printing |
| **AI chat agent for setlist commands** | "Type 'add Lecha Dodi in G' and it happens" | Clever but a layer of abstraction over UI that works fine. At 10-15 users, the leader knows the UI. AI agent adds latency, unpredictability, and GPT API costs | Direct UI is faster and more reliable for a known small user base |
| **QR code sign-in** | "Musicians can log in by scanning a code" | Users are known and logged in persistently. QR sign-in solves a problem that doesn't exist at this scale. | Google OAuth with "remember me" behavior; users are always logged in |

---

## Feature Dependencies

```
[Musician Profiles (instrument + transposition preferences)]
    └──required by──> [Per-instrument auto-transposition]
                          └──required by──> [Setlist performance view with personal key]
                                                └──enhances──> [Proactive offline caching per musician]

[Song library indexed from Drive]
    └──required by──> [Setlist creation]
                          └──required by──> [Setlist performance view]
                                                └──required by──> [Swipe-to-next navigation]

[X32 WebSocket bridge (proxy)]
    └──required by──> [Personal monitor mixing UI]
                          └──enhances──> [Setlist performance view (same screen)]

[AI chord detection pipeline]
    └──required by──> [Chord overlay on PDFs]
                          └──required by──> [Per-instrument PDF transposition]

[Service flow data model (songs + non-song items)]
    └──required by──> [Service-flow-aware performance view]
                          └──required by──> [Non-song item display (prayers, readings)]

[Setlist publish event]
    └──triggers──> [Push notifications to musicians]
    └──triggers──> [Proactive offline caching per musician]

[Scheduling (who's playing)]
    └──enhances──> [Proactive offline caching per musician]
                   (only cache for musicians who are scheduled)
```

### Dependency Notes

- **Musician profiles required before auto-transposition:** You cannot auto-transpose to an instrument's key without knowing what instrument each musician plays and their individual transposition preference (capo, octave, etc.). Profiles must be set up in Phase 1.
- **Service flow model required before performance view:** The performance view must know the difference between a song and a prayer/reading. A flat setlist model won't work for synagogue services.
- **X32 bridge is independent of setlist:** The WebSocket OSC proxy can be built and tested independently; the UI integration happens in the same phase as the performance view.
- **AI chord pipeline already exists:** Do not rebuild it. The dependency is on the pipeline being reliable, not on building it.
- **Offline caching must be proactive, not reactive:** v1 cached on demand (user opens song). v2 must cache on setlist publish so musicians are ready before service starts.

---

## MVP Definition (v2.0)

### Launch With — Phase 1 Core

Minimum viable product — what musicians need to abandon paper and Google Docs.

- [ ] **Musician profiles** — instrument, transposition preference, capo position. Set once, applied everywhere. Essential prerequisite.
- [ ] **Setlist-at-a-glance performance view** — full service run-of-show with songs AND non-song items (prayers, readings, transitions). Current item highlighted. Next item visible. Swipe to advance.
- [ ] **Per-musician key display** — each musician's phone shows songs in their instrument's key automatically. No manual transposition required.
- [ ] **Song card content** — for each song: title, key (auto-transposed), tempo/feel, quick notes. Nothing else.
- [ ] **Service flow builder (admin)** — drag-drop song ordering, non-song item types, estimated timing. Replaces the Google Doc setlist.
- [ ] **Proactive offline caching** — triggered on setlist publish. All songs and charts downloaded before service starts.
- [ ] **Notification on setlist publish** — musicians get alerted when the setlist is ready.
- [ ] **Mobile-first, premium UI** — this is not a feature, it is the product. The UX must feel like a finished product on first open.

### Add After Phase 1 Validation — Phase 2 Monitor Mixing

Once core setlist flow is working and musicians trust the app over paper:

- [ ] **X32 WebSocket proxy** — bridge from browser WebSocket to UDP OSC. Self-hosted on the venue network. This is the enabling infrastructure.
- [ ] **Personal monitor mixing UI** — per-musician: volume of each channel/group in their monitor bus. Simple faders, 4-6 groups max (vocals, guitar, keys, drums, etc.). Integrated into the same app, accessible during performance.
- [ ] **Monitor bus assignment per musician** — which X32 aux bus maps to which musician's profile. One-time setup by sound engineer.

### Add After Phase 2 — Phase 3 Polish

- [ ] **Scheduling (who's playing this week)** — availability tracking, confirmation responses. Simple version: leader marks who's scheduled, musicians confirm.
- [ ] **Sheet music viewer improvements** — chord overlay, per-musician transposed PDF view for new/unfamiliar songs. Currently in v1 but secondary to setlist view.
- [ ] **Google Drive sync hardening** — webhook triggers, retry logic, better error reporting.

### Future Consideration (v3+)

- [ ] **Full Jewish liturgical awareness** — Hebrew/transliteration support, High Holiday vs Shabbat contexts, specific liturgical item types.
- [ ] **Multi-congregation** — generalize the platform for other synagogues or churches.
- [ ] **Analytics** — song frequency, musician participation, service duration actuals vs estimates.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Setlist performance view (swipe-to-next) | HIGH | LOW-MEDIUM | P1 |
| Per-musician auto-transposition | HIGH | MEDIUM (engine exists) | P1 |
| Non-song service items in setlist | HIGH | MEDIUM | P1 |
| Musician profiles (instrument/key prefs) | HIGH | LOW | P1 |
| Proactive offline caching | HIGH | MEDIUM | P1 |
| Setlist publish notification | HIGH | LOW | P1 |
| Service flow builder (admin drag-drop) | HIGH | MEDIUM | P1 |
| Personal monitor mixing (X32) | HIGH | HIGH | P2 |
| X32 WebSocket proxy | HIGH | HIGH | P2 |
| Scheduling / availability | MEDIUM | MEDIUM | P2 |
| Sheet music chord overlay improvements | MEDIUM | LOW (pipeline exists) | P2 |
| Drive sync hardening | MEDIUM | MEDIUM | P2 |
| Push notifications (full) | MEDIUM | LOW | P2 |
| Hebrew/liturgical text support | MEDIUM | HIGH | P3 |
| Analytics / song frequency | LOW | MEDIUM | P3 |
| Multi-tenancy | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v2.0 Phase 1)
- P2: Should have, add when core is working (v2.0 Phase 2-3)
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Planning Center | WorshipTools | OnSong 2026 | CRC App v2 Approach |
|---------|-----------------|--------------|-------------|---------------------|
| Setlist display | Yes (plan view) | Yes (sets) | Yes (setlists) | Yes — primary screen, card-based |
| Non-song service items | Yes | Yes | Limited | Yes — first-class service flow items |
| Live performance view | Services LIVE (basic) | Auto-sync via Presenter | Timeline/autoscroll | Swipe-to-next card, full context per song |
| Per-musician key (auto) | No (manual per song) | No (manual per device) | No (manual per song) | YES — profile-driven, fully automatic |
| Transposing instrument support | No | No | No | YES — Bb, Eb, F instruments natively |
| Personal monitor mixing | No | No | No | YES — X32 OSC via WebSocket proxy |
| Non-Christian / Jewish liturgy | No | No | No | Partial — non-song items, defer full Hebrew support |
| PDF chord extraction | No | No | ChordFlow (new 2026) | Yes (Gemini OCR pipeline, v1) |
| Drive-as-canonical-source | No | No | No | Yes (unique architecture) |
| Offline-first | Partial | Partial | App cache | Yes — proactive caching on publish |
| Scheduling | Yes (full) | Yes | No | Basic — who's playing this week |
| Pricing | $14-99+/month | Free | $9.99/month | Self-hosted, $0 recurring |

---

## Sources

- [Planning Center Services](https://www.planningcenter.com/services) — official product page (MEDIUM confidence)
- [Planning Center Music Stand](https://www.planningcenter.com/music-stand) — official product page (MEDIUM confidence)
- [OnSong 2026 Features](https://onsongapp.com/features/) — official product page (MEDIUM confidence)
- [OnSong 2026 Release Notes](https://onsongapp.com/releases/2026/) — official release notes (HIGH confidence)
- [WorshipTools Charts](https://www.worshiptools.com/en-us/charts) — official product page (MEDIUM confidence)
- [CCLI SongSelect](https://ccli.com/us/en/songselect) — official product page (MEDIUM confidence)
- [CCLI Rehearse announcement](https://gospelmusic.org/news/ccli-introduces-rehearse-to-streamline-worship-team-preparation) — MEDIUM confidence
- [MX-Q App Store](https://apps.apple.com/us/app/mx-q/id1471505954) — official listing (HIGH confidence)
- [MXBus App Store](https://apps.apple.com/us/app/mxbus/id1530411157) — official listing (HIGH confidence)
- [X32-Q App Store](https://apps.apple.com/us/app/x32-q/id587363794) — official listing (HIGH confidence)
- [x32-proxy GitHub](https://github.com/audiopump/x32-proxy) — WebSocket proxy for X32 OSC (HIGH confidence)
- [X32 OSC Protocol (unofficial)](https://behringerwiki.musictribe.com/index.php?title=OSC_Remote_Protocol) — MEDIUM confidence
- [Top 10 Best Church Setlist Apps](https://www.getonstage.app/blog/top-10-best-church-setlist-apps-for-worship-leaders) — ecosystem survey (LOW confidence, useful for overview)
- [Planning Center 2025 updates](https://www.threefold.solutions/blog/planning-center-updates-whats-new-this-summer-2025) — MEDIUM confidence
- [Jewish worship music tools search](https://www.shulmusic.org/) — Confirms no dedicated synagogue band setlist tool exists (LOW confidence)
- Worship musician pain points research (multiple sources) — key/tempo/transitions are the core at-service needs (MEDIUM confidence)

---

*Feature research for: Worship music setlist platform with personal monitor mixing — CRC v2.0*
*Researched: 2026-03-07*
