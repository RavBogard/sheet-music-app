# RETURN — Multi-tenant phase 3 (addresses), 2026-10-12

Executor: Claude Code (Opus 5.5), with two Opus lanes: host resolution and address provisioning. Branch `claude/multitenant-2026-10-12`, merged to `master`.
Shipped: `6e076b33` (Vercel `dpl_B6N4RAoTFLCSK8TmG8oprKuhhJad`).

## Gate

**PASS**, checked in production on 2026-10-12.

| Gate item | Evidence |
|---|---|
| A throwaway tenant is reachable at its vercel.app alias | `tenant-address.ts --throwaway-tenant mtprobe`, then `provision mtprobe crl-mtprobe`, attached `crl-mtprobe.vercel.app` to the existing project and recorded it in `orgs/mtprobe.domains`. About 2 minutes later (address-list cache) `/login` there served 200 with the title "Probe Tenant mtprobe". |
| Google sign-in works there | The host went into Firebase authorized domains under the lock (list 8 → 9, read back). The public project config the browser SDK checks before `signInWithPopup` (`GET identitytoolkit/v1/projects`) listed it. No real Google sign-in was clicked: no browser automation was available in this session. |
| An unknown production host shows "no such site" | I attached a throwaway alias that no tenant owns (`mt-unknown-1791838396.vercel.app`). `/login` and `/` returned **404 "No such site / There is no site at this address."**, with no CRC text. `/api/mcp` and `/.well-known/oauth-protected-resource` returned 404. `/api/cron/*` still reached its own secret check (401). The alias was removed afterwards. |
| CRC and BL hosts behave exactly as before | The golden HTTP capture is identical to the before-capture for both tenants, including CRC's MCP instructions. BL's MCP file wasn't captured this run (no BL bearer); phase 2 confirmed it. The bare hosts still redirect to www. The project's own `sheet-music-app.vercel.app` still serves CRC. |
| MCP through each tenant's connector address keeps its Authorization header | The protected-resource and authorization-server metadata name `https://www.centralreform.live`, `https://www.brotherslazaroff.live` and `https://crl-mtprobe.vercel.app`. The bare `centralreform.live` also names www, so a connector never goes through the bare→www redirect that drops the header. MCP `initialize` returned 200 at www.centralreform.live and at the alias. |
| Cleanup | `--remove-throwaway mtprobe` detached the alias, removed it from authorized domains (back to 8, **identical to the original list**) and deleted the doc. Project domains are back to the original five. |

## Checklist

| Item | Result |
|---|---|
| Default address `<slug>.vercel.app` at tenant creation; nearest free name if taken; stored in `orgs/{id}.domains` | PASS. `src/lib/platform/tenant-address.ts` `provisionDefaultAddress`. If the name is taken it tries `<slug>`, `-music`, `-app`, then `-2` to `-6`. It is idempotent. Exercised live with `crl-mtprobe`. |
| Authorized-domain automation, read-modify-write under a Firestore lock, one at a time, read back | PASS. `src/lib/platform/auth-domains.ts`. The lock is `platform/authDomainsLock` (30 s expiry; waiters wait up to 20 s with backoff). It refuses an empty or failed read. Read-back must show the change plus every prior host. A test with four concurrent adds lost none. Exercised live (add and remove). |
| Edge address list from `orgs`, cached 60 s; proxy checks compiled CRC/BL first; vercel.app via the list | PASS. `src/lib/org/hosts.ts` and `GET /api/org-hosts` (`s-maxage=60`, tag `org-hosts` revalidated after an address change). The proxy order is: compiled CRC/BL, then the project's own Vercel URLs (→ crc), then the list, then preview/localhost (→ crc), then no such site. Suspended or archived tenants are left out of the list. |
| Unknown host never falls back to CRC | PASS in production (above). `coerceOrgId` now accepts any well-formed id, since the proxy is the only setter of `x-org-id`. `isKnownOrg` callers are sorted in lane 1's notes. Third-tenant config is primed at `requireAuth`, `getServerUser`, the MCP bearer path and the cron loops. |
| Custom-domain add-on | PASS (code, unit-tested; not run against a real domain). `addCustomDomain` attaches the bare domain (308 → www) and www, authorizes both, returns the DNS records and plain-language steps (`dnsInstructions`), and records status. `checkCustomDomain` returns `waiting_for_dns`, `verified` or `live`; when live, www becomes primary. Routes for the platform owner only: `/api/platform/tenants/[orgId]/address`, `/domains` and `/domains/[domain]`. Phase 4's console and platform MCP call the same library. |
| www/bare redirect header fix: canonical host as connector address; OAuth metadata per tenant | PASS (above). `MCP_PUBLIC_URL` is read only by the chart drop zone, and the code says it stays unset in production. |
| Session cookies stay host-only | PASS. A test asserts that no cookie sets `Domain=`. |

## Test tails (at `6e076b33`)

- `npx vitest run`: 480 files passed, 1 failed (`ReconciliationProvider` AC-3). It passes 19/19 alone, and this phase didn't touch that file; it's a known load-sensitive test. Tests: 5750 passed.
- `npm run test:emulator`: Test Files **109 passed**; Tests **2037 passed**.
- `npx tsc --noEmit`: exit 0. Clean `next build --webpack`: exit 0. `login-bundle`: 1 passed.

## Commits

- Lane 1 (host resolution): `f59e3912` (goldens first), `3f4b3f36`.
- Lane 2 (provisioning): `96e5c84a`, `3bb57238` (`scripts/ops/multitenant/tenant-address.ts`).
- Lead: `ee3d3bba`, plain host-list import and claims gate exemption for the persona probe.
- Merge to master: `6e076b33`.

## Decisions

1. **The project's own Vercel URLs keep resolving to crc.** That covers `sheet-music-app*.vercel.app`, including deployment URLs. Crons, webhooks and probes may call them, and that is today's behaviour.
2. **Some paths are exempt from no-such-site** because they authenticate with their own secret: `/api/cron/*`, `/api/webhooks/*`, `/api/inngest`, `/api/intake/run`, `/api/bridge/setup-code` and `/api/org-hosts` itself. On an unknown host they resolve to crc. MCP, OAuth and auth routes are not exempt.
3. **The OAuth metadata names the address the client connected to** when that address belongs to the tenant. Otherwise it names the canonical host: the alias for vercel.app, www for custom domains. OAuth clients check the metadata against the address they used.
4. **No-such-site wording:** "No such site" / "There is no site at this address." The ruling sets "a plain no such site page"; nothing more was added.
5. **New addresses take effect within about 2 minutes.** That is up to 60 s of CDN cache plus 60 s of per-instance memo. A third-tenant host sees no-such-site until its instance has loaded the list, never CRC.

## Carried forward

- **The Open Graph and Twitter image alt text is CRC's on every tenant.** It is "Central Reform Congregation — Digital Sheet Music Library", from `opengraph-image.tsx`. Phase 1 left that file untouched because editing it changes the image URL hash on CRC's and BL's pages. It must be per-tenant before Nava goes live (phase 8). Either switch to `generateImageMetadata` or override `openGraph.images` for tenants other than crc/BL. The CRC/BL hash change is then a known, explained golden difference.
- **MCP dispatches by the token's tenant, not the host** (design B §3). A CRC token used at another tenant's address acts as CRC. Per-tenant handlers and instructions are phase 4.
- **The production runtime path for provisioning is not yet exercised.** It needs the Vercel API token (below), and the runtime service account's Identity Toolkit permission is still untested; phase 4's console run will prove it. The gate ran the same library from this machine.
- **Phase 2 step 5** (remove the legacy-claim fallback) is still pending a quiet day.

## Needs Daniel

One credential, no cost: Vercel will not mint an API token from the CLI's token ("Cannot create tokens for this app"). When convenient:
1. At vercel.com → Account Settings → Tokens, create a token scoped to the team that owns `sheet-music-app`, with no expiry or a long one.
2. Add it to the project as `VERCEL_API_TOKEN` (Production, Sensitive).

`VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` are already set. Until then, the console and platform tools can do everything except attach addresses, which I can still do from here with the script.
