# Gap analysis — 2026-10-31

Full UI / UX / MCP / frustration / usability / workflow / feature gap analysis of
centralreform.live, its MCP server, the Brothers Lazaroff tenant, the mixer, and the seams
to the rest of the worship-tech family.

## Alignment round 1 (Daniel, 2026-10-31)

- **Scope:** all four surfaces: Perform (iPads), MCP authoring, the browser app outside Perform,
  and Brothers Lazaroff.
- **Personas:** all equal, a section per role (Daniel, band musicians, David, Randy, Drew,
  Michael, the BrosLaz members).
- **Main pains:** the weekly setlist flow and Perform reliability.
- **Weekly flow goal:** fewer wrong guesses, above all the wrong song or setting and the wrong
  chart version or key. Speed matters less.
- **iPad failures:** no particular failure named; survey them all.
- **Ambition:** big bets welcome.
- **MCP tool count:** flag sprawl only where it causes wrong tool choice or errors.
- **Browser app role:** backup authoring, review, small edits.
- **v2 redesign:** forgotten. Report its state and recommend finishing, merging or deleting it.
- **Adoption:** partial. Some players are on iPads and others are on paper, out of habit or
  comfort and from trust/reliability doubts.
- **Brothers Lazaroff:** a full peer analysis of the gig workflow.
- **Mixer:** full coverage (wedge-mix UX, bridge reliability, MCP control).
- **Integrations:** the full family view (Overlays, Beit Mitzvah portal, shireishabbat books,
  Haftarah).
- **Evidence:** code and docs, a live browser walk, live MCP calls and telemetry.
- **Prod writes:** test data is allowed, clearly prefixed (`test-gap-`) and cleaned up after.
- **Budget:** thorough, with about five research agents.
- **Deliverable:** an artifact web report plus a repo backlog (`BACKLOG.md` here).
- **After:** quick, safe wins are auto-built under standing authority; big bets wait for Daniel.
  A second popup round follows the research.

## Log
- Research wave launched: perform, mcp-authoring, web-app (+ live walk), mixer, broslaz+family.
  The lead does telemetry.
- mcp-authoring probe side effect: draft_service seeded 3 REAL profiles on first call
  (profile__crc__friday_night:daniel_karen, profile__crc__shabbat_morning:daniel_karen,
  profile__crc__shir_shabbat), seeded from atypical sources (MCP-03). Left in place; deleting
  re-seeds identically until MCP-03 is fixed. Raised in round-2 questions.

## Alignment round 2 (Daniel, 2026-10-31)
- **Stale usual:** fill it but say it (older than 8 weeks or differs from the last service).
- **B'nei Mitzvah:** its own flow with its own preset. It never feeds the regular profiles.
  GATE: camp, holiday and guest services are also kept out of the regular profiles. Proceeded
  because this follows from "Bat Mitzvah is its own flow" and from the stale-usual fix.
- **Probe-seeded profiles:** re-seed them after the profile fix ships.
- **Chart revisions:** future setlists only. Past setlists keep their exact chart, played keys are
  kept, and standing choices follow the new version.
- **Signed-out iPads:** show a "Setlist updated, tap to refresh" strip, with no auto-reload while
  a chart is open.
- **Fleet iPads:** personal logins, not device accounts. The fleet readiness board would then be
  per person; it is deferred.
- **Page turns:** edge tap zones only, with a per-device off switch. Pedal keys, half-page turns
  and night charts were not chosen and stay in the backlog.
- **Open-chart overlay:** no preference given. GATE: build the note + Vocal Lead line and
  "Next: title (key)". Proceeded because they were the recommendation and Daniel raised no objection.
- **v2:** delete it all.
- **Trims:** Schedule out of the top nav, the stale Changelog link out, the dead Perform
  components out, and the `/admin` alias out.
- **Per-instrument copies:** fold them under the parent service in the list. Keep the copies.
- **People:** approve Drew and hide test accounts. Meir is undecided: leave.
- **Wedge ceilings:** yes, set by Drew, starting at about -2 dB. Needs a bridge release.
- **Mixer plan:** saved mixes and an engineer console. The change log/undo and the one-call
  "my mix" were not chosen for now.
- **Bridge alerts:** push to Drew and Michael.
- **Bus 5:** also assign it to the account Claude Desktop uses (crcmusic@).
- **BL wording:** Brothers Lazaroff branding, with CRC staying the legal operator for now.
- **Gig fields:** no preference. GATE: venue, address, load-in/soundcheck/start/end and set
  lengths with a total. Proceeded on the recommended starting set.
- **Family:** the week-key spine and a Beit Mitzvah card on the setlist. Names are not private
  (Daniel: "Nothing is private... names can be in there"), so student names may show.
- **Analytics:** an in-app page counter in the existing beacon only. No Vercel Analytics.
- **First big bet:** the service memory rebuild.
- **Pre-commit checks:** existing setlist on that date, a dead or archived chart, and a played key
  that differs from the written key on a PDF. All of these WARN and never block.
- **Voice readback:** no preference. GATE: count plus the first three, settings not file names,
  dates on "last time". Proceeded on the recommendation.
- **Shirei Tshuvah:** printed at 184pp. The registry is right; fix the CLAUDE.md note.

## Visual refresh (Daniel, 2026-10-31, mid-session)
- Daniel asked for /impeccable init plus a frontend-design / ui-ux-pro-max visual refresh of the
  web app. This covers everything except the chart rendering, so that people see the work.
- init interview: audience = band musicians (iPad), Daniel/David reviewing, and Brothers Lazaroff.
  A fresh identity is OK. Outcome: all three, trust first.
- PRODUCT.md is written to `docs/design/PRODUCT.md`. GATE: not at the repo root, because the repo's
  CLAUDE.md allows only README/CLAUDE/AGENTS/CHANGELOG/COORDINATION and config at the root (the
  stricter rule wins). The impeccable launcher does not auto-find it there, so read it directly in
  design sessions.
- Sequencing: the refresh starts after wave-1 PR C (web trims) merges, because it touches the same
  files. Its Perform parts start after PR B. Visual direction options go to Daniel before the build.
- Report artifact: https://claude.ai/artifact/A95Xw4Pn85UQoEumRYb4Tr

## Security note (2026-10-31)
- The PR #30 review found a pre-existing flaw: `rate-limit.ts` `getKey` keys buckets on the `sub` of
  an UNVERIFIED Bearer JWT, so a forged token gets a fresh bucket each time. That bypasses every
  limit that uses it. It is being fixed in PR #30's fix round, and Daniel was informed.
- PR #30 fixed the `telemetry` tier only (it is now IP-keyed). Every other tier still keys on the
  unverified `sub`. Follow-up security slice SEC-01: verify the token, or fall back to IP, for every
  tier. Caution: the band iPads share one shul WiFi IP, so IP-keying the `chart`/`api` tiers could
  throttle Perform mid-service. Prefer verifying the Firebase ID token (cached) over IP keying.
  Assign to the strongest model with an adversarial review.

## Ops done (2026-10-31)
- Bus 5 is co-assigned to CRC Music (gRWqLaYIFAUlXyFATzGbihEzzfL2), alongside Daniel.
- Drew: both accounts (DINwaB86… percussion, wZ1BAJXt… engineer) already have role admin. The
  "pending request" in People is probably stale. Daniel can clear it in Manage → People.
- TEL-01 back-fill skipped: PR #30 hides folders in the library list and returns not_a_chart for them.
- Merged: #29 (Perform), #30 (web trims and the telemetry rate-limit). #28 is waiting on CI after
  the emulator expectation fix (the moment label "Bar’chu").
- SEC-01 builder launched (verified-token rate-limit keys, shared shul IP safe).
- Michael Koppelman (6PXdZ6W1MqY6NCO1QqCexfRZj3Q2) is confirmed by Daniel as the studio-PC Michael.
  He was written to `config/monitor.bridgeAlertRecipients` through Firestore REST with Daniel's CLI
  login (an updateMask on that one field only). It takes effect when PR #32 merges.
- FLAKE: src/lib/beit-mitzvah/service.emulator.test.ts 'concurrent joint ceremonies' failed on PR #32 with 'Transaction is invalid or closed' (unrelated change). Fix in a later slice.

## Bet 1 shipped (#33 merged 2026-10-31) and re-seed
- Re-seeded for real: shir_shabbat (16 rows, learned from 5 Shir Shabbats) and
  friday_night:daniel_karen (20 rows, learned from the one regular Friday, May 22).
- NOT re-seeded: shabbat_morning:daniel_karen. The dry run learned from 5 regular services but
  returned an EMPTY order (a bug). A fix builder has been launched, and it adds a guard so an empty
  or half-size learned order is never written. RISK until then: a Shabbat-morning draft_service
  for a future date may re-cache the empty order. Daniel was told to hold Shabbat-morning drafts.
- #34 merged (empty-setlist shells skipped and the shrink guard). The Aug 29 setlist
  (JZd5mZhlxalYymMaXJMQ, Noa & Ezra B'nai Mitzvah, with aliyot rows by name) was re-typed to
  bnei_mitzvah_saturday. GATE: proceeded because of Daniel's ruling that B'nei Mitzvah is its own
  flow. Then shabbat_morning:daniel_karen was re-seeded from Apr 4 (38 rows, a single service, so
  drafts will flag it).
- Follow-up: when fewer than 3 regular services exist, the learner unions the orders (81 rows from
  2 services). It should take the most recent service's order. Backlog: SEED-UNION.
- SECURITY (found while building PR #37): the upload duplicate-name check (processChartUpload, and
  the import_chart_from_drive dry run) looked across BOTH tenants. A CRC upload could be refused
  over a Brothers Lazaroff chart, and the refusal named that chart and its fileId (a cross-tenant
  metadata leak). Fixed in #37 (org-scoped). Daniel informed. #37 is under adversarial review.

## Wave status at end of 2026-10-31 session
- Merged and live:
  - #28 draft correctness
  - #29 Perform reliability
  - #30 web trims
  - #31 rate-limit verification (security)
  - #32 MCP and tenant mechanics
  - #33 service memory rebuild (bet 1)
  - #34 empty-setlist and shrink guard
  - #35, #36, #38 visual refresh (blend E)
  - #37 chart lineage (bet 2), which also fixes the cross-tenant dedupe leak
- DESIGN.md recorded at docs/design/DESIGN.md (commit 10d1a65e).
- backfill_chart_lineage dry run: scanned 906 CRC rows, 0 pairs, 0 ambiguous. Correct: the "v2" and
  "updated" names have no clean original to link to. The real issue is exact duplicate actives
  (e.g. two "Nigun 2 (DG Mando)"). That is dedupe work; backlog DEDUPE-ACTIVE.
- Note: 235 library_index rows carry no `status`. Lineage treats them as inactive. Check whether
  they are legacy-active (backlog STATUS-NULL).
- Remaining bets: bet 3 (Perform trust pack, partly delivered by the refresh: freshness line, Save
  button, not-saved marks), bet 4 (wedge safety), bet 5 (BL band mode), bet 6 (family spine).
  Backlog extras: SEED-UNION, the BM emulator flake, DEDUPE-ACTIVE, STATUS-NULL, the leftover
  glass/indigo CSS noted in DESIGN.md.
- Bet 3 merged: #39 (offline integrity) and #40 (tap zones, note line, Next, device transposition). Next-label wording 'Next: title · key' was the lead's call.
- Bet 4 started. Spec: BET-4-wedge-safety.md. Wording the lead's call, logged in the spec.
- GATE: the default wedge ceiling is 0.70 (≈ −2 dB by the f*40-30 fader law), not 0.80 (+2 dB). The lead's earlier recommendation mislabelled 0.80 as −2 dB; Daniel chose −2 dB, so 0.70 follows his ruling. Both bet-4 builders were told.
- #41 (bridge v10.0.8) is merged on green, but the RELEASE is held until B4b (the limits panel) merges, so Drew can adjust the ceiling the moment the bridge starts enforcing it. Release with: gh release create v10.0.8 --target master.
- Bet 4 shipped: #41 (bridge v10.0.8) and #42 (limits panel, saved mixes, engineer console, MCP tools). Firestore rules deployed (firebase deploy --only firestore:rules). Release v10.0.8 published with its exe, blockmap and latest.yml; the studio PC updates in its idle window. The lead ruled set_monitor_limits needs confirm:true to raise a limit above 0 dB.
- NOTE: no CI workflow deploys firestore.rules. Every rules change needs a manual deploy after merge. Backlog: RULES-DEPLOY-CI.
- SECURITY (found while building PR #44): generate_gig_packet had no tenant check on the setlist, so a leader in one tenant could build the other tenant's packet by its setlist id. Fixed in #44 (setlist_not_found). Daniel informed. #44 is under adversarial review, which also hunts for other unscoped setlist loads.
- SECURITY (pre-existing, found in the #44 review): /api/setlist/email-packets did not check the setlist's tenant, so a BL band leader could email packets for a CRC setlist to real CRC musicians. Being fixed in #44's fix round, with a sweep of the other setlist routes. Also adding org checks to review_chart_bonds and wait_for_setlist_change.
- SECURITY (pre-existing, found in the #44 re-review): /api/scheduling/assign and /unassign had no tenant check (cross-tenant writes, plus SMS/email). Being fixed in #44.
- #44 merged (band model plus the cross-tenant fixes). FOUND: production reads tenant config from Firestore (ORG_CONFIG_SOURCE is set), so the code-only config changes had NOT reached prod: the #32 BL branding (BL printouts still said 'CRC Music Books'), the BL agent guide (#44), the Assistant font name, and the legacy-beit-mitzvah book (TF-15). Ran scripts/ops/multitenant/seed-org-configs.ts: dry run, a field-level diff verified no DB-only edits were lost (service types identical), then --apply (10 fields). Verified 0 drift after. Manifest: docs/planning/2026-10-12-multitenant/manifests/seed-org-configs-2026-11-01T00-47-50-195Z.json (undo with --undo). Temp ADC from the Firebase CLI login, deleted after.
- Backlog CONFIG-SEED-CI: every config-code.ts change needs a seed run; add a CI check that fails when code and the orgs/* docs drift, or seed on deploy.
- Polish backlog CAL-VIEW: the /setlists calendar view shows a staffing legend (Fully staffed / Needs attention / No musicians) and red 'none' chips, built on assignments Daniel doesn't use, and it lists instrument copies unfolded with overlapping titles. Drop the staffing status and fold copies.
- #46 and #47 merged (audit colours/leftovers; a11y/touch, including the tap-zone dialog fix). #48 (perf) is under review. GATE: accepted the trade-off that the first chart opened about 20 s after load is slower (1.4 to 2.0 s) because pdf.js is no longer pre-evaluated, in exchange for no frozen taps (TBT 1.8 to 0.7 s) and a faster immediate first open (4.2 to 2.7 s). Proceeded per the trust-first principle.
- Note: the login bundle-size tests already fail on master (721.5 KB vs a 580 KB budget); they are not in the CI gate. Backlog BUNDLE-BUDGET.
- #49 (bet 6) security review: no blockers; four lows in a fix round (strict citation pattern, a replay fence on details, a bounded cache, joint ceremony). GATE: rehearsal dates and student names on the PUBLIC /perform page are kept, by Daniel's err-public policy and his 'names can be in there' ruling.
- #49 merged (week key, occasion, BM card). backfill_week_keys was dry-run, holiday keys spot-checked (RH, YK, Sukkot, Shemini Atzeret, Shavuot, Pesach, autumn parashot), then applied to 83 CRC setlists. Mar 29 is keyed pesach-1 (the week before Pesach): advisory only, harmless.
- Daniel 2026-11-01: 'Beit Mitzvah yes, automatic yes, whatever'.
  - Builder bm-portal: the portal sends details to the card.
  - Builder ci-deploy: keyless (WIF) rules auto-deploy on merge, plus a tenant-config drift check. It never auto-writes config, so DB-only edits are safe.
  - Rehearsal dates stay public ('whatever').
- Dedupe (Daniel approved 'just do it'): the dedupe_library dry run found 6 same-name groups, all with DIFFERENT bytes. Marked 5 unbonded re-uploads as duplicate one by one with mark_chart_status (reversible): Eil Malei Rachamim (old copy), plus Barchu (Walkdown) Bass Clef, C, Eb and Bb (same-day re-uploads, already archived). SKIPPED Fiddley Tune: the one that would be hidden is the NEWER upload (2026-09-24) and is bonded to 2 setlists, so it is likely a version, not junk. Left for Daniel.
- Config seed re-applied for crc branding.themeColor (#0e0d18 to #23356B, drift caught by #51's check). Manifest seed-org-configs-2026-11-01T03-30-05-040Z.json.
- Re-audit 14/20 (REAUDIT.md). P1: a Perform setlist render loop (CPU and battery); builder perf-loop is on it. Matrix view 401: Daniel chose to REMOVE the calendar view (polish wave).
- Daniel 2026-11-01 answers: next = polish, hardening and usability (open tonight's setlist fast, last-minute swap, add a new chart); revive the MusicXML part picker later; the Shabbat AM profile may learn over time; Meir to be approved as member; BL: ship it and plan a brainstorm conversation with David; iPads: Michael keeps them ready, so write a standard iPad settings checklist; wording all fine; fix all re-audit items and report after.
- #52 (Perform render loop) verified on the preview: idle CPU 98% on prod vs 1% with the fix (CDP TaskDuration over 10 s). Merging.
- Automated security scan flagged GET /api/setlists/[id]/ceremony as public exposure of minors' names and rehearsal dates. ACCEPTED: Daniel explicitly ruled names may show ('names can be in there') and 'whatever' on public rehearsal dates, under the err-public policy. Revisit if Daniel changes his mind.
- #53 (people MCP tools) security review: no Critical/High. Fix round for an in-transaction last-admin count (a pre-existing race), a migrate-after-check order, a tenant-scoped caller role, and a dual-tenant test.
- #53 fix round done (in-transaction last-admin, tenant-scoped caller role, a dual-tenant test). SECURITY FOLLOW-UP SEC-02: assertEditor and the assertAdmin checks in the AI-config/bridge tools fall back to the legacy users.role (cross-tenant) for callers not yet migrated to memberships. Check whether any users remain unmigrated; if any do, migrate them or make the checks tenant-scoped.
- SEC-02 checked: the migrate-memberships --plan run shows 38 accounts, 0 unmigrated, so the legacy-role fallback is unreachable today. Kept as a hardening follow-up (make assertEditor tenant-only). The plan file contained emails and was deleted, not committed.
- #53 merged (people MCP tools: list_access_requests, set_member_role). Used them, dry run then real: Meir Bargeron pending to member (Daniel's ruling), and Drew Brodsky's third account (drew@centralreform.org) pending to member (Daniel: 'Approve Drew'; least privilege, his two other accounts are already admin). An unnamed pending request (uid AkbnMV…, 2026-10-24) is left for Daniel. #54 merged (polish wave 1).
- BL ideas page reviewed by Daniel: ONLY 'on-the-fly reorder for the whole band' approved; the other 12 ideas are parked. Builder live-reorder launched (Perform leader reorder mode, live follow with a highlight, both tenants).
- Daniel 2026-11-01: blend E judged bloated; chose mock option B ('E, much quieter') EVERYWHERE. Brief updated. Builder refresh-b launched.
