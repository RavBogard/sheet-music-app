# Lane C: platform console, shared collections, feature flags, Hebrew

Analyst C, 2026-10-12. Read-only survey of master. Answers MISSION-2026-10-12.md outcomes 3, 4, 6, 7.

## 1. Platform console

### Today

- `/admin` redirects to `/manage` (`src/app/(main)/manage/ManageClient.tsx`): People, Library, Sound, Audit tabs, single-tenant.
- No browser screen edits the congregation config; `config/congregation` / `congregation__{org}` (`congregationDocId`, `src/lib/org/registry.ts`) is changed only via MCP (`update_congregation_services`) or the Firebase console.
- Tenants are code: `ORGS` (`registry.ts`), `BRANDING` (`branding.ts`), `vocab.ts`; `hidesLiturgicalFields()` checks for `brotherslazaroff` by name.
- "Super admin" is three things: `SUPER_ADMIN_UID` (`src/lib/api-auth.ts`), a global `role: 'admin'` claim, and `config/admins` in `firestore.rules`. `isAdmin()` skips every tenant check in the rules (`songOrgReadOk`, `orgReadOk`, `orgCreateOk`). A Nava admin would therefore read CRC songs. Platform owner and tenant admin must be split before a second admin exists (lane B; the console depends on it).
- `auditLogs` exists (set-role, delete-user, library deletes), no tenant field.

### Proposal

A new `/platform` route, separate from `/manage`; nav link and server check for the platform owner only. `/manage` stays the tenant admin's page and does not grow. Three screens:

1. **Tenants**: one row each with name, address, status (setting up / live / paused), member count, features on. One button: New tenant.
2. **Tenant page**, one scrolling page, five sections:
   - **Identity**: name, short name, kind (synagogue/band), time zone, language, email sender, print footer, colours, logo. Generated from lane A's config schema so console and seed script cannot disagree.
   - **Features**: six switches (section 3).
   - **Addresses**: default subdomain; Add custom domain; per domain the DNS records to give the tenant and a status (waiting / verified / certificate issued) with Check again. Mechanism from the deployment lane.
   - **People**: members, roles, remove, Invite admin (email in, link out, pending invites).
   - **Collections**: owned collections with sharing; shared collections visible here, with Assign/Unassign.
   - A **View as this tenant** button.
3. **Activity**: platform audit log, filter by tenant.

New tenant = Identity form plus subdomain plus "copy liturgy frames and books from CRC".

**View as tenant**: open the tenant's address as Daniel with a fixed banner, read-only unless editing is switched on. Not "log in as a specific person"; add later only if support needs it.

**Audit**: new `platformAudit` collection (who, action, tenant, before, after, when, console or Claude). Add `orgId` to `auditLogs`.

### Platform MCP tools

Tools are split across addresses by one table (`src/lib/mcp/surfaces.ts`): authoring `/api/mcp`, ops `/api/ops/mcp`. Add `/api/platform/mcp` the same way (`src/lib/mcp/build-handler.ts`). Bearers carry one `orgId` (`orgFrom`, `src/lib/mcp/org-context.ts`); platform tools take `orgId` as an argument and refuse anyone but the platform owner. House style from `update_congregation_services`: writes default `dryRun: true`, return `{before, after, diff, changed}`.

| Tool | Arguments | Returns |
|---|---|---|
| `list_tenants` | none | orgId, name, status, addresses, members, features |
| `get_tenant` | orgId | full config, address status, members by role, collections |
| `create_tenant` | orgId, name, shortName, kind, timeZone, locale, subdomain, features?, copyLiturgyFrom?, dryRun | config to write, address, next step |
| `update_tenant` | orgId, patch, dryRun | before/after/diff |
| `set_tenant_features` | orgId, features, dryRun | before/after/diff |
| `add_tenant_domain` | orgId, domain, dryRun | DNS records, verification state |
| `check_tenant_domain` | orgId, domain | state and what is missing |
| `remove_tenant_domain` | orgId, domain, dryRun | before/after |
| `list_tenant_members` | orgId, role? | uid, name, email, role, last seen |
| `set_tenant_member_role` | orgId, uid or email, role, dryRun | before/after |
| `remove_tenant_member` | orgId, uid, dryRun | before/after |
| `invite_tenant_admin` | orgId, email, role | invite id, link, expiry |
| `list_collections` | orgId? | owner, visibility, shared-with, chart count |
| `set_collection_sharing` | collectionId, visibility, sharedWith, dryRun | before/after, charts affected |
| `assign_collection` | collectionId, orgId, assigned, dryRun | before/after |
| `mint_tenant_view_bearer` | orgId, minutes (max 60) | short-lived read-only bearer for that tenant |
| `list_platform_activity` | orgId?, since?, limit? | audit rows |

Tenant admins get `create_collection` and `set_collection_sharing` (own collections only) on the authoring surface.

## 2. Shared chart collections

### Today

- "Collection" is a fixed string on `library_index`: `core | supplemental | nava | uploads`, repeated in at least ten files (`src/lib/songs/picker-scope.ts`, `src/lib/library-upload.ts`, `ai-enrichment.ts`, `review-queue.ts`, `api/admin/library-review/edit`, `api/library/list`, `SongChartsLibrary.tsx`, `SearchOverlay.tsx`, `UploadDialog.tsx`, `ScraperModal.tsx`, MCP `list_library`/`search_library`). Labels are hard-coded ("Shireinu" = supplemental).
- Pickers (`ChartPickerList.tsx`, `TonightSwapSheet.tsx`) show only rows whose `orgId` is the host tenant (`isPickableFor`); songs arrive via `songs where orgId == host` (`src/lib/songs/subscribe.ts`).
- CRC holds 140 `nava` rows (DUPLICATES-REPORT-2026-09-22). "L'Cha Dodi (Nava)", 1.5 MB, sits in CRC `uploads`, and BL holds a byte copy titled "Lecha Dodi Nigun (Nava)" in Dm (rows P8, section 5), possibly a different tune from the C chart in `nava`. That copy-per-tenant pattern is what sharing should end.
- Setlist tracks point at `fileId`/`songId` and cache title, fileName, mimeType (`src/lib/mcp/server-tracks-write.ts`).
- **Chart bytes are not tenant-isolated.** `download_chart` (`src/lib/mcp/tools/library-download.ts`) never checks the row's tenant. `/api/drive/file/[fileId]` is public by design and trusts same-site requests (`src/lib/drive-file-auth.ts`). `storage.rules` lets any member of any tenant read all of `library/`. So sharing by reference needs no byte changes, and "private" is private only in listings. Under one parent domain every tenant subdomain is same-site to every other. For the security lane.

### Data model

- `collections/{id}`: `ownerOrgId`, `name`, `label`, `visibility` (`private` / `listed` / `all`), `sharedWith` (tenants), `assignedTo` (tenants the platform owner added; a tenant admin cannot remove these).
- On `library_index` and `songs` rows: `collectionId` (old `collection` string kept as fallback) and `visibleToOrgs`, a copied list (owner + sharedWith + assignedTo, or `["*"]`), recomputed by one server job when sharing changes. The copy lets the picker query `visibleToOrgs array-contains-any [host, "*"]` and lets the rules check it without reading another document.
- Only the owner edits a shared chart. Consumers change key and notes on their own track rows, as now.

### Picker

Own charts by default, exactly as today. Each visible shared collection is an extra chip, off until switched on, remembered per user. Same on the library page. MCP `search_library`/`list_library` get `includeShared` (default false) and `collectionId`; results carry `ownerOrgId`.

### Reference, not copy

Recommend reference. Consequences:

- **Owner edits reach everyone at once**, including a mid-week PDF replacement before CRC's Friday. Log byte replacements on shared charts in platform activity.
- **Owner deletes**: today hide/delete ignore bonds in other tenants' setlists (`mark_chart_status` in `src/lib/mcp/tools/index.ts`). For shared charts that must flip: refuse delete while another tenant's upcoming setlist uses it; allow archive (bytes stay, existing rows work, chart leaves pickers).
- **Unshare**: existing rows keep working; the chart leaves the consumer's picker.

### Moving `nava` to Nava without breaking CRC

The risk is the read paths. `src/lib/mcp` has 45 checks of `rowOrg(row.orgId)` against the caller (get_song, search, swap_chart, text search, bond checks), plus `isPickableFor` and `songOrgReadOk`. Changing the 140 rows' `orgId` alone would make them vanish for CRC.

1. Add one helper, "can this tenant see this row" (owner or in `visibleToOrgs`); switch reads to it, keep writes on "owns". Ship with every row visible only to its own tenant, so CRC and BL see no change.
2. Create Nava and a "Nava Tehila" collection, owned by Nava, shared with `crc`.
3. For the 140 rows set `collectionId`, `orgId` to Nava, `visibleToOrgs` to Nava and CRC; keep `collection: "nava"` so CRC's tab and chip are unchanged; record prior `orgId` to allow undo. File ids are untouched, so CRC setlists, cached titles and Storage paths keep working.
4. Run CRC and BL isolation and bond probes before and after.

The parallel rescrape should write into the Nava-owned collection once it exists.

**Duplicate case**: move nothing automatically. Once someone says which tune it is, a Nava chart joins the Nava collection and the CRC and BL copies are marked duplicate pointing to it (reversible `mark_chart_status`); BL can then be shared the collection instead of keeping copies.

## 3. Feature flags

`DEFAULT_CONFIG.features` (`src/lib/congregation-store.ts`) has `monitor, ai, audio, collaboration`; only `monitor` is read, to hide a nav link. Replace with six flags in tenant config, checked on the server; hiding buttons is extra.

| Feature | Code today | Gate | Nava |
|---|---|---|---|
| Mixer / X32 | single untenanted docs `config/monitor`, `monitor-live/*` (`server-monitor.ts`, `monitor-store.ts`, `firestore-monitor-client.ts`); bridge reads `config/monitor` directly (`bridge/src/config.ts`); 19 MCP tools; `/monitor`; Sound tab | page, nav, Sound tab, every monitor/bridge tool, `bridge-watch` and `admin-consistency` crons, rules | off |
| Drive inbox | env `CHART_INBOX_DRIVE_FOLDER_ID` (`src/lib/drive-sync/inbox.ts`, `api/cron/drive-sync`); `register-chart-inbox.ts` already CRC-only | folder id into tenant config, cron loops tenants, inbox tools | off |
| Scheduling emails | `scheduling-reminder` cron has no tenant; "CRC Music" sender hard-coded (`src/lib/email.ts`, `email-scheduling.ts`) | cron loop, sender from config, `api/scheduling/*` | off |
| today.json | `emit-today` already loops `ORGS` | loop flagged tenants | off |
| notify_band | MCP tool, push/email/SMS | handler, UI button | off |
| Perform | `src/app/perform`, `src/components/performance` | route | on |

Crons in `vercel.json` are global; each loops tenants. MCP tools register before the caller's tenant is known, so day-one gates go in handlers; trimming Nava's menu (it would see 19 mixer tools) needs the server built after the bearer is read, a later step.

**Mixer: recommend CRC-only behind the flag.** The bridge is a desktop app on fixed Firestore docs, not a URL, so "per tenant" means namespacing docs and telling the bridge its tenant, across app and bridge, for no current second user. Keep CRC on bare doc names (the `congregationDocId` pattern) so it stays additive later.

## 4. Hebrew and right-to-left

### Today

- No translation layer or i18n package. `src/app/layout.tsx` hard-codes `lang="en"`; nothing sets `dir`.
- `src/lib/org/vocab.ts` (17 keys per tenant) is the seed to grow into a string table.
- Fonts Poppins, Righteous, Zilla Slab, Geist Mono load Latin only; no Hebrew letters.
- Chart rendering uses DejaVu Sans (has Hebrew). The service sheet PDF prints Hebrew as "?" (`src/lib/pdf/service-sheet-pdf.ts`).
- `America/Chicago` about 50 times in 20 files; about 55 `toLocale…`/`Intl.DateTimeFormat` calls.
- Band-facing: login, nav, home, setlist list and view, chart viewers (`src/components/music`), Perform, schedule.

### What it needs

1. Tenant locale (`en`/`he`) with a per-user override; layout sets `lang` and `dir`.
2. A `t()` lookup on server and client, grown from vocab.
3. Start/end instead of left/right: about 135 physical-direction classes in band-facing folders, 13 files with chevrons or arrows to flip. Tailwind `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-` cover it.
4. A Hebrew font (Rubik or Heebo), loaded only for Hebrew tenants.
5. Every date formatter takes the tenant time zone and locale; same job as removing `America/Chicago`.
6. Chart content keeps its own direction in its own container so flipping the page does not flip chord lines. Perform next/previous should follow reading direction; check on an iPad with a real Hebrew chart.

### Size

About 450 to 600 strings across about 120 band-facing files (24,000 lines): setlist about 170, Perform 130, chart viewers 50, nav/home/schedule 40, login and errors 30. Admin adds about 300.

### Day-one scope

Hebrew: login, nav, home, setlist list and view, chart viewers, Perform. English: `/manage`, library, upload, templates, platform console, all MCP text. Setlist editing English on day one (Nava will author mostly through Claude). Titles and chart content shown as written.

## Decisions only Daniel can make

1. A tenant admin never sees other tenants' data (recommended), confirming the split from today's global admin.
2. View as tenant: read-only as himself (recommended), or also log in as a specific person.
3. Shared charts by live reference, owner fixes reach CRC at once (recommended), or pinned versions.
4. When Nava unshares or archives a chart CRC uses: CRC setlist rows keep working (recommended) or are removed.
5. Moving the 140 `nava` rows to Nava's ownership means CRC loses edit rights to them. Confirm.
6. Which tune the "L'Cha Dodi (Nava)" / "Lecha Dodi Nigun (Nava)" file is, and whether BL gets the Nava collection.
7. Mixer CRC-only behind a flag (recommended) or per-tenant now.
8. Setlist editing in Hebrew on day one, or viewing and Perform only.
9. With scheduling emails and notify_band off, whether Nava sees the Schedule page and how it tells its band about a setlist.
