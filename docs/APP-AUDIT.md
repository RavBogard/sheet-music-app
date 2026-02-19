# CRC Music — Systematic App Audit

**Date:** February 19, 2026  
**Scope:** Complete user-flow analysis across all 7 personas, all routes, all API endpoints  
**Method:** Code-level trace of every persona through every reachable flow, examining authorization, error handling, data integrity, and experience quality

---

## Personas Traced

| Persona | Role | Real People | Key Flows |
|---------|------|-------------|-----------|
| Guest | (none) | Walk-ins | Dashboard → public setlists → QR sign-in |
| Pending | pending | New sign-ups | Dashboard → welcome card → instrument setup |
| Member | member | Community | Library → public setlists → personal setlists |
| Musician | musician | Joey, David G | Perform → monitor → receive emails → transposed charts |
| Band Leader | band_leader | David L, Bryn, Karen, Randy | Create → edit → publish → notify → print packets |
| Admin | admin | Daniel | Everything + system config + bridge + user management |
| Sound Engineer | soundEngineer | Drew, Taylor, Andrew | Monitor → bus assignment → matrix → bridge |

---

## Section 1: Essential Issues

### 1.1 — Rate limiter keys collide: all authenticated users share one bucket

**File:** `src/lib/rate-limit.ts` lines 89–94  
**Severity:** High — one active user can lock out the entire band

The `getKey()` function extracts the first 16 characters of the Bearer token as the per-user rate limit key. Firebase JWTs are standard JWT format: `header.payload.signature`. The header is always `{"alg":"RS256","typ":"JWT"}`, which base64-encodes to `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9`. Every Firebase token from your project starts with this identical string.

Result: the rate limit key `u:eyJhbGciOiJSUzI1` is shared by **every authenticated user**. When the API limiter is set to 60 requests/minute, that's 60 requests total across all musicians, not 60 per person. Friday night with 8 musicians loading charts simultaneously will hit this within seconds.

**Fix:** Decode the JWT payload (second segment) and extract the `sub` or `user_id` claim:

```typescript
function getKey(req: NextRequest): string {
    const auth = req.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
        try {
            const payload = auth.split('.')[1]  // JWT payload segment
            const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
            return `u:${decoded.sub || decoded.user_id}`
        } catch { /* fall through to IP */ }
    }
    // ... IP fallback
}
```

### 1.2 — Chart file download endpoint has no authentication

**File:** `src/app/api/drive/file/[fileId]/route.ts`  
**Severity:** High — copyrighted sheet music accessible to anyone with a file ID

This endpoint serves Google Drive PDFs and has CORS origin checking and rate limiting, but **no `withAuth` check**. Anyone who obtains a file ID — from a shared URL, email link, browser history, or network inspection — can download charts without being signed in. This is the endpoint that serves every chart in the app.

The CORS check only prevents cross-origin browser requests. Direct HTTP requests (curl, mobile apps, scripts) bypass it completely. Unlike `/api/setlist/print/public` which correctly verifies `isPublic === true`, this endpoint serves any file by ID with no access control.

**Fix:** Add `withAuth` at the top of the route handler. The server-side print pipeline uses `file-fetcher.ts` directly (via admin SDK), so adding auth here won't break PDF generation.

### 1.3 — Publish route uses redundant Firestore fetch instead of token claims

**File:** `src/app/api/setlist/publish/route.ts` lines 62–68  
**Severity:** Medium — wasted Firestore read on every publish, inconsistent auth pattern

The publish route checks `auth.isAdmin` (from the token), but when that's false, it fetches the user's profile from Firestore to check if they're a band leader — even though `auth.isBandLeader` is already available from the decoded token. This costs a Firestore read per publish call and creates a code inconsistency: the `email-packets` route correctly uses `auth.isBandLeader` without a Firestore fetch.

```typescript
// CURRENT (publish — wasteful)
if (!isOwner && !auth.isAdmin) {
    const userDoc = await db.collection('users').doc(auth.uid).get()  // unnecessary
    const role = userDoc.data()?.role
    if (role !== 'band_leader' && ...) { return 403 }
}

// CORRECT (email-packets — already does this)
if (!isOwner && !auth.isAdmin && !auth.isBandLeader) {
    return 403
}
```

### 1.4 — Email-packets query includes community members

**File:** `src/app/api/setlist/email-packets/route.ts` line 48  
**Severity:** Medium — community members could receive gig packets

The comment says "musicians and above — not plain community members" but the Firestore query includes `'member'` in the role filter. When `recipientUids` is null or undefined, the `.filter()` on line 53 passes all users with email addresses, including community members who aren't musicians.

In practice, the PublishDialog always provides `recipientUids` from the MusicianPicker (which correctly filters to musician+). But the API itself is unprotected against this edge case — a direct API call without `recipientUids` would email everyone.

**Fix:** Remove `'member'` from the query: `['admin', 'band_leader', 'musician', 'leader']`

### 1.5 — Pending users see the "New Setlist" button, then get a silent error

**File:** `src/components/setlist/SetlistDashboard.tsx` line 322  
**Severity:** Low-Medium — confusing UX for new users in their first 30 seconds

The SetlistDashboard shows the "New" button to any signed-in user (`{user ? (...<Plus/> New...) : (...Sign In...)}`). A pending user who just signed in for the first time can tap it, get routed to the editor, and when they try to save, Firestore rules reject the write (`isMember()` check fails). The error surfaces as a generic save failure with no explanation.

The dashboard home page handles this beautifully with the pending card illustration, but the `/setlists` route doesn't gate the create action.

**Fix:** Either hide the "New" button for pending users (`user && isMember`), or show a clear inline message when they tap it: "Your account is being reviewed — you'll be able to create setlists once approved."

---

## Section 2: Ease of Use Improvements

### 2.1 — Instrument setup reminder is a one-shot that never returns

When a musician is first approved, the dashboard shows a welcome card prompting them to set up their instrument. If they tap "Skip" (`viewedWelcomeModal = true`), the prompt disappears permanently. The musician then receives concert-pitch charts forever without understanding why — there's no reminder in Settings, no nudge on the perform page, and no indication that transposition is available.

**Suggestion:** Add a subtle banner in the Settings page instrument section: "Set your instrument to get automatically transposed charts." Or, on the perform page when transposition is 0 and no instrument is configured, show a one-time tooltip: "Playing a transposing instrument? Set it up in Settings."

### 2.2 — Perform page errors are indistinguishable

The `/perform/setlist/[id]` page catches Firestore `onSnapshot` errors with a single message: "Failed to load setlist." This can mean three completely different things: (a) the setlist doesn't exist (404), (b) the user doesn't have permission (it's private and they're not the owner), or (c) the network failed. A musician who receives a link to an unpublished setlist gets the same message as a network timeout.

**Suggestion:** Distinguish the error in the `onSnapshot` error callback. Firestore `FirestoreError` has a `code` field: `'permission-denied'` vs `'not-found'` vs `'unavailable'`. Map these to user-friendly messages: "This setlist hasn't been published yet," "Setlist not found," "Network error — check your connection."

### 2.3 — No undo or retraction after publishing

Publishing is a one-way action with real-world consequences: emails are sent, PDFs are linked. If a band leader publishes with wrong songs or the wrong date, there's no "retract" or "unpublish and notify." The toggle-public exists but doesn't recall emails or notify musicians that the previous version was wrong.

**Suggestion:** Add an "Update & Re-Notify" flow for already-published setlists that sends a follow-up email with a clear "UPDATED" subject prefix and a diff summary. This turns a mistake into a correction rather than leaving musicians confused.

### 2.4 — Setlist search doesn't filter by date

The setlist dashboard search uses Fuse.js text matching on names only. Band leaders looking for "the setlist from two weeks ago" must scroll the list or switch to calendar view and visually scan. There's no way to type "February 7" or "last Friday" to find setlists.

**Suggestion:** Extend the search to match against formatted event dates. When the search query looks like a date pattern (contains a month name, "last Friday," or MM/DD), filter setlists by `eventDate` proximity. This is lightweight — just parse the date from the query and sort by distance.

### 2.5 — Band leaders have no read-receipt signal after publishing

After a band leader hits "Publish & Notify," they see a success toast with the count of emails sent. But they have no way to know: did Joey open the email? Did David download his packet? Did anyone actually look at the setlist? The email tracking system (`emailEvents`) captures delivery/open events, but these aren't surfaced in the UI.

**Suggestion:** Add a small status row on the published setlist view: "📧 Sent to 6 · Opened by 4 · Downloaded by 2." This uses data already being collected by the Resend webhook → `emailEvents` subcollection. Band leaders would finally know whether to text Joey on Friday afternoon.

---

## Section 3: Feature Additions

*Filtered to ideas I believe with 80%+ certainty you'd want, given your focus on smooth service execution, AI integration, musician experience, and liturgical integrity.*

### 3.1 — "What changed?" diff when a published setlist is updated

When tracks are added, removed, or reordered in an already-published setlist, musicians currently see the new version with no indication of what's different. Friday afternoon, a musician opens the setlist they reviewed on Wednesday and doesn't realize L'cha Dodi was swapped for a different setting.

**Implementation:** The `setlists/{id}/history` subcollection already records changes. When a musician opens a setlist they've viewed before, show a dismissible banner: "Updated since you last viewed: +Mi Chamocha (B♭), −L'cha Dodi, Shalom Rav moved to #3." Store `lastViewedAt` per user in `users/{uid}/setlistViews/{setlistId}` and diff against the history entries.

### 3.2 — Song usage analytics surfaced in the library

The `songUsage` collection tracks every song appearance in published setlists. This data exists but is invisible to the humans making setlist decisions. Band leaders building next week's setlist don't know that they've used Oseh Shalom six Fridays in a row or that they haven't touched Sim Shalom since September.

**Implementation:** Add a subtle line under each library card: "Last played Feb 7 · 8× this year." On the "Add Songs" modal in the editor, sort options could include "Least recently used" alongside alphabetical. The data is already in Firestore; this is purely a UI surface.

### 3.3 — Service flow validation via the AI agent

The AI chat agent already has full liturgical knowledge and can see the current setlist. Add a "Check Service Flow" button (or slash command) that validates the liturgical ordering: "Your Shabbat evening service has the Amidah before the Sh'ma — these are typically reversed." "There's no Kaddish between the Torah service and Musaf." "Consider adding a Mi Shebeirach after the Torah reading."

**Implementation:** This is a specialized prompt to the existing Gemini agent with the current setlist tracks as context. The liturgical-calendar.ts module already provides parasha context. The agent already can read the setlist. This is essentially a one-shot prompt template: "Analyze this setlist for liturgical flow issues in a Reform context."

### 3.4 — Shared "band leader annotations" layer on charts

The annotation system supports personal per-user drawings on charts. But rehearsal marks — "circle the coda," "ritard measure 12," "D.S. al Coda from here" — need to be visible to the whole band, not just the person who drew them. Currently, the band leader draws these on their own iPad, then says "see measure 12" verbally during rehearsal.

**Implementation:** Add an `isShared` flag to annotations. When the band leader toggles "Share with band" on their annotations, save to `setlists/{id}/sharedAnnotations/{fileId}` (readable by all). The PerformerView renders both personal and shared layers, with shared annotations in a distinct color (e.g., blue vs. the user's red).

### 3.5 — Smart "Clone for Next Week" with liturgical awareness

The existing clone-next-week feature creates a literal copy. A smarter version could: keep fixed liturgical elements (Barechu, Sh'ma, Amidah, Kaddish) that appear every week; swap the Torah portion automatically based on the parasha calendar; flag the variable slots ("This week's special reading: ___") and suggest songs from the library based on usage patterns (prefer songs not played in the last 4 weeks).

**Implementation:** This combines the existing liturgical-templates.ts (which already knows service structure), the song-usage data, and the parasha calendar. The clone operation would produce a setlist that's 70% done rather than 100% copied — the band leader fills in the creative choices, the system handles the liturgical scaffolding.

---

## Section 4: Backend Improvements

### 4.1 — Fix the rate limit key extraction

As detailed in 1.1. The fix is 5 lines: decode the JWT payload segment and use `sub` as the key. This is the highest-impact single-line-class fix in the codebase — it turns a system-wide rate limit into a proper per-user one.

### 4.2 — Add authentication to the file download endpoint

As detailed in 1.2. Add `withAuth(req)` to `/api/drive/file/[fileId]/route.ts`. The service worker offline cache will need to pass the auth token in its fetch requests, but it likely already does (check `offline-store.ts`).

### 4.3 — Standardize API authorization to single pattern

Three different auth patterns exist across routes:

| Pattern | Used By | Problem |
|---------|---------|---------|
| `withAuth(req, 'role')` | set-role, set-sound-engineer, band-prep | Correct — role checked in middleware |
| `withAuth(req)` + manual owner/role check via `auth.isBandLeader` | email-packets | Correct — checks token claims |
| `withAuth(req)` + manual Firestore fetch for role | publish | Wrong — redundant read, inconsistent |

Standardize to: always use `auth.isAdmin`, `auth.isBandLeader`, `auth.isMusician` from the token. Never re-fetch role from Firestore in a route handler. The token refresh mechanism (`claimsUpdatedAt`) ensures claims are current.

### 4.4 — Add API route integration tests

362 unit tests cover lib functions thoroughly, but zero tests cover API routes. The rate limit collision, the missing auth on file downloads, the inconsistent publish auth, and the member-inclusive email query would all be caught by route-level tests that verify: (a) correct HTTP status for each role, (b) Firestore state after mutations, (c) response shape.

**Framework suggestion:** Use Next.js route testing with `next/test-utils` or lightweight fetch-based tests against a test server. Mock Firebase Admin with `firebase-admin/testing`. Even 20 tests covering the happy path + unauthorized path for each API would catch entire classes of bugs.

### 4.5 — Extract shared types to workspace package

`MatrixInfo`, `MixerSnapshot`, `ServerMessage`, and `MonitorConfig` are defined identically in both `src/types/monitor.ts` and `bridge/src/types.ts`. When one changes, the other must be manually synced. This will eventually cause a runtime type mismatch that's invisible to TypeScript.

**Fix:** Create `packages/shared-types/` as an npm workspace. Both the Next.js app and the bridge import from it. TypeScript catches drift at build time.

---

## Section 5: Outside-the-Box Suggestions

### 5.1 — Position-aware music stand QR codes

Print a laminated QR code for each physical music stand position: "Stand 1 — Guitar," "Stand 2 — Keys," "Stand 3 — Drums." When a musician scans their stand's QR code, it deep-links into the app with two actions pre-loaded: (a) opens the current published setlist with their personal transposition, and (b) auto-assigns them to the corresponding monitor bus.

**Why this matters:** This collapses a 3-step flow (open app → find setlist → go to monitor → pick bus) into a single scan. On Friday night when the sub drummer shows up 5 minutes before the service, they scan the stand, see their charts, hear their monitor. No onboarding needed. The QR auth system already exists — this extends it with position context.

### 5.2 — "What We Sing" public congregational music page

A public-facing (no login required) page at `/what-we-sing` showing the congregation's musical life: a heatmap of song frequency over the year, the most-played songs each month, seasonal patterns (High Holiday songs cluster in September, Chanukah songs in December). Built entirely from the existing `songUsage` data.

**Why this matters:** This serves the 95% of the congregation who never use the app but are curious about the music. It's also a powerful tool for guest musicians ("Here's what we sing — familiarize yourself with these 20 songs") and for Daniel's Sinai & Synapses grant reporting ("Here's a data-driven view of our musical liturgical practice"). It turns private operational data into a community engagement asset.

### 5.3 — Post-service debrief agent

After Friday night, a push notification or email says "How did the service go?" Opens the AI chat with the evening's setlist pre-loaded. The agent asks structured questions: "Any songs that didn't work? Tempo or key issues? Anything you'd change?" Responses are stored as structured debrief notes attached to the setlist.

**Why this matters:** Over a year, this builds institutional memory that no one currently captures. "Last time we did Hashkiveinu in E minor, it was too low for the congregation." "The transition from Mi Chamocha into the Amidah needs a longer instrumental bridge." This is the kind of knowledge that lives in Daniel's head and Drew's head and gets lost when someone's out sick. The AI agent already has the context — this is just a structured prompt template with persistent storage.

### 5.4 — Live lyric projection sync

The app already has song metadata, keys, and service order. Export a ProPresenter or OpenLP-compatible projection file that maps slides to the setlist order. When the band leader advances through the setlist on their iPad, the projection computer could receive a signal (via the existing WebSocket infrastructure or a simple HTTP poll) and advance to the matching lyrics slide.

**Why this matters:** Right now, someone manually clicks through projection slides during the service, trying to stay in sync with the band. Mistakes are visible to the entire congregation. Syncing the projection to the setlist eliminates a volunteer role and a failure mode. The bridge WebSocket architecture already solves the hard problem (real-time sync between devices on the same network).

### 5.5 — Congregation musical fingerprint for guest musicians

Analyze the full song usage corpus to generate a "CRC Musical Profile": preferred tempos, key distributions, ratio of English to Hebrew, contemporary vs. traditional settings, most-loved melodies. Package this as a one-page PDF that gets auto-emailed to any musician who's newly assigned to a setlist for the first time.

**Why this matters:** When a sub guitarist shows up, they currently rely on verbal briefing: "We're pretty relaxed, mostly Friedman and Klepper, keep it gentle." A data-driven profile turns tribal knowledge into an onboarding document. It also gives Daniel a mirror — "I didn't realize we hadn't done anything by Debbie Friedman in three months" — that pure intuition might miss.

---

*End of audit. All findings are grounded in specific files and line numbers in the current codebase. Issues in Section 1 are fixable in under an hour each. The feature suggestions in Section 3 build on infrastructure that already exists.*
