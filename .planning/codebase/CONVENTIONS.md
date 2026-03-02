# CONVENTIONS
This document maps coding conventions, stylistic patterns, and error handling methods.

## Code Style & Patterns
- **React Components**: Function components with hooks. Prefer Client Components (`"use client"`) only where interactive state is required.
- **Styling**: Tailwind CSS class composition. Utility classes managed by `clsx` and `tailwind-merge` for conditional rendering and overriding defaults.
- **State Management**: Zustand for light-weight client state, React Query for server data fetching and revalidation.
- **Imports**: Usage of absolute imports (`@/components/...`, `@/lib/...`) over relative paths is standard practice here.

## Data Validation & Types
- Strict TypeScript (`"strict": true` typically enabled, checking types via `npm run check:types`).
- External and API-bound data validated by `zod` schemas.

## Error Handling
- **React Boundary**: Handled via `react-error-boundary` encapsulating sub-trees or pages to prevent complete crashes.
- **Telemetry**: Sentry integrated for tracing and monitoring unexpected runtime errors.
- **Toasts for User Feedback**: Utilizing `sonner` via `Toaster` component for showing success/error notifications natively.
