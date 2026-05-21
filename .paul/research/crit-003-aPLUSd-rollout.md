# CRIT-003 a+d — scoped least-privilege bridge credential: VERIFY-SAFE map + rollout

**Lane:** crit003-impl · **Author:** coder-3 · **Base:** `5dd02b555` · **Date:** 2026-05-21
**Tier:** 2 (security / credential) · **Companion design:** `crit-003-bridge-credential-DESIGN.md`

This doc accompanies the code change in `src/app/api/bridge/setup-code/route.ts`. It records the
**§0 verify-safe permission map** (Daniel's condition: *"make sure it's not going to mess anything up"
FIRST*), then the GCP + Vercel + studio-PC runbook Daniel executes to finish the rollout.

The **code lands now**; it is inert until Daniel sets `BRIDGE_SA_*` in Vercel and re-runs setup on the
studio PC. Before that, redemption behaves exactly as today (vends the server's `FIREBASE_*` key, now
with a loud log warning).

---

## §0 — VERIFY-SAFE permission map (proof a scoped SA won't break the bridge)

Enumerated from **every** Firestore / Storage / Auth operation the running bridge performs, read at
master `5dd02b555` (the bridge files moved since the DESIGN base `c2c45b6f4` via `e41adbd30`,
`a5d35f47f`, `c0b2342a2` — re-verified here).

| Resource | Ops the bridge performs | Where (master `5dd02b555`) | Minimum permission |
|---|---|---|---|
| `config/monitor` (single doc) | `get`, `onSnapshot` (listen), `set` (create-if-missing), `update` (x32Address, bridgeUrl, `bridge.*` heartbeat/offline) | `bridge/src/config.ts:44,50,61,147,157,182,195,209` | Firestore read+write |
| `users/{uid}` | `get` — reads only `role` + `soundEngineer`, once per command | `bridge/src/firestore-transport.ts:332` | Firestore read |
| `monitor-live/state` (single doc) | `set` (full), `update` (deltas) | `bridge/src/firestore-transport.ts:84,152` | Firestore write |
| `monitor-live/commands/pending/*` | `onSnapshot` (orderBy listen), `update` (error/timeout mark), `delete`, `where(createdAt <…).limit(50).get()` | `bridge/src/firestore-transport.ts:171-175,244,250,266,310,313,435-442` | Firestore read+write+delete+query |

### What the bridge does NOT do (negative findings — the safety proof)

- **No Cloud Storage.** Zero `getStorage` / `.bucket(` / `storage()` references anywhere in
  `bridge/src` (grep, whole dir).
- **No Auth-admin.** Zero `createUser` / `getUser` / `deleteUser` / `setCustomUserClaims` /
  `createCustomToken` / `listUsers`. The single `admin.auth()` reference is
  `config.ts:91 verifyToken` → `verifyIdToken`, and it has **no caller** anywhere in `bridge/src`
  (grep for `verifyToken` returns only its definition). It is **vestigial** (predates the removed
  WS/HTTP server). Even if re-activated, `verifyIdToken` is offline JWT verification against Google's
  public certs and needs **no project IAM Auth role**.
- **No token minting, no Remote Config, no Messaging, no user management.**

### Verdict: **GATE PASS**

The bridge's entire legitimate footprint is **three Firestore paths**: `config/monitor` (RW),
`users/{uid}` (R), `monitor-live/**` (RW + delete + query). A dedicated service account with
**`roles/datastore.user`** (project-wide Firestore RW via the Admin SDK) covers **all** of them. The
bridge needs **no** Auth-admin, **no** Storage, **no** token-creator role.

> **Residual scope note (carried from DESIGN §3):** `roles/datastore.user` is project-*wide* Firestore
> (GCP IAM cannot scope an Admin-SDK SA to specific collections — that needs Security Rules, i.e. the
> deferred option (c)). So a leak of the scoped key still yields project-wide Firestore RW, but **no
> longer** Auth-takeover / token-minting / Storage. That is the a+d security gain: it removes the
> *worst* outcome (mint a session as any admin → total app takeover) and decouples the bridge identity
> from the production backend so it is independently rotatable/revocable. Option (c)'s true
> per-collection least privilege remains a Lane-F1-bundled future step.

---

## The code change (what shipped)

`src/app/api/bridge/setup-code/route.ts`, GET (redeem) handler — credential-building block only.
Redemption gates are **untouched** (single-use transaction, 10-min TTL, rate-limit, audit-log + email,
`band_leader`-gated POST).

- **(a) scoped vending.** If **both** `BRIDGE_SA_CLIENT_EMAIL` and `BRIDGE_SA_PRIVATE_KEY` are set,
  the endpoint vends *that* identity. The email + key are selected **together** (not per-field) so a
  half-configured env can never produce a mismatched, non-authenticating pair.
- **Safe fallback.** If either is missing, it vends the server's `FIREBASE_*` credential (today's
  behavior) and logs a loud `logger.warn`. → the change cannot break redemption before the SA exists.
- **(d) rotation hygiene.** The vended key is read straight from env, so rotation is a **Vercel env
  swap with no code change**. Optional `BRIDGE_SA_PRIVATE_KEY_ID` flows into the key's `private_key_id`.
- **Observability.** The JSON response gains an additive `scoped: boolean` field (the bridge reads only
  `credentials`, so this is non-breaking) — lets the deployed REPRO confirm which identity was vended
  without exposing the key.

Tests: `src/app/api/bridge/__tests__/setup-code.test.ts` — 11 cases (7 original gates intact + 4 new:
scoped-vend, fallback-with-warning, `private_key_id` override, partial-env safe fallback).

---

## Runbook — Daniel-console actions (you execute; code is already live)

Project: **`crcmusiccharts`**. Replace placeholders as noted. Requires `gcloud` authed to the project
(`gcloud auth login` then `gcloud config set project crcmusiccharts`) **or** use the Cloud Console UI
equivalents in parentheses.

### Step 1 — Create the dedicated bridge service account

```bash
gcloud iam service-accounts create monitor-bridge \
  --project=crcmusiccharts \
  --display-name="X32 Monitor Bridge (scoped, CRIT-003)"
```
(Console: IAM & Admin → Service Accounts → Create → name `monitor-bridge`.)

Its email will be: `monitor-bridge@crcmusiccharts.iam.gserviceaccount.com`.

### Step 2 — Grant ONLY the minimum role (Firestore user), nothing else

```bash
gcloud projects add-iam-policy-binding crcmusiccharts \
  --member="serviceAccount:monitor-bridge@crcmusiccharts.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```
Do **not** grant any Auth, Storage, Token Creator, Editor, or Owner role. This single role is the whole
permission set proven sufficient in §0.

### Step 3 — Generate a JSON key for the scoped SA

```bash
gcloud iam service-accounts keys create monitor-bridge-key.json \
  --iam-account=monitor-bridge@crcmusiccharts.iam.gserviceaccount.com
```
(Console: the SA → Keys → Add Key → Create new key → JSON.)

This downloads `monitor-bridge-key.json`. From it you need three fields: `client_email`, `private_key`,
and `private_key_id`. **Keep this file out of git and delete it after Step 4.**

### Step 4 — Set `BRIDGE_SA_*` in Vercel (Production)

In Vercel → Project → Settings → Environment Variables, add (Production scope):

| Name | Value (from `monitor-bridge-key.json`) |
|---|---|
| `BRIDGE_SA_CLIENT_EMAIL` | the file's `client_email` (`monitor-bridge@crcmusiccharts.iam.gserviceaccount.com`) |
| `BRIDGE_SA_PRIVATE_KEY` | the file's `private_key` — paste verbatim. The `\n` escapes are handled in code (`replace(/\\n/g, "\n")`), so paste exactly as it appears in the JSON. |
| `BRIDGE_SA_PRIVATE_KEY_ID` | (optional) the file's `private_key_id` — for traceability |

Redeploy (env var changes need a fresh deploy to take effect). After redeploy, a setup-code redemption
returns `"scoped": true`.

> **Security:** once pasted into Vercel, delete the local `monitor-bridge-key.json`
> (`rm monitor-bridge-key.json`). The key now lives only in Vercel's encrypted env + (after Step 5) the
> studio PC.

### Step 5 — Studio-PC rollout (swap the running bridge onto the scoped key)

The currently-running bridge keeps its existing (full-admin) on-disk key until it re-runs setup, so
there is **no service interruption** — do this at a convenient (non-service) time:

1. In the app admin panel → generate a new bridge setup code (POST `/api/bridge/setup-code`,
   `band_leader`-gated).
2. On the studio PC, run the bridge's setup/redeem flow with the new code. The bridge fetches the
   **scoped** credential and overwrites its local `service-account-key.json`.
3. Restart the bridge; confirm it still reads `config/monitor`, writes heartbeat, and processes a
   monitor command (i.e. the 3 Firestore paths work under the scoped SA).

### Step 6 — Retire the old full-admin exposure

After the bridge is confirmed healthy on the scoped key, the studio PC no longer needs the production
backend identity. To close T1/T5 fully:

- The old on-disk key was a **copy of the backend `FIREBASE_*` SA**. Because the backend itself still
  uses that SA, you do **not** delete that SA — but you should **rotate the backend `FIREBASE_PRIVATE_KEY`**
  (generate a new key for the backend SA in GCP, update `FIREBASE_PRIVATE_KEY` in Vercel, delete the old
  key version) so any copy that leaked from the studio PC before this rollout is invalidated. This is the
  one-time cleanup of the historical exposure; after it, the studio PC holds only the scoped key.
- Going forward, the studio PC only ever holds the `monitor-bridge` scoped key.

---

## Rotation procedure (option d — repeatable, no code change)

To rotate the **bridge** key on a schedule or after a suspected leak:

1. `gcloud iam service-accounts keys create new-bridge-key.json --iam-account=monitor-bridge@crcmusiccharts.iam.gserviceaccount.com`
2. Update `BRIDGE_SA_PRIVATE_KEY` (+ `BRIDGE_SA_PRIVATE_KEY_ID`) in Vercel → redeploy.
3. Generate a new setup code → re-run setup on the studio PC (Step 5) → bridge picks up the new key.
4. Delete the old key version:
   `gcloud iam service-accounts keys delete <OLD_KEY_ID> --iam-account=monitor-bridge@crcmusiccharts.iam.gserviceaccount.com`
5. `rm new-bridge-key.json` locally.

No code deploy is required for any rotation — it is purely a Vercel env swap + studio-PC re-setup.

---

## Deferred / out-of-scope (do NOT implement here)

- **DPAPI at-rest encryption of the on-disk key** (DESIGN option d, second half) touches
  `bridge/src/config.ts` + `main.ts` — the `bridge/**` **do-not-touch** zone
  ([[project_mcp_parallel_workstream]]). Documented as a follow-up; needs a Daniel-authorized bridge lane.
- **Short-lived minted tokens** (option b) and **rules-scoped identity** (option c, bundled with Lane
  F1) remain future phases per the DESIGN recommendation.

---

## Verification posture

- **Unit:** `setup-code.test.ts` 11/11 (scoped, fallback+warn, key-id override, partial-env safety).
- **§0 safety map:** above — bridge needs Firestore-only; scoped SA covers all; no Auth/Storage/mint.
- **Deployed REPRO (Tier-2):** after ship, redeem a code against
  `https://www.centralreform.live/api/bridge/setup-code?code=…` and assert:
  - Pre-`BRIDGE_SA_*`: `scoped:false`, `credentials.client_email` == server SA, server logs the warning.
  - Post-`BRIDGE_SA_*` (Daniel-gated, after Step 4): `scoped:true`, `credentials.client_email` ==
    `monitor-bridge@crcmusiccharts.iam.gserviceaccount.com`.
  The post-state REPRO is a **Daniel-console follow-up** (it requires the SA + env to exist); the
  pre-state REPRO + the redemption-gates-intact behavior are verifiable at ship time.

*Lane crit003-impl · coder-3 · Tier 2 · code change limited to `src/app/api/bridge/setup-code/route.ts`
+ its test; READ-ONLY on `bridge/**`.*
