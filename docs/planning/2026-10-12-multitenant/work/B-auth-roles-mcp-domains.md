# B — Identity, per-tenant roles, rules, MCP binding, domains

Analyst B, 2026-10-12. Read-only survey of master. Paths relative to sheet-music-app/.

## 1. How it works today

- **One global role.** Claim `role` (admin / band_leader / musician / member), mirrored at `users/{uid}.role`. Rules read the claim: `isAdmin()` firestore.rules:17–23 (claim, or uid in `config/admins`, a document read), `isBandLeader()` :25, `isMusician()` :88, `isMember()` :93. MCP tools read the user document instead (`readUserRole`, src/lib/mcp/server-tracks-write.ts:113, 17 files).
- **A list of tenants.** Claim `orgIds`; missing means `['crc']` (src/lib/org/membership.ts; rules `callerOrgs()` :36–43), mirrored to `users/{uid}.orgIds`. A person has the same role in every tenant they belong to.
- **Admins skip every tenant check**: `orgCreateOk` :46, `orgUpdateOk` :53, `callerCanWriteExistingOrg` :63, `songOrgReadOk` :75, `orgReadOk` :81, `canLeadSetlist` :463 all begin `isAdmin() ||`. Unstamped documents count as CRC; writes with no `orgId` are allowed.
- **No tenant check at all** on: setlist create (any signed-in user, even pending, :166); setlist update/delete (:172–177); `users` read by any band leader (:105); `templates` (:295); `setlistTemplates` (:307); `recordings` read (:235); `songUsage` (:517); `musician_availability` (:541); `live_sessions`; `tasks`; setlist `history` create (:445); and the single global `config/featured`, `config/defaults`, `config/monitor`, `monitor-live/*`.
- **Escalation hole (fix first, independent of this project).** :106 lets a user write any field of their own user document, including `role`. `/api/auth/sync-claims` copies a non-pending document role into the auth claim, and every client calls it in drift repair (src/lib/drift-repair.ts:84). A pending account can write `role:'admin'` from the browser console, call sync-claims, and become admin; MCP tools would treat it as admin at once. Confirm in the emulator, then restrict self-writes to profile fields.
- **Storage.** storage.rules:9–17: any member of any tenant reads `library/**` (paths `library/{fileId}.ext`, no tenant). The browser never reads Storage directly; bytes go through `/api/library/file/[id]`, public by file id by design (`requireAuth:false`, :172). The comment that Storage rules cannot read Firestore (storage.rules:4) is out of date.
- **Sign-up.** The browser writes the new user document with `role:'pending'`, `orgIds:['crc','brotherslazaroff']` (src/lib/users-firebase.ts:53). No claim is set, so rules treat the person as CRC-only, and sync-claims later copies the claim back so the document reverts to `['crc']`. The "join both" default only half works.
- **Admin control.** src/components/admin/UserRow.tsx:53–73, three-way select hardcoded to two tenants, calling src/app/api/admin/set-role/route.ts.
- **Scripts.** scripts/migrations/2026-06-09/backfill-user-orgids.mjs (stamps `users.orgIds` from claims); scripts/migrations/2026-06-09/fix-david-orgids-claim.mjs (David to both); scripts/issue-bl-bearer.mjs (mints a BL token and overwrites David's claim to BL only; retire it); scripts/mint-throwaway-bl-bearer.mjs (probe token on David's real uid, claims untouched).

## 2. Per-tenant role model

**Membership record** `memberships/{tenantId}__{uid}`: `{uid, tenantId, role: admin|band_leader|musician|member|pending, soundEngineer, addedBy, addedAt}`. Top-level so a tenant admin lists their tenant in one query. Single source of truth; `users/{uid}` keeps only profile fields.

**Platform owner.** Server-only `platform/owners {uids:[Daniel]}` plus claim `po:true`. Only the platform owner skips tenant checks; a tenant admin is admin only in their tenant.

**Claims.** One server function rebuilds claims from membership records on every change: `{po?:true, m:{crc:"bl", brotherslazaroff:"ad"}, se?:["crc"]}` with two-letter role codes. About 20 bytes per tenant: 20 tenants is about 400 bytes, under the 1000-byte limit, and real people hold one to three. So rules read claims and never pay for a document read. During transition the function also keeps writing the old `role`/`orgIds` claims so current rules keep working. Removal: also revoke refresh tokens; for the up-to-one-hour token lifetime, server routes and MCP read the membership record, not the claim.

**Sign-up joins only the tenant you came through.** The browser stops writing role or tenant data. After sign-in it calls `/api/auth/join`, which takes the tenant from `x-org-id` (set by src/proxy.ts:161, which overwrites anything the client sends) and creates a `pending` membership there only. The tenant admin approves. A CRC member signing in on Nava's address gets a pending Nava request and nothing else. The app's role comes from the host tenant's membership.

**Mapping existing users (reversible).** For each user, for each tenant in their `orgIds` claim (missing = crc), create a membership with their current role. Daniel gets `po`. David becomes `crc: band_leader`, `brotherslazaroff: band_leader` (BL admin is Daniel's call). Other current admins keep admin only in the tenants their orgIds list. The migration only adds records and claims; rollback deletes them.

**Rules sketch.**

```
function po() { return request.auth != null && request.auth.token.get('po', false) == true; }
function code(t) { return request.auth != null ? request.auth.token.get('m', {}).get(t, '') : ''; }
function rank(c) { return c == 'ad' ? 4 : c == 'bl' ? 3 : c == 'mu' ? 2 : c == 'me' ? 1 : 0; }
function atLeast(t, c) { return po() || rank(code(t)) >= rank(c); }
function docOrg() { return resource.data.orgId; }
function newOrg() { return request.resource.data.orgId; }

match /users/{uid} {
  allow read: if request.auth.uid == uid || po();
  allow create: if request.auth.uid == uid
    && !request.resource.data.keys().hasAny(['role','orgIds']);
  allow update: if request.auth.uid == uid && request.resource.data.diff(resource.data)
    .affectedKeys().hasOnly(['displayName','photoURL','lastLoginAt']);
}
match /memberships/{id} {
  allow read: if resource.data.uid == request.auth.uid || atLeast(resource.data.tenantId, 'bl');
  allow write: if false;
}
match /setlists/{id} {
  allow get: if true;                        // public Perform link, unchanged
  allow list: if atLeast(docOrg(), 'me');
  allow create: if atLeast(newOrg(), 'bl') && request.resource.data.ownerId == request.auth.uid;
  allow update: if atLeast(docOrg(), 'bl') && newOrg() == docOrg();
  allow delete: if atLeast(docOrg(), 'bl');
}
// same shape for tracks, songs, recordings, templates, setlistTemplates, contacts
match /tenantConfig/{t} { allow read: if true; allow write: if atLeast(t, 'ad'); }
```

Band-leader roster reads move to a server route. Shared collections: allow a song read when its collection is in a short `sc` claim list, or via `exists()` on a share record. Storage: stamp `orgId` into each object's custom metadata (no file moves) and require `atLeast(resource.metadata.orgId,'me')`.

Precondition: every tenant-owned document carries `orgId` before deploy. List rules are not filters, so unstamped CRC documents would vanish from queries. Stamping is reversible.

## 3. MCP

**Today.** `mcpTokens.orgId` is returned by `verifyBearer` (src/lib/mcp/auth.ts:155) and read by tools via `orgFrom` (src/lib/mcp/org-context.ts). Minting (src/app/api/mcp/tokens/route.ts:39–41; src/app/api/mcp/oauth/token/route.ts, host tenant from `x-org-id`) goes through `resolveMintOrg` (src/lib/org/membership-server.ts), which silently falls back to the user's first tenant when they are not in the host's. A CRC-only user connecting through Nava's address gets a CRC token. The authorize step does not record its host (src/app/api/mcp/oauth/authorize/route.ts:94).

**Changes.** Store the host's tenant in the authorization code; mint for that tenant only; refuse clearly when the user has no approved membership there (platform owner exempt). One helper reading the token tenant's membership replaces `readUserRole`.

**Platform-owner tools: recommend a separate platform surface**, like the ops surface in src/lib/mcp/build-handler.ts: `/api/platform/mcp`, accepting only `platform`-kind tokens minted for a platform owner. Tools (list_tenants, create_tenant, set_feature_flag, add_custom_domain, domain_status, grant_membership, share_collection) take a required `tenant` argument with no default. Authoring stays on per-tenant connectors with their current URLs; Daniel adds any tenant's connector by connecting through its address. This avoids a tenant argument on about 100 authoring tools, prevents wrong-tenant writes, and costs Daniel one extra connector, not twenty.

**Per-tenant agent guide.** `.paul/AGENT-GUIDE.md` is read once at startup (build-handler.ts:45–60) and served to every tenant; the BL connector today describes Daniel's Shabbat services. Instead: verify the token, then pass the request to a cached per-tenant handler whose instructions are assembled from tenant config (name, authors, service types, vocabulary, time zone, language, and only enabled features). Dispatch by the token's tenant, not the host, so existing connectors keep working (the probe calls www.centralreform.live with a BL token). Disabled features' tools drop off that tenant's list.

**Mixer gate.** src/lib/mcp/tools/monitor.ts, src/lib/mcp/server-monitor.ts, monitor-observability.ts and bridge-health.ts never call `orgFrom`; there is one global `config/monitor`. A BL sound engineer or bus holder can move CRC's X32. Gate: (1) `mixer` flag on for the token's tenant; (2) bridge config carries `orgId` and must match; (3) role and sound-engineer checks read that tenant's membership. In rules, mixer command creation requires `atLeast(bridge tenant,'mu')` instead of global `isMember()` (firestore.rules:603).

## 4. Domains and sign-in

**Today.** Host to tenant is a code table (src/lib/org/registry.ts:15, :70) used by src/proxy.ts:161. Each host must be added to Firebase authorized domains (scripts/add-auth-domains.mjs) or Google sign-in does nothing. docs/brotherslazaroff-domain-setup.md is a manual walkthrough.

**Subdomain by default.** `<slug>.<platform domain>`. A Vercel wildcard domain requires the domain's nameservers to be Vercel's. Without a neutral domain, `<slug>.centralreform.live` works the same; the host lookup should allow several hosts per tenant so a neutral domain can be added later.

**Firebase Auth has no wildcard authorized domains.** Each subdomain must be added. Fully automatable: the Identity Toolkit call the script already makes (`PATCH .../admin/v2/projects/{project}/config?updateMask=authorizedDomains`), run server-side at tenant creation. It replaces the whole list, so additions must be serialized, and the service account's permission must be confirmed once. Keep the default auth domain with popup sign-in; per-tenant auth domains would need manual Google OAuth redirect-URI edits, which have no API.

**Edge lookup.** The proxy cannot use the Admin SDK. Subdomains resolve from the host's first label, checked against a list; custom domains need a lookup the console writes (Vercel Edge Config or a cached JSON). Check Edge Config limits against the plan first. CRC and BL stay in the compiled fallback.

**Custom-domain add-on.** Automated from the console: add to the Vercel project (`POST /v10/projects/{id}/domains`, apex redirect set in the same call); fetch required records and status (`GET /v6/domains/{name}/config`, `POST .../verify`); add hosts to Firebase authorized domains; write the host lookup; certificates follow automatically; show "waiting for DNS / verified / live". Not automatable: the DNS change at the tenant's registrar; the console shows the exact records. Needs a Vercel API token as a server secret.

**www versus bare.** The bare domain 307-redirects to www, and clients drop the Authorization header on that redirect (scripts/migrations/2026-05-19/cycle-7-fixes-3-prod-audit.mjs:21). Vercel redirects before the app runs, so no per-path exemption. The console must give the canonical host as the connector URL, and OAuth metadata must name it. Subdomains avoid this. Session cookies stay host-only.

## 5. Adversarial test plan

**Emulator rules suite.** `@firebase/rules-unit-testing` is installed (package.json:99) with an emulator script (:15); add Storage. Personas: platform owner; A-admin, A-band leader, A-musician, A-member, A-pending; B-band leader; dual (A band leader + B admin); signed out; old-claims-only. Each must fail:

- A-member: get or list B's setlists, tracks, songs, recordings, templates, setlistTemplates, contacts, assignments, history, availability, live sessions, bond flags, stages, overrides; read B's chart object in Storage; read any `mcpTokens`, `mcpOAuthCodes`, or B's `memberships`.
- A-band leader: create a setlist stamped B or unstamped; restamp an A setlist to B; update or delete B's setlist, track, template, contact; write overrides on a B setlist; enqueue a command to B's bridge.
- A-admin: create or change a B membership; set own `po`; write B's tenant config or `platform/owners`.
- Anyone: write `role`, `orgIds`, `m`, `po` into own user document; create own membership.
- Dual: B admin rights give nothing extra in A.
- Signed out: list anything; read Storage. Must still work: get one setlist or track by id; `/api/library/file/[id]`.

**Live probe.** scripts/dev/e2e-bl-tenant-probe.mjs (under scripts/dev/) drives only MCP, which uses the Admin SDK and so never tests rules. Generalise to `e2e-tenant-probe.mjs`: read tenants from the registry; create a throwaway test user and token per tenant (generalise mint-throwaway-bl-bearer.mjs to take a tenant, stop borrowing David's account); for every ordered pair, create in A and confirm invisible to B, and confirm B cannot get, update or delete A's setlist by id, with no overlap in templates, musicians, contacts or congregation context; connect through each tenant's canonical host, including an A user refused at B's host; then sign the test users in with the browser SDK and repeat core reads and writes against deployed rules and Storage. Clean up and revoke. 20 tenants is 380 ordered pairs, minutes of run time.

## Decisions only Daniel can make

1. David in BL: band leader as today, or BL tenant admin.
2. Other current admin accounts: confirm their tenants, since they lose "see every tenant".
3. An existing member signing in through another tenant's address: automatic pending request (proposed) or invitation only.
4. Subdomain parent: a neutral domain (nameservers moved to Vercel) or `<slug>.centralreform.live` for now.
5. Whether chart bytes and setlists stay readable by anyone holding the id, for every tenant, or become a per-tenant setting.
6. Any spend on Vercel Edge Config or plan changes for the host lookup.
