# A. Tenant data model, config out of code, and migration

Analyst A, 2026-10-12. Read against MISSION-2026-10-12.md. Repo: sheet-music-app on master. Line numbers are as of today.

## 1. What defines a tenant today

All of this is code; a new tenant today means editing these files and redeploying.

**Identity and host routing**
- src/lib/org/registry.ts:8 DEFAULT_ORG_ID "crc"; :15-26 the ORGS table (id, name, domain); :47 coerceOrgId sends any unknown id to crc; :58 congregationDocId (crc keeps bare `congregation`, others `congregation__{id}`); :70 resolveOrgIdByDomain.
- src/proxy.ts:163-164 resolves host to org at the Edge with no database, sets `x-org-id`. Unknown hosts become crc.

**Browser branding**
- src/lib/org/branding.ts:78-120 BRANDING table (names, meta, theme colour, logo, wordmark, manifest, baseUrl; :95 CRC reads NEXT_PUBLIC_BASE_URL).
- src/app/globals.css:208, :227 BL colour tokens; :274 BL heading font; :677 `bl-hero` (image at :216). CRC is the `:root` default.
- src/app/layout.tsx:126 loads the Zilla Slab font only when org is brotherslazaroff; :116 `<html lang="en">` is fixed (no `dir`).
- src/app/login/page.tsx:31 `if (orgId === "brotherslazaroff")` hero branch; :102-106 the default branch reads `getServerCongregationConfig()` with NO org argument and falls back to "Central Reform Congregation", "St. Louis, MO", /logo.jpg. A new tenant would see CRC's login today.
- public/manifest.json, public/manifest-brotherslazaroff.json; public/brands/brotherslazaroff/{hero.jpg, wordmark.png}; public/logo.jpg (CRC).
- src/app/opengraph-image.tsx:5, :122 CRC only. src/app/robots.ts:3 and src/app/sitemap.ts:3 hardcode centralreform.live.
- "CRC Music" also hardcoded in src/app/(v2)/layout.tsx:12, PublicSetlistSkeleton.tsx:25, unauthorized/page.tsx:4.
- src/components/Footer.tsx:12 "A project of Daniel Bogard" on every tenant.

**Vocabulary**
- src/lib/org/vocab.ts:189 hidesLiturgicalFields is `orgId === "brotherslazaroff"`; :213 BASE strings (CRC); :238 BL overrides.

**Constants and defaults**
- src/lib/constants.ts:13 BASE_URL, :19 DEFAULT_SHORT_NAME "CRC Music".
- src/lib/congregation-store.ts:54-69 DEFAULT_CONFIG (CRC name, St. Louis, /logo.jpg, #7c3aed, print footer). The client merges the tenant's config doc over this, so missing fields show CRC values.
- src/lib/mcp/tools/congregation.ts:49-55 a second copy of the same CRC defaults.
- Firestore `config/congregation` (CRC) and `config/congregation__brotherslazaroff`: services, stream, scheduling, printFooter, defaultMusicians.
- Firestore `templates/{key}` (CRC) and `templates/{org}__{key}`: src/lib/template-firebase.ts:30 keyFor, :38 selectOrgOverrides. The client reads the whole collection and filters in the browser.

**Time zone: America/Chicago, live code (comments omitted)**
- src/lib/parse-event-date.ts:54 `const TZ` (feeds every naive date written by MCP and the app: setlist-write.ts, clone-setlist.ts, templates.ts, setlist-write tool).
- src/lib/performance/tonight.ts:87; src/lib/today/build-today.ts:55; src/lib/reader-music.ts:88; src/lib/mcp/tools/service-sheet.ts:83.
- src/app/api/scheduling/calendar-feed/[token]/route.ts:72 `X-WR-TIMEZONE`.
- MCP tool descriptions say times are Chicago: src/lib/mcp/tools/index.ts:1338, :1477, congregation-services.ts:125, setlist-write.ts:386.
- Cron: vercel.json bridge-watch at `0 14 * * *`, `0 19 * * 5`, `30 21 * * 5` are Chicago times written in UTC (documented src/app/api/cron/bridge-watch/route.ts:49-54). `scheduling-reminder` at `0 10 * * *` is 5 am Chicago. scripts/ops/monitor-live-probe.mjs:223 service-window guard.
- src/lib/liturgical-calendar.ts:169 asks Hebcal for the Diaspora parasha schedule; Nava needs Israel's.

**Email, SMS, calendar, print**
- src/lib/org/branding.ts:148 EMAIL_BRANDING; src/lib/email.ts:36-41 sender (BL has its own env var, falls back to the shared noreply@centralreform.live); email.ts:395, :403, :477, :485 still hardcode "CRC Music" in two templates; :112 bridge email subject.
- src/lib/email-scheduling.ts:29 sender, :92-93 "Central Reform Congregation" body text, :137 footer, :145 from-name. Scheduling email is fully CRC.
- SMS: src/app/api/setlist/notify-band/route.ts:289 and src/lib/mcp/tools/setlist-publish.ts:1064 "CRC Music: ..." prefix; :252/:1000/:1058 origin falls back to centralreform.live.
- Calendar feed route.ts:68 PRODID, :71 calendar name "CRC Music - ...", :96 UID @centralreform.live, :102 LOCATION.
- Chart footer: src/lib/chart-render/house-chart-html.ts:178 defaults "Central Reform Congregation" / "centralreform.live".
- Print cover: src/lib/print-pipeline.ts:1020 default footer, :1022-1025 reads the per-org config doc (already tenant-aware).
- Gig packet: src/lib/mcp/tools/library-download.ts:357 PDF subject "CRC Music Books gig packet".

**Legal pages**: src/app/(main)/{privacy,terms,sms-consent,accessibility}/page.tsx name Central Reform Congregation and music@centralreform.live throughout.

**Library tabs and collections**
- src/components/library/SongChartsLibrary.tsx:495-500 "CRC Charts", "Shireinu" and "Nava Tehilah" tabs shown only when org is crc.
- src/lib/songs/picker-scope.ts:31-45 same labels and the crc default chip.
- Fixed collection list `core | supplemental | nava | uploads` in src/lib/library-upload.ts:59, src/lib/mcp/tools/index.ts:793 (and three more enums there), review-queue.ts:61; menus in UploadDialog.tsx:318 and ScraperModal.tsx:442.
- src/lib/library/ai-enrichment.ts:297 Gemini prompt says "Central Reform Congregation music library".

**Books and liturgy**: src/lib/books/registry.ts:24-37 and src/data/books/registry.json, src/lib/liturgy/lookup.ts:89-97, src/data/templates/*. Global, not tenant-scoped, CRC books mixed with shared ones (shabbat-maariv, shirei-tshuvah). src/lib/liturgical-templates.ts:97, :99 slots limited to CRC rabbi keys `daniel_karen` and `randy`. ServiceType union src/lib/liturgical-calendar.ts:46.

**MCP agent guide**: .paul/AGENT-GUIDE.md loaded once for every connection by src/lib/mcp/build-handler.ts:48. It names Daniel, CRC books and "CRC does not use publish" (:106). The BL connector is served the same guide today.

**Other**: src/lib/users-firebase.ts:53 new users get `['crc','brotherslazaroff']`; src/components/admin/UserRow.tsx:54 a crc / bl / both menu; src/lib/performed/history-client.ts:54 and src/lib/reader-music-public.ts:12 pinned to crc; CORS defaults in src/app/api/library/file/[id]/route.ts:32 and drive/file allow only centralreform.live.

## 2. Proposed tenant config

One Firestore doc per tenant at `orgs/{orgId}` (the collection already exists, public-read, server-write; rules at firestore.rules:261). orgId is lowercase letters, digits and hyphens, immutable, and doubles as the default subdomain. Keep the existing `config/congregation[__id]` doc for the operational settings it already holds (services, stream, scheduling, defaultMusicians); do not move them.

Fields (R = required at creation; defaults in brackets):

- `id`, `name`, `shortName` (R); `status` active | suspended [active].
- `domains`: `primary` (R, e.g. "nava.<platform domain>"; CRC "centralreform.live", BL "brotherslazaroff.live"), `aliases` [].
- `branding`: appName, metaTitleDefault, metaTitleTemplate, metaDescription, ogTitle, tagline, themeColor, logoUrl, wordmarkUrl, heroImageUrl, location [""]; `loginVariant` congregation | hero [congregation]; `forceDark` [false]; `colors` {light, dark} token maps [empty = app defaults]; `fontDisplay`, `fontBody` as keys into a fixed font menu in code [poppins]. Fonts must be a menu because next/font is fixed at build time; include two or three Hebrew faces.
- `vocabulary`: `mode` shul | band (R; band replaces hidesLiturgicalFields); `overrides` map of VocabKey strings.
- `locale`: `language` en | he [en]; `direction` ltr | rtl [from language]; `timeZone` IANA (R); `calendar` diaspora | israel [diaspora].
- `email`: fromName (R), fromAddress [shared platform sender], replyTo, headerBg, headerImagePath, headerImageHeightPx, footerText, smsPrefix [shortName].
- `print`: footer, chartFooterLeft, chartFooterRight, packetSubject.
- `legal`: operatorName, contactEmail; `useCrcText` [false; true for CRC].
- `features`: mixer, driveInbox, schedulingEmails, todayFeed, notifyBand, perform, mcp [all false except perform and mcp].
- `library`: `collections` [{id, label}] in tab order; `defaultCollection`.
- `liturgy`: `books` (visible slugs), `defaultBookByService`, `serviceTypes` [{key, label, defaultStart}].
- `agentGuide`: text appended to a shared core guide [none]; `createdAt`, `updatedAt`, `createdBy`.

**Loading.** One server function `getOrgConfig(orgId)` (Admin SDK), held in memory for 60 seconds and in Next's tagged cache so the console clears it on save. The root layout passes it to the client through the existing OrgProvider, so the browser never reads it from Firestore.

**Host to tenant at the Edge.** The proxy cannot read Firestore cheaply. A `{slug}.{platform domain}` host needs no lookup (slug = orgId). Custom domains use a host-to-orgId map from a public endpoint built off `orgs`, held in Edge memory for 60 seconds. CRC and BL hosts stay hardcoded in the proxy so they never depend on the lookup. Works with centralreform.live or a neutral platform domain.

**Missing doc.** For crc and BL the code tables remain the fallback, so a missing doc renders exactly today's output. Any other unknown or suspended host gets a plain "no such site" page, never CRC (today coerceOrgId would show a typo subdomain CRC's login).

**Mapping CRC and BL.** The seed script imports the current constants rather than retyping them: BRANDING, EMAIL_BRANDING, vocab BASE and BL OVERRIDES, DEFAULT_CONFIG.printFooter, and the literals in email-scheduling.ts, the calendar feed, house-chart-html.ts and library-download.ts. CRC `colors` stays empty (CRC is `:root`). BL keeps its globals.css block, marked `legacyCssTheme: "brotherslazaroff"`; generated colour CSS is for new tenants only, so both stay byte-identical. CRC baseUrl still reads NEXT_PUBLIC_BASE_URL first.

## 3. Gaps in tenant tagging

- **Recordings.** Upload now stamps orgId (src/app/api/recordings/upload/route.ts:112) and the client query filters on it. Gap: firestore.rules:235 lets any member read every recording. Fix: read requires `orgReadOk`. Also stamp any old untagged recordings "crc". Reversible (rules change; the stamp is an added field).
- **finalize_chart_upload.** Already stamps the caller's org (library-upload-session.ts:576, index.ts:3313). Remaining: `org` is optional, so a caller that omits it leaves the chart unstamped (read as crc). Fix: make it required. Reversible.
- **scheduling_history.** Nothing in src writes it now. The history route (src/app/api/scheduling/history/route.ts:23) takes the latest 50, then filters by tenant, so other tenants' rows eat the limit; it does the same with the last 500 scheduling_assignments. Fix: query with `where('orgId','==',org)` and add indexes; stamp old rows "crc". Reversible.
- **setlistTemplates.** MCP filters by orgId (templates.ts:219) but firestore.rules:307 checks role only. Fix: add org checks matching contacts (rules:251). Reversible.
- **templates (liturgical overrides).** Rule :295 lets any signed-in user read all; the client downloads every tenant's templates. Fix: rule checks that the id prefix before `__` is one of the caller's orgs (bare id means crc), and the client queries only its own id range. Reversible.
- **Storage.** storage.rules lets any member read all of `library/`, with no tenant check. Fix: write `orgId` into each object's custom metadata (additive, reversible) and check it in the rule, with shared collections served through the existing server routes. Coordinate with the shared-collections lane.
- **"Missing orgId means crc"** (rules and about 25 code paths): leave it; once CRC rows are stamped it is inert.
- **isAdmin()** in rules is platform-wide (roles lane), which also blocks real isolation.

## 4. Migration plan (CRC and BL unchanged)

1. Fresh Firestore export (beside the nightly /api/cron/backup), with one test restore into a scratch project. Required before steps 5-6.
2. Write `orgs/crc` and `orgs/brotherslazaroff` full docs from the code constants. Additive. Rollback: delete the fields.
3. Add `getOrgConfig` with code tables as the fallback, behind an env switch (code | firestore). Add golden-output tests per tenant: head metadata, manifest, login HTML, both email templates, scheduling email, ICS feed, print cover, packet PDF metadata, chart footer, library tab labels, MCP instructions. Rollback: flip the switch.
4. Replace hardcodes one surface at a time (section 1 list), each passing its golden test for CRC and BL. Time zone: date helpers take the tenant zone; MCP text says "the tenant's local time" and get_congregation_context returns the zone. Crons stay single entries that loop over flagged tenants; scheduling-reminder runs hourly and sends at each tenant's local 05:00 (CRC's time today). bridge-watch stays CRC-only. Rollback: revert.
5. Stamp `orgId: "crc"` on every untagged row in songs, library_index, recordings, setlists, setlistTemplates, scheduling_*, contacts. Write a manifest of every doc id changed. Rollback: remove the field from exactly those ids. Reversible, backup first.
6. Storage metadata stamp, same manifest pattern. Reversible.
7. Tighten Firestore and Storage rules (section 3). Run the BL probe and the emulator rule tests first. Rollback: redeploy the previous rules file.
8. Turn off the hardcoded BRANDING / vocab / EMAIL tables only after the firestore switch has run in production with no diff. Keep the CRC/BL host map in the proxy permanently.

No step deletes or overwrites a value, so all are reversible. CRC/BL-visible changes: none in steps 1-8 if the golden tests hold. Visible but separate: new sign-ups joining one tenant only (already ruled), and the fate of CRC's "Nava Tehilah" tab.

## 5. Cost shape at about 20 tenants

Assumptions: tenants are bands or small congregations of 5-40 active users, one or two services a week, libraries of 500-3,000 charts at about 1 MB each, Nava-like tenants with mixer, Drive inbox and SMS off.

- **Vercel**: one Pro project, as now. Usage grows with users, not tenant count. Crons stay at today's 16 entries if each loops over tenants. Custom domains and certificates cost nothing extra; a wildcard subdomain needs the platform domain's DNS on Vercel. Likely within Pro's included usage.
- **Firestore**: config reads are cached, so small. The risk is code that reads a platform-wide slice and filters in memory (templates, scheduling history and assignments, suggest-band); that cost multiplies with every tenant's data. Fixed in step 4, reads grow with users. A new device's first library sync is one read per chart. Rough total: low tens of dollars a month. The current CRC + BL Firebase bill is the baseline.
- **Storage**: about 40 GB at 20 tenants, around $1 a month; downloads mostly pass through Vercel routes.
- **Money to flag**: if the account is on Resend's free tier (100 emails a day, one verified domain), it will not cover 20 tenants' scheduling and notify emails, nor per-tenant sender domains. SMS for notify_band is charged per message, and Israeli numbers cost more. Gemini enrichment runs on every imported chart, so a Nava seed import is a one-time cost of N calls. Nava starts with none of the email or SMS features on, so nothing needs buying for Nava itself.
