# CentralReform.live 2.0

A modern worship music management platform for Central Reform Congregation. Built with Next.js, Firebase, and Google Drive integration.

## Features

- **Setlist Management** — Create, edit, and organize worship setlists with drag-and-drop track ordering, section headers, BPM/key metadata, and per-track notes
- **Sheet Music Library** — Browse and search Google Drive-synced music files with Firebase Storage CDN caching for fast loading
- **Performance Mode** — Full-screen PDF viewer with smart prefetch (preloads next 3 songs), swipe navigation, wake lock, and toolbar auto-hide
- **AI Chord Detection** — Gemini-powered OCR detects chords on lead sheets and overlays transposed chord symbols
- **Auto-Transposition** — Musician profiles with instrument presets (Bb Trumpet, Eb Alto Sax, etc.) auto-apply transposition in performance mode
- **Print Gig Packets** — Generate per-musician PDF packets with correct transpositions
- **Light/Dark Theme** — Light theme default for editing, automatic dark mode for performance
- **PWA Offline** — Workbox caches PDFs and Firebase Storage files for 30-day offline access
- **AI Chat Assistant** — Natural language setlist management (create, add songs, schedule)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Auth**: Firebase Auth
- **Database**: Firestore
- **Storage**: Firebase Storage (CDN) + Google Drive (intake)
- **AI**: Google Gemini (OCR, chat)
- **Testing**: Vitest (13 test files, 200+ cases)
- **Deploy**: Vercel

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # Run test suite
```

## Environment Variables

```
GOOGLE_CREDENTIALS_JSON=...
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
GEMINI_API_KEY=...
```

## Architecture

```
src/
├── app/                 # Next.js App Router pages
│   ├── (main)/          # Main layout (nav, sidebar)
│   ├── perform/         # Performance mode (full-screen)
│   └── api/             # API routes (Drive, AI, library)
├── components/
│   ├── setlist/         # Setlist dashboard, editor, track items
│   ├── library/         # Song charts browser
│   ├── music/           # PDF viewer, transposer, tuner
│   ├── performance/     # Toolbar, drawer, metronome
│   ├── settings/        # User preferences, musician profiles
│   ├── admin/           # Data integrity, user management
│   └── ui/              # shadcn/ui primitives
├── lib/                 # Shared utilities
│   ├── store.ts         # Zustand music state
│   ├── chord-utils.ts   # Shared chord detection
│   ├── prefetch.ts      # Smart PDF prefetching
│   ├── music-math.ts    # Transposition, key estimation
│   └── google-drive.ts  # Drive API client
├── hooks/               # Custom React hooks
└── types/               # TypeScript interfaces
```
