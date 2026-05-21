# CRIT-003 — Scoped bridge credential DESIGN (reopened)

**Lane:** monitor-crit003 · **Author:** coder-3 · **Base:** `c2c45b6f4` · **Date:** 2026-05-21
**Type:** DESIGN / RESEARCH — recommendations only, **no implementation**. Code read READ-ONLY at the
base SHA. This doc reopens the long-deferred **CRIT-003** (Daniel 2026-05-14: "not important; don't
include and leave be") because the 2026-05-21 monitor audit (BR-13 / F1) gives a concrete reason to
revisit: the bridge's credential **is** the security boundary for X32 control.

> **Decision context note.** `decisions.md` 2026-05-18T15:30Z reframed CRIT-003 as dissolving into
> "Bitfocus Companion HTTP API + Cloudflare Tunnel + Access." **That direction is dead** — both audit
> lanes confirmed Companion is obsolete and the deployed system is the Electron+Firestore bridge
> (`monitor-audit-SYNTHESIS.md` §convergence-1). So CRIT-003 is a *live* custom-bridge credential
> question again, exactly as originally framed. This doc supersedes the Companion framing.

---

## 1. Current posture + exact threat model

### What the bridge holds today

- The bridge authenticates to Firebase with a **Firebase Admin service-account key**, loaded from a
  plaintext JSON file next to the exe (`bridge/src/config.ts:28-39` reads `FIREBASE_SA_KEY_PATH`;
  `bridge/src/main.ts:316-317` writes `service-account-key.json`).
- The key is obtained once via the **setup-code flow**: admin generates a 10-char code
  (`src/app/api/bridge/setup-code/route.ts:33-66`, `band_leader`-gated); the bridge redeems it
  (`main.ts:297-339` → GET `/api/bridge/setup-code?code=…`).
- **FACT — the bridge does not get its own key; it gets a copy of the production server's key.** The
  redeem branch builds the returned credential from `process.env.FIREBASE_CLIENT_EMAIL` +
  `process.env.FIREBASE_PRIVATE_KEY` (`setup-code/route.ts:143-161`). Those are the **exact same env
  vars the Next.js backend initializes its own Admin SDK with** (`src/lib/firebase-admin.ts:18-20`).
  So the studio PC ends up holding the private key of the **same identity the production backend runs
  as** — not a separate, lesser credential.
- The key is **never rotated** (no rotation path exists anywhere in the code), and it is **never
  scoped** (a Firebase Admin SA is full-project: all of Firestore, the entire Auth user database
  incl. token minting "as anyone," Cloud Storage, etc.).

### Why this credential is the security boundary (not just one of several)

Per Lane 2's F1 (`monitor-audit-lane2-app-mcp-FINDINGS.md` §3.1) the **bridge is the SOLE
authoritative authorization gate** for X32 control: `firestore.rules` does authN + attribution +
loose schema only, and MCP's `assertMonitorAccess` is bypassable by a direct Web-SDK write. The only
thing between an arbitrary signed-in user's command and the physical mixer is the bridge's
`isCommandAuthorized` — which runs **as this admin identity**. Compromise the credential and you
don't just read data; you become the trusted executor.

### Threat model

| # | Threat | Today's exposure |
|---|---|---|
| T1 | **Physical / local access to the studio PC** (the audit's headline) | Plaintext JSON → attacker copies the **production backend's** full-admin private key. Full Firestore read/write, full Auth admin (mint a session as any admin → total app takeover), Storage. The single worst outcome. |
| T2 | **Credential exfiltration by malware on the PC** | Same as T1; the file is unencrypted at rest and world-readable by the bridge user. |
| T3 | **Setup-code interception / replay** | Mitigated already: codes are 10-char, single-use via a transaction (`route.ts:95-108`), 10-min TTL (`:56`), rate-limited (`:71-72`), and redemption emits an audit doc + admin email (`:114-140`). Residual: the code is sent over the URL query string, and *anyone* who redeems gets the full admin key (the code is the only secret). |
| T4 | **No rotation / no revocation** | If the key leaks, there is no mechanism to invalidate it short of rotating the **production backend's** SA key in GCP — which simultaneously re-credentials the live website. Blast radius of a rotation is the whole product. |
| T5 | **Compromise blast-radius coupling** | Because bridge identity == server identity, you cannot reason about, audit, or revoke "the bridge" independently of "the website." Audit-log attribution cannot distinguish bridge writes from backend writes. |

**Bottom line:** the realistic, audit-flagged threat is **T1/T2** (physical/local access to a
weakly-secured studio PC), and the severity multiplier is **T4/T5** (the leaked key is the
production identity, unrotatable without taking down the site). The fix target is therefore two
things at once: **(i) shrink what the on-disk credential can do**, and **(ii) decouple it from the
production identity so it can be rotated/revoked independently.**

---

## 2. The bridge's ACTUAL required permission set (least-privilege target)

Enumerated from every Firestore/Auth op the running bridge makes (`config.ts` + `firestore-transport.ts`):

| Resource | Ops the bridge performs | Where |
|---|---|---|
| `config/monitor` (single doc) | **read** (`.get()`), **listen** (`.onSnapshot`), **create-if-missing** (`.set()`), **update** (`x32Address`, `bridgeUrl`, `bridge.*` heartbeat/offline fields) | `config.ts:44,50,61,133,146,159,181,196` |
| `users/{uid}` | **read** — only `role` + `soundEngineer` fields — once **per command** (BR-01) | `firestore-transport.ts:329` |
| `monitor-live/state` (single doc) | **write** (`.set()` full + `.update()` deltas) | `firestore-transport.ts:84,152` |
| `monitor-live/commands/pending/*` | **listen** (orderBy), **update** (error-mark), **delete**, **query** (`where createdAt < … limit 50`) | `firestore-transport.ts:173,244,266,310,313,431-439` |
| Firebase **Auth** | `admin.auth().verifyIdToken(token)` — defined at `config.ts:91-103` (`verifyToken`) | see INFERENCE-1 |

**So the entire legitimate footprint is three Firestore paths** — `config/monitor` (RW),
`users/{uid}` (R, two fields), `monitor-live/**` (RW+delete) — **plus possibly ID-token verification.**

What the bridge demonstrably does **NOT** need, yet the current admin key grants: every other
Firestore collection (charts, library, setlists, scheduling, templates, …), **Auth user management**
(create/delete/disable users, **mint tokens as any user**), Cloud Storage, and Remote Config. The
gap between "needs 3 paths" and "holds full project admin" is the whole of CRIT-003.

> **Hard constraint that shapes every option (FACT):** today `firestore.rules` explicitly **denies**
> client access to the monitor transport — `monitor-live/state` `allow write: if false`,
> `commands/pending` `allow read/update/delete: if false` (`firestore.rules:385-410`). The comments
> say "Bridge writes/reads via Admin SDK (bypasses rules)." **The current design is structurally
> dependent on the Admin SDK bypassing rules.** Any option that moves the bridge *under* rules
> (option c) therefore requires rewriting these rules — it is not a drop-in credential swap.

---

## 3. Options analysis

Two near-orthogonal axes fall out of the threat model:
- **Scope axis** — how narrow are the bridge's powers (full admin → separate SA minus Auth/Storage →
  rules-scoped to the 3 monitor paths).
- **Secret-lifetime axis** — how long-lived is the on-disk secret (permanent private key → short-lived
  rotating token).

**Critical platform fact (FACT, GCP-confirmable):** GCP IAM **cannot scope a service account to
specific Firestore collections/documents.** Predefined Firestore roles (`roles/datastore.user`,
`roles/datastore.viewer`) are **project-wide**. Per-document Firestore authorization is done by
**Security Rules**, not IAM. Consequence: a "least-privilege SA" that still uses the **Admin SDK**
gets project-wide Firestore no matter how you trim its IAM — you can drop *non-Firestore* powers
(Auth, Storage) but not narrow Firestore itself. **Only going through Security Rules (option c)
achieves true per-collection Firestore least privilege.**

### (a) Dedicated least-privilege custom service account (Admin SDK, scoped IAM)

Create a **new** SA, e.g. `monitor-bridge@<project>.iam.gserviceaccount.com`, distinct from the
backend SA. Grant it `roles/datastore.user` (Firestore RW) and **nothing else** — explicitly **no**
Auth-admin role, **no** Storage role, **no** token-creator role. The setup-code endpoint vends *this*
key instead of the server's.

- **Security gain:** **HIGH on blast-radius**, **LOW on Firestore scope.** Kills T5 (bridge ≠ server
  identity), removes Auth-takeover + Storage from the leak (the worst part of T1 — no more "mint a
  session as admin"). But a leak still yields **project-wide Firestore** RW (can read/corrupt all
  collections) because Admin SDK bypasses rules.
- **Rotation:** independently rotatable/revocable without touching the live site (fixes T4). Still a
  **permanent private key on disk** between rotations (T1/T2 lifetime unchanged).
- **Ops impact (solo-maintainer one-click flow):** **LOW.** One-time GCP-console task for Daniel
  (create SA, assign one role, download key into the env the setup-code endpoint reads). Electron flow
  is byte-identical (still redeems a code → writes a JSON key). No bridge-code change beyond *which*
  env vars the endpoint reads.
- **BR-01 interaction:** none — still does the per-command `users/{uid}` read; scoping is orthogonal
  to the caching fix.
- **BR-10 interaction:** none inherent, but a distinct identity makes a future owner-lease
  attributable.

### (b) Short-lived minted credentials via the existing setup-code/refresh endpoint

Stop putting a permanent private key on disk. The bridge holds only a **long-lived enrollment
secret**; it periodically calls a server endpoint that mints a **short-lived (~1 h) credential**.
Because the Admin SDK needs an SA key (or ADC) — not a custom token — "short-lived for Admin SDK" in
practice means the server uses **IAM Credentials `generateAccessToken`** on the dedicated SA from (a)
to vend a ~1 h OAuth2 access token, which the bridge uses as a bearer against the Firestore REST API
(or refreshes an ADC-style token source). The existing setup-code infra (`route.ts`) is the natural
home for the enrollment + refresh surface.

- **Security gain:** **MED-HIGH.** Disk theft (T1/T2) now yields ≤1 h of access plus the enrollment
  secret — and the enrollment secret can be made revocable server-side (kill switch). Still
  project-wide Firestore *during* that hour if built on the (a) SA.
- **Rotation:** **excellent / automatic** — short TTL, revoke by disabling the enrollment record.
  Best answer to T4.
- **Ops impact:** **MED.** New moving parts: a refresh endpoint, a bridge refresh loop, and
  **offline tolerance** — if the studio PC can't reach the endpoint at refresh time the bridge must
  degrade gracefully (keep last token until expiry, surface a clear "re-enroll" state). More to
  debug for a solo maintainer; the Electron one-click enroll still works (code → enrollment secret).
- **BR-01:** orthogonal. **BR-10:** the refresh/enrollment record *could* double as a single-owner
  lease (vend to one active enrollment at a time) — a real, if secondary, bonus.

### (c) Scoped Firebase **identity** + firestore.rules (bridge runs as a rules-bound principal)

Give the bridge a dedicated **Firebase Auth identity** (a service uid with a custom claim, e.g.
`bridge:true`), authenticate via `signInWithCustomToken` (custom token minted by the
setup-code/refresh endpoint, auto-refreshed), and have it operate through the **client SDK subject to
Security Rules** — no Admin SDK at all. Then add rules admitting `request.auth.token.bridge == true`
to read/write exactly `config/monitor`, read `users/{uid}`, and read/write/delete `monitor-live/**`.

- **Security gain:** **HIGHEST.** True per-collection Firestore least privilege, **enforced by
  Firestore itself.** A leak gives access to only the 3 monitor paths — no other collection, no Auth
  DB, no Storage, no token minting. Fully neutralizes T1/T2/T5.
- **Rotation:** **excellent** — short-lived ID tokens auto-refresh; revoke by disabling the bridge
  user / stripping the claim.
- **Ops impact:** **HIGHEST.** (1) Must **rewrite** the `monitor-live/*` + `config/monitor` rules
  (currently `if false` for the bridge's ops) → directly **collides with Lane F1's rules hardening**
  and needs coordination + a real rules-test surface (which today is absent — F10). (2) **Couples
  bridge availability to rules correctness** — today the Admin SDK is *immune* to rules mistakes; under
  (c) a bad rules deploy can break monitor control mid-service. (3) If `verifyToken` is live
  (INFERENCE-1) it must be re-homed (client SDK can't `verifyIdToken`). (4) Same refresh-loop /
  offline-tolerance complexity as (b).
- **BR-01 interaction:** notable. Under rules, the per-command `users/{uid}` read either stays (needs
  a rule letting the bridge read roles) or partially folds into the bridge's claim — but Lane 2
  already notes per-bus ownership is awkward in CEL, so the bridge still needs `config/monitor` +
  role data. (c) **relocates** BR-01's read rather than removing it.
- **BR-10 interaction:** a bridge Auth identity is a natural lease-holder, but `signInWithCustomToken`
  permits concurrent sign-ins of the same uid, so it does **not** enforce single-instance by itself.

### (d) Status quo + rotation hygiene only

Keep Admin SDK, but: stop reusing the **server's** key (mint at least a separate key — i.e. the
cheap half of (a)), **encrypt the key at rest** (Windows **DPAPI** ties the secret to the machine/user
account so a copied file is useless elsewhere), restrict the file ACL to the bridge user, and document
a **scheduled rotation** runbook.

- **Security gain:** **LOW-MED.** The unscoped key still exists, but **DPAPI at-rest encryption is a
  genuine, cheap win against T1/T2** (the copied file won't load on another machine). Rotation
  shrinks the leak window. Does nothing for scope.
- **Rotation:** manual/scheduled — depends on discipline (the audit's "never rotated" is the current
  failure of exactly this).
- **Ops impact:** **LOWEST** — a runbook + a small DPAPI wrap of the read/write at `config.ts:29` /
  `main.ts:316`. No architecture change.
- **BR-01 / BR-10:** orthogonal.

### Side-by-side

| Option | Firestore scope | Non-Firestore powers removed | On-disk secret | Decouples from server identity | Rotation | Ops cost | Touches do-not-touch zones |
|---|---|---|---|---|---|---|---|
| (a) custom SA | project-wide (Admin) | **yes** (Auth+Storage) | permanent key | **yes** | manual, independent | **low** | setup-code route + GCP console |
| (b) short-lived mint | project-wide *during TTL* | yes (if on (a) SA) | enrollment secret + ≤1h token | yes | **auto** | med | setup-code route + refresh loop |
| (c) rules-scoped identity | **3 paths only (enforced)** | **all** | ≤1h ID token + refresh | **yes** | **auto** | **high** | **firestore.rules (Lane F1)** + bridge auth + setup-code route |
| (d) hygiene only | project-wide (Admin) | optional (separate key) | encrypted-at-rest key | only if separate key | manual | **lowest** | bridge config read + runbook |

---

## 4. RECOMMENDATION

**Phased, with (a) as the immediate move and (c) as the end-state to weigh against its ops cost.**

### Recommended path

1. **Now — Option (a): a dedicated least-privilege custom service account.** This is the highest
   security-gain-per-ops-cost step and it directly neutralizes the *worst* finding (T1+T5: the studio
   PC holding the **production backend's** identity). Concretely: a separate SA with only
   `roles/datastore.user`, **no** Auth/Storage/token-creator roles; the setup-code endpoint vends
   *that* key. The Electron one-click flow is unchanged; the only work is GCP-console setup + reading
   different env vars. *Even if nothing else is ever done, this removes Auth-takeover from a key
   leak and makes the credential independently rotatable.*

2. **Alongside (a) — pull the cheap hygiene from (d):** encrypt the on-disk key at rest (Windows
   DPAPI), restrict its file ACL, and write a rotation runbook. These apply no matter which secret
   sits on disk and are near-zero cost.

3. **Next — Option (b): short-lived minted credentials** built on the (a) SA, to attack the
   secret-lifetime axis (T1/T2 → ≤1 h exposure + a revocable enrollment secret). Adopt when the
   refresh-loop / offline-tolerance complexity is justified.

4. **End-state to evaluate — Option (c): rules-scoped bridge identity** for true per-collection
   Firestore least privilege. **Do not pursue (c) standalone** — bundle it with **Lane F1's
   firestore.rules hardening** (they rewrite the same `monitor-live/*` rules) and only after a
   `monitor-live` rules-test harness exists (audit F10). Its decisive cost is **coupling bridge
   availability to rules correctness**, which a solo maintainer should adopt deliberately, not by
   default.

**Why not lead with (c)?** It is the strongest scope answer but the most expensive and the riskiest
for a solo, deploy-to-prod, weekly-use shop: it rewrites the very rules another lane is hardening,
adds a rules-test surface that doesn't exist yet, and makes a bad rules deploy able to break monitor
control mid-service. (a) captures most of the real-world risk reduction (Auth-takeover + identity
decoupling) for a fraction of the cost; (c) is the principled finish line once the rules surface is
mature.

### Migration sketch (no code)

- **(a)** Create `monitor-bridge` SA in GCP console → grant `roles/datastore.user` only → generate a
  JSON key → store its `client_email` / `private_key` in a **new** env pair (e.g.
  `BRIDGE_SA_CLIENT_EMAIL` / `BRIDGE_SA_PRIVATE_KEY`) read by `setup-code/route.ts` instead of the
  server's `FIREBASE_*`. Re-run the setup-code flow on the studio PC to swap the on-disk key. Verify
  the bridge still reads/writes the 3 paths and that the new SA **cannot** read a non-monitor
  collection or touch Auth (negative test). Retire the old reuse of `FIREBASE_CLIENT_EMAIL/PRIVATE_KEY`
  for the bridge.
- **(d-hygiene)** Wrap the key file read (`config.ts:29`) + write (`main.ts:316-317`) in DPAPI
  protect/unprotect; tighten the file ACL; add a rotation runbook to `bridge/SETUP_GUIDE.md` (which
  per BR-20 needs rewriting anyway).
- **(b)** Add a `POST /api/bridge/refresh` (enrollment-secret-authenticated) that returns a ~1 h
  token via IAM Credentials `generateAccessToken` on the (a) SA; bridge runs a refresh loop with
  graceful-degrade-on-offline. Enrollment secret stored encrypted (d).
- **(c)** Mint a `bridge:true`-claimed custom token from the same endpoint; bridge signs in via the
  client SDK; **add bridge-principal allowances to the `monitor-live/*` + `config/monitor` rules
  (coordinate with Lane F1)**; add a `monitor-live` rules test; drop the Admin SDK from the bridge;
  re-home `verifyToken` if still used.

### The explicit decision Daniel must make

1. **Pick the target end-state on the scope/lifetime axes:** **(a) only** (decouple + drop
   Auth/Storage; cheapest meaningful win) · **(a)+(b)** (also kill the permanent on-disk key) ·
   **(a)+(b)+(c)** (true per-collection least privilege, highest ops cost + rules coupling).
   *Recommendation: commit to **(a) + (d)-hygiene now**, schedule (b), treat (c) as a Lane-F1-bundled
   stretch.*
2. **Authorize the touch zones** the chosen path needs. All paths touch
   `src/app/api/bridge/setup-code/route.ts`; (b)/(c) touch `bridge/**`; (c) touches
   `firestore.rules`. `bridge/**` is the MCP-workstream **do-not-touch** zone
   ([[project_mcp_parallel_workstream]]) and firestore.rules is shared with **Lane F1** — both need
   explicit Daniel OK + cross-lane coordination before any implementation lane is dispatched.
3. **Confirm the current GCP IAM** on the backend SA (INFERENCE-2) so we know exactly which roles a
   separate bridge SA must *not* inherit.

---

## 5. FACTS vs INFERENCES

**FACTS (read at `c2c45b6f4`):**
- The bridge loads an Admin SA key from plaintext disk (`config.ts:28-39`, `main.ts:316-317`).
- The setup-code endpoint vends the **server's own** `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
  (`setup-code/route.ts:143-161`), identical to the backend Admin init (`firebase-admin.ts:18-20`).
- No rotation path exists in the repo (grep: no rotation/expiry logic on the bridge key).
- The bridge's complete legitimate footprint is the 3 Firestore paths in §2 (full op enumeration from
  `config.ts` + `firestore-transport.ts`).
- `firestore.rules` denies client access to `monitor-live/*` (`if false`), so the current design
  structurally depends on Admin-SDK-bypasses-rules (`firestore.rules:385-410`).
- Setup-code redemption is single-use (transaction), 10-min TTL, rate-limited, audit-logged + emailed
  (`route.ts:71-140`).
- GCP IAM has no per-collection Firestore scoping; Firestore document authZ is via Security Rules
  (platform fact; confirmable in GCP docs/console).

**INFERENCES (need the prod-PC / GCP console to confirm):**
- **INFERENCE-1:** `config.ts:91-103 verifyToken` (`admin.auth().verifyIdToken`) appears to be
  **vestigial** — no caller remains in the current transport (it predates the removed WS/HTTP server,
  BR-05/BR-20). If truly dead, option (c)'s "client SDK can't verifyIdToken" objection evaporates.
  **Confirm there is no live caller** before relying on this.
- **INFERENCE-2:** the **actual IAM roles** currently bound to the backend SA (and thus inherited by
  the bridge today) — needs the GCP console. Determines exactly what a scoped SA must drop.
- **INFERENCE-3:** whether the studio PC's OS account supports DPAPI in the deployed configuration
  (it should on Windows; confirm it's not a shared/again-physically-trivial login).
- **INFERENCE-4:** whether `generateAccessToken` (IAM Credentials API) is enabled on the project —
  needed for option (b); enable in GCP console.

---

*Lane monitor-crit003 · coder-3 · DESIGN/RESEARCH · READ-ONLY on code · base `c2c45b6f4` ·
supersedes the Companion framing of CRIT-003; coordinates with Lane F1 (rules) + the bridge/**
do-not-touch zone.*
