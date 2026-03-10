# Project: sheet-music-app (CentralReform.live)

## What This Is

A web app for Central Reform Congregation's worship band that musicians load on tablets, iPads, and phones to manage setlists, view and live-transpose charts, and adjust monitor mixes on the fly. Used during live services, rehearsals, and community jam events where anyone can pull up the setlist and charts on their own device.

## Core Value

Musicians can instantly access setlists, transpose charts to their instrument, and control their monitor mix — all live on any device, no paper or prep needed.

## Current State

| Attribute | Value |
|-----------|-------|
| Version | 1.3.1 |
| Status | Production |
| Last Updated | 2026-03-10 |

**Production URLs:**
- CentralReform.live: Main application

## Requirements

### Validated (Shipped)

- [x] Setlist management with drag-and-drop ordering, sections, BPM/key metadata
- [x] Sheet music library synced from Google Drive with Firebase Storage CDN
- [x] Performance mode full-screen PDF viewer with smart prefetch and swipe nav
- [x] AI chord detection via Gemini OCR with transposed chord overlays
- [x] Auto-transposition with musician profiles and instrument presets
- [x] Print gig packets with per-musician transpositions
- [x] Light/dark theme with auto dark mode for performance
- [x] PWA offline support with 30-day Workbox caching
- [x] AI chat assistant for natural language setlist management
- [x] v1.3 Bugsweep: codebase audit, security fixes, backend hardening, frontend robustness — Phase 1-4
- [x] v1.3.1 Regression fixes: cache-busted PDF worker, iPad monitor connection stability

### Active (In Progress)

- None (milestone complete)

### Planned (Next)

- [ ] To be defined during planning

### Out of Scope

- To be identified during planning

## Target Users

**Primary:** CRC worship band musicians
- Use tablets/iPads on music stands during live services
- Need instant transposition for their instrument (Bb trumpet, Eb sax, etc.)
- Need monitor mix control without leaving their position

**Secondary:** Community jam participants
- Load setlists and charts on personal phones
- Need simple read-only access to current song/chart

## Context

**Business Context:**
Central Reform Congregation worship services and rehearsals. Also used for community jam events with broader participation.

**Technical Context:**
- Next.js 16 (App Router) on Vercel
- Firebase (Auth, Firestore, Storage)
- Google Drive for file intake
- Gemini AI for chord detection and chat
- PWA for offline tablet/phone use

## Constraints

### Technical Constraints
- Must run on Vercel serverless
- Must work offline (PWA) for unreliable venue WiFi
- Must perform well on tablets and phones (touch-first)
- Firebase ecosystem for auth, database, storage

### Business Constraints
- Single congregation use case (CRC)
- Musicians are not technical — UX must be frictionless

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16 | App Router |
| UI | Tailwind CSS 4 + shadcn/ui | |
| State | Zustand | |
| Auth | Firebase Auth | |
| Database | Firestore | |
| Storage | Firebase Storage (CDN) + Google Drive (intake) | |
| AI | Google Gemini | OCR, chat |
| Testing | Vitest + Playwright | 640+ tests |
| Deploy | Vercel | |

## Links

| Resource | URL |
|----------|-----|
| Repository | https://github.com/RavBogard/sheet-music-app |
| Production | CentralReform.live |

## Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| withAiSlot as preferred AI concurrency API | Phase 2 | Pattern for all future AI callers |
| Drive timeout via Promise.race | Phase 2 | googleapis doesn't support AbortSignal |
| uploadToStorage keeps throwing, reads get StorageResult | Phase 3 | Consistent pattern for Storage callers |
| Missing context tracked in AI prompt (not silent) | Phase 3 | AI responses note missing data sources |
| BroadcastChannel for cross-tab cache invalidation | Phase 3 | Tabs stay in sync after library sync |
| Ref-based callbacks for effect dep stability | Phase 4 | Pattern for all hooks with callback deps |
| Broadened useSafeFirestoreSync ref type to DocumentData | Phase 4 | Eliminates all caller `as any` casts |
| SectionErrorBoundary for admin crash isolation | Phase 4 | Sections fail independently |
| pdfjs.version in worker URL for cache busting | v1.3.1 | Prevents stale worker mismatch after deploys |
| Ref-based uid tracking in useMonitorConnection | v1.3.1 | Prevents effect churn during iPad auth token refresh |
| visibilitychange as iOS Safari reconnection trigger | v1.3.1 | beforeunload doesn't fire on iOS Safari |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-03-10 after v1.3.1 Phase 1 (regression fixes)*
