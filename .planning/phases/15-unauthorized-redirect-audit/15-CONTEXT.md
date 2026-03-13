# Phase 15: Unauthorized Redirect UX Audit - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses the "bounce out" logic when users attempt to access a route they aren't authorized for. Previously, the system was aggressively bouncing users back to the dashboard (`/setlists`) or login page. This creates a confusing UX if a user clicks a legitimate link (like a shared setlist) but lacks the *highest* level of access (e.g. they only have view access but clicked an edit link). 

The goal is to scan the entire codebase and intelligently redirect users to the closest permissible equivalent route, rather than a generic fallback.

</domain>

<decisions>
## Implementation Decisions

### Graceful Downgrading
- **Decision:** Scan all Next.js Server Components and `proxy.ts` for `redirect('/setlists')` and `redirect('/login')`.
- **Decision:** Instead of hard bouncing to the dashboard, check if there is a read-only equivalent route they *can* access. 
- Example: If a Musician hits `/setlists/[id]` (Editor), they should be routed to `/perform/setlist/[id]` (Performance View) instead of `/setlists` (Dashboard). *(This specific case was just fixed, but we will scan for others).*

</decisions>

<code_context>
## Existing Code Insights

### Targets for Modification
- `src/proxy.ts`
- `src/app/(main)/manage/page.tsx`
- `src/app/(main)/monitor/page.tsx`
- `src/app/(main)/setlists/page.tsx`
- `src/app/perform/setlist/[id]/page.tsx`
- `src/app/api/...` (API routes returning 401/403)

</code_context>

---

*Phase: 15-unauthorized-redirect-audit*
*Context gathered: 2026-03-13*