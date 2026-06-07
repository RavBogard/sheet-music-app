# Lane bridge-release-v10.0.2 (coder-1) — Tier 2, OUTWARD-FACING, bridge single-owner, Daniel-gated

## Context
P2-A bridge observability (ack-write `monitor-live/commands/acks/{commandId}`, B4/B5/B9/B10/B13) is **on master `7eb1b2d9e` + auditor-ACCEPTed** (bridge 70/70), but NOT yet on the live desk — the desk runs **v10.0.1** (P1-A only). This lane builds the release that carries P2-A to the desk. **The code is already verified** (unlike the v10.0.1 cred-code situation) — the only open risk is deploy mechanics + timing.

## ★ DEPLOY-TIMING GATE — READ BEFORE PUBLISHING
Today is **Friday — Fri-eve service is TONIGHT, Shabbat morning TOMORROW.** Publishing a NON-DRAFT release **auto-deploys to the live desk** (autoDownload + autoInstallOnAppQuit). **BUILD + STAGE now, but DO NOT publish non-draft until explicit supervisor go.** The P2-A ack surface is NOT needed for tonight (the iPad fader UX rides state-reflection, not acks; no consumer reads acks yet — get_command_status is the only reader and C-9 UI isn't built). So there is no reason to risk a service-day desk deploy. Default expectation: **publish AFTER the weekend services** (or a Daniel-approved non-service window today with rollback ready). STOP + confirm timing before `gh release create`.

## Scope (`bridge/**`, single-owner; same recipe as v10.0.1 — [[project_bridge_release_build]])
1. Version bump `bridge/package.json` `10.0.1` → **`10.0.2`** (commit + push to master).
2. Build: `npm install` + `npm run dist` (= `tsc && electron-builder --win`, nsis). **Gotchas:** tsconfig EXCLUDE `bridge/src/__tests__`; `gh` asset filenames hyphen-renamed to match `latest.yml` url. If electron-builder won't build cleanly here → STOP + report (pivot to Daniel building locally).
3. **STAGE only:** prepare the NON-DRAFT GH release `v10.0.2` (exe + latest.yml + blockmap) but **hold the actual `gh release create` for supervisor go** per the timing gate. You may create it as a **DRAFT** to stage assets, then flip to non-draft on go.
4. Refresh `bridge-update-helper-steps.md` for v10.0.2 (installer-direct primary; durable-cred already in v10.0.1 so an in-place update is non-destructive).
5. Notes summarize: P2-A observability — ack surface, server-time clock-skew, command ordering/idempotency, query correlation, two-bridge lease, client-count.

## Acceptance
- `bridge/package.json` = `10.0.2` on master; build produces signed exe + latest.yml + blockmap.
- Release STAGED (draft or held); `gh release view` output in SHIP-NOTICE `## Repros`.
- Bridge suite still 70/70 + check:types after the version bump.
- **Post-deploy (after the go, whenever):** re-run `scripts/monitor-live-probe.mjs` (P0-B2) → confirm acks now written + own-write reflected end-to-end. That's P2-A's live acceptance (the auditor's OPEN-FOLLOWUP).

## Hard rules
- Outward-facing + hits LIVE hardware → single owner (you); no other agent touches bridge/**.
- Bridge version only; `errors.ts`/`error-envelopes.ts` read-only.
- Cut a FRESH worktree off origin/master `7eb1b2d9e`. Claims: `bridge/package.json` (+ the helper doc).
- Tier 2: SHIP-NOTICE → inbox/auditor.md + HEADS-UP → inbox/supervisor.md when staged. **Do NOT auto-deploy on a service day without the timing go.**
**Action required:** ACK in inbox/supervisor.md, build + stage, then HOLD for the publish-timing go.
