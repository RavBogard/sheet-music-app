# Project Research Summary

**Project:** Transposer Rebuild
**Domain:** Optical Music Recognition / PDF Parsing
**Researched:** March 2, 2026
**Confidence:** HIGH

## Executive Summary

The current implementation of extracting musical chords from sheet music relies on `react-pdf` text layer scraping combined with an on-the-fly AI Canvas validation. This is fundamentally flawed because PDF text layers for music notation fonts frequently scramble, detach accidentals (like # and b), and present non-linear bounding boxes.

Research indicates that building a bulletproof chord transposer requires completely abandoning DOM-level text scraping. The recommended approach is **Vision-based Chord Extraction via LLM (Gemini 1.5 Pro / GPT-4o)** run *once* per document on the server, heavily cached. This produces absolute coordinates for every chord on the page by "looking" at the sheet music exactly as a human does, avoiding PDF font encoding issues entirely. The app should then use these absolute coordinates to render an overlay.

## Key Findings

### Recommended Stack

- **Extraction Model:** Google Gemini 1.5 Pro (via `@google/generative-ai` SDK) or OpenAI GPT-4o (via `openai` SDK). Both excel at spatial reasoning and OCR of non-standard layouts.
- **Image Generation:** `pdf.js` worker to render PDF pages to images entirely on the server or web worker, bypassing the DOM.
- **Storage/Caching:** Firebase Firestore + Upstash Redis.
- **Client Overlay:** Absolute positioned DOM overlays based on percentage coordinates (x/y) relative to the rendered page width/height.

### Expected Features

**Must have (table stakes):**
- 100% accurate chord detection (Root, Quality, and Extensions).
- Precise bounding boxes (x, y, width, height) to completely cover underlying text.
- Manual user overrides (add, edit, delete, resize) that take precedence over AI detections.

**Should have (competitive):**
- Proactive background scanning (scan pages 2, 3, etc., while the user reads page 1).
- Offline support (chords cached aggressively via `idb`).

### Architecture Approach

**Major components:**
1. **Server-Side Extraction Endpoint** (`/api/ai/transposer/scan`) — Receives a PDF page image, prompts the Vision API for a structured JSON array of chords and their normalized `[x, y, w, h]` bounding boxes, and returns the result.
2. **Client-Side Cache Layer** (`use-smart-transposer.ts`) — Checks `idb` / Firestore before ever hitting the server.
3. **Rendering Layer** (`SmartTransposer.tsx`) — Purely presentational. Takes an array of chords and renders them. No DOM scraping logic.

### Critical Pitfalls

1. **Vision Model Hallucinations** — Vision models can occasionally invent chords in empty white space. *Prevention*: Prompt engineering must enforce strict confidence thresholds and request specific JSON schemas.
2. **Coordinate Drift** — If the image sent to the Vision API has a different aspect ratio than the client's rendered PDF, overlays will misalign. *Prevention*: Send the image exactly as rendered by `pdf.js`, and return coordinates as percentages (`%`), not absolute pixels.
3. **Cost/Latency** — Vision APIs are slow and expensive. *Prevention*: A hybrid cache strategy. If a document is scanned once by *any* user, save the exact coordinates globally in Firestore so subsequent users get instant results.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Server-Side Vision Pipeline
**Rationale:** The foundation of the rebuild. We must prove the Vision API can accurately return coordinates for complex chords.
**Delivers:** `/api/ai/transposer/scan` endpoint and associated prompt engineering/logic.

### Phase 2: Client State & Caching Restructure
**Rationale:** The client needs to handle the new coordinate format and aggressively cache results without touching `react-pdf` text layers.
**Delivers:** Rewritten `use-smart-transposer.ts` focusing on caching and API orchestration, stripping out all `text-scanner.ts` logic.

### Phase 3: The Presentation Layer
**Rationale:** The visual overlay must perfectly cover the original chords using the new bounding box data.
**Delivers:** Updated `SmartTransposer.tsx` and manual edit controls (the popover).

### Phase Ordering Rationale
- We cannot build the client until we know exactly what data shape the Vision API will reliably return (Phase 1 first).
- We cannot build the visual overlay until the state/caching layer can feed it data (Phase 2 second).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Vision APIs are currently the industry standard for unstructured layout OCR. |
| Features | HIGH | Matches previously discussed requirements. |
| Architecture | HIGH | Separating extraction (server) from presentation (client) solves the current tight-coupling issues. |
| Pitfalls | MEDIUM | Vision coordinates can sometimes be slightly off-center; we may need a "padding" multiplier in the client presentation layer. |

**Overall confidence:** HIGH
