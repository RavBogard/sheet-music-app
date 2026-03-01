# CentralReform.Live — Milestone: Outline & Stability

## What This Is

A web app for worship musicians at Central Reform Congregation to manage sheet music, build setlists for services, and perform live with real-time synchronization. Musicians use it to know what's coming in a service — which tune, what key, who leads — and optionally view the chart if they need it.

## Core Value

Musicians can glance at the app during a live service and instantly know what's happening: the tune, the key, and who's leading — without fumbling through paper or scrolling through charts.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Firebase Authentication with Google OAuth — existing
- ✓ Sheet music library with Google Drive integration — existing
- ✓ Setlist creation, editing, and drag-drop reordering — existing
- ✓ Track types: songs, headers (sections), readings, prayers, transitions, notes — existing
- ✓ Per-track metadata: key, lead musician, performer, BPM, notes, transposition — existing
- ✓ Real-time live performance mode with NOW/NEXT tracking — existing
- ✓ PDF print pipeline with cover page outline, per-musician transposition — existing
- ✓ Smart transposition with AI chord extraction — existing
- ✓ Musician roster and assignment management — existing
- ✓ Service-level metadata: rabbi, event date, service notes — existing
- ✓ Role-based access control (admin, band_leader, musician, member) — existing
- ✓ PWA with offline caching — existing
- ✓ Email delivery via Resend for published setlists — existing
- ✓ Background job processing via Inngest — existing
- ✓ Real-time Firestore sync for collaborative features — existing
- ✓ QR code login flow — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Add tune/arrangement field to setlist tracks (e.g., "Klepper", "Moshav", "Shur")
- [ ] Redesign live performance view to prioritize outline info (tune, key, lead) over chart display
- [ ] Charts available as drill-down for unfamiliar pieces, not the default view
- [ ] Redesign printed outline to be clean, scannable, music-stand-ready
- [ ] Print outline includes tune name, key, lead, and section headers
- [ ] Fix critical npm vulnerabilities (17 total, 1 critical in opensheetmusicdisplay)
- [ ] Replace unsafe `as any` type assertions (~30+ instances) with proper types
- [ ] Fix silent error swallowing (40+ `.catch(() => {})` patterns)
- [ ] Add proper error handling for unhandled promise rejections
- [ ] Fix incomplete request validation in API routes (publish, tasks, etc.)
- [ ] Add Firebase Admin credential validation (fail fast on missing keys)
- [ ] Fix N+1 chord extraction in print pipeline (batch-load chord data)
- [ ] Comprehensive feature evaluation with improvement suggestions

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user simultaneous editing — Complex CRDT/locking needed; not urgent for current team size
- Offline sync conflict resolution — Partial offline works; full sync deferred
- Mobile native app — PWA sufficient for now
- Video/media attachments — PDF/audio covers current needs
- Real-time chat during performance — Not how musicians communicate during a service
- Backup/restore UI — Can be addressed in a future milestone

## Context

**Who uses this:** 5-10 worship musicians at Central Reform Congregation, Austin TX. They play Shabbat services (Friday night, Saturday morning), B'nei Mitzvah, and special events.

**The outline problem:** Today, someone prints an Excel spreadsheet outline and puts it on music stands. The outline shows the service order with tune names, keys, and who leads each piece. Musicians glance at this outline far more than actual sheet music — for standard liturgical tunes they know well, the outline is all they need. Charts are only needed for unfamiliar or new arrangements.

**The attached sample outline** (Cypress Penrod Bat Mitzvah) shows the format:
- Organized by liturgical sections (Pre service, Awakening, Birchot Hashachar, Shema, T'filah, Torah service, Concluding prayers)
- Each entry: Song/Prayer name, Tune/Arrangement, Key, Lead, Page #, Lead in
- Section structure is mostly consistent across Saturday services
- Page numbers are per-event (families print their own siddurim for B'nei Mitzvah)

**Missing data field:** The app has no "tune/arrangement" field on tracks. This is critical — musicians identify pieces by tune name (e.g., "Friedman Barchu" vs "standard Barchu"). The tune name is often more important than the song title itself.

**Time sensitivity:** A Bat Mitzvah service is coming up this week. The outline features need to be usable for that event.

**Concerns interleaving:** Technical debt fixes should be interleaved with feature work — fix critical issues first, then outline features, then remaining concerns.

## Constraints

- **Stack**: Next.js 16 / React 19 / Firebase / TailwindCSS — existing stack, no major changes
- **Timeline**: Bat Mitzvah this week — outline refinements are urgent
- **Users**: Small team (5-10 musicians) — performance at scale not a concern
- **Print**: Must work on standard letter paper, readable from a music stand (~arm's length)
- **Live view**: Must be glanceable on phone/tablet during performance

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Outline-first performance view | Musicians look at outlines 90% of the time, charts only for unfamiliar pieces | — Pending |
| Add tune/arrangement as dedicated field | Not just a note — it's the primary identifier musicians use | — Pending |
| Interleave concerns with features | Critical stability issues affect the features being built | — Pending |
| Keep Excel-like outline format for print | Musicians are used to this format; make it prettier, don't redesign from scratch | — Pending |

---
*Last updated: 2026-03-01 after initialization*
