# ARCHITECTURE
This document outlines the high-level system design and architectural patterns of the application.

## Pattern & Data Flow
- **Framework Architecture**: Next.js App Router paradigm. Uses React Server Components (RSC) for initial fast data fetching and rendering, seamlessly mixed with Client Components (`"use client"`) for interactivity.
- **State Architecture**: 
  - Global UI Server State: Handled by React Query (`@tanstack/react-query`).
  - Global UI Client State: Handled by Zustand.
- **PWA Pattern**: Service workers handling caching for offline mode, explicitly supported via `@ducanh2912/next-pwa`.

## Layers & App Structure
1. **App Router Layer** (`src/app/`): Defines pages, layouts, and API routes.
   - Global layout (`src/app/layout.tsx`) initializes Font styling, ThemeProvider, Toaster (Sonner), ErrorBoundary, and ClientProviders.
2. **Component Layer** (`src/components/`): Modular UI components separated by feature or atomic level primitives (e.g. Radix UI wrapped components).
3. **Core Utility / Lib Layer** (`src/lib/`): Contains API wrappers, utility functions, state store definitions, and configuration (e.g. Firebase init).
4. **Hooks Layer** (`src/hooks/`): Reusable custom React hooks extracting complex business and UI logic.
5. **Types Layer** (`src/types/`): Centralized TypeScript definitions and Zod schemas.

## Entry Points
- Global Web Entry: `src/app/layout.tsx` and `src/app/page.tsx`
- Background Jobs: Inngest (`src/inngest/`)
- API Routes: Next.js API route handlers in `src/app/api/`
