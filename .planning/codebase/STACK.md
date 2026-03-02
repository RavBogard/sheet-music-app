# STACK
This document maps the core technologies, frameworks, and dependencies used in this project.

## Core Runtime & Frameworks
- **Framework**: Next.js 16.1.4 (App Router)
- **UI Library**: React 19.2.3
- **Language**: TypeScript 5
- **Package Manager**: npm (implied by package.json structure)
- **Node Environment**: Node.js v20+

## Styling & Typography
- **CSS Framework**: Tailwind CSS v4
- **Component Primitives**: Radix UI
- **Design System/Styling Utilities**: `clsx`, `tailwind-merge`, `class-variance-authority` (cva)
- **Fonts**: `next/font/google` (Geist Sans, Geist Mono, DM Serif Display)
- **Icons**: `lucide-react`
- **Animations**: `tw-animate-css`

## Data Fetching & State Management
- **Local State**: Zustand v5
- **Server Data/Caching**: React Query (`@tanstack/react-query`) v5
- **Database/Local Storage**: `idb` (IndexedDB for offline capabilities)

## Key Libraries & Utilities
- **Drag & Drop**: `@dnd-kit/core`, `@dnd-kit/sortable`
- **Date/Time Parsing**: `date-fns`
- **Data Parsing/Exporting**: `papaparse` (CSV), `jszip` (ZIP files)
- **Search**: `fuse.js`
- **Sheet Music Rendering**: `opensheetmusicdisplay`
- **PDF Processing**: `pdf-lib`, `pdfjs-dist`, `react-pdf`
- **Validation**: `zod`

## Features & PWA
- **PWA Support**: `@ducanh2912/next-pwa`
- **Notifications**: `sonner` (Toaster)

## Build & Tooling
- **Linting**: ESLint (Next.js config)
- **Build Scripts**: Custom scripts (`scripts/update-build-info.js`, `scripts/copy-pdf-worker.js`)
