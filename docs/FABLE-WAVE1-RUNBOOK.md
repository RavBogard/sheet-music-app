# Fable Wave 1 — Runbook (2026-08-31)

Companion to `docs/FABLE-REVIEW-2026-08-31.md`. Three implementation crews (Opus) executed the
week-1 fixes against a container snapshot; targeted vitest + tsc ran green there. **44 files were
written into this working tree by Cowork on 2026-08-31 — nothing is committed to git yet.**
Review → run the gate locally → commit → deploy, in the order below.

## What landed

**Keep-alive (iPads):**
- `use-wake-lock.ts` — fixed the `[wakeLock]`-deps cleanup that permanently disarmed
  `visibilitychange` re-acquire the moment a lock was first acquired (the "lost after switching
  away" bug). Sentinel now lives in a ref; release is unmount-only.
- Durable intent in `localStorage` (`crc.keepAwakeIntent`) + one-shot pointerdown retry — survives
  reload, eviction, "Reload to resume". Explicit disarm stores `'0'` (never auto-re-arms).
- Auto-arm on every `/perform/**` surface via new `KeepAwakeProvider` (`keep-awake-context.tsx`)
  in `perform/layout.tsx` — **no per-service tap required anymore**; toggle remains as override.
  Throttled `ensureLock()` self-heal on pointerdown + 30s heartbeat.
- New `KeepAwakeBanner` — appears only when armed-but-not-held; distinct warning on standalone
  iPadOS < 18.4 (the OS bug JS can't beat — WebKit 254545).
- `/perform/[fileId]` (single-chart route) previously had **no** wake lock; now wired.
- Note: `SetlistPerformClient.tsx` + `use-setlist-performance.ts` also carried someone's fresh
  `eventDate`/PrintModal change from this tree — merged, all 65 related tests pass.

**Bridge self-healing:**
- New `bridge/src/lease-identity.ts`: persisted machine ID + conservative same-host lease steal
  (cross-host steals refused by design). Lease TTL 90s→20s, renew 6s.
- Same-host relaunch → ACTIVE: ~110s → **~0s**. Cross-host takeover: ~110s → ~26s.
- Standby now writes a distinct `bridgeStandby.*` marker (never `bridge.lastSeen`); fixed a bug
  where a quitting standby stamped the ACTIVE bridge offline.
- `bridge/watchdog/` — PowerShell + Task Scheduler watchdog; **install per `INSTALL.md` on the
  venue PC** (restart-if-dead every minute, logs to `%LOCALAPPDATA%\CentralReform Bridge\watchdog.log`).
- `get_bridge_health` MCP tool now reports `standby`.
- Bridge version stays 10.0.7 — bump to 10.0.8 when you cut the release build.

**Monitor mix:**
- Fader release value now commits synchronously (+ flush on hidden/pagehide/unmount) — kills the
  "set it and it snapped back" bug.
- Firestore stall no longer disables faders / blanks QuickMonitorPanel; mixer-unreachable and
  state-syncing are now separate signals.
- Command **rejections are visible**: acks rules added (`monitor-live/commands/acks`, per-uid),
  bridge stamps `uid` on all ack paths, client rolls back + shows a compact reason.
- `unconfirmed` mixer values now render dimmed instead of as confident zeros.
- New `/api/cron/bridge-watch` (Fri 14:00 + 16:30 America/Chicago + daily): **silent when green**;
  push + in-app + email (set `BRIDGE_ALERT_EMAIL`) only when the bridge is down/stale, with root
  cause + one-line remedy. 6h re-notify suppression. (The existing `admin-consistency` cron only
  reached Sentry.)

## Deploy order — matters

1. Review the diff (`git diff` / `git add -p`).
2. `npm run test` and `npm run check:types` locally. Known pre-existing failures (also fail on a
   pristine tree, none touched by this wave): public-view (4), perform-cls (2), pdf-viewer,
   sync-engine, print-pipeline, coord-status/worktree shell tests; `tsc` has one pre-existing
   error in `e2e/helpers/axe.ts` (missing `cycle-4` harness).
3. `npm run test:emulator` — includes 9 NEW ack-rules cases (needs Java; wasn't runnable in the
   container).
4. **Deploy `firestore.rules` BEFORE the client** (`firebase deploy --only firestore:rules`).
   Shipping the client first is harmless (ack reads deny, logged at debug) but the rejection UI
   stays dark until rules land.
5. Set `BRIDGE_ALERT_EMAIL` in Vercel env; confirm `CRON_SECRET` exists; push to deploy.
6. Venue PC: install the watchdog (`bridge/watchdog/INSTALL.md`), then rebuild/reinstall the
   bridge as 10.0.8 when convenient — the lease fixes ship with the bridge, not the web deploy.
7. Verify: kill the bridge from Task Manager → tray icon returns ≤90s (watchdog); kill+relaunch by
   hand → `get_bridge_health` alive within seconds; `curl -H "Authorization: Bearer $CRON_SECRET"
   https://centralreform.live/api/cron/bridge-watch` → `{healthy:true, notified:false}`.

## The iPad fleet — device config (the part code can't do)

Per iPad: Display & Brightness → Auto-Lock: **Never** · Low Power Mode **off** (keep them on power
at services; optional Shortcut: on charge → LPM off) · update to **iPadOS ≥ 18.4** (below that,
Home-Screen web apps cannot hold the screen on — the app now shows a warning on such devices) ·
iPad 6th gen / Pro 10.5" / Pro 12.9" 2nd gen can't run 18: use a pinned Safari tab there ·
do NOT push any MDM passcode payload with a max auto-lock (it removes "Never" from the menu).
Re-check Auto-Lock after every OS update.

## On-iPad verification (first service after deploy)

Open any chart → screen stays on with no tap. App-switch / lock screen → return → lock re-acquires.
Kill the web app → reopen → arms itself. Toggle off → reload → stays off. Drag a monitor fader and
release fast → value sticks. Ask Claude for `get_bridge_health` → shows active + standby fields.
