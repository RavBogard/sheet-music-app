# Pitfalls Research: Auth & Access Audit (RBAC)

**Domain:** Authentication, RBAC, Firebase, Next.js App Router
**Researched:** 2026-03-13
**Confidence:** HIGH (verified with Next.js 15/16 patterns and Firebase SDK documentation)

## Critical Pitfalls

### Pitfall 1: The "Stale Cookie" Desync (Session Bleed)

**What goes wrong:**
The Firebase Client SDK automatically refreshes the ID token every hour. However, the HTTP-only cookie used by Next.js Server Components/Middleware remains stale. The user appears "logged in" on the client but the server rejects requests with a 401/403 or falls back to "unauthenticated" state.

**Why it happens:**
Next.js Server Components cannot see the client-side Firebase Auth state directly. They rely on cookies. Developers often forget to sync the refreshed token from `onIdTokenChanged` back to the server via a `POST` or Server Action.

**How to avoid:**
Implement an `AuthProvider` that listens to `onIdTokenChanged`. When the token changes, immediately trigger a fetch/Server Action to update the session cookie.
```javascript
useEffect(() => {
  return onIdTokenChanged(auth, async (user) => {
    const token = user ? await user.getIdToken() : null;
    await fetch('/api/auth/sync', { method: 'POST', body: JSON.stringify({ token }) });
  });
}, []);
```

**Warning signs:**
Users reporting they are suddenly "logged out" while actively using the app, or "Permission Denied" errors that resolve only after a manual page refresh.

**Phase to address:**
AUTH-AUDIT-01 (Session Hardening)

---

### Pitfall 2: Custom Claim Propagation Lag (Role Bleed)

**What goes wrong:**
When an Admin upgrades a "Musician" to "Band Leader" in Firebase, the change is NOT immediate for the user. They retain their old "Musician" permissions for up to 1 hour because their active JWT ID token still contains the old claims.

**Why it happens:**
Firebase ID tokens are stateless JWTs. Claims are only refreshed when a new token is minted.

**How to avoid:**
1. Force a token refresh on the client after a role change using `user.getIdToken(true)`.
2. For high-security actions (e.g. deleting a setlist), don't just check the JWT; perform a real-time Firestore lookup of the user's role.

**Warning signs:**
"I promoted them but they still can't see the Edit button," or worse, "I demoted them but they can still edit for another hour."

**Phase to address:**
RBAC-01 (Strict Edit Visibility)

---

### Pitfall 3: Next.js App Router Cache Leak (The "Ghost Admin" UI)

**What goes wrong:**
A "Musician" user logs out, and an "Admin" logs in on the same browser. Due to the App Router's client-side "Router Cache," the Musician might see segments of the Admin's UI (or vice versa) because Next.js cached the layout segments in the browser.

**Why it happens:**
The App Router caches prefetched and visited segments to make navigation instant. It doesn't automatically clear this cache on logout unless directed.

**How to avoid:**
1. Call `router.refresh()` after every login/logout.
2. Ensure the logout logic clears all local state and triggers a hard redirect or `window.location.reload()` for maximum safety.

**Warning signs:**
UI elements from a previous session appearing briefly after switching accounts.

**Phase to address:**
AUTH-ROBUST (Sign-in Hardening)

---

### Pitfall 4: Static Rendering Authorization Leak

**What goes wrong:**
A page that should be protected (e.g. `/setlist/[id]/edit`) is accidentally statically optimized (SSG) by Next.js because it doesn't use dynamic functions like `cookies()`. The "Admin" UI structure is baked into the static HTML and served to everyone.

**Why it happens:**
Next.js tries to be "static by default." If a page doesn't explicitly opt-into dynamic rendering, the build-time version is served.

**How to avoid:**
Always call `cookies()` or `headers()` inside Server Components that perform RBAC checks. This forces the page into **Dynamic Rendering** mode, ensuring the auth check runs on every request.

**Warning signs:**
The "Edit" button appearing for a split second for everyone before "disappearing" (if hidden via client-side JS), or the button being visible in the "View Source" of the page.

**Phase to address:**
RBAC-01 / UI-UX-01 (Feature Filtering)

---

### Pitfall 5: Bypassing RBAC via Server Actions/API Routes

**What goes wrong:**
The developer hides the "Delete Setlist" button for Musicians, but forgets to protect the `deleteSetlistAction` Server Action. A savvy user can trigger the action directly via the browser console or a tool like Postman.

**Why it happens:**
Focusing on "UI visibility" instead of "Data integrity."

**How to avoid:**
Implement a "Double-Lock" strategy:
1. **UI Lock:** Hide the button in the component.
2. **Logic Lock:** The very first line of the Server Action/API Route MUST verify the user's role using `getAuth()` and `verifyIdToken()`.

**Warning signs:**
Audit logs showing unauthorized roles performing sensitive actions.

**Phase to address:**
RBAC-01 / RBAC-02 (Visibility & Enforcement)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| **Hardcoded Admin UIDs** | Fast to implement, bypasses RBAC complexity. | Security risk, hard to maintain as team grows. | **Never.** (Currently identified as a concern in `CONCERNS.md`). |
| **Client-only Role Checks** | Easier to code (no Server Component logic). | Extremely easy to bypass; leaks UI structure. | Only for non-sensitive UI-only toggles. |
| **Middleware-only Auth** | Centralized, "set and forget." | Doesn't protect sub-components or nested actions. | As a first line of defense, but not the only one. |
| **Legacy Role Mappings** | Maintains backward compatibility. | Logic "bloat," confusion about which role is current. | During transition periods only (max 1-2 milestones). |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Firebase Auth** | Relying on `onAuthStateChanged` for server-side auth. | Use Session Cookies + Firebase Admin SDK in Middleware/Server Components. |
| **Firestore** | Forgetting to sync Firestore Security Rules with app roles. | Ensure Firestore rules mirror the RBAC logic (e.g. `request.auth.token.role == 'admin'`). |
| **Google Drive** | Direct client-side access to files. | Proxy via a Server Action to check app-level RBAC before serving the file link. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Real-time Role Lookups** | High Firestore read costs, slow page loads. | Use Custom Claims in the JWT for fast, stateless role checks. | > 1,000 users/month |
| **Unpaginated User Audits** | "Admin" page hangs or crashes on load. | Implement pagination for user management and audit logs. | > 100 users |
| **Heavy Auth Contexts** | Entire app re-renders on every auth state change. | Split Auth state into small, focused contexts or use `useOptimistic` for UI. | Any scale |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Exposing Role Logic in Client** | Users can see what roles exist and target vulnerabilities. | Keep detailed role logic on the server; only send boolean flags (e.g. `canEdit`) to client. |
| **Weak Session Expiry** | Sessions lasting weeks on public/shared devices. | Use shorter session cookie expiry (e.g. 24h) and force re-auth for sensitive actions. |
| **Token Theft via LocalStorage** | Cross-Site Scripting (XSS) can steal the ID token. | Use `httpOnly` cookies for the primary session, never store raw tokens in `localStorage`. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **Layout Shift on Auth** | Content jumps when the "Admin" sidebar appears. | Use "Skeleton Screens" or server-side rendering to determine layout before it hits the browser. |
| **Silent Failures** | User clicks "Edit" but nothing happens (403). | Always provide "Access Denied" feedback or hide the button entirely. |
| **Sign-in Loop** | Redirected to login while already signed in. | Fix the "Stale Cookie" desync (Pitfall #1). |

## "Looks Done But Isn't" Checklist

- [ ] **RBAC:** Often missing **server-side enforcement** — verify that the Server Action rejects unauthorized roles.
- [ ] **Logout:** Often missing **cache clearing** — verify that `router.refresh()` or a hard reload happens.
- [ ] **Role Change:** Often missing **token refresh** — verify `user.getIdToken(true)` is called after a role update.
- [ ] **Public Access:** Often missing **unauthenticated path handling** — verify public setlists work in Incognito mode.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **Permission Bleed** | MEDIUM | Revoke all tokens for the affected user and force a re-login. |
| **Stale Session Bug** | LOW | Clear browser cookies and re-authenticate. |
| **Admin UI Leak** | HIGH | Rotate secrets (if leaked), fix static rendering, and deploy a "Clear Site Data" header. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stale Cookie Desync | AUTH-AUDIT-01 | Test "Session Expiry" edge cases in dev tools. |
| Claim Propagation Lag | RBAC-01 | Promote user in Firebase and verify immediate access in app. |
| Router Cache Leak | AUTH-ROBUST | Log out/in as different users and check for UI artifacts. |
| Static Rendering Leak | UI-UX-01 | View source of protected pages to ensure no sensitive HTML is present. |

## Sources

- [Next.js Authentication Docs](https://nextjs.org/docs/app/building-your-application/authentication)
- [Firebase Admin SDK Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Personal Experience: "The Ghost Admin" bug in App Router v13-15]
- [sheet-music-app/CONCERNS.md (Hardcoded UIDs, Legacy Roles)]

---
*Pitfalls research for: sheet-music-app (Auth & Access Audit)*
*Researched: 2026-03-13*
