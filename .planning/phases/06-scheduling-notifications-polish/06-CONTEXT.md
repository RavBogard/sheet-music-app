# Phase 6: Scheduling, Notifications & Polish - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect all features built in Phases 1-5, polish the scheduling and notification experience, and validate the entire end-to-end flow so the app is ready for real services. Band leader assigns musicians, musicians get notified, setlist publication triggers alerts, and the full workflow works seamlessly.

Requirements: SCHED-01, SCHED-02, NOTIF-01, NOTIF-02

</domain>

<decisions>
## Implementation Decisions

### What already exists (extensive infrastructure)
- **Scheduling system**: Assignment creation API, accept/decline workflow, availability checking, musician suggestions, blockout management, reminder cron job, calendar feed (iCal), unassign API
- **Multi-channel notifications**: FCM push (with token management), email (Resend), SMS (Twilio), in-app (Firestore subcollection with real-time sync)
- **Scheduling notification helpers**: notifySchedulingRequest(), notifySchedulingResponse(), notifySchedulingReminder() in notification-store.ts
- **Email templates**: Scheduling assignment emails with new-song detection, reminder emails
- **SMS templates**: Assignment SMS, reminder SMS (48hr), cancellation SMS
- **UI components**: Schedule page with tabs (My Schedule, Calendar, Availability, All), ScheduleCard with accept/decline, PeopleSection for admin
- **Data models**: SchedulingAssignment, MusicianBlockout, SchedulingHistory, SetlistMusician, notification preferences per musician

### Phase 6 focus: polish and integration, not greenfield
- The scheduling backend is production-ready — this phase ensures the UX is polished and the end-to-end flow works
- Setlist publication notifications (NOTIF-02) may need wiring — verify that publishing a setlist triggers musician notifications
- Assignment flow should be accessible from the setlist editor (not just the schedule page)
- "Who else is playing" (SCHED-02) needs to be visible in both schedule view and performance view
- New musician onboarding (success criteria #4) needs a smooth first-time experience

### Assignment from setlist editor
- Band leader should be able to assign musicians directly from the setlist editor, not only from a separate scheduling page
- Quick-assign: show available musicians, tap to assign, notifications fire automatically

### Notification triggers to verify/wire
- Setlist published → notify assigned musicians (NOTIF-02)
- Setlist updated (tracks changed) → notify assigned musicians (NOTIF-02)
- Musician assigned → multi-channel notification (NOTIF-01) — already built
- 48-hour reminder → already built via cron

### End-to-end flow validation
- Create setlist → assign musicians → publish → musicians see it on tablets → perform with monitor mixing → done
- New musician sign-up → profile setup → see their setlist within 5 minutes

### Claude's Discretion
- UX polish details (animations, transitions, loading states)
- Assignment UI placement within setlist editor
- "Who's playing" display format in performance view
- First-time musician onboarding flow specifics
- Which existing scheduling features need UI polish vs are already good enough
- Integration testing approach

</decisions>

<specifics>
## Specific Ideas

- The end-to-end flow is the real deliverable — every feature from phases 1-5 must connect seamlessly
- A substitute musician should be able to sign in, set up profile, and see their setlist within 5 minutes
- "Who else is playing" should be visible at a glance, not hidden behind a tap

</specifics>

<code_context>
## Existing Code Insights

### Scheduling APIs (all exist)
- POST /api/scheduling/assign — Create assignments, auto-notify
- POST /api/scheduling/respond — Accept/decline with band leader notification
- GET /api/scheduling/availability — Check who's available on a date
- GET /api/scheduling/suggest — Find replacement musicians
- POST /api/scheduling/blockouts — Manage blockouts
- DELETE /api/scheduling/unassign — Remove musician
- GET /api/scheduling/calendar-feed/[token] — iCal export
- GET /api/cron/scheduling-reminder — 48-hour reminder cron

### Notification Infrastructure (all exist)
- src/lib/push-notifications.ts — FCM client-side registration
- src/lib/notification-store.ts — In-app notifications with real-time sync, broadcastNotification()
- src/lib/email.ts — sendSetlistEmail(), emailAllMembers()
- src/lib/email-scheduling.ts — sendSchedulingEmail() with new-song detection
- src/lib/sms.ts — sendSMS(), sendSchedulingAssignmentSMS(), sendSchedulingReminderSMS()
- src/app/api/push/send/route.ts — FCM server-side send

### UI Components (exist but may need polish)
- src/app/(main)/schedule/page.tsx — Schedule page with tabs
- src/components/scheduling/ScheduleCard.tsx — Assignment card with accept/decline
- src/components/admin/PeopleSection.tsx — User management

### Data Layer
- src/lib/scheduling-firebase.ts — All scheduling Firestore queries
- src/lib/musician-profile.ts — Profile management with instrument presets
- src/lib/users-firebase.ts — User CRUD

### Established Patterns
- withAuth(request, requiredRole?) guards all API routes
- checkRateLimit(request, tier) for rate limiting
- Zustand stores for client-side state
- Real-time Firestore subscriptions for live updates

</code_context>

<deferred>
## Deferred Ideas

- Recurring scheduling templates (e.g., "every Friday night lineup")
- Scheduling history analytics
- AI-based lineup suggestions
- Conflict detection for overlapping assignments
- Email delivery tracking

</deferred>

---

*Phase: 06-scheduling-notifications-polish*
*Context gathered: 2026-03-08*
