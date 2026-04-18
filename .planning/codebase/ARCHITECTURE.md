# Architecture: Sheet Music App

This document outlines the high-level system design for the `sheet-music-app`.

## Core Framework
- **Next.js App Router**: The application uses the Next.js `app` router paradigm (`src/app/`).
- **Serverless API Routes**: Instead of relying heavily on Next.js Server Actions, the application utilizes Next.js API Routes (`src/app/api/...`) to execute secure server-side logic (e.g., `ai`, `cron`, `library`, `scheduling`, `setlist`, `push`). 
- **React Client Components**: Extensive use of client-side state, meaning much of the interactive performance interface relies on `"use client"` directives.

## State Management
- **Zustand Stores**: Global client-state is managed through Zustand (`src/lib/store.ts`, `src/lib/alert-store.ts`, `src/lib/monitor-store.ts`, etc.). The central `useMusicStore` handles core domain logic like playback queues, AI parsing states, real-time syncing status, and audio metadata.
- **Firebase Firestore (Real-time)**: Live synchronization for features like "follow-the-leader" relies on direct Firestore subscriptions (e.g., `onSnapshot` in `src/lib/live-session-firebase.ts`). The `live_sessions` collection tracks active broadcasters (publishing `queueIndex`, `currentVisiblePage`) allowing client listeners to instantly follow along.

## Database: Firestore Data Model
Firestore acts as both the primary database and real-time transport layer. Operations are tightly controlled through robust security rules (`firestore.rules`), implementing Role-Based Access Control (Admin, Band Leader, Musician, Member, Sound Engineer).

**Key Collections:**
1. `setlists`: The root collection for performance events. Contains subcollections like `presence` and `history`.
2. `users`: Stores user preferences (`songPreferences`, `annotations`, `notifications`).
3. `library_index`: A server-owned indexing collection (writes happen via Admin SDK on API routes) to maintain catalog integrity.
4. `live_sessions`: Ephemeral documents mapping `{setlistId}_{broadcasterId}` tracking active live broadcast state.
5. `monitor-live`: Transport layer for hardware bridging (e.g. Behringer mixer control via iPad commands).
6. **Task & Analytics**: Server-managed collections (`tasks`, `auditLogs`, `setlists/{id}/emailEvents`, `songUsage`, `scheduling_assignments`) where clients read directly, but only API routes (Admin SDK) write.

## Authentication & Authorization
- **Firebase Authentication**: Standard Firebase auth for user identity.
- **Custom Claims & Config**: Authorization is resolved either via custom token claims or configuration documents (`config/admins`, `config/congregation`).
- **Client vs Admin SDK**: Clients read directly from Firestore via Firebase Client SDK (enforced by `firestore.rules`). Privileged actions (e.g. syncing the library, assigning schedules, updating tasks) are delegated to `/api` routes that utilize the `firebase-admin` SDK to bypass rules securely.

## Specialized Sub-systems
- **Bridge Integration**: Connects the web app to local hardware/audio interfaces via the `/api/bridge` setup and the `monitor-live` Firebase transport.
- **AI Processing**: Dedicated API routes (`/api/ai/...`) handle background AI tasks like chord validation, optical music recognition (OMR), and transposing.
- **Background Jobs (Inngest / Cron)**: Scheduled maintenance, database syncing, and scheduled reminders run through Vercel Cron or Inngest pipelines hitting Next.js endpoints.
