# Lane monitor-crit003 — Scoped bridge credential DESIGN (reopen deferred CRIT-003) · Tier 0 (design)

You are **coder-3**. Daniel is **reopening the long-deferred CRIT-003** (bridge-credentials design),
now informed by the full monitor audit. This is a **DESIGN / RESEARCH lane** — produce a design doc
+ recommendation. **Do NOT implement a credential change** (it's a security decision for Daniel).

**The problem (from the audit, BR-13):** the bridge authenticates with a **full-project-admin
Firebase service-account key**, stored **plaintext** next to the exe on the studio PC, downloaded
once via the setup-code flow, **never rotated**. A physically-accessible studio PC therefore holds
an unscoped admin credential — but the bridge only actually needs a handful of operations.

CRIT-003 was previously deferred (Daniel 2026-05-14: "not important; don't include and leave be").
The audit is the reason to revisit it; you must fold in **everything learned**.

## MUST READ (all the info learned)
- `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/research/monitor-audit-SYNTHESIS.md`
- `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` — **BR-13** (cred posture), plus **BR-01**
  (per-command `users/{uid}` read), **BR-10** (no real single-instance lock)
- `.paul/research/monitor-audit-lane2-app-mcp-FINDINGS.md` — **F1** (bridge is the sole authoritative
  authz gate — so the bridge's credential IS the security boundary)
- Current credential flow (read, don't edit): `bridge/src/main.ts` (~297-339 setup-code →
  `service-account-key.json`), `bridge/src/config.ts` (~28-39 load via `FIREBASE_SA_KEY_PATH`),
  `src/app/api/bridge/setup-code/route.ts` (the issuing endpoint) + its test.

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-monitor-crit003 -b feat/monitor-crit003-cred-design c2c45b6f4
cd ../sheet-music-app-monitor-crit003
```
ACK; create `.coord/status/coder-3.md`. READ-ONLY on code — your only write is the design doc.

## §2 Deliverable — `.paul/research/crit-003-bridge-credential-DESIGN.md`
1. **Current posture + exact threat model:** unscoped admin SA key, plaintext on disk, no rotation,
   physical-access exposure; and (per F1) this credential is the security boundary for X32 control.
2. **The bridge's ACTUAL required permission set** — enumerate every Firestore op the bridge makes
   (derive from `firestore-transport.ts` + `config.ts`): e.g. read `config/monitor`, read
   `users/{uid}` role, read+write `monitor-live/*`. This is the least-privilege target.
3. **Options analysis with tradeoffs:**
   - (a) **Least-privilege custom service account** (IAM/Firestore-scoped to the needed paths).
   - (b) **Minted short-lived creds via the existing setup-code endpoint** (custom token / scoped,
     rotating) — leverages infra that already exists.
   - (c) **Scoped identity + firestore.rules** for the bridge instead of Admin SDK (so rules apply
     to the bridge too — note this interacts with Lane F1's rules hardening).
   - (d) **Status quo + rotation hygiene only** (cheapest; least improvement).
   For each: security gain, rotation story, ops impact on the **solo-maintainer Electron one-click
   flow**, and interaction with **BR-01** (does scoping change the per-command user read?) and
   **BR-10** (single-instance lease — could the same identity mechanism carry an owner lease?).
4. **RECOMMENDATION** + a migration sketch (no code) + the explicit **decision Daniel must make**.
5. **FACTS vs INFERENCES** (you read source at a SHA; flag anything needing the prod-PC / GCP console
   to confirm, e.g. current IAM roles on the SA).

## §3 Ship
Docs-only → FF-push → `master-tip.md` → SHIP-NOTICE (`from coder-3`). Tier-0 design; supervisor
self-verifies; auditor may review the design. Do NOT touch `bridge/` code or `firestore.rules`
(coordinate with Lanes F1/F2 — your doc may reference their changes).
