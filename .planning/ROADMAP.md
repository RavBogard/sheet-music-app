# Roadmap: Transposer Rebuild

## Overview

Rebuilding the Smart Transposer feature from the ground up to replace unreliable DOM text scraping with a state-of-the-art server-side Vision API pipeline. The journey involves building the backend extraction endpoint, restructuring the client caching layer to support percentage-based absolute coordinates, and finally rebuilding the visual overlay presentation layer.

## Phases

- [x] **Phase 1: Server-Side Vision Pipeline** - Build the endpoint to extract precise bounding boxes from PDF page images using Vision APIs. (completed 2026-03-02)
- [ ] **Phase 2: Client State & Caching Restructure** - Scraping removed; caching architecture updated to proactively store and retrieve absolute coordinates.
- [ ] **Phase 3: Formatting & Presentation Layer** - Rebuild the visual overlay and manual edit workflows using the new percentage-based coordinates.

## Phase Details

### Phase 1: Server-Side Vision Pipeline
**Goal**: The server can ingest an image of a sheet music page and reliably return an array of chords with their normalized percentage bounding boxes.
**Depends on**: Nothing
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04
**Success Criteria** (what must be TRUE):
  1. Server endpoint `/api/ai/transposer/scan` successfully responds to a `POST` request containing a base64 image.
  2. The returned JSON strictly matches the schema `[{ text: "C", x: 10, y: 15, w: 5, h: 3 }]`.
  3. Empty or non-musical pages return an empty array without throwing a 500 error.
**Plans**: 1 plan

Plans:
- [ ] 01-01-PLAN.md — Build the Next.js API route for the Vision pipeline

### Phase 2: Client State & Caching Restructure
**Goal**: The client requests Vision API scans entirely separate from the DOM rendering logic, caches the results aggressively, and strips out `text-scanner.ts`.
**Depends on**: Phase 1
**Requirements**: STATE-01, STATE-02, STATE-03, STATE-04
**Success Criteria** (what must be TRUE):
  1. Loading a previously scanned PDF page triggers zero Vision API calls (loads from cache).
  2. The `text-scanner.ts` utility file is completely removed or bypassed.
  3. The `useSmartTransposer` hook correctly orchestrates the async call to the new Phase 1 endpoint.
**Plans**: TBD

Plans:
- [ ] 02-01: Remove `text-scanner.ts` references and rewrite `use-smart-transposer.ts` data fetching flow.
- [ ] 02-02: Implement global Firestore cache and proactive background scanning for adjacent pages.

### Phase 3: Formatting & Presentation Layer
**Goal**: The visual overlay perfectly covers the original chords without the original text peeking through, and users can manually override the detections.
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Transposed chords appear exactly where the original chords are printed, using absolute percentage positioning.
  2. The visual bounding box obscures the original text completely.
  3. Double-clicking empty space opens the popover to add a manual chord.
  4. Clicking an existing chord overlay opens the popover to edit, resize, or delete it.
**Plans**: TBD

Plans:
- [ ] 03-01: Rebuild `SmartTransposer.tsx` absolute percentage rendering and size matching.
- [ ] 03-02: Wire up manual edit popover handlers (add/edit/delete/resize).

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Server-Side Vision Pipeline | 1/1 | Complete    | 2026-03-02 |
| 2. Client State & Caching Restructure | 0/2 | Not started | - |
| 3. Formatting & Presentation Layer | 0/2 | Not started | - |
