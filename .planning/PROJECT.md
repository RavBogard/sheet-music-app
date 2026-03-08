# CRC Music v2.0

## What This Is

A worship music platform for Central Reform Congregation. 5-8 core musicians, cantorial soloists, a rabbi/band leader (Daniel), and a sound engineer use it to plan services, perform with confidence, and control their personal monitor mixes — all from tablets on music stands. Community members and guest musicians also access setlists and sheet music for jam sessions and special events.

It replaces: Google Sheets for setlist planning, paper binders during performance, and the inability for musicians to control their own monitor mix.

## Core Value

A musician sets their tablet on a music stand, opens the app, and sees this week's service: song titles, their key, tempo, notes, and the full liturgical flow — readings, prayers, songs — all at a glance. They can drill into any PDF when needed, and adjust their monitor mix in 1-2 taps. A non-musician community member at a jam session can pull up centralreform.live on their phone and follow along with no account needed.

## The Three Pillars

### 1. Setlist Experience (Editor + Performance View)

**The editor** replaces Google Sheets. Daniel's weekly workflow is "duplicate last week's setlist and swap a few songs." The liturgical structure is fixed (Kabbalat Shabbat has a known order), so the app should pre-fill the entire service skeleton from a template and let Daniel slot in songs, set keys, assign leads. It needs to be faster than a spreadsheet — type, tab, type, tab. AI auto-fills templates and accepts natural language commands ("add Mi Chamocha in Am after the responsive reading").

16 service templates: 7 regular (Daniel/Karen Friday, Randy Friday, Shir Shabbat, Daniel/Karen Saturday, Randy Saturday, Bnei Mitzvah Saturday, Havdalah/Afternoon Bnei Mitzvah) and 9 holiday (Erev RH, Daytime RH, Alt Daytime RH, 2nd Day RH, Kol Nidre, Quick Kol Nidre, YK Morning, YK Yizkor, YK Neilah).

**The performance view** is what musicians see on a portrait tablet during a service. At a glance: song title, their transposed key, tempo. The full service flow (readings, prayers, transitions) is visible so nobody gets lost. Tapping a song opens the PDF viewer immersively — the setlist gets out of the way. Getting back to the setlist is fast and fluid.

### 2. Monitor Mixing (The Killer Feature)

Musicians adjust their personal monitor mix from their tablets. 3-4 shared wedge monitor buses on an X32 console. Each musician sees 6-8 faders for the channels they care about.

**Two modes:**
- **Configure** (before service): See all channels, star the ones you care about. Sound engineer can pre-configure which channels each musician sees.
- **Live** (during service): Only your starred channels. Clean faders, instant response. 1-2 taps to open from anywhere in the app.

**The bar:** A non-technical sound engineer plugs in the system and it works. Every musician opens their mix and it's just there. It never drops mid-service. Zero troubleshooting during a live service. If the X32 isn't reachable, the app says so clearly. This requires a serious research spike into the right bridge architecture — x32-proxy on a Raspberry Pi, a service on the production PC, direct browser OSC, or something else entirely. The answer must be stupid simple to install and bulletproof in production.

### 3. PDF Viewer (Keep As-Is)

The existing PDF viewer with AI chord detection, transposed chord overlays, and annotation is good. Don't rebuild it. Keep it immersive — when a musician taps into a PDF, it owns the screen. The setlist and monitor controls stay accessible (slide-out drawer, bottom bar button) but don't cover the PDF.

## What Exists and What Changes

### Keep As-Is
- PDF viewer + AI chord detection pipeline (Gemini Flash OCR, three-layer detection)
- Transposition engine (music-math, chord-utils — 100% test coverage)
- Firebase Auth with Google OAuth
- Firestore data model (sound architecture)
- Vercel deployment

### Rebuild / Redesign
- Setlist editor (too slow/clunky, must be faster than a spreadsheet)
- Setlist performance view (tablet-first, portrait orientation, setlist-at-a-glance)
- Monitor mixing (never worked — total rethink from bridge architecture to UX)
- Home screen (upcoming service focus, not a dashboard)
- AI integration (currently poorly integrated — needs auto-fill templates + chat commands + behind-the-scenes intelligence)

### Improve / Harden
- Google Drive sync (works but fragile — needs retry logic, better error handling, robustness that eliminates admin duct tape)
- Library management (browse, search, upload — keep but clean up)
- Backend systems generally (simplify so admin tooling becomes unnecessary)
- Code cleanup (157 components → focused set, 8 Zustand stores → consolidated, dead code removal)

### Keep but Simplify
- Scheduling (assign musicians to services, notify, who's playing — no availability calendar or AI suggestions for now)
- Print/gig packet pipeline (everyone uses it sometimes, especially for guest musicians)
- QR code authentication
- SMS and push notifications
- User/role management

### Cut
- Task management system
- Analytics/usage dashboard
- 8-week rotation matrix
- Admin features that exist as duct tape for fragile backend systems

## User Tiers

| Tier | Auth | Access |
|------|------|--------|
| Core band | Google OAuth, approved | Full: setlist, monitoring, PDFs, transposition, scheduling |
| Guest musicians | Google OAuth or QR | Performance view + PDFs + transposed chords + print packets |
| Community jammers | No auth (public link) | Setlist + PDFs only (jam sessions, special events) |
| Band leader (Daniel) | Admin | All of the above + setlist editor + scheduling + user management |
| Sound engineer | Authorized | Monitor bus assignment + their own mix |

## Physical Setup

- **Tablets** (mostly iPads, mix of CRC-provided and personal) in **portrait orientation** on music stands
- **X32 digital console** with 3-4 shared wedge monitor buses
- Venue WiFi (reliable enough — offline is nice-to-have, not critical)
- 5-8 musicians per service, 3-5 needing monitor control
- Community jam sessions: up to 40 people on their own phones/tablets

## Constraints

- **Platform:** Vercel (serverless) — keep
- **Database:** Firebase/Firestore — keep
- **File storage:** Google Drive as canonical source — keep, harden
- **Framework:** Next.js (App Router) + React — keep
- **Timeline:** ASAP — ship polished, not half-baked
- **Budget:** Minimal — free tiers
- **Users:** ~10-15 core accounts, up to 40 for jam sessions
- **Primary device:** Tablets in portrait on music stands; phones for jam session guests
- **Success criteria:** Everything polished — setlist, monitoring, scheduling, notifications all solid before going live with the band

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Tablet-first, portrait orientation | Musicians use tablets on music stands during services |
| Setlist-at-a-glance as primary view | Musicians need song/key/tempo info 95% of the time, PDFs only for new songs |
| Monitor mixing as foundational priority | The killer feature that's never worked — requires deep research before implementation |
| Keep PDF viewer as-is | It's good engineering, don't break what works |
| Two-mode monitor UX (configure vs live) | Separate configuration complexity from performance simplicity |
| Template-based setlist creation | Liturgical structure is fixed — pre-fill skeleton, swap songs |
| Duplicate-and-tweak workflow | 70-80% of songs stay the same week to week |
| Public access for jam sessions | No auth — centralreform.live link, setlist + PDFs only |
| Backend simplification over admin tooling | Fix the systems, the duct tape admin tools become unnecessary |
| Cut tasks, analytics, rotation matrix | No users yet — premature features |

---
*Last updated: 2026-03-07*
