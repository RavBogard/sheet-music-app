# Coding Conventions

**Analysis Date:** 2026-03-01

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `DashboardClient.tsx`, `HeroCard.tsx`)
- Utilities/lib: kebab-case (e.g., `chord-utils.ts`, `api-auth.ts`)
- Stores/hooks: kebab-case with functional prefix (e.g., `use-offline.ts`, `chord-cache.ts`)
- Test files: Match source filename with `.test.ts` suffix (e.g., `chord-utils.test.ts`)
- Index/barrel files: `index.ts` for grouped exports

**Functions:**
- Utility functions: camelCase (e.g., `transposeChord()`, `formatDuration()`)
- React hooks: camelCase with `use` prefix (e.g., `useOffline()`, `useMediaQuery()`)
- Component functions: PascalCase (e.g., `DashboardClient()`, `HeroCard()`)
- Higher-order functions/creators: camelCase with descriptive verb (e.g., `createApiHandler()`, `createSetlistService()`)

**Variables:**
- Local: camelCase (e.g., `upcomingSetlists`, `shouldAnimate`)
- Constants: UPPER_SNAKE_CASE (e.g., `SUPER_ADMIN_UID`, `CHORD_REGEX`)
- Unused parameters: Prefix with underscore for intentionality (e.g., `_param`)

**Types:**
- Interfaces: PascalCase with no prefix (e.g., `AuthResult`, `DashboardServerProps`)
- Type aliases: PascalCase (e.g., `Greeting`, `SetlistTrack`)
- Enums: PascalCase (e.g., `AuthRole`)

## Code Style

**Formatting:**
- Tool: ESLint 9 with Next.js config (see `eslint.config.mjs`)
- No Prettier config in root — relies on ESLint formatting rules
- TypeScript strict mode enabled (`strict: true` in tsconfig.json)
- Target: ES2017

**Linting:**
- Config: `eslint.config.mjs` using `eslint/config` with `nextVitals` and `nextTs` presets
- Disabled rules with intentional justification:
  - `react-hooks/set-state-in-effect`: Disabled for data-fetching patterns (onSnapshot callbacks, WebSocket handlers)
  - `@next/next/no-img-element`: Disabled for small avatars/icons where optimization overhead isn't warranted
  - `@typescript-eslint/no-unused-vars`: Disabled to allow underscore-prefixed parameters for intentionality
  - `@typescript-eslint/no-explicit-any`: Disabled for rapid prototyping
  - `react-hooks/exhaustive-deps`: Disabled for intentional dependency omissions

**Indentation:** 4 spaces (inferred from source files)

## Import Organization

**Order:**
1. Next.js and React imports (`import { useState } from 'react'`, `import { useRouter } from 'next/navigation'`)
2. External library imports (e.g., `from 'zustand'`, `from 'sonner'`)
3. Firebase imports (e.g., `from 'firebase/firestore'`)
4. Internal imports with `@/` alias (e.g., `from '@/lib/auth-context'`)
5. Type imports (e.g., `import type { SetlistTrack } from '@/types/models'`)

**Path Aliases:**
- `@/*` maps to `./src/*` (tsconfig.json configuration)
- Used consistently throughout for clean, absolute imports

## Error Handling

**Patterns:**
- **Try-catch blocks:** Used in async operations with structured logging
- **Logger usage:** `logger.error()` always logs even in production; `logger.warn()`, `logger.log()`, `logger.info()`, `logger.debug()` only in development (`/src/lib/logger.ts`)
- **API errors:** Thrown as `NextResponse` objects with appropriate HTTP status codes (401 for auth, 403 for authorization, 400 for validation, 500 for server errors)
- **Role-based errors:** Checked via `requireAuth()` with `AuthRole` type (admin, band_leader, musician, member) in role hierarchy
- **Validation errors:** Caught from Zod schema parsing with `safeParse()` and returned with detailed error format
- **Network errors:** Caught and logged, return null or default value depending on context

**Example patterns from `api-wrapper.ts`:**
```typescript
// Auth error handling
const authResponse = await withAuth(req, options?.role)
if (authResponse instanceof NextResponse) return authResponse

// Validation error handling
const validation = options.schema.safeParse(rawBody)
if (!validation.success) {
    return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
    )
}

// Catch-all error logging
} catch (error) {
    logger.error(`[API Wrapper Error] ${req.method} ${req.url}`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
}
```

## Logging

**Framework:** Custom logger object in `src/lib/logger.ts`

**Methods:**
- `logger.log()` - Development only
- `logger.warn()` - Development only
- `logger.error()` - Always logs (production and development)
- `logger.info()` - Development only
- `logger.debug()` - Development only

**Patterns:**
- Error logging always includes context: `logger.error('[Context] Message:', error)`
- Prefix messages with bracketed context: `[Offline]`, `[API Wrapper Error]`
- Multi-argument logging supported: `logger.error('msg', { detail }, 'extra')`

## Comments

**When to Comment:**
- Non-obvious algorithm logic (e.g., chord regex pattern explanation in `chord-utils.ts`)
- Workarounds and intentional overrides (e.g., "Capo 2 on key of E correctly" regression test comment)
- Inline explanations of business rules (e.g., "Backward compat: old 'leader' maps to band_leader")
- Section markers for large logical blocks (e.g., "// Cold-launch detection")

**JSDoc/TSDoc:**
- Used for public functions and exported modules
- Includes parameter descriptions and return type clarification
- Example from `api-auth.ts`:
```typescript
/**
 * Verify the request has a valid Firebase auth token.
 * Optionally checks that the user has the required role.
 *
 * Returns AuthResult on success, throws NextResponse on failure.
 */
export async function requireAuth(
    req: NextRequest | Request,
    requiredRole?: AuthRole
): Promise<AuthResult>
```

## Function Design

**Size:** Functions kept small (typically 5-50 lines), with complex logic broken into smaller helper functions

**Parameters:**
- Explicit destructuring for object parameters to document what's used
- Type annotations always included (TypeScript strict mode)
- Optional parameters marked with `?` and documented

**Return Values:**
- Explicit return types in all function signatures
- Use `Promise<T>` for async functions
- Union types for error cases (e.g., `Promise<AuthResult | NextResponse>`)
- Computed/derived values returned as objects (e.g., `{ offlineStatus, isDownloading, bulkProgress }` from `useOffline()`)

## Module Design

**Exports:**
- Named exports preferred over default exports (easier to refactor and code split)
- Type exports use `export type { Interface }` syntax
- Constants exported at module level

**Barrel Files:**
- Used in `/src/components/dashboard/index.ts` and `/src/components/ui/illustrations/index.ts`
- Pattern: `export { ComponentName } from "./ComponentName"`
- Allows clean import grouping: `import { HeroCard, UpcomingTimeline } from "@/components/dashboard"`

## Type Safety

**TypeScript Configuration:**
- Strict mode enabled
- `moduleResolution: "bundler"`
- `noEmit: true` (type checking only, transpilation via Next.js)
- JSX: `react-jsx` (automatic JSX runtime)

**Patterns:**
- Interface definitions at top of module before implementation
- Generic types used for reusable components (e.g., `ProtectedApiContext<P = any, B = any>`)
- Zod schemas used for runtime validation (e.g., in `createApiHandler`)

---

*Convention analysis: 2026-03-01*
