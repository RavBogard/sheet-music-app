# Lane bridge-cleanup-fixes — coder-2 — high-value bridge bug fixes (BR-02 / BR-01 / BR-05) · Tier 2

Daniel approved a bridge cleanup before cutting a new bridge release. Implement the three high-value
bugs the monitor audit found (the LOW polish items BR-06..BR-18 are deliberately OUT of scope — keep
this tight). These land on master so the next bridge build includes them.

Daniel has **authorized touching `bridge/`**.

## Read first
- `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/research/monitor-audit-SYNTHESIS.md`
- `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` — **BR-02, BR-01, BR-05** (full evidence + fix directions)

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-bridge-cleanup -b feat/bridge-cleanup-fixes 1ad242468
cd ../sheet-music-app-bridge-cleanup
```
ACK; create `.coord/status/coder-2.md`; claim the files you edit in `shared/claims.md`.

## §2 Scope (EDIT)
1. **BR-02 — idle-X32 false-disconnect** (`bridge/src/x32-client.ts` ~209-225). Replace the
   traffic-inferred liveness (20s of silence ⇒ "disconnected" ⇒ reconnect ⇒ heavy full resync) with an
   explicit periodic `/xinfo` (or `/status`) **keepalive query** + response-based liveness. A quiet X32
   must NOT trigger a false disconnect/resync. (The audit inferred this fires ~every 20s on an idle
   console; the keepalive fix is correct regardless — the studio-PC probe later confirms stability.)
2. **BR-01 — per-command user read** (`bridge/src/firestore-transport.ts` ~329 `isCommandAuthorized`
   + `bridge/src/config.ts`). Stop the `users/{uid}` Firestore read on every fader tick: cache user
   role/`soundEngineer` in-memory with a short TTL, or fold role into the already-watched config
   stream. **Preserve the authz semantics EXACTLY** — post-F1 the bridge is the authoritative
   bus-ownership gate; do not weaken it, and keep F2's array-aware `getUserBus` intact.
3. **BR-05 — dead admin "Scan for X32" button** (`src/components/admin/SoundSystemSection.tsx`
   ~100-145 — **APP side, deploys via Vercel, NOT the bridge build**). The button fetches `/scan` on a
   bridge HTTP port that no longer exists. Remove the dead button (X32 auto-discovers on bridge
   startup) or repoint it; fix the stale `wss://…:9001` placeholder if trivial. Note this is app-side
   in your SHIP-NOTICE (different deploy path than the bridge fixes).

**Do NOT** bump `bridge/package.json` version — the version bump is part of the build/release step
(owned by the runbook lane), not this code lane.

## §3 Tests + guard rails
- Extend bridge tests: BR-02 (mock idle X32 → no false disconnect/resync) + BR-01 (role cache hit;
  authz unchanged for member/musician/engineer/matrix cases).
- Keep `npm run check:types` green; bridge typechecks (note: full bridge tsc needs `cd bridge && npm
  install` — electron is heavy; the CI `build-bridge.yml` is the authoritative gate).
- Do NOT regress F1 (rules/authz) or F2 (array bus assignments). Do NOT touch `main.ts` auto-update
  (that's BR-03, already shipped) or the LOW-polish items.

## §4 Ship
**Tier 2** (BR-01 sits in the authz path) → auditor confirms authz is unchanged. Push FF → overwrite
`master-tip.md` → SHIP-NOTICE (`from coder-2`, call out the app-side BR-05 separately) → mark
agents.md → archive status → release claims. The bridge release is cut AFTER this lands (separate
step, per the runbook lane).
