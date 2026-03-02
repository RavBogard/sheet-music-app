# PROJECT
## Vision
Rebuild the Smart Transposer feature from scratch to be "bulletproof". The current implementation—which relies aggressively on DOM scraping via `react-pdf`'s text layer combined with a fallback AI canvas scan—is fundamentally unreliable. It drops chord extensions, misses some chords entirely, and fails to perfectly cover existing chords when rendering the transposed overlay.

## The Core Value
A musician reading a sheet music PDF must see perfectly placed, 100% accurate transposed chords overlaid exactly on top of the original chords, without the original text peeking through.

## Requirements

### Active

- [ ] High-reliability detection of all chords (including complex extensions like `A#m7b5` or `C(add9)`) from sheet music.
- [ ] Accurate bounding box calculation so the transposed chord overlays precisely cover the underlying original chord text.
- [ ] Complete replacement of the current brittle `text-scanner.ts` heuristics.
- [ ] Evaluation and implementation of a robust parsing strategy (e.g., server-side Vision API parsing, dedicated PDF parsing, or a hybrid approach with caching).
- [ ] Maintain the ability for users to manually add, edit, override, or delete chords if the automated system misses something.

### Out of Scope
- Modifying the underlying sheet music rendering library (`react-pdf`) itself.
- Changes to the native key detection or playback features.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Abandon current `text-scanner.ts` heuristics | Text layers in music PDFs are notoriously unreliable for absolute positioning and often render accidentals/extensions far away from roots. | — Pending |
| Evaluate Server-Side Vision / Dedicated OCR | We need absolute, pixel-perfect bounding boxes of what the user actually sees, which DOM text-layers cannot guarantee. | — Pending |

---
*Last updated: March 2, 2026 after initialization*
