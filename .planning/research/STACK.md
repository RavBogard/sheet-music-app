# Stack Research

**Domain:** Worship music platform — setlist management, monitor mixing (X32), offline-first PWA
**Researched:** 2026-03-07
**Confidence:** MEDIUM-HIGH (X32 connectivity HIGH, UI HIGH, state management HIGH, PWA MEDIUM)

---

## Recommended Stack

### Core Technologies (Keep from v1 — No Change)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.1 | App framework | Already running. Turbopack now stable default. `proxy.ts` replaces `middleware.ts`. React 19.2 built in. |
| React | 19.2 | UI runtime | Already running. Concurrent rendering, React Compiler stable, View Transitions API support. |
| Firebase Auth | Current | Authentication | Google OAuth working. No reason to change. |
| Firestore | Current | Primary database | Data model is sound. Real-time listeners working. |
| Google Drive API | v3 | File storage source | Sync engine is working architecture. Keep, harden. |
| Vercel | Current | Hosting + cron | Works at this scale. Free tier adequate. |
| TypeScript | 5.1+ | Type safety | Required by Next.js 16 minimum. |

### UI Layer (Full Rebuild)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Tailwind CSS | v4.1 | Styling foundation | CSS-first config (no `tailwind.config.js`), 100x faster incremental builds, design tokens as CSS variables, first-party Next.js integration via `@tailwindcss/postcss`. Required for shadcn/ui v2. |
| shadcn/ui | Latest (2025) | Component foundation | Copy-paste architecture means full ownership, no library lock-in. Components live in your repo. Pairs with Tailwind v4 and Radix UI. Zero magic. Exactly what a ground-up UI rebuild needs — customize without fighting a library. |
| Motion (Framer Motion) | 11+ | Gesture + animation | Rebranded from Framer Motion. Production-tested with React 19 + Next.js 16. Native gesture recognition (drag, swipe, tap) that works on touch devices. 120fps via Web Animations API + ScrollTimeline. Spring physics for natural feel. `useMotionValue` + `useTransform` = iOS-style swipe-to-next setlist card. Bundle: 2.3KB min for `useAnimate`, 34KB for full `motion` component. |

**Why NOT MUI or HeroUI:** Both bring their own design language and fight you when you want pixel-perfect custom designs. shadcn gives you unstyled primitives (via Radix) you style yourself with Tailwind. For a "premium feel" app, design freedom beats component count.

**Why NOT Aceternity UI / Magic UI:** Beautiful but theatrical. Adds dependency overhead and opinionated animation styles that may not match a worship/professional context. Use Motion directly instead — same power, no lock-in.

### State Management (Consolidation from 8 → 3 Stores)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Zustand | 5.0.10 | Client UI state | Latest (Jan 2026). React 19 concurrent-safe. Slices pattern allows 1 store with 3 logical domains. Official Zustand docs recommend single store with slices for related state. |
| TanStack Query | v5 | Server/async state | Separates server state from UI state. Handles Firestore fetches with caching, background refetch, deduplication. `@tanstack-query-firebase/react` from Invertase provides Firebase-specific hooks. Eliminates redundant Firebase calls — critical for offline fallback logic. |

**Store architecture (3 domains, 1 Zustand store with slices):**
- `authSlice` — current user, role, musician profile, transposition preferences
- `setlistSlice` — active setlist, current song index, performance mode state, service flow
- `uiSlice` — sheet music viewer open/closed, monitor mix panel state, nav state

**What moves OUT of Zustand:** All Firestore data (setlists library, song list, user list, drive sync status) → TanStack Query. Firestore real-time listeners → TanStack Query subscriptions via `@tanstack-query-firebase/react`.

**Why NOT Jotai:** Atomic model creates implicit dependencies between atoms. Harder to reason about for a ~10-user app with a clear domain model. Zustand slices are more explicit. |

### X32 Monitor Mixing (Total Architecture Rethink)

This is the biggest unknown from v1. Research conclusion: **direct browser-to-X32 is impossible without a bridge, but a clean bridge is very achievable.**

| Component | Technology | Version | Purpose | Why |
|-----------|-----------|---------|---------|-----|
| WebSocket-to-UDP bridge | `x32-proxy` (npm) | 2.5.8 (Oct 2025) | Translates browser WebSocket connections to X32 UDP OSC on port 10023 | Only purpose-built Node.js package for this exact use case. Published by AudioPump Inc., actively maintained (Oct 2025). Runs anywhere Node.js runs. Built-in static file server. |
| OSC message library | `osc.js` | Latest | Encode/decode OSC binary frames in browser | Transport-agnostic. `osc.WebSocketPort` sends OSC over WebSocket. Works in browser and Node. The reference JS OSC implementation. |
| Bridge host | Raspberry Pi Zero 2W or any LAN device | — | Runs `x32-proxy` on the same LAN as the X32 | Node.js on a $15 Pi is the "always-on" bridge. Sound engineer plugs in once. All musicians' phones connect to it. |

**Why the Electron bridge (v1) failed:** Electron requires a desktop running during the service. It creates a single point of failure tied to one person's machine. It's over-engineered for what is essentially a UDP proxy.

**The simple architecture:**
```
Musician's phone (browser)
  → WebSocket → x32-proxy (LAN device, e.g. Pi)
  → UDP OSC port 10023 → Behringer X32
```

**Key X32 OSC facts (HIGH confidence — from official Behringer wiki):**
- X32 listens on UDP port 10023
- Client sends `/xremote` to subscribe to state updates (timeout ~10 seconds, must be refreshed)
- Fader control: `/ch/01/mix/fader ,f 0.75` (float 0.0–1.0)
- Bus aux send (monitor mix): `/ch/01/mix/01/level ,f 0.75`
- Mute: `/ch/01/mix/on ,i 0` (0=mute, 1=unmute)
- No authentication — LAN-only deployment is the security model

**Security note:** X32 has zero authentication. `x32-proxy` warns explicitly: "If you enable access to the mixer from the internet, you're probably going to have a bad day." Keep this on the church LAN only. The web app connects to `ws://[local-ip]:8080`.

**Fallback if Pi is unavailable:** Monitor mix UI shows "Mixer offline" gracefully. Musicians can still use the setlist view — the primary use case — without mixer connectivity.

### Offline-First PWA

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@ducanh2912/next-pwa` | Latest | Service worker + Workbox for Next.js | More actively maintained than `shadowwalker/next-pwa`. App Router aware. Configures Workbox strategies per route. Handles offline fallback page at `app/~offline/page.tsx`. |
| IndexedDB (via existing setup) | — | Chart cache, setlist cache | Already working in v1. Keep. Use with TanStack Query's `persister` for offline Firestore data. |
| Background Sync API | Native (browser) | Queue writes while offline | Native browser API, no library needed. Queue setlist changes/corrections while offline, flush on reconnect. |

**PWA caching strategy by content type:**
- App shell (layout, navigation): Cache-First, versioned
- Setlist data (active service): Cache-First with background revalidation — musicians MUST have this offline
- Song charts/PDFs: Cache-First, pre-cached on setlist publish
- Firestore API calls: Stale-While-Revalidate for lists; Network-First for mutations
- Monitor mix faders: No caching — real-time only, gracefully degrade offline

**Next.js 16 PWA notes:**
- Official manifest support via `app/manifest.ts` (no plugin needed for manifest)
- Service worker still requires `@ducanh2912/next-pwa` or custom `sw.ts`
- `proxy.ts` (new in v16, replaces `middleware.ts`) must allowlist `/sw.js`, `/manifest.json`, `/workbox*`
- `"use cache"` directive (new in v16) replaces `fetch` cache options — use for setlist data

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-pdf-viewer/core` + `@react-pdf-viewer/default-layout` | Latest | PDF sheet music viewer | Secondary feature (new/unfamiliar songs). Use `dynamic(() => import(...), { ssr: false })` wrapper. PDF viewer is always a Client Component. |
| `pdf.js` worker | Latest (bundled with react-pdf-viewer) | PDF rendering engine | Comes with `@react-pdf-viewer/core`. No separate installation needed. |
| `music-math` / `chord-utils` | Existing | Chord transposition | Already working with 100% test coverage. Keep. No change needed. |
| `@tanstack-query-firebase/react` | Latest | Firebase-specific TanStack Query hooks | Handles Firestore collection/document subscriptions with TanStack Query semantics. Avoids reinventing subscription management. |
| `date-fns` | v3 | Date formatting for service scheduling | Lightweight, tree-shakeable. No moment.js. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Turbopack | Build (Next.js 16 default) | Now stable and default. No webpack config needed. 5x faster builds. Do not fight it — remove any webpack customizations. |
| React Compiler | Auto-memoization | Stable in Next.js 16. Enable via `reactCompiler: true` in `next.config.ts`. Eliminates most manual `useMemo`/`useCallback`. |
| Vitest | Unit testing | Faster than Jest for Vite/Turbopack projects. Already have 361 tests — migrate incrementally. |
| Playwright | E2E testing | Mobile viewport testing for swipe gestures, offline mode simulation. |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| shadcn/ui + Motion | HeroUI | If you want a complete design system out of the box and are OK with NextUI's aesthetic. Not for premium custom designs. |
| shadcn/ui + Motion | Aceternity UI | If you're building a SaaS marketing site, not a utility app used during live music performance. |
| `x32-proxy` (Node.js) | Custom WebSocket server (osc.js) | If you need more control over the bridge logic (e.g., per-user permission filtering). `x32-proxy` is a drop-in; custom server gives more flexibility. |
| `x32-proxy` on Raspberry Pi | `x32-proxy` on sound engineer's laptop | Laptop approach works but requires laptop to be on. Pi is always-on, power-efficient, and purpose-built for this. |
| TanStack Query | Firebase SDK listeners directly | If you have very few data types and don't need caching. At 157 components with 8 Zustand stores, TanStack Query pays for itself immediately. |
| `@ducanh2912/next-pwa` | Manual `sw.ts` | Manual gives more control but more boilerplate. For this app, `@ducanh2912/next-pwa` covers 95% of needs. |
| Zustand slices (1 store) | 3 separate Zustand stores | Multiple stores if domains are truly independent and don't share any state. Auth/setlist/UI are related enough to benefit from co-location. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `shadowwalker/next-pwa` | Last commit 2022. Not maintained. Breaks with Next.js 15+. | `@ducanh2912/next-pwa` |
| Electron bridge for X32 | Requires running desktop app during service; single point of failure; never worked reliably in v1. | `x32-proxy` on a Raspberry Pi or LAN device |
| Direct UDP from browser | Browsers cannot send raw UDP packets. This is a hard browser security constraint. | WebSocket → `x32-proxy` → UDP |
| Redux Toolkit | Overkill for a ~15-user app. Adds boilerplate without benefit at this scale. | Zustand 5 with slices |
| MUI (Material UI) | Imposes Material Design aesthetic. Fighting the design system to get a custom premium look is a losing battle. | shadcn/ui with Tailwind |
| Moment.js | 67KB, deprecated by maintainers. | `date-fns` v3 (tree-shakeable) |
| Pages Router (Next.js) | Legacy. App Router is the future. Already using App Router in v1. | App Router (already using) |
| `@react-pdf/renderer` (react-pdf) | For generating PDFs, not viewing them. Common mistake. | `@react-pdf-viewer/core` for viewing |
| Webpack custom config | Turbopack is now default and stable in Next.js 16. Webpack configs will be ignored or cause issues. | Remove webpack customizations; use `next.config.ts` Turbopack options |

---

## Stack Patterns by Variant

**X32 mixer is online (on church LAN):**
- Browser connects to `ws://[pi-ip]:8080`
- Monitor mix controls are live and bi-directional
- `/xremote` subscription refreshed every 8 seconds
- Fader state synced from mixer on connect

**X32 mixer is offline / bridge unreachable:**
- Monitor mix panel shows "Mixer offline — connect to church WiFi"
- All other app features work normally (setlist, charts, transposition)
- No error states or crashes — graceful degradation

**Musician is offline (no WiFi at all):**
- Service worker serves cached app shell instantly
- IndexedDB serves cached setlist and charts
- Monitor mix panel shows "Offline — mixer unavailable"
- Any setlist corrections queued via Background Sync API, synced when back online

**Building setlist on desktop (band leader):**
- Full Next.js SSR for setlist creation UI
- React Server Components for setlist data fetch
- Client components for drag-drop ordering and real-time preview
- Server Actions for save operations

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 16.1 | React 19.2, TypeScript 5.1+, Node.js 20.9+ | Node minimum bumped in v16. Verify hosting. |
| Tailwind CSS v4.1 | Next.js 15+/16, shadcn/ui (latest) | shadcn/ui updated for Tailwind v4. Check shadcn CLI version. Remove `tailwind.config.js`. |
| Zustand 5.0.10 | React 18–19 | `create<T>()()` double-call pattern required for TypeScript + middleware. |
| Motion (Framer Motion) 11+ | React 18–19, Next.js 15/16 | No `@types` package needed — TypeScript included. |
| `x32-proxy` 2.5.8 | Node.js (any version), X32 firmware any | No React dependency. Runs standalone. |
| `osc.js` | Browser (WebSocket transport), Node.js | Use `osc.WebSocketPort` in browser. |
| `@tanstack-query-firebase/react` | TanStack Query v5, Firebase v10+ | Invertase maintained. Check for React 19 compatibility before installing. |
| `@ducanh2912/next-pwa` | Next.js 13+/15/16 | App Router aware. `proxy.ts` in Next.js 16 must allowlist SW files. |

---

## Installation

```bash
# UI layer
npm install tailwindcss @tailwindcss/postcss
npm install motion
# shadcn components added via CLI per-component:
npx shadcn@latest add button card sheet slider

# State management
npm install zustand @tanstack/react-query @tanstack-query-firebase/react

# PWA
npm install @ducanh2912/next-pwa

# X32 bridge (install on Pi/bridge device, NOT in Next.js app)
npm install -g x32-proxy

# X32 browser client (in Next.js app)
npm install osc

# PDF viewer
npm install @react-pdf-viewer/core @react-pdf-viewer/default-layout

# Utilities
npm install date-fns

# Dev dependencies
npm install -D vitest @vitejs/plugin-react playwright
```

---

## Sources

- [x32-proxy GitHub (audiopump)](https://github.com/audiopump/x32-proxy) — version 2.5.8, deployment model, WebSocket bridge architecture. HIGH confidence.
- [x32-proxy on npm](https://www.npmjs.com/package/x32-proxy) — package metadata, install method. HIGH confidence.
- [Behringer OSC Remote Protocol wiki](https://behringerwiki.musictribe.com/index.php?title=OSC_Remote_Protocol) — official X32 OSC specification, port 10023, `/xremote`, fader commands. HIGH confidence.
- [osc.js GitHub (colinbdclark)](https://github.com/colinbdclark/osc.js/) — browser WebSocket OSC transport. HIGH confidence.
- [osc-js npm](https://www.npmjs.com/package/osc-js) — alternative OSC library with bridge mode. MEDIUM confidence.
- [Motion for React docs](https://motion.dev/docs/react) — React 19 compatibility, gestures, swipe actions. HIGH confidence.
- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — Turbopack stable, proxy.ts, React Compiler stable, `"use cache"` directive. HIGH confidence.
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) — breaking changes, Node.js 20.9+ minimum. HIGH confidence.
- [Tailwind CSS v4.0 release](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, build performance, Next.js integration. HIGH confidence.
- [shadcn/ui component library comparison 2025/2026](https://www.untitledui.com/blog/react-component-libraries) — ecosystem overview. MEDIUM confidence.
- [Zustand GitHub](https://github.com/pmndrs/zustand) — version 5.0.10, slices pattern, React 19. HIGH confidence.
- [TanStack Query Firebase (Invertase)](https://react-query-firebase.invertase.dev/) — Firebase-specific hooks. MEDIUM confidence.
- [Next.js PWA guide (official)](https://nextjs.org/docs/app/guides/progressive-web-apps) — built-in manifest support, service worker patterns. HIGH confidence.
- [@ducanh2912/next-pwa docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/getting-started) — App Router configuration. MEDIUM confidence.
- [PWA 2026 guide (DigitalApplied)](https://www.digitalapplied.com/blog/progressive-web-apps-2026-pwa-performance-guide) — caching strategies, Background Sync API. MEDIUM confidence.
- [XR18 Arduino bus control for IEM (GitHub)](https://github.com/ksipp01/XR18-Arduino-Bus-control-for-IEM) — real-world example of browser-based monitor mix control via OSC. MEDIUM confidence.

---

*Stack research for: CRC Music v2.0 — worship setlist platform with X32 monitor mixing and offline-first PWA*
*Researched: 2026-03-07*
