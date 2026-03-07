# Project Research Summary

**Project:** CRC Music v2.0 — Worship Setlist Platform with X32 Monitor Mixing
**Domain:** Worship music platform — setlist management, personal monitor mixing (Behringer X32), offline-first PWA, brownfield UI rewrite
**Researched:** 2026-03-07
**Confidence:** MEDIUM-HIGH overall (X32 protocol HIGH, stack HIGH, features MEDIUM-HIGH, architecture HIGH, pitfalls HIGH)

## Executive Summary

CRC Music v2.0 is a brownfield rewrite of a worship band setlist app for a Jewish congregation (~10-15 users), with two defining capabilities no competitor offers together: per-instrument automatic key transposition and integrated personal monitor mixing via the Behringer X32. The core architectural challenge is that browsers cannot send raw UDP packets, which is the only protocol the X32 understands. The proven solution is a Node.js WebSocket-to-UDP proxy (the `x32-proxy` npm package) running on a dedicated LAN device — ideally a Raspberry Pi mounted in the audio rack. This is a solved problem with a purpose-built, actively maintained library; the risk is operational rather than technical.

The recommended approach is to execute the rewrite as a strangler fig migration: keep v1 routes functional while building v2 routes in parallel, ship one complete vertical slice (the live performance setlist view) before touching any other feature, and only cut over once v2 has been validated at actual Shabbat services. The stack keeps all working v1 infrastructure (Firebase Auth, Firestore, Google Drive sync, chord transposition engine with 100% test coverage) and rebuilds only the UI layer: Tailwind CSS v4.1, shadcn/ui, and Motion (Framer Motion 11+) replace whatever was there before. State management consolidates from 8 Zustand stores to 3 domain-aligned stores, with TanStack Query absorbing all server/async state from Firestore.

The three highest risks are: (1) X32 OSC keepalive expiry silently breaking monitor sessions mid-service — mitigated by keeping the 9-second `/xremote` renewal in the proxy server, never the browser; (2) stale setlist data being served from PWA cache during a live service — mitigated by network-first strategy for all setlist data with version-stamped cache invalidation; and (3) big-bang rewrite breaking working features before v2 is ready — mitigated by the strangler fig pattern with explicit go/no-go criteria per feature before cutting over.

---

## Key Findings

### Recommended Stack

The v1 backend is sound and should not be replaced. Firebase Auth, Firestore, Google Drive sync, and the existing Gemini Flash OCR/chord extraction pipeline all continue unchanged. The UI layer is a full rebuild using Tailwind CSS v4.1 (CSS-first config, 100x faster incremental builds), shadcn/ui (copy-paste component ownership, pairs with Tailwind v4 and Radix UI), and Motion 11+ for touch gestures (swipe-to-next setlist card, spring physics, 120fps via Web Animations API). Next.js 16.1 is already in use; Turbopack is now stable and default, React Compiler eliminates most manual memoization.

**Core technologies:**
- **Next.js 16.1 + React 19.2:** Already running; keep and upgrade. Turbopack stable, React Compiler enabled via `reactCompiler: true`. Remove all webpack customizations.
- **Tailwind CSS v4.1:** Full rebuild of UI layer. CSS-first config (delete `tailwind.config.js`). Required for shadcn/ui v2 compatibility.
- **shadcn/ui (latest 2025):** Copy-paste architecture gives full ownership. No library lock-in. Use via `npx shadcn@latest add [component]`.
- **Motion 11+:** Swipe gestures, spring physics, 120fps animations. `useMotionValue` + `useTransform` for iOS-style card navigation.
- **Zustand 5.0.10:** Three stores (AppStore, SetlistStore, MixerStore) replacing current 8. Slices pattern. React 19 concurrent-safe.
- **TanStack Query v5 + `@tanstack-query-firebase/react`:** Server/async state separation from UI state. Handles Firestore with caching and deduplication.
- **`x32-proxy` 2.5.8 (npm):** Purpose-built WebSocket-to-UDP proxy for X32. Runs on LAN device (Raspberry Pi). Not installed in the Next.js app.
- **`osc.js`:** OSC binary encoding/decoding in browser. `osc.WebSocketPort` sends OSC over the WebSocket connection to the proxy.
- **`@ducanh2912/next-pwa` + Serwist:** Service worker, offline fallback, push notifications. App Router aware. Note: `proxy.ts` in Next.js 16 must allowlist `/sw.js`, `/manifest.json`, `/workbox*`.
- **IndexedDB (via `idb` library):** Chart and setlist cache. Proactively populated on setlist publish.

**Avoid:** Electron bridge (v1 failure mode), direct browser UDP, `shadowwalker/next-pwa` (abandoned 2022), MUI (fights custom design), Redux Toolkit (overkill at 15 users), `@react-pdf/renderer` (for generating PDFs, not viewing them).

See [STACK.md](.planning/research/STACK.md) for full installation commands, version compatibility, and alternatives analysis.

---

### Expected Features

The market gap is clear: no existing tool combines service-flow-aware setlists with automatic per-instrument transposition and integrated monitor mixing. Planning Center, WorshipTools, and OnSong each cover subsets of this but none cover all three. Jewish-specific worship tooling is essentially nonexistent in the band/setlist space.

**Must have (table stakes — Phase 1):**
- Setlist-at-a-glance performance view with full service run-of-show (songs AND non-song items: prayers, readings, transitions)
- Per-musician automatic key display — each phone shows the song in the musician's instrument key (Bb trumpet, Eb alto sax, F horn, capo positions)
- Musician profiles — instrument, transposition preference, capo position; set once, applied everywhere
- Song card content — title, key (auto-transposed), tempo/feel, quick notes; swipe to advance
- Non-song service items as first-class entities (Shabbat structure: Kabbalat Shabbat, Torah, D'var, etc.)
- Service flow builder (admin) — drag-drop ordering, non-song item types
- Proactive offline caching — triggered on setlist publish, all charts downloaded before service
- Setlist publish notification — musicians alerted when the setlist is ready
- Premium mobile-first UI — this is the product, not a feature

**Should have (differentiators — Phase 2-3):**
- Personal monitor mixing (X32) — per-musician fader control for their monitor bus, integrated in the same app
- X32 WebSocket proxy — Node.js bridge on Raspberry Pi
- Scheduling — who's playing this week, availability confirmation
- Sheet music viewer improvements — chord overlay, transposed PDF per musician
- Google Drive sync hardening — webhook triggers, retry logic, expiry renewal

**Defer to v3+:**
- Full Jewish liturgical awareness (Hebrew/transliteration, High Holiday vs Shabbat contexts)
- Multi-congregation / SaaS platform
- Analytics

**Anti-features (do not build):**
Real-time collaborative setlist editing, full house mixer control from phones, in-app audio recording, backing tracks playback, AI chat agent for setlist commands, QR code sign-in.

See [FEATURES.md](.planning/research/FEATURES.md) for competitor analysis, feature dependency graph, and prioritization matrix.

---

### Architecture Approach

The system separates into four distinct zones with clear boundaries: the client-side PWA (three feature modules: setlist, sheet-music, monitor), the Next.js API layer on Vercel (serverless, stateless), the Firebase backend (Firestore, Auth, Drive sync), and the X32 bridge (a separate Node.js process on the church LAN — not part of the web app). The critical architectural rule is that the X32 bridge is infrastructure, not part of the app; Vercel serverless functions cannot run a persistent WebSocket/UDP process, so the bridge must be separately deployed.

**Major components:**
1. **Setlist Feature** (`features/setlist/`) — live performance view (Server Component shell + Client Component for swipe), setlist builder with drag-drop, service flow items
2. **Monitor Feature** (`features/monitor/`) — X32Client WebSocket abstraction, fader UI, graceful degradation when bridge offline
3. **Sheet Music Feature** (`features/sheet-music/`) — PDF viewer (always `dynamic()` import, client-only), chord overlay, transposed view
4. **Three Zustand Stores** (`store/`) — AppStore (auth, user, instrument), SetlistStore (active setlist, position, performance mode), MixerStore (WebSocket state, channel levels)
5. **Offline Cache Layer** (`lib/offline/`) — IndexedDB via `idb`; all Firestore listeners write to cache simultaneously; getCachedSetlist() is the offline read path
6. **Service Worker** — asset caching (Cache-First for shell), setlist data (Network-First), PDFs (Cache-First pre-populated on publish)
7. **X32 Bridge** (standalone Node.js process) — `x32-proxy` on Raspberry Pi, `/xremote` keepalive every 8 seconds in proxy (not browser), local state broadcast to handle X32's no-self-echo behavior

**Key patterns:**
- Setlist-first page hierarchy: default authenticated route is active setlist, not PDF viewer
- Server Components for data fetch; Client Components only for interaction, gestures, WebSocket
- Feature public API via `index.ts`: no direct imports into feature internals from pages or other features
- Firestore listeners centralized in hooks/context, not in leaf components (prevents battery drain)
- Offline: network-first for setlist data + version-stamped cache invalidation on publish

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for full project structure, data flow diagrams, X32 bridge options analysis, and build order.

---

### Critical Pitfalls

1. **X32 keepalive expiry kills monitor sessions silently** — The X32 stops broadcasting fader updates 10 seconds after the last `/xremote`. Never put the keepalive loop in browser JavaScript (mobile throttling kills it). The proxy server sends `/xremote` every 8 seconds unconditionally. Test by running the proxy for 30+ minutes without interaction.

2. **X32 does not echo its own OSC commands back to the sender** — When musician A moves a fader from the app, musician A's UI will not get confirmation from the X32. The proxy must implement local state broadcast: every OSC command sent to the X32 is immediately echoed to all connected WebSocket clients. Also: on first connect, actively poll all fader/mute states — `/xremote` only gives future changes, not current state.

3. **Stale setlist served from PWA cache at live service** — Cache-first serves last week's setlist. Catastrophic failure: invisible and unrecoverable mid-service. Use network-first for all setlist documents. Force `getDocumentsFromServer()` on app open for the active setlist. Implement version timestamps: publish event increments a version in Firestore; client checks version against cache on startup and invalidates if mismatched.

4. **Big-bang rewrite breaks working features** — With real services every week, a half-rebuilt app is worse than the old one. Strangler fig pattern: v1 routes stay alive; v2 routes build under `/v2/` paths; cut over per-feature only after v2 replacement has been used at two actual services. Never delete v1 code until v2 is validated.

5. **Firestore listeners leaking on mobile** — Every `onSnapshot` without a cleanup in `useEffect` return becomes a zombie listener. After 20 minutes of navigation, phones overheat and battery drains. Centralize all Firestore listeners in 2-3 context providers aligned with the 3 stores. Enforce cleanup in ESLint. Test with Chrome DevTools Performance tab for 30 minutes.

6. **Google Drive webhook channels expire silently (max 1 week)** — New PDFs stop appearing in the app with no error. The existing hourly cron must remain active as a safety net. Add a daily cron job that checks webhook channel expiry and proactively renews channels within 24 hours of expiration.

7. **Bus factor 1** — Solo developer holds all credentials and operational knowledge. Write a Service Day Runbook (proxy restart, force sync, app won't load) and share with the sound engineer before going live. Store credentials in a shared password manager.

See [PITFALLS.md](.planning/research/PITFALLS.md) for full pitfall analysis, technical debt patterns, integration gotchas, performance traps, security mistakes, UX pitfalls, and the "Looks Done But Isn't" checklist.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation and Architecture Setup

**Rationale:** Everything depends on this. The 3-store state architecture, IndexedDB cache layer, service worker, and UI primitives must exist before any feature can be built correctly. Define the strangler fig cutover strategy here — not later.

**Delivers:** Working Next.js 16 scaffold with Tailwind v4.1 + shadcn/ui primitives, 3 Zustand stores with TypeScript types, Firebase Auth (Google OAuth), IndexedDB cache layer (`lib/offline/`), service worker with offline fallback page, PWA manifest. Strangler fig plan documented.

**Addresses:** Musician profiles (instrument, transposition preferences) — prerequisite for everything else.

**Avoids:** Big-bang rewrite (define cutover plan here), Firestore listener leaks (design centralized listener architecture before building screens), stale cache (define network-first strategy before any caching is implemented), `'use client'` sprawl (establish RSC/RCC boundary rules from day 1).

**Research flag:** Standard patterns. No deep phase research needed. Next.js 16 + Tailwind v4 + shadcn docs are authoritative and current.

---

### Phase 2: Live Performance Setlist View (Primary User Value)

**Rationale:** This is the product. Everything else is secondary. Musicians need to abandon paper immediately after this phase. Build this end-to-end as the first complete vertical slice before touching any other feature.

**Delivers:** Setlist-at-a-glance performance view (`/setlist/[id]`) — full service run-of-show with songs AND non-song items, current item highlighted, next item visible, swipe-to-next navigation. Per-musician auto-transposition applied at render time from AppStore instrument profile. Proactive offline caching triggered on setlist publish. Setlist list page (which services exist).

**Addresses:** All P1 features from the features matrix — setlist performance view, per-musician key display, non-song service items, proactive offline caching, setlist publish notification (basic version).

**Uses:** Motion 11+ for swipe gestures; TanStack Query + `@tanstack-query-firebase/react` for Firestore; SetlistStore + AppStore; IndexedDB cache layer from Phase 1.

**Avoids:** PDF-first navigation (setlist is the default route, not a sidebar); stale cache (network-first for setlist data, version-stamped invalidation on publish); Firestore listener leaks (centralized in SetlistStore context).

**Research flag:** Standard patterns for the setlist/swipe UI. The non-song service item data model (how to represent a Shabbat service flow with Jewish liturgical structure) may benefit from a quick research pass — the data model must support Hebrew text and liturgical item types without requiring a full implementation of liturgical awareness in Phase 2.

---

### Phase 3: Setlist Creation and Service Flow Builder

**Rationale:** The leader (Daniel) builds setlists; the team consumes them. This phase gives the admin the tooling to replace the Google Doc setlist workflow. Comes after Phase 2 so the Firestore data model is validated against actual performance view needs before the builder is built on top of it.

**Delivers:** Drag-drop service flow builder for admin/leader role. Non-song item types (prayer, reading, transition, announcement). Song library search and add-to-setlist. Setlist publish action with version increment and notification trigger.

**Addresses:** Service flow builder (admin), scheduling-who's-playing (basic version), push notifications on publish (full implementation).

**Avoids:** Collaborative editing (anti-feature — leader-only creation with instant broadcast); premature song catalog management (Drive is the catalog; index it, don't build management UI).

**Research flag:** Drag-drop implementation with Next.js 16 and React 19 Concurrent Mode may need a focused research pass. The standard `dnd-kit` library is the likely answer, but verify React 19 compatibility and whether Server Components impose any constraints on drag-drop event handling.

---

### Phase 4: X32 Monitor Mixing

**Rationale:** This is the highest-complexity feature and the most technically novel. It is architecturally independent of the setlist (the bridge is a separate process, MixerStore is a separate store) and can be built in parallel with Phase 3, but comes after Phase 2 validation because monitor mixing is a Phase 2 augmentation of the performance view, not a standalone feature.

**Delivers:** `x32-proxy` Node.js bridge deployment on Raspberry Pi with PM2 process management and systemd auto-start. MixerStore with WebSocket connection lifecycle management. Channel strip UI — per-musician fader and mute for their assigned monitor bus. Connection status indicator (proxy reachable / X32 reachable / mixer synced). Graceful degradation when bridge is offline. Bridge URL configuration in admin settings. Sound engineer runbook for proxy management.

**Addresses:** X32 WebSocket proxy, personal monitor mixing UI, monitor bus assignment per musician.

**Uses:** `x32-proxy` 2.5.8 on Pi; `osc.js` in browser; MixerStore; WebSocket client in `features/monitor/bridge/x32-client.ts`.

**Avoids:** Keepalive in browser (must be in proxy — verify this before writing any client code); X32 no-self-echo (proxy must broadcast locally); proxy as single point of failure (PM2 + systemd, connection status visible, app functional without it); full house mixer control (musician views locked to monitor buses only).

**Research flag:** NEEDS RESEARCH PHASE. X32 integration has non-obvious protocol behavior (no-self-echo, initial state polling, `/xremote` timeout, meter data as raw ArrayBuffer). Before writing any bridge or client code, document the exact OSC message sequence for: initial connect + state poll, fader set, mute toggle, and graceful disconnect. Verify `x32-proxy` 2.5.8 handles local broadcast natively or whether it must be custom-implemented.

---

### Phase 5: Sheet Music and Drive Sync Hardening

**Rationale:** The PDF viewer and AI chord pipeline exist in v1. This phase hardens and integrates them properly into the v2 architecture rather than rebuilding from scratch. The Drive sync hardening (webhook renewal) is a reliability requirement before going live for regular use.

**Delivers:** PDF viewer (`@react-pdf-viewer/core`) as a drill-down from setlist song card. Chord overlay with per-musician transposed view. Google Drive webhook channel renewal cron (proactive, 24-hour window before expiry). Delta sync using `pageToken` (not full sync on every startup). Drive sync status visible in admin panel.

**Addresses:** Sheet music viewer improvements, Drive sync hardening, chord overlay.

**Uses:** Existing Gemini Flash OCR pipeline; existing transposition engine from `lib/music/`; Vercel cron infrastructure.

**Avoids:** PDF-as-primary-view (drill-down from setlist only); full Drive catalog management (premature); `@react-pdf/renderer` (wrong library — that's for generating PDFs).

**Research flag:** Standard patterns for PDF viewer integration. Drive webhook renewal is well-documented in Google's official API docs. No deep research needed.

---

### Phase 6: Scheduling, Notifications, and Operations

**Rationale:** Scheduling (who's playing) and full push notifications are P2 features that require the user model and setlist model to be stable (Phases 2-3). This phase also covers the operational runbook and bus-factor mitigation before the app is used at High Holiday services.

**Delivers:** Schedule page — who's playing this week, musician confirmation. Push notifications — setlist published (full PWA push, not just in-app badge), upcoming service reminder. Service Day Runbook shared with sound engineer. Shared credential vault. Onboarding flow for substitute musicians (access within 5 minutes on mobile).

**Addresses:** Scheduling, push notifications (full), bus factor mitigation, substitute musician onboarding.

**Avoids:** Admin analytics dashboard (no users yet to analyze, defer to v3); QR code sign-in (solves a non-problem at this user count).

**Research flag:** PWA push notifications on iOS Safari have historically been problematic — verify current status for iOS 17+/18+ before committing to push notification implementation. PWA push on Android is well-documented and reliable.

---

### Phase Ordering Rationale

- **Foundation before everything:** The 3-store architecture and IndexedDB cache pattern must be established before any feature is built, or each feature will re-invent its own state management and caching.
- **Setlist view before setlist builder:** Validate the data model (especially the service flow + non-song items) against the performance view before building admin tooling on top of it. Wrong data model in the builder = expensive retrofit.
- **Strangler fig throughout:** v1 routes stay live. Each phase ships a complete vertical slice that is validated at a real Shabbat service before the next phase begins. This is not a preference — it is a hard requirement given weekly service cadence.
- **X32 in Phase 4 (not Phase 2):** Monitor mixing is architecturally independent but operationally dependent on musicians trusting the app over paper first. If musicians don't yet trust the setlist view, they won't trust monitor mixing. Build trust first.
- **Drive hardening in Phase 5:** The existing Drive sync works well enough for early phases. Webhook renewal and delta sync are reliability improvements, not launch blockers for the setlist view.

---

### Research Flags

**Needs `/gsd:research-phase` during planning:**
- **Phase 4 (X32 Monitor Mixing):** Non-obvious X32 OSC protocol behavior, proxy local broadcast design, `x32-proxy` 2.5.8 capabilities. Research before writing any code.
- **Phase 6 (Scheduling / Notifications):** iOS PWA push notification current status. Verify before committing to push notification architecture.

**Standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Next.js 16 + Tailwind v4 + shadcn/ui are well-documented. Official docs are authoritative.
- **Phase 2 (Setlist View):** RSC/RCC patterns, Zustand, TanStack Query + Firebase — well-documented standard patterns.
- **Phase 3 (Setlist Builder):** Verify `dnd-kit` + React 19 compatibility before starting, but this is a known-good pattern.
- **Phase 5 (Sheet Music + Drive Sync):** PDF viewer and Drive webhook renewal are well-documented.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies (Next.js 16, Tailwind v4, Zustand 5, TanStack Query v5, x32-proxy 2.5.8) all verified against official docs and release notes. Version compatibility explicitly verified. |
| Features | MEDIUM-HIGH | Competitor landscape well-documented (official product pages, App Store listings). Jewish-specific market gap confirmed by absence of tooling. Feature value assessments based on domain knowledge rather than user research with actual CRC musicians. |
| Architecture | HIGH | RSC/RCC patterns from official Next.js docs. X32 protocol from official Behringer OSC documentation. PWA patterns from official Next.js PWA guide (updated 2026-02-27). Three-store architecture based on Zustand official discussion. |
| Pitfalls | HIGH | X32 keepalive and no-self-echo pitfalls confirmed by official X32 protocol docs and practitioner posts. Firestore listener leak pattern is a known issue in Firebase SDK tracker. Drive webhook expiry confirmed by official Google docs and community forum reports. Big-bang rewrite risk is based on software engineering consensus. |

**Overall confidence:** HIGH for technical recommendations; MEDIUM-HIGH for feature prioritization (would benefit from a brief user interview with CRC musicians before Phase 2 ships).

### Gaps to Address

- **CRC musician user research:** Feature priorities are research-inferred, not validated with actual users. A 30-minute conversation with 2-3 musicians before Phase 2 ships would validate that the setlist card design (title, key, tempo, notes) contains what musicians actually need on stage.
- **X32 firmware version compatibility:** Research confirms the OSC protocol is stable across X32 firmware versions, but the specific firmware running at CRC has not been verified. Confirm before Phase 4.
- **`@tanstack-query-firebase/react` React 19 compatibility:** Research notes this should be verified before installation. Confirm before Phase 2 implementation.
- **iOS PWA push notification current status:** The PWA push notification landscape on iOS has changed across versions. Verify iOS 17+/18+ behavior before Phase 6 design.
- **Non-song service item data model:** How to represent the Shabbat service structure (Kabbalat Shabbat, Maariv sections, Torah, D'var) without requiring full liturgical awareness in Phase 2 needs design before Phase 2 data model work begins.

---

## Sources

### Primary (HIGH confidence)
- [Behringer X32 OSC Remote Protocol (official)](https://behringerwiki.musictribe.com/index.php?title=OSC_Remote_Protocol) — X32 UDP port 10023, `/xremote`, fader commands, keepalive model
- [x32-proxy GitHub (audiopump)](https://github.com/audiopump/x32-proxy) — version 2.5.8, deployment model, WebSocket bridge architecture
- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — Turbopack stable, proxy.ts, React Compiler, `"use cache"` directive
- [Next.js official PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — Serwist, offline fallback, push notifications (updated 2026-02-27)
- [Tailwind CSS v4.0 release](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, build performance, Next.js integration
- [Zustand GitHub](https://github.com/pmndrs/zustand) — version 5.0.10, slices pattern, React 19 compatibility
- [Motion for React docs](https://motion.dev/docs/react) — React 19 compatibility, gestures, swipe actions
- [Firebase: Access data offline (official)](https://firebase.google.com/docs/firestore/manage-data/enable-offline) — Firestore offline persistence, cache behavior
- [Google Drive API: Push notifications / webhooks (official)](https://developers.google.com/workspace/drive/api/guides/push) — channel expiry, renewal requirements
- [Unofficial X32/M32 OSC Remote Protocol PDF](https://wiki.munichmakerlab.de/images/1/17/UNOFFICIAL_X32_OSC_REMOTE_PROTOCOL_(1).pdf) — extended protocol reference

### Secondary (MEDIUM confidence)
- [osc-js GitHub + BridgePlugin docs](https://github.com/adzialocha/osc-js) — WebSocket-to-UDP bridge alternative to x32-proxy
- [TanStack Query Firebase (Invertase)](https://react-query-firebase.invertase.dev/) — Firebase-specific TanStack Query hooks
- [@ducanh2912/next-pwa docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/getting-started) — App Router configuration, Serwist integration
- [OnSong 2026 Release Notes](https://onsongapp.com/releases/2026/) — ChordFlow PDF transposition (competitor feature)
- [MX-Q App Store](https://apps.apple.com/us/app/mx-q/id1471505954) / [MXBus App Store](https://apps.apple.com/us/app/mxbus/id1530411157) — Monitor mixing competitor apps
- [Feature-Sliced Design for Next.js App Router](https://feature-sliced.design/blog/nextjs-app-router-guide) — features/ module architecture pattern
- [Behringer X32 OSC is Quirky — Janis Streib](https://janis-streib.de/post/behringer-x32-osc-is-quirky/) — X32 no-self-echo behavior, practical protocol quirks

### Tertiary (LOW confidence — useful for landscape, not decisions)
- [Top 10 Best Church Setlist Apps](https://www.getonstage.app/blog/top-10-best-church-setlist-apps-for-worship-leaders) — ecosystem overview
- [Jewish worship music tools search / shulmusic.org](https://www.shulmusic.org/) — confirms no dedicated synagogue band setlist tool exists

---

*Research completed: 2026-03-07*
*Ready for roadmap: yes*
