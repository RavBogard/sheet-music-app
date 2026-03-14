---
wave: 1
depends_on: []
files_modified:
  - "src/lib/auth-context.tsx"
  - "src/app/api/library/upload/route.ts"
  - "src/proxy.ts"
  - "src/app/auth-error/page.tsx"
  - ".planning/codebase/AUTH-ROUTING-FLOW.md"
autonomous: true
---

# Phase 12 Plan: Auth & Routing Deep Dive & Fixes

## Requirements Addressed
- **AUTH-04**: Perform a deep dive analysis of role-based routing, UI gating, and authentication state flow.
- **AUTH-07**: Investigate and fix 403 Forbidden error when Admins upload files to `/api/library/upload`.

## Verification Criteria
- [ ] Users with `musician`, `band_leader`, and `admin` roles can successfully upload files via the UI without a `403 Forbidden` error.
- [ ] Direct API requests to `/api/library/upload` by `member` or `pending` users are rejected with `403 Forbidden` and "Upload permission required." message.
- [ ] Redirect responses from `src/proxy.ts` contain `Cache-Control: no-store, must-revalidate, max-age=0` headers.
- [ ] An artificial redirect loop between `/login` and a protected route tracks bounce count and safely routes the user to the `/auth-error` fallback page.
- [ ] The `/auth-error` fallback page correctly clears session state and logs the user out when "Refresh Session" is clicked, while adhering to the `ui-ux-pro-max` design guidelines (accessible buttons, clean layout).
- [ ] `.planning/codebase/AUTH-ROUTING-FLOW.md` is authored and accurately describes the authentication state flow.

## must_haves
- All upload authorization must be derived securely from `ctx.auth` (on the server) and `profile` + claims (on the client).
- The `canUpload` boolean in `auth-context.tsx` must encompass `isMusician`.
- Redirect loop detection must rely on a short-lived cookie or server-side state within `src/proxy.ts`.
- `AUTH-ROUTING-FLOW.md` must clearly document the token lifecycle, edge middleware routing, client-side state, and API security mechanisms.

## Tasks

<tasks>
<task>
  <id>12-1</id>
  <title>Update Upload Authorization (Frontend & Backend)</title>
  <description>Update `src/app/api/library/upload/route.ts` to allow upload if `ctx.auth.isAdmin || ctx.auth.isBandLeader || ctx.auth.isMusician`, falling back to `userDoc.data()?.canUpload` only if false. Update `src/lib/auth-context.tsx` so `canUpload` also includes `isMusician`.</description>
</task>
<task>
  <id>12-2</id>
  <title>Inject Cache-Busting Headers in Edge Middleware</title>
  <description>Update `src/proxy.ts` to append `Cache-Control: no-store, must-revalidate, max-age=0` to `NextResponse.redirect` objects handling auth boundaries (like `/login` to protected routes and vice versa).</description>
  <dependencies>
    <dependency>12-1</dependency>
  </dependencies>
</task>
<task>
  <id>12-3</id>
  <title>Implement Redirect Loop Detection and Fallback Page</title>
  <description>In `src/proxy.ts`, track redirect bounces using a short-lived cookie. If bounces exceed a threshold (e.g., 3), log the error and redirect to a new `/auth-error` route. Create `src/app/auth-error/page.tsx` displaying a user-friendly error message and a "Refresh Session" button that calls `/api/logout` and clears local state. Ensure the UI for this page follows the `ui-ux-pro-max` guidelines for accessibility and clean layout.</description>
  <dependencies>
    <dependency>12-2</dependency>
  </dependencies>
</task>
<task>
  <id>12-4</id>
  <title>Author Authentication State Flow Documentation</title>
  <description>Create `.planning/codebase/AUTH-ROUTING-FLOW.md` comprehensively describing the token lifecycle, edge middleware (`src/proxy.ts`), API security (`src/lib/api-auth.ts`), client-side state (`auth-context.tsx`), and the newly added redirect loop fallback mechanism.</description>
</task>
</tasks>
