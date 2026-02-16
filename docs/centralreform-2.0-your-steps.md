# CentralReform 2.0 — Your Steps

## ✅ Already Done (Auto-Deployed)

Everything below has already been pushed to master and auto-deployed to Vercel:

- **210+ commits** across 6 development sessions
- Light theme (72 components), dark mode for performance
- Musician profiles with CRC ensemble presets
- Auto-transposition in performance mode
- **Sticky per-song transposition** — your preferred key for each chart persists across sessions
- Firebase Storage migration (160/180 files migrated)
- Smart prefetch, loading skeletons, chord cache management
- Component decomposition, type safety (0 TypeScript errors)
- Chord transposer accuracy improvements

---

## 🔧 Your Action Items

### 1. Deploy Firestore Security Rules (Required for Sticky Transposition)

The new `songPreferences` subcollection needs a security rule deployed. Without this, saving per-song transposition preferences will fail silently.

```bash
cd ~/path-to/sheet-music-app
firebase deploy --only firestore:rules
```

You should see output confirming the rules were deployed successfully.

### 2. Clear Chord Cache (Recommended)

Go to **Settings → Chord Cache → Clear Chord Cache**

This forces all charts to rescan with the improved algorithm that:
- Keeps separate chords like "A" and "B" from merging into "AB"
- Catches single-letter chords like "F" that were previously missed
- Reduces overlap between adjacent chord overlays

### 3. Test Sticky Transposition

1. Open any chart (e.g., Modeh Ani) in Perform mode
2. Adjust the transposition (e.g., set to -2 for D shapes)
3. You should see "saving..." then "✓ saved" in the transposer menu
4. Navigate away, then come back to the same chart
5. Your transposition should be automatically applied

**Priority chain**: If a setlist leader sets a per-track transposition, that overrides your personal preference for that setlist performance.

### 4. Firebase Migration — Check Remaining Files

Go to **Settings → Firebase Migration**. If it shows files remaining, hit "Migrate Files" again. The ~20 failed files are likely:
- Google Docs/Slides (can't export as PDF)  
- Files with restricted sharing permissions

These will be marked as failed and won't retry endlessly.

### 5. Verify Firebase Storage Serving

Open any chart in the library. Check browser dev tools (Network tab) — the response should have a header `X-Served-From: firebase-storage` instead of `google-drive`. This confirms files are being served from Firebase's CDN.

---

## What's New in 2.0

| Feature | Description |
|---------|-------------|
| **Sticky Transposition** | Your preferred key for each song persists across sessions |
| **Firebase Storage** | Files served from CDN instead of Google Drive proxy |
| **Light Theme** | Clean, modern look for browsing; dark mode auto-activates in Perform |
| **Musician Profiles** | Instrument, transposition, capo preferences per musician |
| **CRC Ensemble Presets** | Acoustic guitar, bass, mandolin, electric guitar, voice, hand drums |
| **Smart Prefetch** | Next songs preload in background for instant page turns |
| **Loading Skeletons** | Shimmer placeholders on all pages instead of blank screens |
| **Chord Accuracy** | Improved chord detection — fewer missed/merged chords |
| **Chord Cache** | Admin button to clear cached chord positions |
| **Type Safety** | 62 TypeScript errors fixed, strict mode throughout |

---

## Deferred to 2.1

- Per-musician gig packets (print transposed packets per player)
- Leader view of musician keys across a setlist
- Library redesign (search by key/artist/topic)
- Setlist editor visual polish
- Offline queue (edit setlists while offline)
- Firestore query pagination
