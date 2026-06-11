# STRESS-TEST PROMPT — Full-system permission/tenancy/UX audit (2026-06)

You are a fresh Claude Cowork session acting as an **independent adversarial
tester** of the multi-tenant sheet-music app. You did not build this app and you
must not trust its documentation about what works — only what you observe.

## Pre-flight gate (added 2026-06-10 after run 1)

Before ANY testing, verify your environment. If a check fails, STOP and tell
Daniel exactly what is missing — do not test around it and do not substitute
curl/bash/fetch:

1. `list_connected_browsers` returns a connected browser (Claude in Chrome).
2. The centralreform.live MCP responds (`list_setlists` on either bearer).
3. You can read `sheet-music-app/docs/ACCESS-POLICY.md`.
4. Loginable accounts work end-to-end: `create_test_account({role:"member",
   loginable:true, ttlSec:900})` returns a one-time login URL; open it in the
   browser and confirm you land signed in; then `revoke_test_account` it and
   confirm the same URL no longer works. If any step fails, STOP and report —
   the persona half of this run depends on it.

**Run 1 (2026-06-10) completed the MCP/data layer.** Read its report at
`.paul/research/STRESS-TEST-REPORT-2026-06-10.md` first — execute ONLY its
`## INCOMPLETE` list (browser surfaces), don't re-test the ✅ cells, and append
findings to a new report continuing the BUG numbering from where it left off.

## Read first (in this order)

1. `sheet-music-app/docs/ACCESS-POLICY.md` — **the oracle.** Every access
   finding is judged against this matrix. If observed behavior contradicts a
   cell → bug. If the policy is silent or ambiguous → "policy question", not a bug.
2. `sheet-music-app/.paul/STATE.md` — current version/milestone context only.
   Do NOT inherit its claims about what is fixed.

## Environment

- Tenants: https://centralreform.live (CRC) and https://brotherslazaroff.live (broslaz). Production.
- You have the centralreform.live MCP connected (setlist/library/admin tools) and Claude-in-Chrome browser tools.
- Viewports: test iPad landscape (1180×820) as primary — it is the band's real
  surface — plus iPhone (390×844) and desktop (1440×900) spot-checks.

## Test accounts

Mint via MCP (`create_test_account`), never use real people's accounts:

| Account | Role | Purpose |
|---|---|---|
| test-member | member | D4 library gating (should NOT see library) |
| test-musician | musician | consumer tier, no monitor bus |
| test-musician-bus | musician | have a monitor bus assigned via `assign_monitor_bus`, then verify own-bus-only access |
| test-leader-crc | band_leader, orgIds:[crc] | cross-org authoring wall on broslaz |

Anon needs no account. Record every created artifact (accounts, setlists,
tracks) in a running CLEANUP LEDGER section of your report as you go.

## Hard safety rules

1. **Never call `publish_setlist`.** Use `preview_publish` only — real rosters get notified otherwise.
2. **Monitor mixes: gating checks only.** Verify who can SEE faders/buses per
   policy D6. Do NOT move faders, mutes, or matrix levels — the bridge may be
   connected to real hardware. Interactive fader behavior is Daniel-supervised
   UAT, not yours.
3. All data you create must be `isTest: true` and go in the cleanup ledger.
4. No destructive admin tools (`delete_*`, `revoke_*`, migrations) except on
   artifacts you created.
5. If context runs low: stop testing, write the report with a `## INCOMPLETE`
   section listing untested cells, so a successor session can continue.

## Pass A — adversarial matrix walk (systematic)

Walk the ACCESS-POLICY matrix. For each persona below, on BOTH tenants, attempt
each read surface and each write surface and record observed vs expected.

Run order (cheapest setup first):

1. **Anon** — both hosts: landing, setlist list, setlist detail, Perform mode,
   a chart deep link (`/perform/[fileId]`), a recording, library URL (expect
   redirect/denied), schedule (expect visible), `/manage` and `/admin` URLs
   (expect denied), write controls invisible (invariant 6). Capture console +
   network errors on every cold load.
2. **Cross-tenant deep links (D3)** — grab a broslaz chart/setlist URL, open it
   while "on" CRC context and as anon. Expect: opens. Then verify UI *lists*
   stay host-scoped (invariant 1).
3. **test-member** — login on each host; key check: library hidden (D4),
   schedule visible, charts viewable.
4. **test-musician** — full read surface; monitor page shows NO buses (not
   assigned); cannot author.
5. **test-musician-bus** — monitor page shows exactly their own bus and no one
   else's (D6). Visibility only — no fader moves.
6. **test-leader-crc on broslaz** — consumer reads work; authoring on broslaz
   must fail cleanly (proper error, not 500); any setlist they author via UI or
   MCP must land `orgId: crc` (invariant 2 — verify stored org via MCP read).
7. **QR flow (D5)** — exercise what's testable without two physical devices:
   inspect `/qr/[code]` + `/api/auth/qr` semantics; verify a code fails after
   use/expiry if observable; verify the session it grants matches the
   musician's role. Note what requires physical UAT.
8. **Chart upload paths** (added after David's 2026-06-10 report — see
   `BUG-cowork-chart-upload-2026-06-10.md`): exercise `import_chart_from_drive`
   (PDF and, once supported, .docx/Google Doc), inline `upload_chart` under
   50 KB, and `request_chart_upload_url` semantics. Note which paths are
   expected to fail from the Cowork sandbox (signed-URL PUT) vs genuinely broken.
9. **MCP error contract spot-checks** — bad IDs and cross-org IDs against
   `get_setlist`, `propose_setlist_changes`: expect structured errors, correct
   status semantics, ISO timestamps (v11.2 regression checks).

For every cell: if it matches policy, log one line in the coverage table. If it
doesn't, file a finding.

## Pass B — day-to-day worthiness (task-based, fresh eyes)

Switch mindset: you are a musician with low patience, 7 minutes before service.
On iPad viewport, as test-musician, on broslaz then CRC:

1. Open the site cold → find tonight's/most recent setlist → open it.
2. Open the first chart → page through → transpose it → back to setlist → next song.
3. Play a recording while viewing a chart.
4. Lose the network briefly (simulate via devtools offline if possible) → does
   the app degrade gracefully?
5. As test-leader: create a small test setlist in the UI, add 3 songs, reorder, delete it.

Journal *friction*, not just bugs: every extra tap, ambiguous label, slow load
(>2s perceived), layout jank, dead end. Rate each friction item Minor/Annoying/Blocking.
Pull `get_web_vitals_summary` via MCP and include it.

## Report format

Write to `sheet-music-app/.paul/research/STRESS-TEST-REPORT-2026-06-<today>.md`:

1. **Summary** — 5 lines: counts by severity, worst finding, overall worthiness verdict (1–10 with one-line justification).
2. **Findings** — numbered BUG-1..N, each with: severity (P0 data-loss/security/tenancy · P1 core flow broken · P2 degraded · P3 polish), persona + tenant + viewport, numbered repro steps, expected (cite the policy cell or invariant #), actual, evidence (screenshot filename, console/network excerpt). **Do not prescribe fixes.** If root cause is uncertain, write "VERIFY FIRST: <what to check>".
3. **Policy questions** — behavior the policy doesn't cover. For Daniel, not Claude Code.
4. **UX friction journal** — Pass B items with ratings.
5. **Coverage table** — every matrix cell tested with ✅ OK / 🐛 BUG-n / ⏭ untested+why. This section is mandatory; it's what makes the next stress test cheap.
6. **Cleanup ledger + confirmation** — list every artifact created, then run
   `cleanup_all_test_data` + `revoke_test_account` for each, and verify gone.
   Report ends with explicit "CLEANUP VERIFIED" or what remains.

Save screenshots alongside the report. When done, present the report file and
give Daniel a 5-line chat summary.
