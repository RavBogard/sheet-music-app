# iPad sweep — shared-device onboarding / QR sign-in: FINDINGS

**Lane:** `ipad-sweep-onboarding` · **Coder:** coder-2 · **Risk tier:** 1
**Base SHA:** `9a6e6453c` · **Branch:** `feat/ipad-sweep-onboarding`
**Surface:** prod (`https://www.centralreform.live`), iPad WebKit (820×1180 portrait + 1180×820 landscape)
**Spec:** `e2e/onboarding-qr-ipad.spec.ts`
**Probe role:** FINDINGS only — NO `src/` edits. Fixes are out of scope for this lane.

> **Verification legend:** `PROD-VERIFIED` = asserted at the deployed surface by a
> green spec test. `CODE-CONFIRMED` = traced in source at base SHA, awaiting/covered
> by a prod assertion. Each finding lists the test id that backs it.

---

## F1 — [HIGH] The QR shared-device onboarding flow is UNREACHABLE in production

**The lane's headline. The band's documented way of signing into the 6 shared
iPads cannot be reached by any user.**

`QRSignIn` (the QR *display*) — together with the whole "Guest Sign-In" card and
its "Sign In with Google" button — renders in exactly one place:

- `src/app/(main)/DashboardClient.tsx:398` → `{!user && !authLoading && ( <QRSignIn/> … )}`

…i.e. the dashboard at `/`, **only for a signed-out viewer**. But two facts make
that state impossible to reach in production:

1. **`src/proxy.ts:228-230` (UNAUTH-001):** any request to `/` *without* a
   `__session` cookie is 307-redirected to `/perform`. A signed-out shared iPad
   never lands on the dashboard.
2. **`DashboardClient.tsx:42-43`:** `user` is derived as
   `authUser || (serverUid ? {…} : null)`. Whenever a session cookie exists,
   `serverUid` is set, so `user` is non-null and the `{!user …}` guest card
   (QR + Google button) is never rendered.

→ **No production state is both reachable AND renders the QR display.** Signed
out ⇒ bounced off `/`; signed in ⇒ guest card suppressed. The QR onboarding
surface — and the dashboard's "Sign In with Google" guest button beside it — are
effectively dead UI.

**User impact:** the band cannot onboard the 6 iPads via the intended scan-and-
approve flow. The only reachable sign-in is `/login` (Google popup), which on a
*shared* iPad means juggling each musician's Google credentials in a popup — the
exact friction the QR flow was built to remove.

**Likely cause (not a fix, context only):** the UNAUTH-001 `/`→`/perform`
redirect shipped `40341c1be` (2026-05-18); the QR feature is older (`v4.3
P6-S04` markers). The redirect orphaned the older guest-sign-in surface —
regression-by-intent-collision, not a deliberate removal.

**Important nuance:** the QR *backend* is fully functional (see F4 / test B1) —
this is purely a missing/blocked UI entry point. A fix is likely small (surface
the QR on a reachable route — e.g. a "Sign in on a shared device" affordance on
`/login`, or let `/` render the guest card for a shared-device path before the
redirect). **Out of scope for this sweep lane; flagged for triage.**

**Repro (PROD-VERIFIED — tests A1/A2/A3):**
- `A1` fresh context → `GET /` → final pathname is `/perform`; "Scan with your
  phone to sign in" count = 0 on the landed page.
- `A2` `/perform` → no QR affordance.
- `A3` `/login` → "Sign in with Google" present, QR affordance count = 0.

---

## F2 — [LOW] QR approval gate admits the literal `member` role, against its stated intent

`src/app/api/auth/qr/route.ts:157-164`:

```ts
// v4.3 P6-S04: ... Gate it to members (musician/band_leader/admin) ...
const allowedRoles = new Set(["member", "musician", "band_leader", "admin"])
if (!role || !allowedRoles.has(role)) { return 403 }
```

The comment frames the gate as "members (musician/band_leader/admin)" — i.e.
band-tier roles — yet the allow-set also contains the literal `member` role
(congregation member, the lowest non-pending tier). A plain `member` can approve
a shared-device QR sign-in.

**Severity LOW:** the approver signs the iPad in *as themselves*, and `member` is
still an approved, authenticated account — so the blast radius is "a congregation
member can sign a shared iPad in as that same member." Not a privilege
escalation. But it is broader than the comment's intent and worth a Daniel ruling:
**should a `member` be able to put a shared band iPad into a signed-in state?** If
not, drop `"member"` from the set (musician/band_leader/admin only).

**Repro (PROD-VERIFIED — test C1):** both `musician` and `member` approvers →
PUT `/api/auth/qr` → HTTP 200 at prod. The `member` 200 is the flagged behavior.

---

## F3 — [NOTE] Coverage gaps inherent to the harness (documented, not bugs)

- **True expiry (HTTP 410):** `route.ts` only 410s once `Date.now() > expiresAt`
  (5-min TTL). Not inducible via the public API in a fast test (no way to
  back-date `expiresAt`; would need a 5-min wait or Firestore write). The
  client's *refresh-on-410/404* logic (`QRSignIn.tsx:121-125`) is therefore not
  UI-exercised — and is moot anyway while F1 keeps the component unreachable. The
  404 path (unknown/consumed code) IS covered (D1, B1).
- **No-role / pending refusal (`route.ts:159 !role`):** `create_test_account`
  always sets a `role` custom claim (`test-tokens.ts:233`), so a minted account
  can't exercise the no-role 403 branch. Auth-layer refusals (401 no-bearer, 403
  invalid token) ARE covered (C2).

---

## F4 — [NOTE / positive] QR backend cycle + iPad sign-in works correctly under WebKit

Despite F1, the underlying flow is sound end-to-end at the deployed surface:

- **B1 (cycle):** POST create → GET poll(`pending`) → PUT approve (band_leader
  Firebase ID token) → GET poll(`approved` + one-time `customToken`) → iPad
  `signInWithCustomToken` lands as the approver (`auth.currentUser.uid` matches);
  consumed session then 404s (single-use).
- **C2 (auth gate):** PUT no-bearer → 401; invalid ID token → 403.
- **D2 (idempotency):** second approve on an approved code → 409.
- **E1 (shared device):** sign-out fully clears `auth.currentUser`; the next user
  signs in clean with no leaked prior-user state.
- Cycle (B1/C1/D2/E1) run green under `ipad-webkit` (backend/auth behavior is
  orientation-independent); the no-auth/visual describe (A1/A2/A3/C2/D1/F1) ran
  green under BOTH `ipad-webkit` and `ipad-webkit-landscape`.

> Status: **PROD-VERIFIED** (all describes green at prod, SHA `9a6e6453c`).

---

## Run conditions / isolation posture

Per `[[feedback_sandbox_test_isolation]]`: every minted uid tracked in
`createdUids`, cascade-revoked by id in `afterAll` via `revokeTestAccounts`.
**Never** `cleanup_all_test_data`. Post-run `list_test_accounts` verified **0** of
this lane's accounts remained (clean). No token written to any tracked file.

Bearer note: the lane's preferred path is to dogfood `mint_admin_bearer` off a
root; that was **blocked today by the per-uid mint quota (10/10 reached)**, so the
cycle was run with the pool root bearer directly (in-memory only, not burned). The
quota exhaustion is an ops observation on the bearer-mint feature, not a QR
finding. QR sessions self-consume on approved-GET or expire ≤5 min (no DELETE API
for arbitrary pending docs — a few short-lived `pending` rows may linger ≤5 min;
harmless).

## Summary

| ID | Sev | Title | Verify |
|----|-----|-------|--------|
| F1 | HIGH | QR onboarding UNREACHABLE (orphaned by `/`→/perform redirect) | PROD-VERIFIED (A1/A2/A3) |
| F2 | LOW | PUT approval admits literal `member` vs stated intent | PROD-VERIFIED (C1) |
| F3 | NOTE | Harness coverage gaps (410 expiry, no-role refusal) | n/a |
| F4 | NOTE+ | QR backend cycle + iPad sign-in correct under WebKit | PROD-VERIFIED (B1/C2/D2/E1) |

**One fix-worth-triaging: F1 (HIGH).** F2 is a one-line Daniel ruling. The flow's
mechanics are healthy; the problem is the door is locked.
