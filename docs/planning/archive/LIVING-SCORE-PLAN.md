# The Living Score

## The Vision

Right now, a lead sheet is scanned once and the result is frozen forever — right or wrong. What if instead, every lead sheet was a **living document** that got smarter across three layers:

1. **Instant** — the text layer gives you something in milliseconds
2. **Self-healing** — AI silently corrects mistakes within seconds
3. **Teachable** — your touch teaches it what it missed, permanently

The musician never waits, never opens a menu, never types a chord name. The score just... learns.

---

## What the Musician Experiences

### Opening a chart for the first time

You open Yedid Nefesh. Chords appear instantly — Am, C, Dm, the ones the text layer got right. Two seconds later, without any action from you, the "A" that should have been "Am" quietly fades to "Am". A "Dm" that was missing fades into existence at the right spot. The score heals itself while you watch.

A subtle shimmer animation (a brief purple pulse) marks each correction so you notice it happened, but it's not jarring. It feels like the page is waking up.

**Under the hood**: The text-layer scan ran instantly. Simultaneously, a low-res image of the full page was sent to Gemini. When the AI response arrived ~2 seconds later, the system compared every chord position and silently patched in corrections and additions.

### Noticing something still wrong

It's rare after the AI pass, but let's say the "Gm Dm Bb C" cluster at the bottom of Yedid Nefesh page 1 was partially missed. You see the gap.

You **tap the empty spot** on the page where the chord should be.

A small circular pulse appears under your finger — confirmation the system heard you. Within one second, the chord materializes: "Bb". It fades in with that same purple shimmer. Done. One tap, one second, no menus.

**Under the hood**: Your tap coordinates were mapped to the PDF page. The system cropped a 200×100px region around your tap from the rendered canvas, sent it to Gemini with context ("This is a lead sheet. What chord symbol, if any, is at the center of this image region?"), got back "Bb", and placed it. The correction is saved as a **user override** that will never be overwritten by future scans.

### Noticing a wrong chord

The transposer shows "A" but you can see it should be "Am". You **tap the wrong chord overlay**.

A small popover appears directly below the chord with 4-5 options:

```
┌─────────────────────────┐
│  Am   A7   Amaj7   Am7  │
│  ────────────────────    │
│  ✏️ Type custom          │
└─────────────────────────┘
```

The suggestions are generated from:
- What Gemini sees at that exact position (re-examined on tap)
- Music theory: given the key (Em) and surrounding chords, "Am" is far more likely than "A"
- Common corrections: the system knows "A→Am" is the #1 most common text-layer error

You tap "Am". The chord updates instantly. The popover vanishes. One tap to open, one tap to fix. The correction is permanently saved.

### In performance mode

During a live service, you're not fixing chords — you're playing. The "tap to fix" interaction is **automatically disabled during live mode** (the `liveState.enabled` flag already exists). Chord overlays revert to `pointer-events-none`. Zero risk of accidental edits during performance.

You fix charts during rehearsal. They stay fixed for the service.

---

## The Three-Layer Architecture

### Layer 1: Instant Scan (0ms)

What exists today, but improved:

**Better merge heuristics** for the #1 failure mode: "A" + "m" = "Am". The current merge algorithm has 5 passes with pixel-distance thresholds. The specific fix: when a standalone "m" or "dim" or "sus" span appears within 3x character-height of a root note (A-G), absorb it unconditionally. This is more aggressive than the current threshold but the false-positive rate is near zero — standalone "m" next to a capital letter on a lead sheet is virtually always a chord quality.

This alone would fix the "dropped minor" bug in both screenshots.

### Layer 2: AI Validation (1-3 seconds, automatic)

The breakthrough change. After text-layer results are shown:

1. Render the page to a canvas at 1200px width
2. Convert to JPEG at quality 0.7 (~80KB)
3. Send ONE image to Gemini with this prompt:

```
You are verifying chord detection on a lead sheet page.

I already detected these chords:
- "Am" at x=12%, y=15%
- "C" at x=35%, y=15%
- "Dm" at x=55%, y=15%
[... etc]

Look at the actual page image. For each chord I detected,
confirm or correct it. Then list any chords I MISSED with
their positions.

Return JSON:
{
  "corrections": [
    { "position": {"x": 12, "y": 15}, "was": "A", "shouldBe": "Am" }
  ],
  "additions": [
    { "text": "Bb", "x": 52, "y": 78 }
  ],
  "confirmed": 14
}
```

This is radically cheaper and more accurate than the current strip-based approach because:
- **One API call** instead of N strips
- **Gemini sees the full context** — staff lines, lyrics, chord relationships
- **Our first draft helps Gemini** — it's not extracting from scratch, just verifying
- **Cost: ~$0.002 per page** (one image, small JSON response)

When the AI response arrives, corrections and additions animate in. The merged result is cached with a confidence flag: `scanMethod: 'textLayer+aiValidated'`.

### Layer 3: User Corrections (on tap, permanent)

The chord overlay switches from `pointer-events-none` to interactive when:
- Transposer is enabled, AND
- Live mode is NOT active

**Tap empty space** → "Add missing chord" flow:
1. Crop region from canvas
2. Send to Gemini: "What chord is here?"
3. Place the chord
4. Save as user override

**Tap existing chord** → "Fix chord" popover:
1. Show 4-5 AI + music-theory suggestions
2. One tap to select
3. Save as user override

**User overrides** are stored in a separate field in the chord cache:

```ts
{
  chords: [...],           // From scan
  userOverrides: {         // From human corrections
    "12.5,15.2": "Am",    // keyed by approximate position
    "52.0,78.1": "Bb",    // additions
  },
  scanMethod: 'textLayer+aiValidated+userCorrected'
}
```

User overrides are **sacred** — they are never replaced by future automated scans. When the page is loaded, overrides are applied on top of whatever the scanner found. If you said it's "Am", it stays "Am" forever until you change it.

---

## The Confidence Cascade

Every chord has an implicit confidence level:

| Source | Confidence | Behavior |
|--------|-----------|----------|
| Text layer only | 0.6 | Shown immediately. Eligible for AI correction. |
| Text layer + AI confirmed | 0.95 | Shown with confidence. Cached permanently. |
| AI corrected | 0.9 | Animated in as correction. Cached. |
| AI added (was missing) | 0.85 | Faded in as new. Cached. |
| User override | 1.0 | Sacred. Never replaced. |

When `CACHE_VERSION` is bumped (scanner algorithm changes), entries at confidence < 0.9 are automatically re-scanned. User overrides survive all cache clears.

---

## What About the Raster Fallback?

The current image-strip pipeline (line-scanner.ts → crop N strips → N Gemini calls) is completely replaced by Layer 2. The full-page AI validation already handles raster PDFs — if the text layer returns zero chords, the AI pass becomes the primary extractor rather than a validator. Same one-call architecture, same prompt (just without the "I already detected these" preamble).

The line-scanner.ts (~170 lines) gets deleted entirely.

---

## Implementation Phases

### Phase A: Self-Healing Scan (the big one)
- Full-page AI validation running in parallel with text-layer scan
- Correction animation (fade-in / text-swap with purple shimmer)
- Merged caching with `scanMethod` field
- Delete line-scanner.ts and strip-based fallback
- **This alone fixes 90% of the problem.**

### Phase B: Tap-to-Fix
- Switch overlay from `pointer-events-none` to interactive (when not live)
- Tap empty space → region crop → AI → add chord
- Tap existing chord → popover with AI suggestions
- User override storage and persistence

### Phase C: Merge Heuristic Hardening
- More aggressive "m" absorption in text-scanner.ts
- The quick-win that reduces the need for AI corrections
- Makes Layer 1 better so Layer 2 has less work to do

---

## What Makes This Different

Most chord detection systems are **scan once, pray it's right**. This is **scan, verify, learn** — three layers that compound:

- **Layer 1** gets you 80% of chords instantly
- **Layer 2** silently patches it to 97% within seconds
- **Layer 3** lets the musician teach the last 3%, permanently

The musician's experience is: chords appear fast, get better on their own, and if I notice something wrong, I tap it and it's fixed forever.

No menus. No settings. No "re-scan" buttons. The score just learns.
