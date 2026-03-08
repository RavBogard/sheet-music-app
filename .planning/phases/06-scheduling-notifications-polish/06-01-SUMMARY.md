---
phase: 06-scheduling-notifications-polish
plan: 01
subsystem: notifications
tags: [fcm-push, sms, notification-bell, scheduling]
dependency_graph:
  requires: [firebase-admin, twilio-sms, fcm-messaging]
  provides: [sendPushToUsers, publish-push-sms, assign-push, scheduling-icons]
  affects: [publish-flow, assign-flow, notification-bell-ui]
tech_stack:
  added: []
  patterns: [shared-server-push-helper, fire-and-forget-notifications]
key_files:
  created:
    - src/lib/push-send.ts
  modified:
    - src/app/api/setlist/publish/route.ts
    - src/app/api/scheduling/assign/route.ts
    - src/components/nav/NotificationBell.tsx
decisions:
  - "SMS on initial publish only (not re-publish) to control Twilio costs"
  - "FCM push on both publish and re-publish since push is free"
  - "Shared push-send helper uses Firebase Admin directly (not HTTP to /api/push/send) to avoid auth forwarding"
  - "Reuse fetched user docs for both email filtering and SMS preference checking"
metrics:
  duration: "3 min"
  completed: "2026-03-08"
  tasks: 2
  files: 4
---

# Phase 6 Plan 1: FCM Push + SMS Notifications Wiring Summary

Wire FCM push and SMS into publish/assign routes, polish NotificationBell with scheduling icons.

## What Was Done

### Task 1: Shared push-send helper + publish route notifications (1c35fff)

**Created `src/lib/push-send.ts`** -- a shared server-side helper that sends FCM push notifications using Firebase Admin messaging directly. Extracted and adapted from `/api/push/send/route.ts` logic:
- `sendPushToUsers(targetUids, { title, body, link })` returns `{ sent, failed, staleTokensCleaned }`
- Batch-reads user docs (30 at a time) to collect fcmTokens
- Sends via `messaging.sendEachForMulticast` in batches of 500
- Cleans up stale tokens (`messaging/registration-token-not-registered`)

**Extended publish route** with two new notification channels:
- **FCM push** (Step 3b): Fire-and-forget push to all assigned registered musicians on both publish and re-publish
- **SMS** (Step 4b): Sends SMS on initial publish only to musicians with `sms === true` preference and a phone number
- Refactored user doc fetch to build a reusable `userDataMap` for both email filtering and SMS preference checking

### Task 2: Assign route FCM push + NotificationBell scheduling icons (7b4a2e0)

**Extended assign route** with FCM push dispatch:
- After creating in-app notification, dispatches FCM push to the musician (fire-and-forget)
- Only when `pushEnabled` is true (respects notification preferences)
- Moved `instrumentText` declaration outside the if-block for reuse by both in-app and FCM push messages

**Extended NotificationBell** with scheduling notification type icons:
- `scheduling_request` -> Calendar
- `scheduling_confirmed` -> CalendarCheck
- `scheduling_declined` -> CalendarX
- `scheduling_reminder` -> Calendar
- `scheduling_cancelled` -> CalendarX

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npm run build` passes with no errors
- `npx vitest run --reporter=verbose` -- all 639 tests pass (40 test files), zero regressions
- All 4 files created/modified verified present
- Both task commits verified in git history

## Self-Check: PASSED
