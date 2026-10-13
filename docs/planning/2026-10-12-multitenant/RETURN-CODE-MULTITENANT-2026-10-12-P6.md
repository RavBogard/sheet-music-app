# RETURN — Multi-tenant phase 6 (feature flags), 2026-10-12

Executor: Claude Code (Opus 5.5). Two Opus lanes:
- Server: config, API routes, MCP, crons, mixer CRC-only, inbox folder.
- UI: pages, nav and buttons.

Branch `claude/multitenant-2026-10-12`, merged to `master`.

Shipped: `9a0492c9` (Vercel `sheet-music-jargqa2xd`). Tenant flags were written to production before the code deployed (lane 1's deploy-order warning). Manifest: `manifests/set-tenant-features-2026-10-13T00-19-06-806Z.json`.

## Gate

**PASS.**

| Gate item | Evidence |
|---|---|
| CRC (all six on) matches the golden captures | Production HTTP golden diff against `golden/http-before`: every CRC surface is identical, MCP instructions included. CRC's live tool list (99) equals lane 1's before-capture exactly (`golden/tools-crc-p6.txt`). The UI goldens (nav, Manage tabs, Perform toolbar, settings toggles, print modal) match for every CRC role. |
| BL set to exactly what BL does today | BL's flags were set flag by flag from production evidence (`P6-BL-FLAGS.md`): mixer off, driveInbox off, schedulingEmails off, todayFeed **on**, notifyBand **on**, perform on. <br>• BL's live tool list is today's minus 14 (`golden/tools-bl-p6.txt`): the 12 authoring mixer tools, plus `get_chart_inbox` and `sync_chart_inbox`, which only ever answered BL "not configured". <br>• BL's UI loses the Monitor link, the Sound tab, the Perform Monitor buttons, the Drive "Sync Now" card (it synced CRC's folder into CRC's library) and the scheduling Email toggle. <br>• BL's MCP instructions name its switched-on features. <br>• BL probe **19/19** (`golden/bl-probe-p6.txt`). BL's today feed re-emitted under the new code (`/api/health`, 164 s old). |
| On a throwaway tenant, each flag switched off removes its UI, refuses its API, drops its MCP tools and skips its cron | Live, on `mtprobe3` at `crl-mtprobe3.vercel.app`, flags all on, then all off (`golden/p6-throwaway-tenant.txt`): <br>• **UI**: `/perform` 200 → 404. `/monitor` is never available to a non-CRC tenant; a signed-out visitor is redirected to login first. <br>• **API**, signed in as a tenant admin, flags off: each route answers 404 `feature_off` — `/api/today` (todayFeed), `/api/scheduling/remind` (schedulingEmails), `/api/library/sync` (driveInbox), `/api/bridge/setup-code` (mixer), `/api/setlist/notify-band` and `/api/setlist/email-packets` (notifyBand, checked against the setlist's tenant before anything is sent). <br>• **MCP**: 87 → 83 tools; `notify_band`, `preview_notify_band`, `get_chart_inbox`, `sync_chart_inbox` drop. Mixer tools are absent in both states (CRC only). Calling a dropped tool is refused with `isError`. <br>• **Crons**: emit-today, scheduling-reminder and drive-sync loop over `tenantsWithFeature(flag)`; bridge-watch and admin-consistency's bridge check run only for crc's mixer. Covered by unit tests: no cron secret is held here to call them live. Live corroboration: CRC's and BL's feeds were re-emitted after deploy. <br>• Cleanup: the tenant, its address (authorized domains back to 8), the probe account, the setlist, and all tokens (view, platform, BL) were removed or revoked. |

## Checklist

| Item | Result |
|---|---|
| Six flags in tenant config replace `DEFAULT_CONFIG.features` (`monitor, ai, audio, collaboration`) | PASS. The old block is removed from the congregation store; `monitor` becomes `mixer`. Nothing read `ai`, `audio` or `collaboration`. |
| BL's flags set flag by flag, with how each was determined | PASS. `docs/planning/2026-10-12-multitenant/P6-BL-FLAGS.md`. |
| Gates on the server at four places | PASS. UI: server `notFound()` in `monitor/layout.tsx` and `perform/layout.tsx`, plus nav and buttons via `useFeature`. API: `requireFeature`. MCP: list filter for every tenant (the crc/BL exemption is removed) plus the `withFeatureGates` handler check. Crons: `tenantsWithFeature`. |
| Mixer CRC-only | PASS. `featureOn` and `tenantFeatures` report the mixer off for any tenant but crc. `config/monitor.orgId = "crc"` is written and checked by bridge-watch and admin-consistency. New setup codes record their tenant. |
| Drive inbox folder id in tenant config | PASS. New field `orgs/{id}.driveInbox.folderId`; `CHART_INBOX_DRIVE_FOLDER_ID` is CRC's fallback. A tenant with no folder is refused as "not configured". drive-sync stamps imports with the folder's tenant. |

## Test tails (merged tree)

- `npx vitest run`: **517 files passed** (3 skipped). Tests: **5,992 passed**.
- `npm run test:emulator`: **119 files, 2,204 tests passed**.
- `npx tsc --noEmit`: 0. Clean `next build --webpack`: 0. `login-bundle`: 1 passed.

## Decisions

1. **BL notifyBand on.** None of BL's 7 setlists was ever notified. But the packet email (`email-packets`) leaves no stored trace, and Vercel keeps only one day of logs, so its use can't be ruled out. Per "when in doubt, on", BL keeps its notify and packet-email tools. Turning it off later is a one-line change to the config plus a script re-run.
2. **BL todayFeed on.** BL's today file is refreshed by the cron, and its consumers read it.
3. **The mixer from a BL token is closed.** Someone who is admin in both tenants (David) drives CRC's mixer through the CRC connector or centralreform.live, not through BL's. Phase 2 had kept that path; the ruling keeps the mixer CRC-only.
4. **Scheduling emails off** still schedules and still sends push and in-app notices; only email and SMS stop.
5. **`open_chart_dropzone` and `import_drive_folder` stay always on.** Neither uses the inbox.
6. **Not gated on purpose:**
   - `/api/setlists/notify-updated`: in-app only, with no callers.
   - `/api/health`.
   - `/api/admin/set-sound-engineer`: a general role route.

## Carried forward

- **A tenant with Perform off has rough edges.** No current tenant is affected.
  - The proxy still sends signed-out visitors from `/` to `/perform`.
  - Several cards and redirects still link into Perform.

  Worth fixing before any tenant turns Perform off; Nava's ruling keeps it on.
- The unused `MCP_FEATURE_FILTER` entry is still declared in `env.mjs`.
- From earlier phases:
  - the Open Graph alt text and `/manifest.json` must become per tenant before phase 8;
  - phase 2 step 5;
  - `VERCEL_API_TOKEN` (Needs Daniel).

## Commits

| Commit | What it is |
|---|---|
| `b57f5f45` | Lane 1: feature-flag contract (`features.ts`, `features-client.ts`) |
| `530beb83` | Lane 1: goldens (tool lists, gated routes and crons) |
| `2f2b1fb5` | Lane 1: gates, BL flags, inbox folder, set-tenant-features script |
| `1fefde19`, `0849f12a`, `cae7256f` | Lane 2: UI goldens, contract cherry-pick, UI gates |
| merges, `9a0492c9` | Merges; production flags manifest |

GATE: production tenant flags written before deploy without a pause — proceeded because the old code ignores them, the dry run showed exactly four field changes, and the manifest undoes them.
GATE: BL loses the mixer UI and tools, the Drive sync card and the scheduling Email toggle — proceeded because the ruling keeps the mixer CRC-only, and the other two only ever acted on CRC's data or had no BL use in production.
