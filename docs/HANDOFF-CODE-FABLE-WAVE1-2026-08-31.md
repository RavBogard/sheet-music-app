# HANDOFF → Claude Code: land Fable Wave 1 (2026-08-31)

**From:** Cowork/Fable session (first Fable review of this project).
**Your job:** verify, commit, and ship the Wave 1 reliability changes already sitting
**uncommitted in this working tree** (56 files, written 2026-08-31 by Cowork via the device
bridge). Full context: `docs/FABLE-REVIEW-2026-08-31.md` (findings) and
`docs/FABLE-WAVE1-RUNBOOK.md` (what changed, deploy order, verification). Read the runbook first.

## Scope of the uncommitted changes

1. **Keep-alive (iPads):** fixed the `[wakeLock]`-deps cleanup bug in `use-wake-lock.ts` that
   permanently disarmed visibilitychange re-acquire; durable intent in localStorage; auto-arm on
   all `/perform/**` via new `KeepAwakeProvider`; new `KeepAwakeBanner`; wired the previously
   uncovered `/perform/[fileId]` route.
2. **Bridge self-healing:** new `bridge/src/lease-identity.ts` (persisted machine ID, same-host
   lease steal), TTL 90s→20s, standby liveness marker separated from `bridge.lastSeen`, watchdog
   scripts in `bridge/watchdog/`.
3. **Monitor mix:** synchronous fader release commit; faders no longer disabled by Firestore
   staleness; ack read rules + uid stamping + visible rejection reasons; `unconfirmed` values
   rendered honestly; new `/api/cron/bridge-watch` (silent-when-green pre-service tripwire).

Also merged (not mine to re-do): the `eventDate`/PrintModal wiring that landed in this tree on
2026-08-31 was preserved in `SetlistPerformClient.tsx` / `use-setlist-performance.ts` — verify it
survived intact.

## Gate before committing

- `npm run test` — expect the pre-existing failures listed in the runbook §Deploy-order step 2
  and nothing new. In the Cowork container, all wake-lock/monitor/bridge-adjacent suites passed
  (65/65 on the perform trio; 248 monitor tests; bridge 226/226).
- `npm run check:types` (one pre-existing `e2e/helpers/axe.ts` error is known).
- `npm run test:emulator` — 9 NEW ack-rules cases in
  `src/lib/__tests__/firestore-rules-monitor.emulator.test.ts` were NOT runnable in the container
  (no Java). These must pass before rules deploy.
- `cd bridge && npm test` (lease-identity + config-lease suites).

## Commit & ship

- Suggested structure: three commits (keep-alive / bridge / monitor+cron), or one if you prefer —
  Daniel's call. Reference `docs/FABLE-REVIEW-2026-08-31.md` in the message(s).
- **Deploy `firestore.rules` BEFORE the client** (`firebase deploy --only firestore:rules`).
- Vercel env: set `BRIDGE_ALERT_EMAIL`; confirm `CRON_SECRET` exists. `vercel.json` gained 3 cron
  entries (its `_comment` keys were removed — schema risk).
- Bridge changes ship with the bridge app, not the web deploy: bump `bridge/package.json` to
  10.0.8 when cutting the release (code comments already cite 10.0.8). Watchdog install on the
  venue PC is manual — `bridge/watchdog/INSTALL.md`.
- Do NOT commit: `bridge/package-lock.json` churn if any, logs, or this handoff once landed
  (archive it to `docs/archive/` per the review's hygiene plan, or delete).

## Post-deploy smoke (runbook §on-iPad verification)

Chart opens → screen stays on with no tap; app-switch → return → lock re-acquires; fast fader
release sticks; `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/bridge-watch` →
`{healthy:true, notified:false}`.
