# Phase 15: Unauthorized Redirect UX Audit - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses the "bounce out" logic when users attempt to access a route they aren't authorized for. Previously, the system was aggressively bouncing users back to the dashboard (`/setlists`) or login page. This creates a confusing UX if a user clicks a legitimate link (like a shared setlist) but lacks the *highest* level of access.

The goal is to scan the entire codebase and intelligently redirect users to the closest permissible equivalent route, rather than a generic fallback, or provide clear unauthorized bounds.
</domain>

<decisions>
## Implementation Decisions

### 1. The Editor (`/setlists/[id]`)
- **Status:** Already implemented.
- **Decision:** Gracefully downgrades unauthorized users to the Performance View (`/perform/setlist/[id]`). No further action needed.

### 2. The Middleware Leader Fallback (`proxy.ts`)
- **Status:** Confirmed solid.
- **Decision:** If a Musician hits *any* leader route (`/manage`, `/admin`, etc.), the middleware intercepts it and hard-redirects them to `/setlists`. We will keep this behavior.

### 3. Sub-admin API Routes or Sub-pages
- **Status:** Needs tightening.
- **Decision:** Pages like `/settings/users`, `/monitor/admin`, and `/manage/templates` that currently redirect internally or rely on loose bounces should be tightened to return `notFound()` or an explicit custom `Unauthorized` UI component rather than bouncing the user around the application.
</decisions>

<code_context>
## Existing Code Insights

### Targets for Modification
- `src/app/(main)/settings/users/page.tsx`
- `src/app/(main)/monitor/admin/page.tsx`
- `src/app/(main)/manage/templates/page.tsx` (verify if redirecting exists)
- Any other specific Next.js page components where `redirect` is used as an auth fallback.
</code_context>

<specifics>
## Specific Ideas
- Best practice standard Tailwind UI/UX applies. If we use a custom unauthorized UI, it should match the aesthetic of `/auth-error` or be a standard 404 `notFound()`.
</specifics>

<deferred>
## Deferred Ideas
None.
</deferred>

---

*Phase: 15-unauthorized-redirect-audit*
*Context gathered: 2026-03-13*