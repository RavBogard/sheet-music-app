# RETURN — Multi-tenant phase 1 (tenant config out of code), 2026-10-12

Executor: Claude Code (Opus 5.5), with four Opus lanes in separate worktrees. Branch `claude/multitenant-2026-10-12`, merged to `master`.
Shipped: `fde7bbe8` (phase 1 merge) and `a7478212` (BL login line fix), both on `master`.

Production deploys:
- `dpl_7BvensZAPpb2cvRcqFmxqe14FBwF`: switch on `code`.
- `dpl_8YHGjwU7sWB4fnKsY6iQKZd8Hj3o`: switch on `code`, with the login fix.
- `dpl_94FjaobaRYtrApA8z78gK9KVbgzd`: switch on `firestore`. This is the current production deploy, aliased on both CRC and BL hosts.

## Gate

**PASS.** With `ORG_CONFIG_SOURCE=firestore` in production, every golden HTTP surface for CRC and BL matches the before-capture. The capture covers:
- 10 pages per tenant: head, body text and images;
- robots and sitemap;
- the linked icons and OG/twitter binaries, by sha256;
- the manifest;
- the MCP `instructions` as served.

The only differences were next/font class hashes, renamed by the uncached rebuild; see decision 2.

With a tenant document missing or invalid, crc and BL render from the code tables. This is proved in the emulator (`src/lib/org/__tests__/get-org-config.emulator.test.ts`: missing document, legacy v11 shape and unknown org). It was not proved by deleting a production document.

- Before: `docs/planning/2026-10-12-multitenant/golden/http-before/`.
- After, on the firestore switch: `golden/http-after-p1/`.
- Diff command: `node scripts/dev/golden-http-capture.mjs --diff <before> <after>` reports `all surfaces identical`.

## Checklist

| Item | Result |
|---|---|
| Golden outputs captured before any change | PASS. HTTP surfaces as above. Surfaces that can't be fetched over HTTP have unit goldens written and run against the unchanged code first: both task emails, the scheduling email (pending/confirmed/cancelled), SMS (scheduling, reminder, cancellation, publish text), the calendar feed, the print footer, the gig-packet subject, the house chart footer, library tab labels, the Gemini prompt, rabbi slots, service types and books, root layout, login, legal pages, page titles, congregation defaults, constants, CORS, time zone, crons, Hebcal and the tenant reads. Every lane committed its goldens in a separate commit before changing code, and none was re-recorded afterwards. The one exception is the BL login snapshot, covered in decision 1. |
| One zod schema for `orgs/{orgId}` | PASS. `src/lib/org/config-schema.ts`. Added this phase: `liturgy.rabbiSlots` (with a `match` word list) and string keys `seo.baseUrl` and `library.coreSectionLabel`. |
| `getOrgConfig`: 60 s memory + tagged cache + `code \| firestore` switch + code fallback; root layout hands config to `OrgProvider` | PASS. `src/lib/org/get-org-config.ts`, tag `org-config:<id>`. `ORG_CONFIG_SOURCE` is declared in `src/env.mjs` and `.env.example`. |
| Seed script imports the code constants; dry run diffs; idempotent; CRC colors empty, BL `legacyCssTheme` | PASS. `scripts/ops/multitenant/seed-org-configs.ts`. In production, 26 field additions (13 per tenant) were written; no existing field changed. The undo manifest is at `manifests/seed-org-configs-2026-10-12T17-59-49-595Z.json`. A second dry run reports 0 changes. |
| Hardcoded values replaced surface by surface | PASS. The hardcoded values on every listed surface were replaced; see the lane notes below. The OG image file keeps its literals (decision 3). The CORS default list is unchanged (decision 6). |
| Time zone per tenant; MCP descriptions say "the tenant's local time"; `get_congregation_context` returns the zone | PASS. Helper: `src/lib/org/locale.ts`. Six MCP description strings were changed (lane 4's list, quoted below). `America/Chicago` remains only in the CRC/BL config values, the fallback constant, comments, `bridge-watch` (CRC-only, as the brief says) and `monitor-live-probe.mjs` (CRC-only mixer). |
| Crons | PASS. `scheduling-reminder` now runs hourly (`0 * * * *`) and sends to each tenant at its local reminder hour. CRC and BL keep 10:00 UTC; a test checks every hour from 0 to 23, plus a Jerusalem tenant's summer and winter hours. `emit-today` loops over the registry. `bridge-watch` is unchanged. Vercel Pro already allowed sub-hourly crons, so there is no plan change. |
| Hebcal per tenant | PASS. `locale.calendar` is used. Tested on Shabbat 30 May 2026: Diaspora reads Nasso, Israel reads Beha'alotcha. |
| Reads that loaded every tenant's data and filtered in memory | PASS. `src/lib/org/tenant-query.ts`. crc's query is unchanged, so untagged rows still count as crc until phase 2 stamps them. Other tenants query `where orgId ==`. Templates: crc keeps the whole-collection listener; other tenants listen only to their own id range. Five indexes were deployed and confirmed READY before the code shipped. |
| Ship on `code`, flip to `firestore`, confirm goldens | PASS. Production env `ORG_CONFIG_SOURCE=firestore` was created through the Vercel API, then production was redeployed. |

## Test tails

Gate runs at `ba5ca38c`, the full phase before the one-line login fix:

- `npx vitest run`: Test Files **452 passed** | 3 skipped (455); Tests **5268 passed** | 31 skipped (5299).
- `npm run test:emulator`: Test Files **98 passed** (98); Tests **1365 passed** (1365).
- `npx tsc --noEmit`: exit 0.
- `rm -rf .next && SKIP_ENV_VALIDATION=1 npx next build --webpack`: exit 0. `/robots.txt` and `/sitemap.xml` are now `ƒ` (dynamic).
- `login-bundle` test against that build: 1 passed.

Runs at `a7478212`, after the login fix:
- `login-page.golden.test.tsx`: 7/7 passed.
- `tsc`: exit 0.

## Commits

| Commit | What it is |
|---|---|
| `78cc61c9`, `e0ad18b4`, `efd1796a` | Foundation: schema, string catalogue, code configs, loader, goldens, seed script |
| `6c57b264` → `426c3b17` | Lane 1 (goldens → change): emails, SMS, calendar feed, print footer, gig packet, chart footer |
| `8789d0e9` | Lane 2: layout lang/dir/fonts, login, robots/sitemap, titles, legal, congregation defaults, constants, CORS helper |
| `73e6a085` → `d4d04a43` | Lane 3: library tabs and collections, Gemini prompt, rabbi slots, service types and books |
| `18b7297b` → `b5ca2bba` | Lane 4: time zone, MCP wording, crons, Hebcal, tenant reads, indexes |
| `915e0fd7` | `ORG_CONFIG_SOURCE` declared in the env schema (`env-coverage` failed without it) |
| `7fbf3061` | Calendar feed loads its tenant's config before reading strings |
| `ba5ca38c` | Merge fix: duplicate `useOrg` from lanes 3 and 4 |
| `a7478212` | BL login line kept byte-identical (decision 1) |

Merge commits: `f1044817`, `8ff3a36f`, `ebbc8048`, `19c17b9c`, `fde7bbe8`.

MCP wording, before → after:
- `get_congregation_context` description: "America/Chicago wall clock" → "wall clock in the tenant's local time". It also now says it returns `timeZone`.
- `index.ts` (×3), `congregation-services.ts:125` and `setlist-write.ts:386`: "America/Chicago" → "the tenant's local time".

## Decisions

1. **The BL login line keeps a missing space.** Production rendered "Brothers Lazaroff· St. Louis, MO", with no space before the dot, even though the JSX had one and a unit render shows it. The first deploy's HTTP diff caught the config version adding the space. It now renders the production bytes, the unit golden asserts that, and a comment says why. GATE: BL output byte-identical — proceeded because the gate requires matching production bytes, not the dev render.
2. **next/font hashes are masked in the HTTP goldens.** Forcing a production redeploy without the build cache renamed `__variable_xxxxxx`. The font set is unchanged: CRC has 3 variables before and after, BL has 4. The `code` deploy built from the same source had identical hashes. The capture and diff now mask these names.
3. **The OG image file is not converted.** Next puts a hash of this file's contents into every page's `og:image` URL, so editing the file changes CRC and BL HTML. The catalogue already reproduces its strings (`og.*`); it can switch over when a phase is allowed to change that URL.
4. **robots.txt and sitemap.xml render per request.** The bytes are identical; they are no longer static.
5. **What BL already had is kept frozen.**
   - Rabbi slots `daniel_karen` and `randy`.
   - All 14 service types and all 8 books.
   - "CRC Charts" and the CRC badge.
   - CRC's legal text, footers, feed identity and AI prompt (the `BL_FROZEN_CRC_KEYS` list).
   - Empty `books` means every book, which is today's behaviour. Which books a new tenant gets is open for phase 8.
6. **The CORS default list is unchanged.** A BL origin still gets `https://centralreform.live` back. Helpers to list each tenant's origins exist for phase 3.
7. **Platform legal pages for other tenants** live in `src/components/legal/PlatformLegal.tsx`. A tenant with no `legal.contactEmail` falls back to music@centralreform.live. Neither CRC nor BL sees these pages. The wording is for phase 8 to confirm with Nava.
8. **BL scheduling history and suggest-band now read BL's own latest N rows.** Previously they read only the BL rows inside the global latest window. The goldens are identical because today's data fits that window; this is a correction, not a change in what BL sees today.

## Carried forward (not phase 1 failures)

- **A third tenant needs priming at server entry points.** Server code reads the primed config cache synchronously, falling back to code. Pages, `get_congregation_context`, the crons and the calendar feed load the config first. The MCP request path (`verifyBearer`), email senders and other API routes do not, so a Firestore-only tenant would get crc values there. Phase 2 adds the load where it resolves the org.
- **`coerceOrgId` only knows crc and BL**, so a third tenant's host resolves to crc. The registry/host lookup moves to config in phase 3, where addresses are handled.
- **Pre-existing, logged:**
  - The reminder cron formats its date with no time zone, so on Vercel the email shows the UTC day.
  - The feed and SMS links use `BASE_URL` (centralreform.live) for every tenant.
  - No index exists for crc's history filtered by `musicianUid` and sorted by `recordedAt`.
- **BL sees CRC wording on many surfaces.** That stays exactly as it is, frozen. The list is for Daniel at the end: task and scheduling emails, SMS, calendar feed identity, print footer, chart footer, legal pages, the "CRC Charts" label and badge, the AI prompt, CRC's agent guide in the MCP instructions, and the OG image.

## Needs Daniel

Nothing for phase 1.
