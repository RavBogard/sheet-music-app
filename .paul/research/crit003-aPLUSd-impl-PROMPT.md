# Lane crit003-impl — CRIT-003 a+d: scoped least-privilege bridge credential (VERIFY-SAFE → implement) · Tier 2

You are **coder-3** — you wrote the CRIT-003 design, so you have the context. Daniel approved **option
a+d** (dedicated least-privilege bridge service account + rotation hygiene), with one explicit
condition: **"make sure it's not going to mess anything up" FIRST, then do a+d.** So this lane has a
hard safety gate before any credential change.

**The problem (recap):** the bridge authenticates with the backend's OWN full-project-admin SA key
(vended cleartext by `setup-code`, never rotated, sitting on a shared-LAN studio PC). A leaked key =
full Auth takeover. a+d gives the bridge a *separate, scoped* identity instead.

## §0 SAFETY GATE — verify it won't break the bridge (do this FIRST, document it)
Before changing what's vended, enumerate **every** Firestore/Storage/Auth operation the bridge
actually performs (read `bridge/src/firestore-transport.ts`, `config.ts`, `main.ts`): e.g. read
`config/monitor`; read `users/{uid}` role (NOTE: coder-2's bridge-cleanup lane is caching this — BR-01;
coordinate); read+write `monitor-live/*`; anything else. Map each op → the minimum permission.
**Confirm a scoped SA (`roles/datastore.user` or a tighter custom role) covers ALL of them and that
the bridge needs NO Auth-admin / NO full-project-admin.** If ANY bridge op needs more than the scoped
role → that's the "would mess something up" case: surface it and STOP for a Daniel decision rather
than shipping a scope that breaks the bridge.

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-crit003-impl -b feat/crit003-aPLUSd c2c45b6f4
cd ../sheet-music-app-crit003-impl   # base: current origin/master (run git fetch; tip 1ad242468)
```
(Use the current `origin/master` tip as base.) ACK; create `.coord/status/coder-3.md`; claim
`src/app/api/bridge/setup-code/route.ts`.

## §2 Implement (only after §0 passes)
- **(a) scoped SA vending:** change `src/app/api/bridge/setup-code/route.ts` to vend a DEDICATED
  least-privilege bridge SA key (new env vars, e.g. `BRIDGE_SA_PRIVATE_KEY`/`BRIDGE_SA_CLIENT_EMAIL`)
  instead of the backend's `FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL`. **Do NOT touch
  `firebase-admin.ts` / the Next.js backend's own identity** — blast radius stays limited to what the
  bridge receives. Per your own DESIGN doc's Option (a).
- **(d) rotation hygiene:** make the scoped key swappable via env (no code change to rotate); document
  the rotation procedure. Keep the existing redemption gates intact (single-use + 10-min TTL +
  rate-limit + audit-log + band_leader-gate — do NOT weaken any).
- **Rollout safety note:** the currently-running bridge keeps its existing key until it re-runs setup,
  so this change does NOT break the running bridge — it only affects future setup-code redemptions.

## §3 Daniel-console runbook (you produce; he executes)
Exact `gcloud`/console steps to: create the scoped bridge SA, grant the minimum role(s) from §0,
generate its key, set `BRIDGE_SA_*` in Vercel; then the studio-PC rollout (re-run setup-code to swap
the bridge onto the scoped key → rotate/revoke the old master-key exposure). The SA creation is
Daniel's console action — you deliver precise steps + wait.

## §4 Deliverable + ship
- Code: the vending change + rotation support.
- `.paul/research/crit-003-aPLUSd-rollout.md`: the §0 verify-safe analysis (permission map proving
  nothing breaks) + the GCP runbook + the rollout steps.
- **Tier 2** (security/credential) → FULL auditor rigor. Push FF → `master-tip.md` → SHIP-NOTICE
  (`from coder-3`) → agents.md → archive → release claims. Code lands now; the GCP-side SA + Vercel env
  + studio-PC re-setup are Daniel-console follow-ups (your runbook drives them).
