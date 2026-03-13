# Codebase Structure: Sheet Music App

This document outlines the file organization and key entry points within the `src/` directory.

## High-Level Directory Layout
- **`src/app/`**: Next.js App Router entry points and API backend.
- **`src/components/`**: React components. Domain-driven and modular.
- **`src/lib/`**: Core business logic, Firebase integrations, utility functions, and Zustand stores.
- **`src/types/`**: Global TypeScript types and Zod validation schemas.
- **`src/hooks/`**: Custom React hooks bridging logic and components.
- **`src/inngest/`**: Background jobs and queue handlers.

---

## Detailed Directory Breakdown

### `src/app/` (Routing & APIs)
*   **`(main)/`**: The primary user-facing shell and layout.
*   **`live/`, `perform/`**: Full-screen, distraction-free route groups tailored for live stage usage and sheet music rendering.
*   **`api/`**: The robust backend of the application, consisting of specialized serverless functions rather than Server Actions.
    *   `library/`: Endpoints to sync, search, and parse the sheet music catalog.
    *   `setlist/` & `setlists/`: PDF generation, import matrix parsing, print pipelines.
    *   `scheduling/`: Band assignments, reminders, and calendar feeds.
    *   `ai/`: Operations like transposing and OMR.
    *   `cron/`, `inngest/`: Background synchronization tasks.

### `src/components/` (UI Layer)
Structured heavily around domain boundaries:
*   **`ui/`, `layout/`, `views/`**: Reusable primitives, generic layout shells, and composite structural views.
*   **`library/`, `setlist/`, `music/`, `performance/`**: Feature-specific components (e.g., PDF rendering, chord overlays, setlist builders).
*   **`monitor/`, `audio/`**: Hardware integration components for in-ear monitor mixing and playback.
*   **`scheduling/`, `calendar/`, `people/`, `admin/`**: Roster and organizational management.

### `src/lib/` (Business Logic & State)
This directory acts as the central brain of the application, decoupling logic from React where possible.
*   **State Management**: `store.ts` (the primary Zustand store), alongside specialized stores like `monitor-store.ts`, `alert-store.ts`, `chat-store.ts`, and `library-store.ts`.
*   **Firebase Integration**: Segregated into client vs admin utilities. `firebase.ts` (Client), `firebase-admin.ts` (Server), and domain-specific wrappers (`setlist-firebase.ts`, `live-session-firebase.ts`).
*   **Music Logic**: Tools for interpreting and manipulating music (`music-math.ts`, `chord-utils.ts`, `key-detection.ts`, `pdf-chord-extractor.ts`, `pdf-transpose-renderer.ts`).
*   **Liturgical/Church Domain**: `liturgical-calendar.ts`, `liturgical-templates.ts`, `congregation-store.ts`.

### `src/types/` (Type Safety)
*   **`schemas.ts`**: Contains Zod validation schemas used across API routes and forms.
*   **`models.ts`**: Core TypeScript interfaces modeling database structures and internal objects.
*   **`monitor.ts`**: Hardware bridge typing.

---

## Key Entry Points
1. **Frontend App Shell**: `src/app/layout.tsx` and `src/app/(main)/layout.tsx`.
2. **Performance Interface**: `src/app/perform/page.tsx` is the critical entry point for musicians actively playing during a set.
3. **Primary State Store**: `src/lib/store.ts` defines `useMusicStore`, the heart of playback and UI state.
4. **Database Security**: `firestore.rules` (at project root) dictates the structural integrity and access controls of the entire data model.
