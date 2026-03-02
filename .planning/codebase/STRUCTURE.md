# STRUCTURE
This document outlines the directory layout, key locations, and naming conventions rules inside the app.

## Directory Layout
- **`src/app/`**: Next.js App Router endpoints, pages, and layouts. Nested folders represent route segments.
  - **`api/`**: Next.js route handlers.
- **`src/components/`**: React components. Often categorized by domain or atom level (e.g. Radix UI primitives vs complex views).
- **`src/hooks/`**: Custom React hooks handling client-side business logic and abstraction overlays (e.g. `use-wake-lock.ts`, `use-smart-transposer.ts`).
- **`src/lib/`**: Core utilities, data/state management.
  - `store.ts`: Zustand global client state management.
  - `api-wrapper.ts`: Fetching and API interaction logic.
- **`src/types/`**: TypeScript type definitions, interfaces, and Zod validation schemas. Shared structures like `monitor.ts`.
- **`src/inngest/`**: Inngest background functions and event-driven architecture configuration.
- **`scripts/`**: Build setup scripts (e.g., `copy-pdf-worker.js`, `update-build-info.js`, `check-types-sync.js`).

## Naming Conventions
- **Files/Folders**: Kebab-case (`kebab-case.ts/tsx/css`) for typical files.
- **Components**: PascalCase name in export, but the file may be kebab-case or PascalCase (usually kebab-case preferred for files like `use-smart-transposer.ts`, `api-wrapper.ts`, components often as `component-name.tsx`).
- **Variables/Functions**: camelCase.
- **Types/Interfaces**: PascalCase.
- **Constants/Env**: UPPER_SNAKE_CASE (e.g. `process.env.NEXT_PUBLIC_BASE_URL`).
