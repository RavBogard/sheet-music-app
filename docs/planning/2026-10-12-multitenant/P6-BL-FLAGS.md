# P6 — Brothers Lazaroff feature flags, flag by flag

Phase 6, lane 1, 2026-10-12. How each of BL's six flags was set to what BL does today. Evidence is from code paths and READ-ONLY production reads (Admin SDK, project crcmusiccharts, no writes) taken 2026-10-12 around 23:50 UTC. The rule applied: whatever BL does today keeps working; when in doubt, on.

Result (`src/lib/org/config-code.ts`, written to `orgs/brotherslazaroff` by `scripts/ops/multitenant/set-tenant-features.ts`):

| Flag | BL | CRC |
|---|---|---|
| mixer | off | on |
| driveInbox | off | on |
| schedulingEmails | off | on |
| todayFeed | **on** | on |
| notifyBand | **on** | on |
| perform | on | on |

Production `orgs/brotherslazaroff.features` today is the phase 1 placeholder (`todayFeed: false, notifyBand: false`). Nothing read it before phase 6, so it did no harm. **It must be corrected (set-tenant-features `--apply`) before the phase 6 code is deployed.** Otherwise BL's today feed and band notifications switch off on deploy.

## Background facts

- BL has 16 memberships: 1 admin, 1 band leader, 12 musicians, 2 pending. Every one of them is also a CRC member (`memberships` by `tenantId`). So per-person traces such as notifications or monitor bus assignments cannot be attributed to BL on their own. Only tenant-stamped documents can.
- BL has 7 setlists (`setlists.orgId == brotherslazaroff`) and 82 library rows, all `source: "upload"`. It has 14 MCP tokens; the most recent was last used 2026-10-12.

## mixer: off

- **Ruling.** The standing default "The mixer stays CRC-only behind its flag" (RULINGS, analysis section 7), and this phase's instruction: the mixer is refused for any tenant but crc even with its flag on.
- **Data.** The mixer is CRC's X32. There is one bare `config/monitor` with no `orgId`, plus `monitor-live/*`. BL has no mixer data of its own.
- **Access.** Since phase 2, mixer rights come from the caller's membership in crc (`server-monitor.ts` `BRIDGE_ORG`). A BL-only member already had no mixer.
- **Production.** `config/monitor.busAssignments` holds 1 uid, a CRC member. `monitor-live/commands/{pending,acks}` are empty, so no command history exists to attribute.
- **What BL loses.** The 12 authoring mixer tools drop from BL's connector, and the `/monitor` page and Sound tab are gone at BL's address (lane 2).
- **Known effect (not a BL feature).** A person who is admin of both tenants can no longer drive CRC's mixer from a **BL** token. They use the CRC connector or centralreform.live, which is the same console. Phase 2 had kept this path ("David keeps the mixer from a BL token"). Phase 6 closes it on purpose, per the ruling.

## driveInbox: off

- **Code.** Before phase 6 the inbox tools refused every tenant but crc (`register-chart-inbox.ts` `inboxFolderFor`: `org !== DEFAULT_ORG_ID → null`, "not set up for the brotherslazaroff organization"). The drive-sync cron watched one env folder and stamped everything `orgId: "crc"` (`poller.ts`). BL could not use the inbox.
- **Library sync.** The Manage > Library "Sync Now" card (`/api/library/sync`) syncs CRC's `GOOGLE_DRIVE_ROOT_FOLDER_ID` and stamps rows crc. A BL use of it would have put rows in CRC's library, not BL's.
- **Production.**
  - All 82 BL library rows are `source: "upload"`; none came from drive-sync or a Drive sync.
  - `config/congregation__brotherslazaroff.driveFolderId` is `""`.
  - The two `driveWatchState` folders carry no `orgId`, because both are CRC's.
- **What BL loses.** `get_chart_inbox` and `sync_chart_inbox` drop from BL's tool list. Both only ever answered BL "not configured".

## schedulingEmails: off

- **Production.**
  - `scheduling_assignments` is empty for every tenant, CRC included.
  - `scheduling_history` has no BL rows and is empty overall.
  - `config/congregation__brotherslazaroff` has no `scheduling` block.
  - Notifications to BL members show no `scheduling_*` type. The only types are `role_changed`, `setlist_published` and `bridge_health`.
  - No scheduling email or SMS can have been sent for BL: every one of them is sent per assignment.
- **What BL loses.** No tools. With the flag off:
  - the scheduling-reminder cron skips BL;
  - `/api/scheduling/remind` refuses BL;
  - `assign_musician` / `unassign_musician` for BL still schedule, with the in-app and push notification, but send no email or SMS.

## todayFeed: on

- **Production.** `public/today/brotherslazaroff.json` (Storage) was updated 2026-10-12T23:45:51Z, the cron's latest 15-minute tick. `emit-today` has looped BL since phase 1, and `/api/health` reports a fresh `today` for BL. The feed is live, so it stays on.

## notifyBand: on (in doubt)

- **Against.**
  - None of BL's 7 setlists has `lastNotifiedAt`. Both notify paths stamp it: `/api/setlist/notify-band` and MCP `notify_band`.
  - BL setlists have no `emailEvents`.
  - Of the 34 `setlist_published` notifications BL members hold, 21 are CRC setlists'. 13 are for a deleted setlist, "BUGSTOMP 2026-05-16 main", a CRC bug-stomp from before BL existed.
  - No `setlists.lastNotifiedAt` exists for any BL setlist; the only notified setlist in production is CRC's.
- **Undecidable.** The lead's lane-2 mapping puts "Email Packet Links to Band" (`/api/setlist/email-packets`) under notifyBand. That route writes nothing to Firestore. It sends through Resend and logs only `[EmailPackets] Sent …`. Vercel keeps Pro runtime logs for one day; the last 23 h show no `EmailPackets` line. Resend's send log is not readable from here.
- **Decision.** BL's use of packet emails cannot be ruled out, so the flag is **on** (when in doubt, on). BL keeps `notify_band` and `preview_notify_band` and the packet email. Revisit if Resend's log shows no BL packet mail.

## perform: on

- **Code and default.** Perform mode is BL's band surface on iPads. The schema default is on, and no evidence or ruling points elsewhere.

## BL's MCP tool list after phase 6

The golden is `src/lib/mcp/__tests__/fixtures/p6-tool-lists-before.json`, captured on unchanged code. BL equals the golden minus exactly these 14, and nothing else (`p6-tool-lists.golden.test.ts`, `BL_DROPPED_P6`):

- **mixer (12):** `list_monitor_buses`, `get_mix`, `get_matrix`, `set_send_level`, `set_send_mute`, `set_bus_fader`, `set_matrix_fader`, `set_matrix_mute`, `get_command_status`, `assign_monitor_bus`, `unassign_monitor_bus`, `get_bridge_health`
- **driveInbox (2):** `get_chart_inbox`, `sync_chart_inbox`

None of them was usable as a BL feature in production. The mixer tools act on CRC's console; the inbox tools refused BL.

BL's generated MCP instructions change by one fact line: "Switched on: Perform mode" becomes "Switched on: Perform mode, band notifications, today feed". The line now states BL's actual features.
