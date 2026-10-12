# Multi-tenant centralreform.live: analysis

12 October 2026. Answers MISSION-2026-10-12.md in this folder. Built from four analyst reports in work/: A (data model and migration), B (sign-in, roles, MCP, domains), C (console, sharing, flags, Hebrew), D (Nava Tehila research and rescrape). Paths are relative to sheet-music-app/; line numbers are as of today. No source code was changed.

## 1. What we found

**How tenancy works today.** A tenant is code. The tenant list is a table in src/lib/org/registry.ts:15-26, and src/proxy.ts:161-164 turns the web address into a tenant id (`x-org-id`). Everything else that makes a tenant is spread across about 40 places, chiefly:

- src/lib/org/branding.ts and src/lib/org/vocab.ts
- the CRC defaults in src/lib/congregation-store.ts:54-69 (copied in src/lib/mcp/tools/congregation.ts:49-55)
- BL's colours and font in src/app/globals.css
- America/Chicago in about seven live code paths and the cron times in vercel.json
- "CRC Music" and "Central Reform Congregation" in the email, SMS, calendar-feed, chart-footer and gig-packet code, and the four legal pages
- .paul/AGENT-GUIDE.md, which every MCP connection gets, BL's included

A new tenant today means editing all of these and redeploying.

**Two fallbacks send unknown addresses to CRC.** `coerceOrgId` (registry.ts:47) turns any unknown tenant id into "crc", and the proxy (proxy.ts:163-164) treats any unknown host as CRC. A mistyped subdomain therefore shows CRC's login. The login page's default branch (src/app/login/page.tsx:102-106) also reads CRC's config with no tenant argument.

**Security findings.**

- **Users can make themselves admin.** firestore.rules:106 lets a user write any field of their own user document, including `role`. `/api/auth/sync-claims` copies that role into the sign-in token, and every browser calls it automatically (src/lib/drift-repair.ts:84). A pending account can set `role: 'admin'` from the browser console and become admin, and MCP tools accept it at once. This exists today, independent of this project.
- **Admins skip every tenant check.** Each tenant rule starts with `isAdmin() ||`, and admin is platform-wide. A Nava admin could read and write CRC's data.
- **About a dozen rules have no tenant check:** setlist create, update and delete; `users` reads by band leaders; `templates`; `setlistTemplates`; `recordings` reads; `songUsage`; `musician_availability`; `live_sessions`; `tasks`; setlist history; and the shared `config/featured`, `config/defaults`, `config/monitor` and `monitor-live` documents.
- **Chart files can be read across tenants.** storage.rules lets any member of any tenant read all of `library/`. MCP `download_chart` (src/lib/mcp/tools/library-download.ts) never checks the row's tenant, and `/api/library/file/[id]` and `/api/drive/file/[fileId]` serve any file to anyone with its id. Under one parent domain all tenant subdomains count as the same site.
- **MCP sign-in falls back to the wrong tenant.** `resolveMintOrg` (src/lib/org/membership-server.ts) quietly issues a token for the user's first tenant when they are not a member of the tenant whose address they used. A CRC-only user connecting through Nava's address gets a CRC token.
- **The mixer is not tenant-scoped.** One `config/monitor` document, no tenant check: a BL sound engineer could move CRC's X32.

**Brief assumptions that turned out false.**

- Recordings and `finalize_chart_upload` already stamp the tenant (src/app/api/recordings/upload/route.ts:112; library-upload-session.ts:576). Left to do: close the open recordings read rule, and make finalize's `org` argument required.
- The BL isolation probe never tests the rules. It drives MCP, which runs on the server with full database access, so the rules are bypassed. It lives at scripts/dev/e2e-bl-tenant-probe.mjs, not scripts/.
- "Every new user joins CRC and BL" only half works: the browser writes both tenants onto the user document (src/lib/users-firebase.ts:53), but the token never gets them, and sync-claims later writes `['crc']` back.

## 2. The recommended design

### Tenant configuration

One Firestore document per tenant at `orgs/{orgId}` (the collection already exists, public-read and server-write, firestore.rules:261). The orgId is lowercase letters, digits and hyphens, never changes, and is the default subdomain. Operational settings (services, stream, scheduling, default musicians) stay in `config/congregation[__id]`. Fields:

- identity: id, name, shortName, status (active or suspended); `domains` (primary, aliases)
- `branding`: app name, page titles, tagline, theme colour, logo, wordmark, hero image, location, login style, light and dark colours, display and body fonts chosen from a fixed menu in code (Next.js fixes fonts at build time), including two or three Hebrew faces
- `vocabulary`: mode (shul or band, replacing the hardcoded BL check) and string overrides
- `locale`: language (en or he), direction, time zone, parasha calendar (diaspora or israel)
- `email` (from-name, from-address, reply-to, header, footer, SMS prefix); `print` (cover footer, chart footer, gig-packet title); `legal` (operator name, contact email)
- `features` (six flags), `library` (collections in tab order), `liturgy` (books, default book per service, service types), `agentGuide` (tenant text added to a shared core guide)

One server function, `getOrgConfig(orgId)`, holds the document in memory for 60 seconds and in Next's tagged cache, so the console clears it on save. The root layout hands it to the browser through the existing OrgProvider. For crc and brotherslazaroff the current code tables stay as the fallback, so a missing document shows exactly today's output. Any other unknown or suspended address gets a plain "no such site" page, never CRC.

### Roles and membership

One membership record per person per tenant, `memberships/{tenantId}__{uid}`, with role (admin, band leader, musician, member, pending), sound-engineer flag, and who added them. It is the single source of truth; `users/{uid}` keeps profile fields only. One server function rebuilds sign-in claims from memberships on every change, as a tenant-to-role map such as `m: {crc: "bl", brotherslazaroff: "ad"}`. That is about 20 bytes per tenant, so 20 tenants is about 400 bytes, under Firebase's 1000-byte limit; real people hold one to three. Rules read the claim, so tenant checks cost no document reads. Daniel alone carries a platform-owner flag (`po: true`, backed by a server-only `platform/owners` document), and only he skips tenant checks. During the changeover the old `role` and `orgIds` claims keep being written.

**Sign-up joins only the tenant whose address was used.** The browser stops writing role or tenant fields. After sign-in it calls `/api/auth/join`, which reads the tenant from `x-org-id` (the proxy overwrites anything the browser sends) and creates a pending membership there only.

### Addresses and sign-in

Every tenant gets `<slug>.<platform domain>`. A Vercel wildcard needs the domain's nameservers on Vercel. Without a neutral domain, `<slug>.centralreform.live` works the same way, and since each tenant can hold several addresses, a neutral domain can be added later.

Firebase has no wildcard authorized domains, so each subdomain is added at tenant creation by the Identity Toolkit call scripts/add-auth-domains.mjs already makes, run on the server one at a time (it replaces the whole list).

Custom domains are automated from the console: add to Vercel with the bare-to-www redirect, show the DNS records and a waiting / verified / live status, add the hosts to Firebase, write the address list. Certificates follow automatically. Only the DNS change at the tenant's registrar is manual. The console gives the www host as the connector address, because the bare-to-www redirect drops MCP's Authorization header.

The proxy cannot read Firestore. Subdomains resolve from the host's first part; custom domains from a small public address list built from `orgs` and cached at the edge for 60 seconds, instead of paid Vercel Edge Config. CRC's and BL's hosts stay compiled into the proxy permanently.

### Platform console and platform MCP

A new `/platform` route for the platform owner only; `/manage` stays the tenant admin's page.

- **Tenant list:** name, address, status (setting up, live, paused), members, features on, New tenant button.
- **Tenant page:** Identity (generated from the config schema, so console and seed script cannot disagree), Features (six switches), Addresses (subdomain, custom domains, DNS records, status, Check again), People (members, roles, invite admin), Collections (owned and shared, assign and unassign).
- **View as this tenant:** opens the tenant's address as Daniel with a banner, read-only.
- **Activity log:** a new `platformAudit` collection (who, what, which tenant, before and after, console or Claude); `auditLogs` gains `orgId`.

The same work goes through Claude on a separate server, `/api/platform/mcp`, registered like the ops surface (src/lib/mcp/build-handler.ts, src/lib/mcp/surfaces.ts) and accepting only platform tokens minted for the platform owner. Its 17 tools:

- list_tenants, get_tenant, create_tenant, update_tenant, set_tenant_features
- add_tenant_domain, check_tenant_domain, remove_tenant_domain
- list_tenant_members, set_tenant_member_role, remove_tenant_member, invite_tenant_admin
- list_collections, set_collection_sharing, assign_collection
- mint_tenant_view_bearer, list_platform_activity

Each takes a required tenant argument with no default; writes default to a dry run returning before, after and the difference, as `update_congregation_services` does. Authoring stays on each tenant's own connector, so about 100 authoring tools need no tenant argument and cannot write to the wrong tenant.

**Per-tenant agent guide.** After the token is checked, the request goes to a cached handler for the token's tenant, with instructions assembled from its config (name, authors, service types, vocabulary, time zone, language, enabled features only). Tools for features that are off drop out. Dispatch is by the token's tenant, so existing connectors keep working. MCP sign-in records the address's tenant in the authorization code (src/app/api/mcp/oauth/authorize/route.ts:94 does not today), issues a token for that tenant only, and refuses clearly when there is no approved membership.

### Shared collections

A new `collections/{id}` record holds the owner tenant, name, label, visibility (private, listed, all), `sharedWith` (chosen by the owner) and `assignedTo` (added by Daniel; a tenant admin cannot remove these). Each chart row gets a `collectionId` (the old `collection` string stays as fallback) and a `visibleToOrgs` list, recomputed by one server job when sharing changes, so pickers and rules check visibility without reading a second document.

Shared charts are live references, not copies: an owner's fix reaches everyone at once, and byte replacements are logged. If the owner unshares or archives a chart, setlists already using it keep working and it leaves the other tenant's picker. Deleting a chart another tenant's upcoming setlist uses is refused. Only the owner edits; others change key and notes on their own setlist rows, as now. Pickers show the tenant's own charts by default, with each shared collection as a chip that starts off. MCP `search_library` and `list_library` gain `includeShared` (default false).

### Feature flags

Six flags in the tenant config, checked on the server. Nava's day-one set: mixer off, Drive inbox off, scheduling emails off, today.json / Overlays feed off, notify_band off, iPad Perform on. Charts, setlists and MCP are always on. Crons stay single entries in vercel.json that loop over flagged tenants; scheduling reminders run hourly and send at each tenant's local 05:00 (CRC's time today). The mixer stays CRC-only behind its flag: the bridge is a desktop app tied to fixed Firestore documents, and nobody else needs it. CRC keeps its bare document names so per-tenant support can be added later.

### Hebrew on day one

Band-facing screens in Hebrew from the start: login, navigation, home, setlist list and view, chart viewers, Perform. Admin, library, upload, templates, the platform console and all MCP text stay English. The work:

- a `t()` lookup grown from vocab.ts: about 450 to 600 strings in about 120 files
- `lang` and `dir="rtl"` set at the root layout from the tenant's language, with a per-user override
- about 135 left/right layout classes changed to start/end; arrows flipped in 13 files
- a Hebrew font (Rubik or Heebo), loaded only for Hebrew tenants; today's fonts have no Hebrew letters
- dates in the tenant's time zone and language (the same job as removing America/Chicago)
- the Israel parasha schedule from Hebcal (src/lib/liturgical-calendar.ts:169 asks for Diaspora)

Chart content keeps its own direction in its own box, so chord lines do not flip. The service sheet PDF prints Hebrew as "?" today (src/lib/pdf/service-sheet-pdf.ts).

## 3. Migration path that keeps CRC and BL identical

**Gate for every step:** golden-output tests comparing CRC and BL before and after: page head metadata, manifest, login HTML, both email templates, scheduling email, calendar feed, print cover, gig-packet metadata, chart footer, library tab labels, MCP instructions. A step ships only when the output matches.

1. Close the self-role hole: self-writes limited to profile fields; sync-claims stops copying a role from the user document. Confirm the hole in the emulator first. Reversible (redeploy previous rules).
2. Fresh Firestore export, test-restored into a scratch project. Required before steps 6 and 7.
3. Write `orgs/crc` and `orgs/brotherslazaroff` by importing the code constants, not retyping them. Reversible (delete the fields).
4. Add `getOrgConfig` behind an environment switch, code tables as fallback. Reversible (flip the switch).
5. Replace hardcoded values one surface at a time, including time zone and cron loops, each passing its golden test. Reversible (revert).
6. Stamp `orgId: "crc"` on every untagged row, with a list of every document changed. Reversible (remove the field from exactly those).
7. Stamp `orgId` into chart files' Storage metadata, same list approach. Reversible.
8. Create memberships and the claim map from current `orgIds` and roles, still writing old claims; Daniel gets the platform-owner flag. Reversible (delete records and claims).
9. Switch sign-up to `/api/auth/join` (already ruled; only new sign-ups notice). Reversible.
10. Add the "can this tenant see this row" helper and switch reads to it (45 checks in src/lib/mcp, plus `isPickableFor` and `songOrgReadOk`), shipping with every row visible only to its own tenant. Reversible.
11. Tighten Firestore and Storage rules after the emulator suite and probe pass. Reversible (redeploy previous rules).
12. Bind MCP sign-in to the address's tenant; turn on per-tenant handlers and guides. Reversible.
13. Create the Nava tenant and move the `nava` collection to Nava's ownership: set collection, owner and visibility (Nava and CRC) on the 140 rows, keep `collection: "nava"` so CRC's tab is unchanged, record the previous owner for undo. File ids do not change, so CRC setlists keep working. **This is the one step CRC users notice: CRC loses edit rights on those 140 charts.** Reversible, but waits for Daniel (decision 6).
14. Retire the hardcoded branding, vocabulary and email tables only after the firestore switch has run in production with no difference. The CRC and BL host map stays in the proxy. Reversible from git.

No step deletes or overwrites a value. Other current admins losing global admin is covered by decision 5.

## 4. Proof

- **Emulator rules suite** (`@firebase/rules-unit-testing`, already in package.json:99; add Storage). People: platform owner; tenant A admin, band leader, musician, member, pending; tenant B band leader; a dual member (A band leader, B admin); signed out; old-claims-only. Each must fail:
  - an A member reading or listing B's setlists, tracks, songs, recordings, templates, contacts, assignments, availability or live sessions, B's chart file in Storage, MCP tokens, or B's memberships
  - an A band leader creating a setlist stamped B or unstamped, moving an A setlist to B, editing or deleting B's records, or commanding B's bridge
  - an A admin changing B's memberships, setting their own platform-owner flag, or writing B's config
  - anyone writing `role`, `orgIds`, `m` or `po` into their own user document, or creating their own membership
  - the dual member gaining anything in A from B admin rights

  Opening one setlist or track by link, and `/api/library/file/[id]`, must still work.
- **N-tenant probe.** Generalise scripts/dev/e2e-bl-tenant-probe.mjs to e2e-tenant-probe.mjs, reading tenants from the registry, with a throwaway test user per tenant instead of David's account (retire scripts/issue-bl-bearer.mjs). For every ordered pair: A's data is invisible from B; B cannot read, change or delete A's setlist by id; no overlap in templates, musicians, contacts or congregation context; an A user is refused at B's address. Then repeat core reads and writes through the browser SDK against deployed rules and Storage. 20 tenants is 380 pairs, a few minutes.
- **Throwaway tenant end to end.** Created by create_tenant or the console; subdomain added to Firebase automatically; a real Google sign-in at that address lands as pending in that tenant only.
- **Platform MCP isolation.** A connection through the throwaway tenant's address sees no CRC data; `/api/platform/mcp` refuses a non-owner token; a tenant token cannot call platform tools.

## 5. Cost and shape

Build phases in order:

1. **Self-role fix.** Small: one rules change, one route change, one emulator test.
2. **Tenant config out of code.** Large: about 40 hardcoded places, each with a golden test, and time zone touches dates across the app and MCP.
3. **Per-tenant roles, rules and stamping.** Large: memberships, claims, sign-up route, a full rules rewrite, stamping every untagged row.
4. **MCP tenant binding and per-tenant guides.** Medium: the OAuth change is small, but building the handler after the token is read changes server start-up.
5. **Addresses.** Medium: the Vercel and Identity Toolkit calls already exist in scripts; the edge address list and status display are new.
6. **Platform console and 17 platform tools.** Large: a new route with five sections, a new MCP surface, audit logging.
7. **Shared collections.** Medium: one new record, but 45 MCP read checks and the pickers move to the new helper.
8. **Feature flags.** Medium: six server-side gates and tenant-looping crons; trimming each tenant's tool list depends on phase 4.
9. **Hebrew and right-to-left.** Large: 450 to 600 strings, about 120 files, direction, fonts, dates.
10. **Proof suite.** Medium: the emulator suite and the pair-looping probe are new code.
11. **Nava onboarding.** Small: create the tenant, move the collection, upload the 3 new and 10 changed PDFs.

**Hosting at 20 tenants is flat except email and SMS.** Vercel stays one Pro project; custom domains and certificates are free; crons stay at 16 entries. Firestore stays in the low tens of dollars a month once the paths that read every tenant's data and filter in memory (templates, scheduling history and assignments, suggest-band) are fixed in phase 2. Storage is about 40 GB, roughly $1 a month. Email and SMS scale: Resend's free tier (100 emails a day, one verified domain) will not cover 20 tenants or per-tenant sender domains, and SMS is charged per message, more for Israeli numbers. Gemini enrichment is a one-time cost per imported chart. Nava starts with email and SMS off, so nothing needs buying for Nava.

## 6. Nava Tehila specifics

**Who's who** (navatehila.org is Hebrew-only; their English catalogue is on Sefaria Voices):

- Rabbi Ruth Gan Kagan: founder, rabbi and CEO.
- Rabbi Nava B. Meirsdorf: the "Rabbi Nava" in the brief. She coordinates Jewish Peoplehood and overseas trips. She is not a composer, and none of the charts are hers.
- Dov Wieder: leads the music (the volunteer Levites band and touring group).
- Daphna Rosenberg (co-created the library with Rabbi Ruth) and Yoel Sykes: the main composers.

**The charts** live in one public Google Drive folder as 554 PDFs in 186 song folders. Each song usually has three: a transliterated chords chart, sheet music, and a Hebrew chord chart.

**Copyright:** "all rights reserved", no license stated; they call the material free for prayer use. Hosting it in Nava's own tenant is fine; CRC or other tenants using it needs their permission.

**The diff** against CRC's 140-chart `nava` collection (matched by title and composer, since no row stores a source address): 3 new (Pitchu Li Sha'arei Tsedek; Kol Haneshama by Daphna; Anan Va'arafel, still empty), 10 changed plus 1 to check (Ehyeh Asher Ehyeh), 0 gone. Full table in work/D-nava-tehila-research-and-rescrape.md.

**Intake route:** PDF upload or import from Drive. The URL scraper makes up charts from their files: on Pitchu Li it returned a wrong key, chords, artist and an invented verse, because it cannot read the PDF behind a Drive viewer page.

## 7. Decisions

### Claude's defaults (logged, no action needed unless Daniel objects)

- Fix the self-role security hole first and immediately.
- No Edge Config or any other new paid service.
- Charts and setlists openable by link stay that way, as a per-tenant setting defaulting on.
- Signing in at another tenant's address creates a pending request.
- View-as is read-only, as Daniel.
- Platform tools on a separate platform MCP server.
- Mixer CRC-only behind its flag.
- Shared charts are live references.
- CRC setlists keep working if an owner unshares.
- notify_band and scheduling stay off for Nava; they share setlist links.
- Legal pages run by the platform, with the tenant named.
- The Lecha Dodi duplicate and BL's access to the Nava collection are deferred to library cleanup.

### Needs Daniel

1. **Platform domain:** buy a neutral domain (money; nameservers move to Vercel), or subdomains under centralreform.live for now.
2. **Nava chart rights:** a written OK from Rabbi Ruth, and whether CRC keeps using the collection.
3. **Email sender:** shared sender with the tenant's display name (free), or per-tenant verified domains (paid).
4. **Credit line:** whether "a project of Rabbi Daniel Bogard" appears on other tenants' pages (src/components/Footer.tsx:12).
5. **People:** David Lazaroff as BL tenant admin? Which tenants do the other current admin accounts belong to (they lose sight of every tenant)?
6. **The nava collection moving to Nava's ownership:** CRC loses edit rights on those 140 charts. CRC users will see this.
7. **Hebrew scope:** setlist editing in Hebrew on day one, or only viewing and Perform? Who checks the Hebrew wording?
8. **The 10 changed Nava charts:** replace in place (keeps setlist links) or add as new versions? Which PDF (chords, sheet music or Hebrew chart) is "the chart" for a Hebrew-first band?
