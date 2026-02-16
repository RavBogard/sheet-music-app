# Changelog

All notable changes to CentralReform are documented in this file.

## [3.1.0] — 2026-02-16

### Multi-Congregation Abstraction (Phase E)

- **Congregation Config System** — All hardcoded "CRC" branding replaced with a Firestore-backed configuration document (`config/congregation`). App name, logo, location, description, print footer, and feature flags are all configurable.
- **Feature Flags** — Nav items (Monitor, AI Assistant) gated by `config.features.*`. Congregations can enable/disable capabilities without code changes.
- **CongregationProvider** — React context wraps the app; `useCongregation()` hook available throughout.
- **Dynamic Greeting** — Guest greeting uses configurable app name.
- **Print Footer** — Setlist print API reads footer text from Firestore config.

## [3.0.0] — 2026-02-16

### Setlist Collaboration & Annotations (Phase D)

#### D1: Setlist Live Sync
- **Presence System** — See who's viewing a setlist in real-time (avatar stack in header).
- **Live Mode** — Leaders toggle "LIVE" to broadcast track changes. Pulsing red badge indicates active live session.
- **"Go to Song" Commands** — Leader taps a track, performers get a floating toast notification with "Jump to song" action.
- **Performer Integration** — LiveNotification component in perform mode; auto-dismiss after 6s; tap to jump.
- **Firestore Presence** — Subcollection with 30s heartbeat, 2-minute stale filter, auto-cleanup on unmount.

#### D2: Chart Annotation Layer
- **Freehand Drawing** — SVG overlay on PDF pages; draw with finger/stylus in normalized 0-1 coordinate space.
- **Text Annotations** — Tap to place text notes ("Breathe here", "D.S.", etc.) at any position on the chart.
- **Highlight Mode** — Semi-transparent strokes for marking passages.
- **4-Color Palette** — Red, Blue, Green, Amber.
- **Per-User Storage** — Annotations saved to `users/{uid}/annotations/{fileId}` in Firestore.
- **Auto-Save** — Debounced 800ms save after each annotation.
- **Undo / Clear Page** — Undo last annotation or clear entire page with confirmation.
- **Annotation Toolbar** — Fixed bottom toolbar with tool selection, color swatches, undo, clear, and done.

## [2.5.0] — 2026-02-16

### Performance Mode Overhaul (Phase C)

- **C1: Return Path Navigation** — Home button in perform mode returns you to where you came from (setlist or library), not the homepage.
- **C2: Swipe-Down Exit** — Swipe down from top of screen to exit perform mode with smooth slide animation.
- **C3: Performance Intro Overlay** — One-time gesture tutorial for first-time performers (tap zones, swipe navigation, exit gesture).
- **C4: Monitor Setup Wizard** — Step-by-step guided setup for X32 monitor integration (bridge URL → network scan → bus selection → musician assignment).

### Quality of Life (Phase B)

- **B1: Onboarding Flow** — Three-state system: pending users see welcome card, newly approved users get instrument setup prompt, returning users see normal homepage.
- **B2: Song Loading Skeleton** — Dark-themed loading state with song name and animated skeleton blocks replaces "No Chart Available" flash.
- **B3: Selective Print Modal** — Choose "Standard", "Just Me" (one-tap personal packet), or select specific musicians. Persists last selection.
- **B4: Compact Library Rows** — Responsive density: 7-8 visible songs on mobile (was 4). Desktop stays spacious.
- **B5: Admin Action Changelogs** — Admin actions (approve, promote, delete) logged to `admin-logs` Firestore collection with timestamp and actor.

### Cleanup & Foundation (Phase A)

- **A1: Dead Code Removal** — Deleted ~1,200 lines: 7 orphaned components, 9 unused API routes.
- **A2: API Auth Wrapper** — `withAuth()` standardizes authentication across all 28 API routes with role hierarchy (admin > leader > member).
- **A3: Console → Logger** — Migrated 125+ console statements to structured logger with production suppression.
- **A4: Navigation Consistency** — Unified mobile/desktop nav model. Dynamic 5-tab layout based on role (member, admin, monitor access).
- **A5: Theme Token Consistency** — Performance components wrapped in dark scope; AudioPlayer converted to semantic tokens.
- **A6: Admin Collapsible Sections** — Accordion sections with smart auto-expand based on pending actions.
- **A7: Empty State Illustrations** — 5 SVG illustrations for empty states (no setlists, empty folder, no results, no audio, pending account).

### Infrastructure

- **Next.js 16 Turbopack** — Added `turbopack: {}` config for compatibility.
- **Firestore Rules** — Added presence subcollection and annotation subcollection rules.
- **Test Fixes** — Fixed 4 failing tests (chord-cache version check, music-math slash chords, calculateCapo -0).
- **@testing-library/dom** — Added missing peer dependency.

## [2.2.0] — 2026-02-16

### X32 Monitor Integration & UI Restructure (Session 9)

- X32 WebSocket bridge infrastructure
- Admin dashboard with user management
- QuickMonitorPanel for performance toolbar
- UI/UX restructure across settings and navigation

## [2.0.0] — 2026-02-15

### Major Release (Sessions 1-8)

- 216 commits covering: testing infrastructure, theme system, musician profiles, Firebase migration, PWA support, transposition engine, and core library/setlist/performance features.
