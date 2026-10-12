# HANDOFF-CODE-MULTITENANT-2026-10-12 — CentralReform.live (sheet-music-app)

Executor: Claude Code on Opus, opened on this repo
Status: ready
Verified-against SHA: `d7c7ec7f` (master, 2026-10-12)
Stop-and-ask count: 0
Branch: `claude/multitenant-2026-10-12` off `master`
Mission: `MISSION-2026-10-12.md` · Analysis: `ANALYSIS-MULTITENANT-2026-10-12.md` (reports in `work/`) · Rulings: `RULINGS-MULTITENANT-2026-10-12.md` — all in this folder; read the rulings first
Subagents: Opus and Sonnet only (R-0919-audit-9). Repeat this line in any sub-order you write.
Process: you are executor and producer for this repo (R-0919-audit-8). Measure your own expectations, keep your own ops/tasks entries, write your own returns, deploy when a phase's gate passes. There is no producer and no board row.
Git: host-side only (`CLAUDE.md`); readouts through a mounted copy are untrusted. Merge to `master` when green.

## Mission

1. A tenant becomes data: one `orgs/{orgId}` document replaces about 40 hardcoded places, and CRC and BL render exactly as today from it.
2. Roles are per tenant; Daniel alone is platform owner; sign-up joins only the tenant whose address was used.
3. Daniel runs every tenant from a `/platform` console and a platform MCP server; each tenant's connector gets its own agent guide.
4. Charts can be shared across tenants as read-only collections; Nava's catalogue is the first, owned by Nava and shared back to CRC.
5. Nava Tehila is onboarded through the new path (shul mode, Asia/Jerusalem, Hebrew right-to-left) and the proof suite passes in production.

## Interrupt policy

Stop and ask Daniel only for:

- **Money**: any new paid service, or any plan change on Vercel, Firebase or Resend.
- **A change CRC or BL users can see or do beyond ruling 6** (the `nava` ownership move; the ruling-8 chart replacements ride on it). The golden-output tests in phase 1 are how you know.
- **An irreversible migration.** Every data step here is built with a manifest and an undo; if one turns out not to be reversible, stop.
- **A judgment call with no precedent** in the mission, analysis or rulings.

Everything else: decide, log it in the phase's ops/tasks entry and the return, and keep going. Deploy to production when a phase's gate passes; no approval checkpoint.

## Before anything

1. Create the branch. Commit `RULINGS-MULTITENANT-2026-10-12.md`, this handoff, and any file in this folder not yet tracked.
2. Create the phase entries in ops/tasks (see the last section).

## Verify preconditions first

- [ ] `master` is at or descends from `d7c7ec7f`. If it has moved, read `git log d7c7ec7f..master` and recheck any line number below that those commits touched.
- [ ] The BL probe is at `scripts/dev/e2e-bl-tenant-probe.mjs` (not `scripts/`). It drives MCP only, so it runs on the Admin SDK and never tests the rules. Run it once against production and keep the output as the baseline.
- [ ] The self-role hole exists. In the emulator, a pending user writes `role: 'admin'` to its own `users/{uid}` (allowed by `firestore.rules:106`), calls the `/api/auth/sync-claims` handler, and comes back with an admin claim. Keep this test; it becomes phase 0's regression test.
- [ ] Recordings and finalize already tag tenants: `src/app/api/recordings/upload/route.ts:112` stamps `orgId`; `src/lib/mcp/tools/library-upload-session.ts:576` stamps the caller's org on `finalize_chart_upload`. What is left: the open recordings read rule (`firestore.rules:236`) and making finalize's `org` argument required.
- [ ] List every account with platform-wide admin today (the `role: admin` claim, `config/admins`, `SUPER_ADMIN_UID` in `src/lib/api-auth.ts`). Ruling 5 assumes David Lazaroff is on that list. If he is not, ask before giving him CRC admin.
- [ ] The Vercel API token on the server can add and remove a `*.vercel.app` domain on the project (`POST /v10/projects/{id}/domains`), and the service account can patch Firebase authorized domains (the call in `scripts/add-auth-domains.mjs`). Prove both with a throwaway name, then remove it.
- [ ] Take a fresh Firestore export and test-restore it into a scratch project. Required before the stamping in phase 2 and the `nava` move rehearsal in phase 5.

---

## Phase 0 — Security patch

Size: small. Gate: the precondition test now fails to escalate; production rules and app deployed the same day; profile edits and the admin set-role route still work.

- [ ] `firestore.rules:106`: a user creating its own document may set `role` only to `pending` (or leave it out); a user updating its own document may change only profile fields. Find the full profile-field list by grepping every writer to `users/{uid}` (drift repair, profile edits, `src/lib/users-firebase.ts:53`) so none of them breaks. `orgIds`, `m` and `po` are never self-writable.
- [ ] `/api/auth/sync-claims` never raises a claim from user-document fields. It may keep or lower a role, never raise one. Admin stays settable only through `src/app/api/admin/set-role/route.ts`.
- [ ] Check whether anyone used the hole: accounts whose admin role has no matching set-role entry in `auditLogs`, or whose document role differs from their claim. Report what you find. If any account looks self-promoted, stop and ask; do not change it yourself.
- [ ] `npm run test:emulator`, `npm test`, `npx tsc --noEmit`, `npm run build` green. Deploy rules and app the same day; in production, a pending throwaway account's attempt is refused.

## Phase 1 — Tenant config out of code

Size: large. Gate: with the config switch on `firestore` in production, every golden output for CRC and BL matches the before-capture exactly; with a tenant document missing, crc and BL still render today's output.

- [ ] **Capture golden outputs before changing anything**, for CRC and BL: page head metadata, manifest, login HTML, both email templates (`src/lib/email.ts`), scheduling email (`src/lib/email-scheduling.ts`), calendar feed, print cover, gig-packet PDF metadata, chart footer (`src/lib/chart-render/house-chart-html.ts`), library tab labels, MCP instructions as served, SMS prefix, Open Graph image, robots, sitemap, the four legal pages, footer. Every later step in every phase compares against these.
- [ ] One config schema (zod) for `orgs/{orgId}` with the fields in analysis section 2. It drives the seed script, the console form and the platform tools, so they cannot disagree.
- [ ] `getOrgConfig(orgId)`: Admin SDK, 60 seconds in memory plus Next's tagged cache (the tag is cleared on save), an environment switch `code | firestore`, and the code tables as fallback for crc and BL. The root layout hands the config to the browser through `OrgProvider`.
- [ ] Seed script (`scripts/ops/`) writes `orgs/crc` and `orgs/brotherslazaroff` by importing the code constants, not retyping them: `BRANDING`, `EMAIL_BRANDING`, vocab `BASE` and BL overrides, `DEFAULT_CONFIG.printFooter`, and the literals in the email, scheduling, calendar-feed, chart-footer and gig-packet code. Dry run prints the difference; running twice changes nothing. CRC `colors` stays empty; BL is marked `legacyCssTheme`.
- [ ] Replace the hardcoded values one surface at a time, each passing its golden test: `src/lib/org/branding.ts`; `src/lib/org/vocab.ts` (`hidesLiturgicalFields` becomes `vocabulary.mode`); `src/lib/congregation-store.ts:54-69` and its copy at `src/lib/mcp/tools/congregation.ts:49-55`; `src/lib/constants.ts` (`BASE_URL`, `DEFAULT_SHORT_NAME`); fonts and `lang` in `src/app/layout.tsx`; both branches of `src/app/login/page.tsx` (the default branch at :102-106 must read the resolved tenant); Open Graph, robots, sitemap; "CRC Music" in `src/app/(v2)/layout.tsx`, `PublicSetlistSkeleton.tsx` and `unauthorized/page.tsx`; email, SMS, calendar feed, chart footer, gig packet; legal pages (platform-run with the tenant named; CRC's text identical); library tabs (`SongChartsLibrary.tsx:495-500`, `src/lib/songs/picker-scope.ts:31-45`) and the fixed collection list `core | supplemental | nava | uploads`; the Gemini prompt in `src/lib/library/ai-enrichment.ts:297`; the rabbi slot keys in `src/lib/liturgical-templates.ts`; books, default book per service and service types per tenant; CORS defaults on `/api/library/file/[id]` and `/api/drive/file/[fileId]`.
- [ ] **Time zone per tenant**: `src/lib/parse-event-date.ts:54`, `src/lib/performance/tonight.ts:87`, `src/lib/today/build-today.ts:55`, `src/lib/reader-music.ts:88`, `src/lib/mcp/tools/service-sheet.ts:83`, the calendar feed's `X-WR-TIMEZONE`, `scripts/ops/monitor-live-probe.mjs:223`. MCP tool descriptions (`src/lib/mcp/tools/index.ts:1338`, `:1477`, `congregation-services.ts:125`, `setlist-write.ts:386`) say "the tenant's local time", and `get_congregation_context` returns the zone. Grep `America/Chicago` down to the CRC fallback only.
- [ ] **Crons**: `vercel.json` keeps today's entries; each loops over tenants. `scheduling-reminder` runs hourly and sends at each tenant's local 05:00 (CRC unchanged). `bridge-watch` stays CRC-only on its current times. `emit-today` loops the registry.
- [ ] **Hebcal per tenant**: `src/lib/liturgical-calendar.ts:169` follows `locale.calendar` (israel or diaspora). Test on a week where the Israel and Diaspora readings differ.
- [ ] Fix the paths that read every tenant's data and filter in memory: templates (`src/lib/template-firebase.ts`), scheduling history (latest 50, then filter), scheduling assignments (last 500), suggest-band. Query by `orgId`, add indexes.
- [ ] Ship with the switch on `code`, then flip it to `firestore` in production and confirm the golden outputs there.

## Phase 2 — Membership and roles

Size: large. Gate: the emulator rules suite is green with every cross-tenant attempt refused and every must-still-work case working; the BL probe matches its baseline; throwaway accounts at each CRC and BL role see what they saw before; current admins migrated per ruling 5.

- [ ] **Stamp untagged rows first** (list rules are not filters; unstamped CRC rows would vanish from queries). `orgId: "crc"` on every untagged row in songs, library_index, recordings, setlists, tracks, setlistTemplates, scheduling collections and contacts, with a manifest of every document changed and an undo script that removes the field from exactly those. Same pattern for `orgId` in each chart file's Storage custom metadata. Backup from the preconditions first.
- [ ] `memberships/{tenantId}__{uid}`: `uid, tenantId, role (admin | band_leader | musician | member | pending), soundEngineer, addedBy, addedAt`. Written by the server only. `users/{uid}` keeps profile fields only.
- [ ] One server function rebuilds claims from memberships on every change: `{po?, m: {tenant: code}, se?}`. It keeps writing the old `role` and `orgIds` claims during the changeover, and fails loudly if a claim set nears the 1000-byte limit. On removal it also revokes refresh tokens; server routes and MCP read the membership record, not the claim.
- [ ] Platform owner: server-only `platform/owners {uids: [Daniel]}` plus the `po` claim. `SUPER_ADMIN_UID` and `config/admins` fold into it.
- [ ] One helper reads the token tenant's membership for server routes and MCP; it replaces `readUserRole` (`src/lib/mcp/server-tracks-write.ts:113`, 17 files).
- [ ] **Rules rewrite** with a tenant check on every collection the analysis lists: setlists (create, update, delete; single-document `get` stays public and `list` stays signed-in per R-0919-audit-2), tracks, songs, library_index, recordings reads, `templates` (id prefix before `__`; bare id means crc), setlistTemplates, contacts, scheduling assignments and history, songUsage, musician_availability, live_sessions, tasks, setlist history, bond flags, stages, overrides, mcpTokens and mcpOAuthCodes (server only), memberships, `orgs` (public read, server write), `platform/*` (server only), `users` (self or platform owner; band-leader roster reads move to a server route), `config/featured` and `config/defaults`, and `auditLogs` (gains `orgId`).
- [ ] **The mixer in rules**: `config/monitor`, `monitor-live/*` and the bridge command queue require at least musician in the bridge's tenant plus the sound-engineer flag, replacing the global `isMember()` at `firestore.rules:603`.
- [ ] **`storage.rules`**: `library/**` reads require membership in the object's `orgId` metadata (phase 5 widens this to shared visibility). The browser does not read Storage directly; check the server routes still work.
- [ ] Every `isAdmin() ||` bypass (`orgCreateOk`, `orgUpdateOk`, `callerCanWriteExistingOrg`, `songOrgReadOk`, `orgReadOk`, `canLeadSetlist`) becomes platform-owner only.
- [ ] **Sign-up**: the browser stops writing role and tenant fields (`src/lib/users-firebase.ts:53`). After sign-in it calls `/api/auth/join`, which takes the tenant from `x-org-id` and creates a pending membership there only.
- [ ] **Pending requests**: a tenant admin sees and approves or declines them in `/manage` People. The crc / bl / both menu in `src/components/admin/UserRow.tsx:53-73` becomes a per-tenant role select. Signing in at another tenant's address creates a pending request there and nothing else.
- [ ] **Migrate people per ruling 5**: one membership per tenant in each user's current `orgIds` (missing means crc), at their current role; every current admin except David becomes admin of crc only; David becomes admin of crc and BL; Daniel gets `po`. Manifest and undo. List every account changed in the return.
- [ ] Retire `scripts/issue-bl-bearer.mjs` (it overwrites David's claim).
- [ ] **Emulator rules suite** (`@firebase/rules-unit-testing`, already in `package.json`; add the Storage emulator). People: platform owner; tenant A admin, band leader, musician, member, pending; tenant B band leader; a dual member (A band leader, B admin); signed out; old-claims-only. Every cross-tenant attempt in analysis section 4 must fail: reading or listing B's records or chart files, MCP tokens, or memberships; creating a setlist stamped B or unstamped; moving an A setlist to B; editing or deleting B's records; commanding B's bridge; changing B's memberships or config; setting one's own `po`; writing `role`, `orgIds`, `m` or `po` into one's own user document; creating one's own membership; the dual member gaining anything in A from B admin rights. Must still work: opening one setlist or track by id while signed out; `/api/library/file/[id]`.

## Phase 3 — Addresses

Size: medium. Gate: a throwaway tenant is reachable at its vercel.app alias and Google sign-in works there; an unknown production host shows "no such site"; CRC and BL hosts behave exactly as before; MCP through each tenant's connector address keeps its Authorization header.

- [ ] **Default address per ruling 1**: at tenant creation, add `<slug>.vercel.app` to the existing project through the Vercel API. If the name is taken, use the nearest free one and store it in `orgs/{orgId}.domains`.
- [ ] **Authorized-domain automation**: the server adds each new host with the Identity Toolkit call from `scripts/add-auth-domains.mjs`. That call replaces the whole list, so run it as read-modify-write under a lock (one Firestore document as the lock), one change at a time, and read the list back afterwards.
- [ ] **Edge address list**: a public endpoint built from `orgs` (host to orgId, aliases and custom domains), cached at the Edge for 60 seconds. The proxy checks the compiled CRC and BL map first, then the list. vercel.app hosts resolve through the list, not by reading the first part of the host.
- [ ] **An unknown host must NOT fall back to CRC.** `src/proxy.ts:161-162` (through `resolveOrgIdByDomain`, `src/lib/org/registry.ts:70-81`) and `coerceOrgId` (`src/lib/org/registry.ts:47`): an unknown or suspended host gets a plain "no such site" page in production. Preview deployments and localhost keep mapping to crc so testing still works.
- [ ] **Custom-domain add-on**: from the console or `add_tenant_domain`, add the domain to the project with the bare-to-www redirect in the same call; show the exact DNS records for the tenant's registrar (`GET /v6/domains/{name}/config`), plain-language DNS instructions, and a waiting / verified / live status with Check again (`POST .../verify`); add the hosts to Firebase; write the address list. Certificates follow automatically. Only the DNS change at the registrar is manual.
- [ ] **www / bare redirect header fix**: the bare-to-www 307 drops MCP's Authorization header and Vercel redirects before the app runs. The console, `invite_tenant_admin` text and each tenant's OAuth metadata name the canonical host (www for custom domains, the alias for vercel.app tenants) as the connector address. Confirm `MCP_PUBLIC_URL` and the OAuth metadata come from the tenant's primary host, not a single env value.
- [ ] Session cookies stay host-only.

## Phase 4 — Platform console and platform MCP

Size: large. Gate: every console action and every platform tool works on a throwaway tenant, dry run first and an audit row after; `/api/platform/mcp` refuses a non-owner token and a tenant token cannot call platform tools; a CRC-only user connecting through another tenant's address is refused rather than handed a CRC token; CRC's served MCP instructions match the golden capture; BL's connector now describes BL.

- [ ] **`/platform`** (platform owner only, checked on the server; `/manage` stays the tenant admin's page): tenant list (name, address, status, members, features on, New tenant); tenant page with Identity (generated from the config schema), Features, Addresses, People, Collections; New tenant (identity, subdomain, optional copy of liturgy frames and books); View as this tenant (read-only, as Daniel, with a banner); Activity.
- [ ] `platformAudit` collection (who, action, tenant, before, after, when, console or Claude); `auditLogs` gains `orgId`.
- [ ] **`/api/platform/mcp`**, registered like the ops surface (`src/lib/mcp/surfaces.ts`, `src/lib/mcp/build-handler.ts`), accepting only platform tokens minted for the platform owner. The 17 tools: `list_tenants`, `get_tenant`, `create_tenant`, `update_tenant`, `set_tenant_features`, `add_tenant_domain`, `check_tenant_domain`, `remove_tenant_domain`, `list_tenant_members`, `set_tenant_member_role`, `remove_tenant_member`, `invite_tenant_admin`, `list_collections`, `set_collection_sharing`, `assign_collection`, `mint_tenant_view_bearer`, `list_platform_activity`. Each takes a required tenant argument with no default; writes default to a dry run returning before, after and the difference, as `update_congregation_services` does.
- [ ] **Per-tenant generated agent guide**, replacing the single `.paul/AGENT-GUIDE.md` served to everyone: split that file into a shared core plus CRC's own text; after the token is checked, dispatch by the token's tenant to a cached handler whose instructions combine the core, the tenant's `agentGuide` text, and generated facts (name, authors, service types, vocabulary, time zone, language, enabled features). Tools for features that are off drop out of that tenant's list. Existing connectors keep working.
- [ ] **MCP OAuth refuses instead of falling back**: the authorize step records the address's tenant in the code (`src/app/api/mcp/oauth/authorize/route.ts:97`); the token is minted for that tenant only; `resolveMintOrg`'s fall-back to the user's first tenant (`src/lib/org/membership-server.ts`) is removed, here and in `/api/mcp/tokens`. No approved membership means a clear refusal (platform owner exempt).

## Phase 5 — Shared collections

Size: medium. Gate: CRC and BL libraries, pickers and MCP library results match the golden captures and the probe baseline; chart bytes are refused across tenants except through visibility (or the per-tenant openable-by-link setting); the `nava` move rehearsal on the scratch restore leaves every CRC setlist resolving.

- [ ] `collections/{id}`: `ownerOrgId, name, label, visibility (private | listed | all), sharedWith, assignedTo` (`assignedTo` is set by the platform owner; a tenant admin cannot remove it). Seed records for CRC's `core`, `supplemental`, `nava`, `uploads` and BL's collections.
- [ ] `library_index` and `songs` rows gain `collectionId` (the old `collection` string stays as fallback) and `visibleToOrgs`, recomputed by one server job whenever sharing changes.
- [ ] One "can this tenant see this row" helper. The 45 MCP "owned" checks in `src/lib/mcp` (`rowOrg(row.orgId)` against the caller) become "visible" checks for reads; writes stay "owns". Same for `isPickableFor` and `songOrgReadOk`. Ship with every row visible only to its own tenant, so nothing changes yet.
- [ ] **Picker**: own charts first, exactly as today. Each visible shared collection is an opt-in chip, off until switched on, remembered per user (`ChartPickerList.tsx`, `TonightSwapSheet.tsx`, the library page). MCP `search_library` and `list_library` gain `includeShared` (default false) and `collectionId`; results carry `ownerOrgId`.
- [ ] **Storage and download authorisation**: `download_chart` (`src/lib/mcp/tools/library-download.ts`) checks visibility; `storage.rules` widens phase 2's read check to shared visibility; `/api/library/file/[id]` and `/api/drive/file/[fileId]` follow the tenant's openable-by-link setting (default on, so today's behaviour stays) and otherwise check membership or visibility.
- [ ] Deleting a chart another tenant's upcoming setlist uses is refused; archive is allowed. Byte replacements on shared charts are logged to `platformAudit`. Unsharing leaves existing setlist rows working.
- [ ] Tenant admins get `create_collection` and `set_collection_sharing` (own collections only) on the authoring surface.
- [ ] **Build and rehearse the `nava` ownership move (ruling 6)**; it runs in production in phase 8, once Nava's tenant exists. The script sets `collectionId`, `orgId` to Nava and `visibleToOrgs` to Nava and CRC on the 140 rows; keeps `collection: "nava"` so CRC's tab is unchanged; records the previous owner; writes a manifest and an undo. File ids do not change. On the scratch restore: run it; confirm every CRC setlist track pointing at one of the 140 still resolves (title, bytes through `/api/library/file/[id]`, Perform loads); CRC's "Nava Tehilah" tab count is unchanged; CRC edits (`update_song`, `mark_chart_status`) are refused with a clear message; BL sees none of them; then run the undo and confirm the restore matches its starting state.

## Phase 6 — Feature flags

Size: medium. Gate: CRC (all six on) and BL (set to exactly what BL does today) match the golden captures; on a throwaway tenant each flag switched off removes its UI, refuses its API, drops its MCP tools and skips its cron.

- [ ] Six flags in tenant config, replacing `DEFAULT_CONFIG.features` (`monitor, ai, audio, collaboration`): `mixer`, `driveInbox`, `schedulingEmails`, `todayFeed`, `notifyBand`, `perform`. Charts, setlists and MCP are always on. Set BL's flags flag by flag to match what BL does today and log how you determined each.
- [ ] Gates checked on the server at four places: UI (page, nav, buttons), API routes, the MCP tool list (built per tenant in phase 4) plus a handler check, and crons (each loops only over flagged tenants).
- [ ] **Mixer CRC-only**: the bare `config/monitor` and `monitor-live/*` documents stay CRC's; the bridge config carries `orgId: "crc"` and must match; the 19 monitor and bridge tools, `/monitor`, the Sound tab and the `bridge-watch` and `admin-consistency` crons check the flag and the tenant.
- [ ] Drive inbox folder id moves into tenant config, with `CHART_INBOX_DRIVE_FOLDER_ID` as CRC's fallback.

## Phase 7 — Hebrew

Size: large. Gate: CRC and BL English output matches the golden captures; on a Hebrew tenant every band-facing and admin screen renders in Hebrew, right to left, with no untranslated string (a scan that fails on any user-visible string bypassing `t()`, plus a pseudo-locale run); chord lines do not flip; dates show in Asia/Jerusalem; the review subagent's report is in the return.

- [ ] **i18n layer**: a `t()` lookup on server and client, grown from `src/lib/org/vocab.ts`; English and Hebrew catalogues; tenant language with a per-user override.
- [ ] **String extraction**: about 450 to 600 band-facing strings in about 120 files, plus about 300 admin strings (`/manage`, library, upload, templates, setlist editing), per ruling 7. The platform console and MCP text stay English (default).
- [ ] **Hebrew-capable fonts** in the fixed font menu (Rubik or Heebo, plus one more), loaded only for Hebrew tenants. The service sheet PDF prints Hebrew as "?" today (`src/lib/pdf/service-sheet-pdf.ts`); embed a Hebrew font there too.
- [ ] **`lang` and `dir="rtl"` at the root layout** (`src/app/layout.tsx:117`) from the tenant's language and the user override.
- [ ] **Logical CSS properties**: about 135 left/right classes become start/end (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`); arrows flipped in 13 files; Perform next/previous follows reading direction. Chart content keeps its own direction in its own container.
- [ ] **Date and number formatting**: about 55 `toLocale…` / `Intl.DateTimeFormat` calls take the tenant's time zone and language.
- [ ] **Translation by subagents**: an Opus or Sonnet subagent translates the catalogue from per-key context notes (where the string appears, who sees it, length limit) and a short glossary for recurring terms (service, setlist, chart, band leader). A second subagent reviews independently for accuracy, register and consistency. Disagreements get a third pass or are logged. Daniel is not the checker (ruling 7). The credit line is translated like any other string.

## Phase 8 — Nava Tehila onboarding

Size: small. Gate: Nava is live at its vercel.app alias in Hebrew, right to left, with its flags as set; the `nava` collection is owned by Nava and CRC sees and uses it exactly as before (every CRC setlist resolves); the platform-owner MCP token test passes.

- [ ] Create the tenant through the new path (`create_tenant`, dry run first, or the console). Slug (your choice, logged), name "Nava Tehila", time zone Asia/Jerusalem, language `he`, direction `rtl`, calendar `israel`, vocabulary mode `shul`, service types from their catalogue (Kabbalat Shabbat, Shacharit, High Holidays, Hallel), shared books only.
- [ ] Flags: `perform` on; `mixer`, `driveInbox`, `schedulingEmails`, `todayFeed`, `notifyBand` off. Charts, setlists and MCP on.
- [ ] vercel.app alias and Firebase authorized domain added by the phase 3 path.
- [ ] Run the phase 5 `nava` move in production: Nava owns the collection, shared to CRC. Then confirm every CRC setlist still resolves and CRC's tab is unchanged.
- [ ] **Chart updates per ruling 8**: replace in place only the songs whose chord PDF changed (from the analysis diff: Lakh Amar Libi, Niggun Tishrei, Arba'im Shana, Bati Legani if its change is to the chord chart, and Shamru Edotav if the library holds the album copy). The five notation-only changes need nothing. Check Ehyeh Asher Ehyeh first. Add Pitchu Li Sha'arei Tsedek and Kol Haneshama (Daphna) as new Nava-owned charts; leave Anan Va'arafel until it has files. PDF upload or Drive import only, never the URL scraper. Dry run and manifest first.
- [ ] No tenant admin yet; Daniel administers it as platform owner.
- [ ] **Platform-owner MCP token test**: Daniel's token through Nava's address sees Nava's library and no CRC-only data; a CRC-only throwaway user is refused at Nava's address.

## Phase 9 — Proof

Size: medium. Gate: every item below passes in production. That is "done" (mission, Proof).

- [ ] **N-tenant probe**: generalise `scripts/dev/e2e-bl-tenant-probe.mjs` into `scripts/dev/e2e-tenant-probe.mjs`. Read tenants from the registry; a throwaway test user and token per tenant (generalise `scripts/mint-throwaway-bl-bearer.mjs` to take a tenant and stop borrowing David's account). For every ordered pair: A's data is invisible from B; B cannot read, change or delete A's setlist by id; no overlap in templates, musicians, contacts or congregation context; an A user is refused at B's address. Then repeat core reads and writes through the browser SDK against the deployed rules and Storage. Clean up.
- [ ] **Throwaway tenant end to end**: create it with `create_tenant` or the console; its alias and Firebase domain are added automatically; a real Google sign-in at that address lands as pending in that tenant only. If no test Google account is available to automate the sign-in, put that one click on the return's "Needs Daniel" list and finish everything else.
- [ ] **Platform-MCP isolation**: a connection through the throwaway tenant's address sees no CRC data; `/api/platform/mcp` refuses a non-owner token; a tenant token cannot call platform tools.
- [ ] **Adversarial rules pass by a separate subagent** (Opus), given the rules files, `storage.rules` and the persona list but not your tests. It writes its own cross-tenant read and write attacks against the emulator and against the deployed rules with throwaway accounts. Every success is a defect, fixed and re-run before done.
- [ ] **Delete the throwaway tenant**: alias removed from Vercel, host removed from Firebase authorized domains, memberships, test users and `orgs` document deleted. Confirm each is gone.

---

## What is explicitly out of scope

- Billing tenants.
- Per-tenant email: sender domains, per-tenant templates, Resend plan changes (ruling 3).
- A web siddur for Nava.
- Nava's tenant admin (Daniel names one later).
- Mixer per tenant (it stays CRC-only behind its flag).
- Lecha Dodi duplicate hygiene.
- BL access to the Nava collection.
- Buying a platform domain (ruling 1).
- Loading Nava's Hebrew charts or sheet music (ruling 8).

## Return

After each phase write `RETURN-CODE-MULTITENANT-2026-10-12-P<n>.md` beside this file: the phase checklist with PASS or FAIL per line, the SHAs shipped, the tail of `npm test`, `npm run test:emulator`, `npx tsc --noEmit` and `npm run build`, every decision you logged, and a short "Needs Daniel" list only if something genuinely needs him.

## Do not

- Do not let liturgical text into this repo: ids, names and page numbers only.
- Do not re-sort, insert or delete a row on an existing setlist outside an explicit author action (R11-b).
- Do not re-add Publish in any form (R-0919-audit-3).
- Do not make single-document `get` on setlists or tracks private (R-0919-audit-2).
- Do not rename or retype the fields Overlays reads through `setlist_reader` (see `CLAUDE.md`). Adding fields is fine.
- Do not propose which setting or melody the band plays.
- Do not buy anything or change a plan.

## ops/tasks

`ops/tasks/*.json` is the single status surface (R-0919-audit-8). It lives in shireishabbat (`~/shireishabbat/ops/tasks/`); this repo has no `ops/tasks/` of its own. The Code session creates its own entries, one per phase (`MULTITENANT-P0.json` through `MULTITENANT-P9.json`), in the shape of the existing files there, and keeps their status current as it works. No board row, no producer.

## Verification notes (independent pass, 2026-10-12, against d7c7ec7f)

All file paths, line references, collection names, routes, scripts, env vars and tool names were checked; five line/path references were corrected in place. The self-assigned-role hole (firestore.rules:106 + /api/auth/sync-claims) is confirmed real as written. Items the pass could not settle, which the Code session resolves in its preconditions step:

- No Vercel API token exists in the code, env.mjs, .env.local or .env.example. Creating and storing one is a precondition for phase 3 (it is a credential, not spending — no interrupt needed unless a plan change is required).
- Vercel's docs confirm the add-domain call (POST /v10/projects/{id}/domains) but do not say a `<slug>.vercel.app` name can be added that way. Phase 3 starts with a throwaway-name test. If it fails, fall back to subdomains under centralreform.live (wildcard DNS already pointing at Vercel) with the same per-host Firebase authorized-domain step; no domain purchase either way (ruling 1).
- The 1000-byte custom-claims limit is from the Firebase docs page title only; confirm on the page before sizing the claim map.
- The scheduling reminder cron is `0 10 * * *` UTC, which is 05:00 St. Louis in summer and 04:00 in winter. Per-tenant time zones mean the cron must run per tenant at local time; keep CRC's current UTC time as-is rather than "fix" it to local 05:00 (CRC unchanged wins).
- The count of MCP "owned by this tenant" checks is about 50 `rowOrg(...)` comparisons in src/lib/mcp, not 45; `readUserRole` touches 15 source files plus 2 tests.
- `library_index` is already server-only (`allow read, write: if false`); the phase 2 rules list can drop it.
- `~/shireishabbat/ops/tasks/` was not visible from the verification mount; confirm the path before writing MULTITENANT-P0..P9 entries.
