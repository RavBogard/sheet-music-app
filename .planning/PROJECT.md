# CRC Music v2.0

## What This Is

A setlist-first worship music platform for Central Reform Congregation's musicians. 5-8 instrumentalists, cantorial soloists, a rabbi/band leader, and a sound engineer use it to plan services, perform with confidence, and control their own monitor mixes — all from their phones. It replaces paper binders, Google Doc setlists, and the chaos of last-minute prep.

## Core Value

A musician opens the app, sees exactly what's coming up — song title, their key, tempo, notes — and performs the entire service without flipping through a binder, asking "what key?", or losing their place. The setlist view is the product.

## Requirements

### Validated

- ✓ Firebase Auth with Google OAuth — existing, working
- ✓ Firestore data model for setlists, users, library index — existing, sound architecture
- ✓ Google Drive as canonical file store with sync engine — existing, needs reliability improvements
- ✓ AI chord detection pipeline (Gemini Flash OCR) — existing, well-engineered
- ✓ Smart transposition engine (music-math, chord-utils) — existing, 100% test coverage
- ✓ PWA with service worker and IndexedDB offline cache — existing, functional
- ✓ Role-based access control (admin > leader > member) — existing
- ✓ Vercel deployment with cron jobs — existing

### Active

- [ ] Setlist creation that replaces the Google Doc workflow — drag-drop song ordering, service flow modeling (readings, prayers, transitions, not just songs), estimated timing
- [ ] Live performance setlist-at-a-glance — song title, musician's key, tempo/feel, quick notes, service flow context, swipe-to-next
- [ ] Per-musician auto-transposition — each musician sees every chart in their instrument's key automatically, no mental math
- [ ] Personal monitor mixing from phones — each musician adjusts their own monitor mix seamlessly via X32 connection
- [ ] Mobile-first, premium UI — beautiful design, smooth animations, zero learning curve, feels like a real product
- [ ] Musician profiles with instrument/transposition preferences — set once, applied everywhere
- [ ] Offline reliability equal to paper — all setlist data and charts cached proactively, works without WiFi
- [ ] Sheet music viewer for new/unfamiliar songs — PDF viewer with transposed chord overlays, secondary to setlist view
- [ ] Simple scheduling — who's playing this week, with availability tracking
- [ ] Notification system — upcoming service reminders, setlist published alerts

### Out of Scope

- Admin analytics dashboard — premature optimization, no users yet to analyze
- Audio file library — separate concern, not core to setlist/performance workflow
- Tasks dashboard — over-engineered for a 10-person user base
- AI chat agent for setlist commands — clever but unnecessary complexity for v2
- Multi-tenancy / multi-congregation — build for CRC first, generalize later
- QR code sign-in bridge — unnecessary complexity for known user base
- Real-time collaborative editing — one person (Daniel) builds setlists, others consume
- Print pipeline for physical gig packets — the whole point is replacing paper

## Context

### Current State
The existing codebase (v1) is a production-grade Next.js 16 app with 30k+ lines, 157 components, 32 API routes, and 361 tests. It was built around PDF viewing with setlist features added on top. The architecture is sound but the UX priorities are inverted — the app treats sheet music as primary and setlists as secondary, when musicians actually need the opposite.

### What Works Well
- **Firebase + Firestore:** Solid data model, good security rules, real-time listeners
- **Google Drive sync:** Clever architecture — congregation drops files into Drive, app auto-discovers them
- **AI chord detection:** Three-layer pipeline (text scan → Gemini validation → user corrections) with correction persistence
- **Music theory engine:** Chord transposition algorithms with 100% test coverage
- **Offline infrastructure:** Service worker + IndexedDB caching with LRU eviction

### What Needs Rethinking
- **Monitor system:** X32 bridge (Electron + WebSocket) was built but never successfully deployed. Needs fundamental rethink — research simpler connection methods (direct OSC from browser, X32's built-in capabilities, or alternative bridge architecture)
- **UI layer:** 157 components accumulated organically. Needs ground-up rebuild with setlist-first philosophy, mobile-first design, and premium visual quality
- **State management:** 8 Zustand stores is over-fragmented. Consolidate to 2-3 focused stores
- **Drive sync reliability:** Hourly cron approach works but feels fragile. Needs hardening (retry logic, better error handling, possibly webhook-based triggers)
- **Component architecture:** Feature folders contain v1/v2 remnants, half-built features, and dead code. Clean slate

### User Base
- 5-8 instrumentalists (guitar, keys, bass, drums, winds, strings)
- 1-2 cantorial soloists (vocalists leading prayers)
- 1 rabbi/band leader (Daniel — service planner, setlist creator)
- 1 sound engineer (runs the X32 board)
- Total: ~10-15 accounts

### Instruments & Transposition
Musicians play transposing instruments (Bb trumpet, Eb alto sax, F horn) alongside concert-pitch instruments (guitar, piano, bass). The auto-transposition must handle all standard orchestral transpositions and respect individual capo preferences for guitarists.

## Constraints

- **Platform:** Vercel (serverless) — keep, works well at this scale
- **Database:** Firebase/Firestore — keep, invested and working
- **File storage:** Google Drive as canonical source — keep, but harden sync
- **Framework:** Next.js (App Router) + React — keep, but rebuild UI components from scratch
- **Timeline:** ASAP — ship core features fast, iterate. Musicians should be using this at services soon
- **Budget:** Minimal — free tiers of Firebase, Vercel, Google APIs
- **Users:** ~10-15 people — don't over-engineer for scale that doesn't exist
- **Primary device:** Mobile phones during services, tablets occasionally, desktop for setlist creation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Setlist-first UX (not PDF-first) | Musicians look at setlist 95% of the time, sheet music only for new songs | — Pending |
| Aggressive UI rebuild, keep backend | Backend (Firebase, Drive sync, AI) is sound; UI priorities are inverted | — Pending |
| Monitor system total rethink | Electron bridge approach never worked; need to research alternatives | — Pending |
| Cut admin analytics, tasks, audio library | No users yet; premature features add complexity without value | — Pending |
| Mobile-first design | Musicians hold phones during services; desktop is secondary | — Pending |
| Consolidate 8 Zustand stores → 2-3 | Over-fragmented state management adds coupling and complexity | — Pending |

---
*Last updated: 2026-03-07 after v2.0 initialization*
