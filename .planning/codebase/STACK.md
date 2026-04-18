# STACK.md
# Tech Stack

This document outlines the core languages, frameworks, libraries, and infrastructure used in the CentralReform.live sheet music application.

## Core Architecture
*   **Framework:** Next.js (v16.1.4) - Utilizes React Server Components and App Router.
*   **Library:** React (v19.2.3)
*   **Language:** TypeScript / Node.js

## UI & Styling
*   **CSS Framework:** Tailwind CSS (v4)
*   **Component Library:** Radix UI (Primitives for accessibility and component behavior like Dialog, Dropdown Menu, Select, Tabs, etc.)
*   **Icons:** Lucide React
*   **Styling Utilities:** `class-variance-authority` (CVA), `tailwind-merge`, `clsx`
*   **Animations:** `tw-animate-css`

## State & Data Management
*   **Client State:** Zustand
*   **Server State & Caching:** TanStack React Query (`@tanstack/react-query`)
*   **Data Validation:** Zod

## Specialized Libraries
*   **Sheet Music Rendering:** OpenSheetMusicDisplay (OSMD)
*   **PDF Handling:** `pdfjs-dist`, `react-pdf`, `pdf-lib`
*   **Drag and Drop:** `@dnd-kit` (core, sortable, utilities)
*   **Virtualization:** TanStack React Virtual (`@tanstack/react-virtual`)
*   **Date/Time:** `date-fns`
*   **CSV Parsing:** PapaParse
*   **Search:** Fuse.js
*   **QR Codes:** `qrcode.react`

## Testing
*   **Unit/Integration:** Vitest, React Testing Library (`@testing-library/react`)
*   **End-to-End (E2E):** Playwright

## Infrastructure & Tooling
*   **Linting:** ESLint with `eslint-config-next`
*   **Deployment/Hosting:** Vercel (indicated by Next.js app structure and CDN references)
