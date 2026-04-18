# Phase 6: Scheduling, Notifications & Polish - Research

**Researched:** 2026-03-07
**Domain:** Scheduling integration, notification wiring, end-to-end polish
**Confidence:** HIGH

## Summary

Phase 6 is overwhelmingly an integration and polish phase. The scheduling backend, notification infrastructure (FCM push, Resend email, Twilio SMS, in-app Firestore), and UI components are all built and functional. The critical gaps are: (1) the publish API does NOT send FCM push notifications to assigned musicians -- it only writes in-app Firestore notifications and sends emails, (2) the NotificationBell component is missing icons for scheduling notification types, (3) the performance view has zero "who else is playing" information, (4) there is no SMS notification when a setlist is published, and (5) the onboarding flow exists but is basic (pending approval banner + instrument setup CTA).

The MusicianPicker is already embedded in the setlist editor (SetlistEditorV2), which means "assign from setlist editor" is done. The scheduling assign API already sends multi-channel notifications (email, SMS, in-app) with preference checking. The ScheduleCard already shows "who else is playing" with colored status badges. The home page NextServiceCard already shows assigned musicians.

**Primary recommendation:** Wire the missing notification channels in the publish flow, add "who's playing" to the performance view, polish the NotificationBell for scheduling types, and validate the end-to-end flow. This is wiring work, not greenfield development.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Scheduling system, multi-channel notifications, UI components, and data models are all existing infrastructure -- this phase polishes and integrates, not builds from scratch
- Setlist publication notifications (NOTIF-02) need wiring verification
- Assignment flow should be accessible from the setlist editor (not just the schedule page)
- "Who else is playing" (SCHED-02) needs to be visible in both schedule view and performance view
- New musician onboarding needs a smooth first-time experience
- Assignment from setlist editor: quick-assign with available musicians, tap to assign, notifications fire automatically
- Notification triggers to verify/wire: setlist published, setlist updated, musician assigned (already built), 48-hour reminder (already built)
- End-to-end flow validation: create setlist -> assign musicians -> publish -> musicians see it on tablets -> perform with monitor mixing -> done

### Claude's Discretion
- UX polish details (animations, transitions, loading states)
- Assignment UI placement within setlist editor
- "Who's playing" display format in performance view
- First-time musician onboarding flow specifics
- Which existing scheduling features need UI polish vs are already good enough
- Integration testing approach

### Deferred Ideas (OUT OF SCOPE)
- Recurring scheduling templates (e.g., "every Friday night lineup")
- Scheduling history analytics
- AI-based lineup suggestions
- Conflict detection for overlapping assignments
- Email delivery tracking
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHED-01 | Band leader can assign musicians to a service | MusicianPicker already embedded in SetlistEditorV2; assign API fully built with multi-channel notifications. **Status: Functionally complete.** May need polish pass. |
| SCHED-02 | Musicians can see who else is playing at each service | ScheduleCard shows other musicians on schedule page. **GAP: Performance view has NO musician display.** Home page NextServiceCard shows musicians from setlist.musicians array. |
| NOTIF-01 | Musicians receive notifications (push and/or SMS) when assigned to a service | Assign API sends email + SMS + in-app notification with preference checking. **Status: Functionally complete.** FCM push from assign flow creates in-app notification but does NOT dispatch FCM push via /api/push/send. |
| NOTIF-02 | Musicians receive notifications when a setlist is published or updated | **GAP: Publish API sends in-app notifications + email but does NOT send FCM push or SMS.** Setlist update notifications fire from use-setlist-logic.ts via notifySetlistUpdated (client-side, in-app only). |
</phase_requirements>

## Codebase Gap Analysis

### Gap 1: Publish Flow Missing FCM Push Notifications (CRITICAL)

**What exists:** `src/app/api/setlist/publish/route.ts` creates Firestore in-app notifications (line 111-127) and sends emails via emailAllMembers. The notifySetlistPublished function in notification-store.ts includes FCM push via broadcastNotification -> sendPushForBroadcast, but this function is NOT called from the publish API route. The publish API writes directly to Firestore instead of using the client-side notification-store.

**What's missing:** FCM push notifications on publish. The publish route runs server-side and writes Firestore notifications directly (bypassing broadcastNotification which handles push). The server-side code would need to call `/api/push/send` itself or use Firebase Admin messaging directly.

**Fix approach:** After writing in-app notifications, call the FCM send logic for assigned musicians who have fcmTokens. Can either:
1. Import and call the push send logic directly in the publish route (server-side, same process)
2. Use a helper that mirrors sendPushForBroadcast but uses Firebase Admin SDK instead of client-side apiFetch

**Confidence:** HIGH -- traced the full code path.

### Gap 2: Publish Flow Missing SMS Notifications

**What exists:** The assign API sends SMS via sendSchedulingAssignmentSMS when a musician is assigned. The publish API sends only email + in-app notifications.

**What's missing:** SMS notification on setlist publish/update. When a setlist is published or updated, musicians with SMS preferences should receive a text.

**Fix approach:** After sending emails, check each registered musician's notification preferences and send SMS via sendSMS for those with sms=true.

**Confidence:** HIGH -- the SMS infrastructure exists, just not wired to publish.

### Gap 3: NotificationBell Missing Scheduling Icons

**What exists:** `src/components/nav/NotificationBell.tsx` maps notification types to icons:
```typescript
const ICON_MAP: Record<string, typeof Bell> = {
    setlist_published: ListMusic,
    setlist_updated: ListMusic,
    chart_uploaded: Upload,
    role_changed: Shield,
    general: Bell,
}
```

**What's missing:** No entries for scheduling_request, scheduling_confirmed, scheduling_declined, scheduling_reminder, scheduling_cancelled. These all fall through to the default Bell icon.

**Fix approach:** Add Calendar or CalendarCheck icons for scheduling notification types.

**Confidence:** HIGH -- direct code inspection.

### Gap 4: Performance View Has No "Who Else Is Playing" Display

**What exists:** The performance view (`src/app/perform/setlist/[id]/page.tsx`) shows tracks, header, PDF overlay, and service notes. The `useSetlistPerformance` hook does NOT fetch or expose musician data. The setlist Firestore document does contain a `musicians` array (populated by the assign API), but the performance hook doesn't read it.

**What's missing:** No musician list in performance view at all. SCHED-02 requires musicians see who else is playing.

**Fix approach:**
1. Extend `useSetlistPerformance` to read and expose the setlist's `musicians` array
2. Add a compact "who's playing" row/chip bar in the performance view header (between the header and SetlistView)
3. Keep it minimal -- name + instrument chips, similar to NextServiceCard format

**Confidence:** HIGH -- the musicians data is already on the setlist document, just needs to be read and displayed.

### Gap 5: Assign API Does Not Dispatch FCM Push

**What exists:** The assign API (line 151-171) creates in-app notifications in Firestore when `pushEnabled` is true. But it does NOT call the FCM push endpoint (`/api/push/send`). The variable name `pushEnabled` controls in-app notifications, not actual push notifications.

**What's missing:** FCM push dispatch on assignment. Musicians with push enabled should receive a browser/device push notification.

**Fix approach:** After creating the in-app notification, dispatch FCM push using Firebase Admin messaging directly (since we're already server-side). Can batch all musician UIDs and send after the assignment loop.

**Confidence:** HIGH -- traced the code.

### Gap 6: Onboarding Flow Is Basic But Functional

**What exists:** `DashboardClient.tsx` has two onboarding states:
1. **Pending user** (line 286-306): Shows "Welcome! Your account is being reviewed" with a "Set Up My Instrument" button linking to /settings and a "Nudge Admin" button
2. **First-time approved** (line 310-339): Shows "You're approved!" banner with "Set Up Instrument" button linking to /settings, plus a "Skip" button that calls markWelcomeModalViewed

The settings page has instrument setup and push notification toggle (PushNotificationSettings component).

**What's missing:** No guided wizard or progressive onboarding. The flow is: sign in -> see pending banner -> wait for approval -> see approved banner -> click to settings -> set instrument -> done. For a substitute musician needing to see their setlist in 5 minutes, the bottleneck is admin approval, not the UX.

**Assessment:** The existing flow is adequate for a 10-person band. The "5-minute" success criterion depends more on admin responsiveness than UI polish. Consider: auto-approve for users with known email domains, or a "quick setup" modal that combines instrument selection + notification opt-in in one screen instead of redirecting to settings.

**Confidence:** HIGH.

## What's Already Complete (No Work Needed)

| Feature | Location | Status |
|---------|----------|--------|
| MusicianPicker in setlist editor | SetlistEditorV2.tsx line 516 | Fully integrated with assign API, availability checking, blockout display, email status tracking |
| Assign API with multi-channel notifications | /api/scheduling/assign | Creates assignments, sends email, SMS, in-app notifications with preference checking |
| Accept/Decline workflow | ScheduleCard + /api/scheduling/respond | Musician can accept/decline, band leader gets notified |
| "Who else is playing" on Schedule page | ScheduleCard.tsx + schedule/page.tsx | Groups assignments by setlist, passes otherMusicians prop |
| "Who's playing" on Home page | NextServiceCard.tsx | Shows musician chips from setlist.musicians array |
| 48-hour reminder cron | /api/cron/scheduling-reminder | Sends email + SMS reminders |
| Notification Bell with real-time updates | NotificationBell.tsx | Subscribes to Firestore notifications, shows unread count |
| Push notification registration | PushNotificationSettings.tsx + push-notifications.ts | FCM token management, permission handling |
| FCM service worker | public/firebase-messaging-sw.js | Handles background push with deep-link on click |
| FCM server-side send | /api/push/send | Sends multicast push, cleans stale tokens |
| Calendar feed (iCal export) | /api/scheduling/calendar-feed/[token] | Existing |
| Blockout management | /api/scheduling/blockouts + UnifiedCalendar | Existing |
| Musician suggestions | /api/scheduling/suggest | Existing |
| Email scheduling with new-song detection | email-scheduling.ts | Highlights new songs in assignment emails |

## Architecture Patterns

### Notification Flow Architecture
```
Assignment Flow (EXISTING):
  MusicianPicker -> assignMusicians() -> POST /api/scheduling/assign
    -> Create SchedulingAssignment in Firestore
    -> Check notification preferences
    -> Send email (Resend) if emailEnabled
    -> Send SMS (Twilio) if smsEnabled && phone exists
    -> Create in-app notification in users/{uid}/notifications
    -> [MISSING] FCM push via Firebase Admin

Publish Flow (NEEDS WORK):
  PublishDialog -> POST /api/setlist/publish
    -> Update setlist (isPublic, publishedAt, publishedSnapshot)
    -> Create in-app notifications for registered musicians
    -> Send email via emailAllMembers
    -> [MISSING] FCM push for assigned musicians
    -> [MISSING] SMS for assigned musicians with sms preference

Response Flow (EXISTING):
  ScheduleCard -> respondToAssignment() -> POST /api/scheduling/respond
    -> Update assignment status
    -> Create in-app notification for band leader
    -> [NO FCM PUSH for response notification - acceptable]
```

### Where Musicians Data Lives
```
setlists/{id}.musicians[]     -- Array of {uid, name, email, instrument}
                                  Written by assign API, read by NextServiceCard, PublishDialog
scheduling_assignments/{id}   -- Individual assignment documents
                                  Written by assign API, read by ScheduleCard, schedule page
```

### Anti-Patterns to Avoid
- **Don't duplicate notification logic:** The publish route already handles in-app notifications inline. Don't create a second path -- extend the existing code.
- **Don't call /api/push/send from server-side code via HTTP:** Use Firebase Admin messaging directly since the publish route is already server-side.
- **Don't add "who's playing" as a separate API call in performance view:** Read it from the setlist document that's already being fetched.

## Common Pitfalls

### Pitfall 1: FCM Push Auth on Publish Route
**What goes wrong:** The /api/push/send endpoint requires band_leader auth. If the publish route tries to call it via HTTP, it would need to forward auth headers.
**How to avoid:** Don't call the HTTP endpoint. Use Firebase Admin SDK messaging directly in the publish route (same pattern as /api/push/send but inline).

### Pitfall 2: Notification Deduplication on Re-Publish
**What goes wrong:** Publishing an already-published setlist sends duplicate notifications. The publish route already handles this (updates publishedSnapshot without re-creating isPublic), but notifications are always sent.
**How to avoid:** This is intentional -- re-publish means "re-notify." The publish dialog already shows "Update & Notify" for published setlists. No action needed.

### Pitfall 3: SMS Cost on Publish Broadcast
**What goes wrong:** Adding SMS to publish flow could send many texts on every publish/update.
**How to avoid:** Only send SMS to musicians who have explicitly opted in (sms === true, which defaults to false). The assign API already follows this pattern. Also consider: only send SMS for initial publish, not re-publish.

### Pitfall 4: Performance View Musician Data Staleness
**What goes wrong:** Performance view reads musicians from the setlist document once. If musicians are assigned/unassigned during a service, the list won't update.
**How to avoid:** The existing useSetlistPerformance hook likely uses onSnapshot for real-time updates. Ensure the musicians field is included in the subscription. For a 10-person band, this is acceptable.

### Pitfall 5: notifySetlistPublished vs Inline Notifications
**What goes wrong:** notification-store.ts has a notifySetlistPublished function that broadcasts to ALL active members. The publish route creates notifications only for assigned musicians. These are different behaviors.
**How to avoid:** The publish route's approach (notify only assigned musicians) is correct for NOTIF-02. Don't replace it with the broadcastNotification approach. Just add FCM push and SMS to the existing per-musician loop.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FCM push sending | Custom push logic | Firebase Admin messaging.sendEachForMulticast | Already used in /api/push/send, handles stale token cleanup |
| SMS sending | Custom Twilio integration | Existing sendSMS() in sms.ts | Already handles phone normalization, error handling |
| Email sending | Custom email logic | Existing emailAllMembers() | Already handles batching, Resend API |
| In-app notifications | Custom notification system | Existing Firestore subcollection pattern | Already used everywhere, has real-time sync |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.1 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHED-01 | Assign musicians to a service | unit | `npx vitest run src/lib/scheduling-firebase.test.ts -x` | Needs verification |
| SCHED-02 | See who else is playing | unit | `npx vitest run src/components/performance/ -x` | No -- Wave 0 |
| NOTIF-01 | Notification on assignment | unit | `npx vitest run src/lib/notification-store.test.ts -x` | Yes (existing) |
| NOTIF-02 | Notification on setlist publish | unit | `npx vitest run src/lib/notification-store.test.ts -x` | Partially (existing tests cover broadcastNotification but not publish route) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] No test for publish route's push notification dispatch (needs mock)
- [ ] No test for performance view musician display
- [ ] Existing notification-store.test.ts covers createNotification, broadcastNotification, markAsRead, markAllAsRead -- good baseline

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files listed in the gap analysis
- `src/app/api/setlist/publish/route.ts` -- full 263-line file traced
- `src/app/api/scheduling/assign/route.ts` -- full 213-line file traced
- `src/lib/notification-store.ts` -- all 347 lines including scheduling helpers
- `src/components/nav/NotificationBell.tsx` -- icon map inspection
- `src/app/perform/setlist/[id]/page.tsx` -- performance view structure
- `src/hooks/use-setlist-performance.ts` -- confirmed no musician data
- `src/app/(main)/DashboardClient.tsx` -- onboarding flow inspection
- `src/components/setlist/v2/MusicianPicker.tsx` -- already in SetlistEditorV2
- `src/components/scheduling/ScheduleCard.tsx` -- otherMusicians prop
- `src/components/home/NextServiceCard.tsx` -- musicians display
- `public/firebase-messaging-sw.js` -- FCM service worker exists and is functional

## Metadata

**Confidence breakdown:**
- Gap analysis: HIGH -- all claims based on direct code tracing
- What's complete: HIGH -- verified by reading actual source files
- Notification wiring: HIGH -- traced every notification path end-to-end
- Onboarding assessment: HIGH -- read DashboardClient.tsx directly

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable codebase, no external dependencies researched)
