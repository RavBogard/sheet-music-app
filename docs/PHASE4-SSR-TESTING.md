# Phase 4: SSR Dashboard — Your Testing Steps

**Commits:** `8a16f13` (code splitting + batched queries) → `8aa3f3c` (SSR dashboard)

## What Changed

The dashboard page (`/`) is now **server-side rendered**. Previously, the browser received an empty HTML shell and showed a white screen for 1–2 seconds while JavaScript downloaded, React booted, and Firebase Auth resolved. Now the server pre-renders the greeting, branding, Hebrew date, and atmosphere gradient into the HTML — so users see real content instantly.

### Architecture

```
BEFORE:  Browser → empty HTML → download JS → boot React → Firebase Auth → render
AFTER:   Browser → server-rendered HTML with greeting → hydrate → Firebase takes over
```

### New Files

| File | Purpose |
|------|---------|
| `src/app/api/auth/session/route.ts` | POST: mints `__session` cookie from Firebase ID token. DELETE: clears it on sign-out. |
| `src/lib/server-auth.ts` | `getServerUser()` reads + verifies session cookie. `getServerCongregationConfig()` fetches config from Firestore (admin SDK). |
| `src/app/(main)/DashboardClient.tsx` | The interactive dashboard (moved from `page.tsx`). Accepts server-computed greeting as initial state. |
| `src/app/(main)/page.tsx` | **Server Component** — computes greeting on server, passes to client component. |

### Auth Flow Change

```
Sign-in:  Google popup → Firebase ID token → POST /api/auth/session → __session cookie set
Sign-out: DELETE /api/auth/session → cookie cleared → Firebase signOut()
```

The session cookie is:
- `httpOnly` (not accessible to JavaScript — XSS-safe)
- `secure` in production (HTTPS only)
- `sameSite: lax` (sent on same-site navigations)
- 14-day expiry (Firebase maximum for session cookies)

---

## What You Need To Do

### Step 1: Deploy to Vercel (automatic)

Since you pushed to `master`, Vercel should auto-deploy. Verify:

1. Go to [Vercel Dashboard](https://vercel.com) → your project
2. Confirm the latest deployment completed successfully
3. Check the build logs for any errors (ignore font warnings — those are build-time only)

### Step 2: Test the Session Cookie Flow

**Test A — Fresh visit (no cookie):**
1. Open a private/incognito browser window
2. Go to `centralreform.live`
3. **Verify:** You should see the greeting immediately ("Good morning" / "Good evening" etc.) with the Hebrew date — NOT a blank white screen
4. The greeting won't have your name yet (that's expected — no session cookie)

**Test B — Sign in and refresh:**
1. Sign in with Google
2. Wait for the dashboard to load fully
3. **Hard refresh** the page (Cmd+Shift+R / Ctrl+Shift+R)
4. **Verify:** The greeting should show your name immediately ("Good morning, Daniel") in the server-rendered HTML — before React even hydrates
5. Open DevTools → Network → look at the initial HTML response. Search for "Daniel" — it should be in the HTML source

**Test C — Sign out:**
1. Go to Settings → Sign Out
2. Refresh the page
3. **Verify:** Greeting goes back to generic (no name)
4. Open DevTools → Application → Cookies → look for `__session` — it should be gone

**Test D — Returning visit (next day):**
1. Close the browser entirely
2. Reopen and go to `centralreform.live`
3. **Verify:** The greeting shows your name instantly (cookie persists for 14 days)

### Step 3: Test Edge Cases

**Cookie expiry:**
- The session cookie lasts 14 days. After that, `getServerUser()` returns null and the server renders a generic greeting. The client-side auth still works — the user just won't see their name in the initial HTML flash.

**Private browsing:**
- No cookie is set in incognito. SSR renders generic greeting. Client auth works normally via Firebase's in-memory state.

**Multiple tabs:**
- Session cookie is shared across all tabs. Signing out in one tab clears the cookie for all.

### Step 4: Monitor Performance

After deploying, check Vercel Analytics or your own testing:

1. **First Contentful Paint (FCP):** Should drop from ~2-4s to <1s
2. **Largest Contentful Paint (LCP):** The greeting text should be the LCP element, rendered in the initial HTML
3. **Time to Interactive (TTI):** Should be similar to before (client JS still needs to load)

You can test with Chrome DevTools → Lighthouse → Performance audit on the dashboard.

---

## Rollback Plan

If anything goes wrong:

```bash
# Revert to pre-SSR commit (keeps code splitting fixes)
git revert 8aa3f3c
git push
```

The client component still works independently — if `getServerUser()` fails or the session API has issues, the dashboard falls back to client-only rendering (same as before, just without the SSR name personalization).

---

## What's NOT Affected

- **All other pages** are unchanged (still client-rendered)
- **API routes** are unchanged (they use Bearer token auth, not session cookies)
- **Firebase client auth** is unchanged — the session cookie is purely additive for SSR
- **Real-time features** are unchanged — Firestore `onSnapshot` listeners still fire client-side
- **Offline/PWA** is unchanged — service worker handles caching as before

---

## Future SSR Candidates

If the dashboard SSR works well, these pages could be converted next (in priority order):

1. **`/perform/setlist/[id]`** — Setlist view page. Server could pre-fetch the setlist data for instant rendering. High traffic page.
2. **`/setlists`** — Setlist dashboard. Server could pre-fetch the user's setlists.
3. **`/library`** — Song library. Server could pre-render the file list from the library index.

Each conversion follows the same pattern: Server Component wrapper → Client Component for interactivity.
