# Phase 12: Auth & Routing Deep Dive & Fixes - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve role-based UI bugs, fix 403 Forbidden errors when privileged users upload files, eliminate authentication redirect loops, and document the overall authentication state flow.
</domain>

<decisions>
## Implementation Decisions

### Admin & Privileged Upload Access
- **Decision:** ALL musicians, admins, and band leaders must be able to upload sheet music. (This is a change from before).
- **Flag Syncing:** Calculate upload permission at runtime based on the user's role (e.g., `role === 'admin' || role === 'band_leader' || role === 'musician' || canUpload`) rather than syncing a flag to Firestore.
- **Legacy Code Check:** Thoroughly check the codebase for any legacy pieces preventing these roles from uploading.
- **Error Message:** Keep the error message simple: "Upload permission required."

### Redirect Cache Busting
- **Caching:** Explicitly disable caching for the `/login` page response to prevent stale cache redirect loops.
- **Loop Fallback:** Show a fallback page with a "Refresh Session" button if a user gets stuck in a redirect loop, allowing them to manually break it.
- **Logging:** Log redirect loop anomalies to the server for investigation.
- **Headers:** Use standard HTTP no-store headers rather than aggressive query params.

### Claude's Discretion
- **Auth Documentation Format:** The user did not specify the format for documenting the authentication state flow. Claude should decide the most effective format (e.g., a Markdown guide in `.planning/codebase/` with optional Mermaid diagrams) to fulfill AUTH-04.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/library/upload/route.ts`: Contains the `canUpload` check that needs expanding to support musicians, admins, and band leaders based on `ctx.auth.role`.
- `src/proxy.ts`: Contains the edge middleware that handles routing and redirects, which is where cache headers and loop detection logic should likely be applied.

### Established Patterns
- **Role Verification:** `ARCHITECTURE.md` states authorization relies on Firebase Auth custom claims and Firestore config. `ctx.auth.role` should be used to verify if a user is an admin/band leader/musician.
- **API Wrapper:** Most secure APIs use `createApiHandler` which provides `ctx.auth`.

### Integration Points
- `/api/library/upload`: Needs permission logic update.
- `/login`: Needs explicit cache-busting headers.
- Middleware / Error boundaries: Where the redirect loop fallback and logging should be implemented.
</code_context>

<specifics>
## Specific Ideas

- "all musicians and admins and band leaders should be able to upload (note: this is a change from before). Whatever is necessary for that, it needs to be made to happen. and the code should be checked to make sure there aren't any legacy pieces preventing that"
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 12-auth-routing-deep-dive-fixes*
*Context gathered: 2026-03-13*
