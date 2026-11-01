# Guides for Michael, Drew, and before/after every service — state

Daniel 2026-11-01: "a guide for michael on everything he needs to do to get the ipads setup and
configured properly, a guide for drew, and then a guide for every post service and pre service."
No guide existed (the 11-01 "standard iPad settings checklist" ask was never written).

## Daniel's answers (20 pop-up questions)
- Where: a shareable web page AND an in-app Help page. Length: one-page checklists.
- Michael runs the whole before/after checklist. Scope: band app and wedges only (no livestream or
  Overlays).
- iPads stay at CRC on a charging cart; a shared pool; tap-to-turn only (no pedals); no MDM
  ("not opposed if free and easy"); Michael installs iPadOS updates midweek only.
- Musicians sign in each time with their own phone's QR code; iPads are left signed in afterwards.
- Drew mixes live in Mixing Station on his own iPad; Drew assigns wedge buses; Drew records off
  the X32 and puts the mix in the Dropbox SERVICES folder (dated folder, `_V1` MP3).
- The studio PC is turned on each service and off after. Daniel chose "On per service; I'll fix
  the code" over leaving it on all week.
- Band call is 30 minutes before. Services start Friday 6:15 pm and Saturday 10:00 am.
- Problems: text Daniel.

## Found while writing
- With the PC off between services, bridge-watch alerted once early in the week and then stayed
  silent (outstanding-problem dedupe), so there was no real pre-service warning. End-of-service mix
  snapshots (bridge, 2 h after start or 23:00) never ran. Builder `bridge-per-service` was sent to
  fix both.
- No Home Screen prompt exists. The manifest starts at `/` (signed in: Dashboard with the Today
  card and its Perform button; signed out: /perform).
- Signed-out iPads don't follow live changes; they show "Setlist updated — tap to refresh".

## Decisions (logged gates)
- GATE: Auto-Lock is 15 minutes, or Never below iPadOS 18.4. Proceeded because keep-awake arms by
  itself in Perform on 18.4+ (Home Screen app); Never all week on a charging cart is needless wear.
  The hardware verification in IPAD-KEEP-AWAKE-ACCEPTANCE.md is still outstanding.
- GATE: Michael starts 45 minutes before (Fri 5:30, Sat 9:15). Proceeded because the band call is
  30 minutes before and the iPads must have their charts saved before then.
- GATE: no MDM in the guide. Proceeded because 6 iPads set up by hand is a 1-hour job, and
  the free routes need a Mac (Apple Configurator) or Apple Business Manager enrolment. Not easy.
- GATE: one shareable page with four tabs (#michael, #drew, #before, #after) rather than four
  pages, so a single link reaches everything and each tab prints on its own sheet.
- GATE: /help is public and CRC-only (Brothers Lazaroff gets 404). Proceeded under err-public;
  nothing in the guides is secret.

## Artifacts
- Shareable page: https://claude.ai/artifact/HTj3WcGTeqJqRWF8gGLhFj (source
  `docs/guides/crc-service-guides.html`). Private until Daniel shares it.
- Source text: `docs/guides/{michael-ipads,drew-sound,pre-service,post-service}.md`.

## Shipped (2026-11-01)
- #65: in-app Help at /help, /help/{michael,drew,before,after}. Public, CRC-only, English and
  Hebrew, printable. The four guides in docs/guides/*.md are the source of truth (a test checks the
  English strings word for word). Checked live at 820×1180 and 375×812.
- Wording fix during review: the push setting is "Settings → Push Notifications" (the guides said
  Settings → Notifications → Push). Fixed in the guides, both translations and the shareable page.
- #64: bridge-watch runs every 15 min and checks only 20–40 min before a CRC service (Fri 18:15 and
  Sat 10:00 fallbacks, DST in code). It is silent otherwise, dedupes per service, and its DOWN text
  is written for Michael. New hourly cron service-mix-snapshot takes the "End of service" mix from
  monitor-live/state about 2 h after the start, so it survives the PC being off. No bridge release.
  A day with no CRC setlist gets no check.
- #68: on brotherslazaroff.live, /help returned 200 and its RSC payload carried the CRC guide (the
  layout's notFound() runs after streaming starts). The proxy now 404s /help for any other tenant.
  Verified live: BL 404, CRC 200. The content is public and nothing secret leaked, but other
  (main)-group pages gated only by a layout notFound() (e.g. /monitor on BL) may show the same
  200-plus-payload pattern. Backlog LAYOUT-404.
- Worktrees wt-bridge-per-service, wt-help-guides and wt-help-404 were removed after their
  junctions were deleted. Main node_modules was intact (959 entries).
