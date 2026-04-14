# Wave 1 — Security, Data Integrity, Rules

## Summary

Security posture is **generally sound**. Firestore rules are well-structured with a deny-all fallback, role hierarchy via custom claims + bootstrap fallback, a server-only `library_index`, and an audit log. Cron endpoints use `timingSafeEqual` for constant-time secret comparison. Bridge setup codes use `randomBytes` with a 10-min TTL and atomic transactional redemption. QR sign-in flow validates codes and deletes on consume.

The most notable gaps are: (1) **no `storage.rules` file checked into the repo** — `firebase.json` only references Firestore, leaving Firebase Storage bucket permissions undefined/default in source control; (2) a few API routes lack rate limiting; (3) the chat endpoint exposes all 100 setlists + 50 users to any signed-in member; (4) the bridge setup-code GET returns the raw service account private key over HTTPS, which is an inherent risk of the design. No P0 privilege-escalation vectors found.

## Findings

### SEC-001 Missing storage.rules in repo (P0/P1 depending on actual deployed rules)
- **Category**: rules
- **File**: `firebase.json:1-6`, repo root (no `storage.rules`)
- **What's wrong**: `firebase.json` only declares `firestore.rules` and `firestore.indexes.json`. There is no `storage.rules` file tracked. Uploaded PDFs, MuseScore originals, and potentially sensitive chart PDFs live in Firebase Storage (`library/` and `library/originals/`), and access is not codified in version control.
- **Why it matters**: If the project's deployed storage rules default to `allow read, write: if request.auth != null;` (the common default) or `allow read: if true;`, anyone (authenticated or not, depending) could read every musician's charts, scanned annotations, and any PII uploaded. There's no way to tell from the repo.
- **Suspected fix**: Add `storage.rules` restricting reads to `isMember()`-equivalent claim check, and writes to server-only (admin SDK via upload API). Wire into `firebase.json`.

### SEC-002 Bridge setup-code redemption returns raw service account key (P1)
- **Category**: security
- **File**: `src/app/api/bridge/setup-code/route.ts:98-119`
- **What's wrong**: GET `/api/bridge/setup-code?code=XXXXXX` returns `FIREBASE_PRIVATE_KEY` to any caller who presents a valid 6-char code. Rate-limiter is the generic 60/min `'api'` tier — 6-char alphabet is 32 chars (~5 bits × 6 = 30 bits, ~1B combos). Brute force unrealistic at 60/min, but the limiter is per-IP/per-user and malformed tokens fall back to IP — a distributed attacker could parallelize. Also, the endpoint is entirely unauthenticated on GET (by design, so bridge.exe can redeem without creds).
- **Why it matters**: The redeemed value is a full service account key with **Admin SDK scope** over the entire Firebase project. Leakage = complete compromise (any user data, any write). The 10-min TTL and "used once" guard mitigate substantially, but the surface is large.
- **Suspected fix**: Use a much longer code (16–24 chars) to raise entropy well above brute-force range even under distributed attack, and/or mint a narrowly-scoped credential (GCP IAM service account with only `cloud-monitor`/`firestore` subset) rather than reusing the app's Admin key. Consider requiring a bridge-side shared secret header in addition to the code.

### SEC-003 `/api/nudge-admin` missing rate limit (P1)
- **Category**: security
- **File**: `src/app/api/nudge-admin/route.ts:6-21`
- **What's wrong**: No `checkRateLimit` call. Authenticated users can spam `lastNudgeAt` updates to their own user doc unboundedly.
- **Why it matters**: Abuse surface is limited (self-write only), but uncapped Firestore writes = cost DoS, and if nudges trigger downstream email/push alerts to admins, it's a harassment vector.
- **Suspected fix**: Add `checkRateLimit(ctx.req, 'api')` at top, or a dedicated tier (e.g., 1/hour per user).

### SEC-004 `/api/scheduling/calendar-feed/[token]` — no rate limit, token-only auth (P1)
- **Category**: security / data
- **File**: `src/app/api/scheduling/calendar-feed/[token]/route.ts:13-33`
- **What's wrong**: Public iCal endpoint, `token.length >= 10` validation only. No rate limit. Token format/entropy isn't enforced here — depends on how `musicianProfile.calendarFeedToken` is generated elsewhere (uncertain).
- **Why it matters**: If tokens are short or guessable, an attacker can enumerate and scrape any musician's assignment history (setlist names, dates, instruments = light PII + service intel). Even with good tokens, absence of rate limit allows enumeration attempts.
- **Suspected fix**: Add rate limit; verify token is generated via `randomBytes(32).toString('base64url')` or equivalent high-entropy source; consider adding a rotate-token admin action.

### SEC-005 Chat endpoint leaks user directory + all setlists to members (P1)
- **Category**: data
- **File**: `src/app/api/chat/route.ts:203-210, 232-253`
- **What's wrong**: For `isAdmin || isBandLeader`, the prompt embeds up to 50 users with `displayName`, `email`, role, and `soundEngineer` flag. Separately, the endpoint always loads the 100 most recent setlists for any signed-in caller. Via prompt injection or model output parroting, a member-tier user could coerce the LLM to echo admin context back — except admin context is only sent when `isAdmin || isBandLeader`, so that specific leak is gated. However, **100 setlists with full track lists and rabbi attributions** are sent for *any* caller reaching the endpoint, which is `isMember()`-equivalent.
- **Why it matters**: Emails and roles aren't huge secrets for a congregation-scoped app, but it's above what Firestore rules (read: `isMember()` on setlists is already permissive) grant. Low real-world severity pre-band.
- **Suspected fix**: Gate all-setlists context behind `isMusician()` or higher; trim user context to exclude email; consider a system prompt instruction not to echo context verbatim (defense in depth only).

### SEC-006 `auth/qr` POST accepts client-supplied code (P2)
- **Category**: security
- **File**: `src/app/api/auth/qr/route.ts:47-66`
- **What's wrong**: POST accepts a client-generated 6-char code. If two iPads race or a malicious client pre-registers a code it predicts a legitimate iPad will pick, the attacker could approve their own phone against a code another iPad then redisplays. Format is restricted to `/^[A-Z0-9]{6}$/`, so collision domain is ~2B; `set()` with no merge will overwrite any existing doc, which resets `status/expiresAt` — a malicious prior "approved" state would be wiped, but equally a legitimate pending session could be stomped by an attacker to force re-approval.
- **Why it matters**: Low severity — requires a narrow race. But rules lock `qr-sessions` server-only (rules line 235), so only this API can write.
- **Suspected fix**: Use `create()` instead of `set()` and retry on collision with a server-generated code; or reject client-supplied codes entirely (generate server-side always).

### SEC-007 `SUPER_ADMIN_UID` env-based admin bypass (P2)
- **Category**: security
- **File**: `src/lib/api-auth.ts:30-32, 75-76`
- **What's wrong**: `requireAuth` treats any user with `uid === process.env.SUPER_ADMIN_UID` as admin regardless of custom claims or Firestore `config/admins`. Hardcoded escape hatch. This is consistent with the rules-layer fallback (`config/admins` UIDs) but is an additional, env-controlled path on the API side only — not mirrored in Firestore rules.
- **Why it matters**: Anyone who can set Vercel env vars (owner-only today) can silently grant themselves admin for all API-mediated writes without updating Firestore or custom claims, bypassing the audit log visibility that role changes normally create. Not directly exploitable; hygiene issue.
- **Suspected fix**: Remove `SUPER_ADMIN_UID` in favor of the existing `config/admins` Firestore doc (which rules already honor), so bootstrap is unified. Or document clearly and only populate in emergency.

### SEC-008 Inngest route unauthenticated (P2, expected)
- **Category**: security
- **File**: `src/app/api/inngest/route.ts`
- **What's wrong**: Standard Inngest serve handler with no additional auth. Inngest's own signing is expected to protect it, but there's no visible `INNGEST_SIGNING_KEY` check in this file (likely handled inside `serve()` when env var is set).
- **Why it matters**: Verify `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` are set in production — if absent, the route accepts unsigned invocations of `generatePdfJob`.
- **Suspected fix**: Confirm signing key envs are set in Vercel. Add a comment linking to the Inngest security docs.

### SEC-009 Firestore rules: setlist DELETE by any ownerId (P2)
- **Category**: rules
- **File**: `firestore.rules:96`
- **What's wrong**: A member can create a setlist (line 87) with `ownerId == auth.uid`, then delete it. Separately, `isOwner` on update/delete accepts any historical owner. Not a real issue unless there's a collection enumeration attack, but a member-tier user *can* create+delete arbitrary setlists. Rate-limiting on the client only.
- **Why it matters**: Quota / write amplification abuse, not data exposure.
- **Suspected fix**: Consider gating create to `isMusician()` rather than all signed-in users.

### SEC-010 Log hygiene — PII in error logs (P2)
- **Category**: log hygiene
- **File**: e.g. `src/app/api/library/upload/route.ts:94,172,200`; `src/app/api/admin/set-role/route.ts:45`
- **What's wrong**: Filenames, emails, and uids are logged via `logger.info/error`. On Vercel logs this is retained 1+ days and visible to anyone with project access.
- **Why it matters**: Low severity pre-band; worth scrubbing before wider rollout.
- **Suspected fix**: Redact email to domain-only in logs; hash uids.

## Uncertainties (for Wave 2)

- **Storage rules**: Are rules deployed at Firebase console level despite not being in repo? Need to inspect live project via Firebase MCP or console screenshot.
- **`calendarFeedToken` generation**: Where is it produced? Entropy level?
- **`config/admins` seeding**: How is this doc populated initially? Is there a bootstrap script or manual console edit?
- **Session cookie issuance**: `/api/auth/session` mints a 14-day cookie but there's no visible revoke-session API if a device is lost — does Firebase `auth.revokeRefreshTokens` get called anywhere on sign-out across devices?
- **Inngest signing**: Confirm production env has `INNGEST_SIGNING_KEY`.
- **CSRF**: Session cookie is `SameSite=Lax` + `__session` name. Mutating API routes rely on `Authorization: Bearer` header (not cookie), so CSRF is inherently blocked for those. But `/api/auth/session` DELETE uses the cookie directly without a CSRF token — a cross-site POST could theoretically trigger a logout (nuisance only).
- **`drive/file/[fileId]` and `drive/save`**: Not audited in this wave — check whether Drive-backed file reads enforce per-user ACL or trust any signed-in caller.
- **Bridge directory**: Only looked at Dockerfile presence; haven't reviewed bridge source for how it stores the redeemed service account key on disk (should be OS keyring, not plaintext).
