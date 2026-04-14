# S02 Bridge Credentials — Design Decision

**Finding:** FINDINGS.md S02 — `/api/bridge/setup-code` GET returns full `FIREBASE_PRIVATE_KEY`.
**Status:** **DECIDED** — Option A (audit-log + admin email on redemption)
**Decided:** 2026-04-14
**Phase:** v4.3 Phase 3 Plan 01

---

## 1. Current State

**Route:** `src/app/api/bridge/setup-code/route.ts`

**POST** (admin-gated, `band_leader` role):
- Invalidates any existing unused codes from the same user
- Generates a fresh 10-char code from a 32-char unambiguous alphabet (~50 bits entropy)
- Persists `{ createdBy, createdAt, expiresAt (+10min), used:false }` to Firestore
- Returns `{ code, expiresAt }` to the admin UI

**GET** (unauthenticated, rate-limited):
- `bridgeSetup` rate-limit tier (5/min)
- Validates code format (10 chars, known alphabet)
- Atomic Firestore transaction: check `!used && !expired` → mark `used:true, usedAt`
- On success: builds a full service-account JSON (`project_id`, `private_key`, `client_email`, …) from `FIREBASE_*` env vars and returns it in the response body

**Prior hardening (v4.2 P1.3):**
- Entropy raised from ~30 bits (6 chars) → ~50 bits (10 chars)
- Dedicated `bridgeSetup` rate-limit tier (5/min, stricter than app-wide 60/min)
- Atomic single-use redemption via `runTransaction`
- Unambiguous alphabet (no 0/O/1/I)

**What remains:** A successful redemption hands out the raw admin service-account key. If a valid code is ever observed mid-window (leaked logs, shared screen, shoulder-surfing during an install call, etc.), the redeemer has full admin-SDK powers forever.

---

## 2. Threat Model

### Who we defend against
1. **External attacker guessing codes** — 50-bit entropy + 5/min rate limit + 10-min window ≈ 3×10⁻¹² chance per 10-min window. Effectively zero. **Already solved by v4.2 P1.3.**
2. **Log leakage** — code appears in request logs, Vercel analytics, proxy logs. Code is single-use + 10-min TTL, so replayability is bounded but nonzero if leak is real-time.
3. **Shared-screen / shoulder-surfing during install** — Rabbi Daniel runs the bridge install with another person looking at the screen. Observer gets the code, races to redeem first.
4. **Compromised admin email / messaging** — a generated code transmitted via email/Slack to the bridge operator, intercepted in transit.

### What we accept
- **Rabbi Daniel's personal machine compromise = game over, regardless of what we do here.** If the attacker has the bridge machine, they have the stored credentials no matter how cleverly we delivered them.
- **Rogue admin (Rabbi Daniel himself)** is out of threat model — he's the sole bridge operator and has full Firebase Console access anyway.
- **Cloud provider compromise** (Firebase, Vercel, GCP) is out of scope.

### Blast-radius goal
Shrink the window in which a single leaked/intercepted code grants silent long-term admin access. Current: unbounded (until key rotation). Goal: detectable within minutes, revocable by a single Firebase Console action.

---

## 3. Candidate Options

| # | Option | Effort | Residual Risk | Ops Cost | Rollback |
|---|--------|--------|---------------|----------|----------|
| A | Audit-log + admin email on every redemption | **XS** (~2hr) | **Med** (credential still full SA; fast detection) | Low (email notification only) | Trivial — feature flag off |
| B | Wrapped credential + per-install passphrase | M (~1 day) | Low (SA key never transits plaintext) | Med (passphrase distribution problem) | Moderate — bridge-side change required |
| C | IAM per-install service-account key (GCP-side provisioning) | L (~2-3 days) | **Low** (revocable per-install) | **High** (GCP IAM API integration; per-install lifecycle) | Hard — requires undoing IAM state |
| D | Short-lived custom token + admin-SDK proxy API | L (~3-5 days) | **Low** (bridge holds no admin creds) | High (proxy latency on every admin op; bridge refactor) | Hard — significant bridge-side rewrite |
| E | Status quo + explicit wontfix | — | Med (unchanged from today) | None | N/A |

### Option A — Audit-log + admin email on every redemption
**Implementation sketch:**
- On successful GET redemption, write `bridge-redemptions/{codeId}` doc with `{ code, createdBy, redeemedAt, redeemerIp, redeemerUserAgent }`.
- Send an email to Rabbi Daniel's admin address via SendGrid/Resend (whichever is already wired) or a Firestore trigger hook we already have for other admin notifications.
- Rotate FIREBASE_PRIVATE_KEY via Firebase Console if any redemption was not expected.
**Residual risk:** credential itself is unchanged. First-use compromise still has minutes to hours before detection, depending on email latency. Revocation is manual (Firebase Console key rotation).

### Option B — Wrapped credential + per-install passphrase
**Implementation sketch:**
- POST generates a random passphrase P alongside the code; shows P to admin in a "copy this" UI.
- GET returns `{ wrappedCredentials }` encrypted under P (e.g., AES-256-GCM with P-derived key).
- Bridge exe prompts for P at install; decrypts locally; stores unwrapped creds in OS keychain/DPAPI.
**Residual risk:** lower — SA key never transits plaintext. But passphrase distribution becomes the new weak link (any channel that could leak the code can leak P alongside it). Also: bridge machine compromise still yields the unwrapped key.

### Option C — IAM per-install service-account key
**Implementation sketch:**
- POST uses Google Cloud IAM API to provision a fresh service-account key scoped minimally (Firestore Admin, Storage Admin; no Auth Admin unless required).
- Persist the IAM key ID in Firestore against the bridge install record.
- Revoke via Firebase Console / gcloud CLI when an install is retired.
**Residual risk:** lowest — each install is revocable independently. But this is a substantial new GCP surface (IAM API credentials on our server, per-install lifecycle tracking) and scales better to "many congregations" than our current deployment justifies.

### Option D — Short-lived custom token + admin-SDK proxy API
**Implementation sketch:**
- Bridge never holds admin SDK credentials; instead, it authenticates to our Vercel API via a bridge-scoped JWT, and every privileged Firestore op goes through our API routes.
- Server mints short-lived custom tokens (1hr) and refreshes them on bridge ping.
**Residual risk:** lowest (bridge has no standing privilege). But this changes the bridge architecture fundamentally: latency on every op, much larger code surface, ops overhead (route-per-capability).

### Option E — Status quo + explicit wontfix
Document that we accept the current risk given single-congregation scope, close the finding as "won't fix in v4.3", revisit if threat model changes.

---

## 4. Decision

**Chosen option:** **A — Audit-log + admin email on every redemption**

### Rationale

1. **Threat model fit.** The realistic attack vectors for this single-congregation deployment are log leakage and shared-screen interception during install — both of which benefit far more from *fast detection* than from exotic credential wrapping. Once the rabbi gets an alert "your bridge code was redeemed from IP X at HH:MM" he can decide within minutes whether to rotate the key.
2. **Effort / ops budget.** XS (~2hr). Option C is the principled long-term answer but it's 2-3 days of GCP IAM plumbing for a single install. Spending that budget on D01 (cascade delete) and the rest of v4.3 is the better marginal use of time.
3. **Rollback story.** Trivial — a feature flag or simply deleting the alert route reverts. No bridge-side changes; no passphrase distribution problem (Option B); no new GCP IAM surface (Option C); no architecture rewrite (Option D).
4. **Preserves optionality.** Audit-log is additive — if we later adopt Option B or C, the audit trail remains useful. Nothing we build here has to be torn out.

### Runners-up rejected

- **Option C** — right answer architecturally, wrong moment. Invest when we have a second congregation or a public bridge distribution to justify per-install key lifecycle.
- **Option B** — passphrase distribution adds an ops burden without materially improving the realistic threat posture (anyone who can intercept the code can likely intercept the passphrase too).
- **Option D** — large bridge refactor. Would rewrite the thing the bridge is for.
- **Option E** — declined. S02 has a real signal; "wontfix" would be dishonest.

### Explicit accepts

- **Bridge machine compromise = game over.** Anyone with physical or remote access to Rabbi Daniel's bridge machine gets the unwrapped admin credential. Not in scope.
- **First-use compromise window.** Between redemption and email alert delivery (typically <1 min, worst-case tens of minutes on email latency), an attacker has silent admin access. Mitigated by the low realistic probability of a code ever being observed in the first place.
- **Manual revocation.** Rotating `FIREBASE_PRIVATE_KEY` is a Firebase Console action. Accepted as infrequent enough that automation isn't worth building.
- **Email availability.** If the alert email fails to deliver (SendGrid outage, inbox issue), detection lags. Mitigated by also writing the audit doc to Firestore where the admin panel can surface unreviewed redemptions.

### Triggers to revisit

Flip to **Option C** (IAM per-install) when any of the following is true:
- A second congregation adopts the bridge (multi-tenant lifecycle becomes necessary)
- Bridge exe is distributed to third parties (untrusted-operator threat model)
- Compliance requires revocable per-install audit chain (unlikely for CRC)
- A real security incident involving the current flow occurs

## 5. Follow-up scope (03-02-PLAN.md)

**Plan:** `/paul:plan` for 03-02 — "S02 audit-log + admin redemption alert"

**Files to touch:**
- `src/app/api/bridge/setup-code/route.ts` — inside the success branch of the GET transaction, write to `bridge-redemptions/{autoId}` with:
  - `code` (the consumed code)
  - `createdBy` (from the redeemed doc)
  - `redeemedAt` (server timestamp)
  - `redeemerIp` (`req.headers.get("x-forwarded-for")?.split(",")[0]` or `x-real-ip`)
  - `redeemerUserAgent`
  - `success: true`
- Email-sending module (check existing: we already send admin nudges — `src/lib/notify-admin.ts` or wherever `nudge-admin` lives). Reuse that transport.
- Admin-panel surface (optional, follow-up): a "Recent bridge redemptions" table. Out of 03-02 scope unless trivial.

**Tasks envisioned (~2hr total):**
1. Firestore schema + write inside GET success branch
2. Admin email via existing transport (subject: "Bridge credentials redeemed"; body: timestamp + IP + UA + "if you didn't install a bridge, rotate the key now")
3. Unit tests: successful redemption writes audit doc + triggers email; failed redemptions don't
4. Firestore rules: `bridge-redemptions` readable only by admin/band_leader, writable only by server

**No required skills** (server-only; no `/ui-ux-pro-max` needed).

**Rollout:** ship to prod on master as a single commit bundle. No feature flag — additive behavior only.

---

*Decision finalized 2026-04-14. Next action: `/paul:unify` this plan, then `/paul:plan` 03-02.*
