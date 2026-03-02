# Requirements: Transposer Rebuild

**Defined:** March 2, 2026
**Core Value:** A musician reading a sheet music PDF must see perfectly placed, 100% accurate transposed chords overlaid exactly on top of the original chords, without the original text peeking through.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Server-Side Vision Pipeline

- [x] **VIS-01**: Server endpoint receives a page image and requests chord bounding boxes from Vision API (Gemini/OpenAI).
- [x] **VIS-02**: Vision API prompt enforces strict JSON schema returning `[text, x, y, width, height]` for each chord.
- [x] **VIS-03**: Vision API coordinate percentages are normalized accurately relative to the source image dimensions.
- [x] **VIS-04**: Endpoint gracefully handles empty pages or pages with no discernible chords.

### Client-Side Caching & State

- [x] **STATE-01**: Client requests Vision API scan ONLY if coordinates are not found in local `idb` or global Firestore cache.
- [x] **STATE-02**: Global Firestore cache persists exact Vision API coordinates so subsequent users get instant results.
- [x] **STATE-03**: Background worker proactive scans adjacent pages (page 2, 3...) when user loads page 1.
- [x] **STATE-04**: Complete removal of `text-scanner.ts` DOM scraping logic.

### Presentation & Overlay

- [x] **UI-01**: Chords render at exact percentage coordinates returned by Vision API.
- [x] **UI-02**: Transposed chord text size automatically scales based on the visual bounding box (`width`/`height`) to fully cover the original printed chord.
- [x] **UI-03**: Overlay visually blocks underlying text (e.g., matching page background color) so original chords don't peek through.
- [x] **UI-04**: User can double-click empty space to manually insert a missing chord.
- [x] **UI-05**: User can click an existing overlay to correct the detected text, resize width, or delete it entirely.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Admin/Telemetry
- **ADM-01**: Admin dashboard tracking Vision API cost/latency metrics.
- **ADM-02**: Flagging system for users to report consistently failed automated transcriptions.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native Key Detection Rewrite | Current estimation logic is adequate once input data is accurate. No need to rewrite. |
| React-PDF Modifications | Avoids branching/forking the core PDF renderer. Overlays must stay absolutely positioned above it. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VIS-01 | Phase 1 | Complete |
| VIS-02 | Phase 1 | Complete |
| VIS-03 | Phase 1 | Complete |
| VIS-04 | Phase 1 | Complete |
| STATE-01 | Phase 2 | Complete |
| STATE-02 | Phase 2 | Complete |
| STATE-03 | Phase 2 | Complete |
| STATE-04 | Phase 2 | Complete |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 3 | Complete |
| UI-05 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: March 2, 2026*
*Last updated: March 2, 2026 after initial definition*
