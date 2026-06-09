# Phase v11-04 — BL consumer surface + onboarding — CONTEXT

**Created:** 2026-06-08 (via /paul:discuss)
**Status:** Ready for /paul:plan
**Milestone:** v11.0 Brothers Lazaroff Multi-Tenant (now 6 phases after the split)

---

## Why this phase

This is the phase where David actually *uses* the app: he authors a setlist via
MCP, then he and the band open it on brotherslazaroff.live, perform from it, and
print a gig packet. v11-04 makes the **public/consumer web surfaces** tenant-correct
and band-appropriate, and seeds David so he can self-serve end-to-end.

**The split (Daniel 2026-06-08):** the cross-tenant *collection* scoping
(templates/roster/congregation/service-personnel R+W) + the CreationWizard vocab
moved OUT to the new **v11-05**, so v11-04 ships the BL consumer surface first.
Isolation audit renumbered to **v11-06**.

---

## LIVE FINDINGS — discovered during discuss (2026-06-08, prod probe + Daniel screenshot)

Daniel reported "brotherslazaroff.live is still showing CRC's site." Live probe of
`www.brotherslazaroff.live/perform` confirmed `data-org="brotherslazaroff"` routing
+ navy dark chrome ARE correct, BUT the public consumer surface leaks CRC content.
**Four concrete defects, all live in prod, all are v11-04 scope:**

1. **[CRITICAL — cross-tenant web read] `getAllSetlists()` is not org-scoped.**
   `src/lib/server-setlists.ts:113` — every `.collection("setlists")` query
   (lines ~47/77/139/157/208) lacks a `.where("orgId","==",org)` filter. `/perform`
   (`src/app/perform/page.tsx` → `getAllSetlists()`) returns ALL tenants' setlists,
   so CRC's real setlists (Parashat Sh'lach, Shir Shabbat, Camp Sabra, B'nei Mitzvah
   of Gavin Stein…) render on brotherslazaroff.live. The MCP layer closed this in
   v11-02; the **public web path never got org-scoping.** Mirror the v11-02 read
   pattern: source org from the request (`headers()` `x-org-id` → `coerceOrgId`) and
   thread it into `getAllSetlists(org)` + the setlist DETAIL route
   (`/perform/setlist/[id]` — needs a cross-tenant not-found wall like MCP
   `get_setlist`) + gig-packet print + any other `server-setlists` consumers.
   NOTE: setlists are public BY DESIGN ([[feedback_setlist_public_policy]]), so this
   is a tenant-CORRECTNESS + cross-tenant-wall break (constraint 4), not a secrecy
   breach. With BL's empty library, scoped `/perform` → correct empty state.

2. **[branding] `PublicSetlistListing` hardcodes "CRC Music".**
   `src/components/performance/PublicSetlistListing.tsx:133` `<h1>CRC Music</h1>` +
   "Public setlists" + line 179 "Sign in to CRC Music". Make org-aware via
   `useOrg()` + `getOrgBranding(org).shortName` ("Brothers Lazaroff").

3. **[metadata] Root layout metadata hardcoded to CRC.**
   `src/app/layout.tsx:32` static `export const metadata` → `<title>` /
   description / openGraph / twitter / appleWebApp.title / metadataBase all say
   "Central Reform Congregation — Music" (David's browser tab reads CRC). Convert to
   `generateMetadata()` (async; reads `headers()` `x-org-id` → `coerceOrgId` →
   `getOrgBranding`). Also: per-org `metadataBase` (brotherslazaroff.live) and
   per-org **manifest** (`/manifest.json` PWA name still "CRC Music" → dynamic
   `manifest.ts` or per-org). `src/app/perform/page.tsx:11` static title "Upcoming
   Services & Setlists" — de-synagogue for BL ("Services" → band vocab via `label()`).

4. **[OPS — Daniel, not code] Apex `brotherslazaroff.live` still on Squarespace.**
   Bare apex serves `Server: Squarespace` / `<title>Coming Soon</title>`; only
   `www.` is on Vercel. Apex A-record never pointed at Vercel. Daniel action: add
   apex domain in Vercel + point Squarespace A `@` → `76.76.21.21` (mirror
   `docs/brotherslazaroff-domain-setup.md`), so typing the domain w/o www reaches
   the app. (v11-03 handoff's "apex redirects to www" claim was WRONG — live probe
   overrides it.)

---

## Goals (Daniel's taste calls, 2026-06-08)

1. **Perform-view structure:** KEEP section headers / setlist structure ("David might
   still want section headers, etc."). Do NOT strip the perform-view's sectioning for
   BL — only the synagogue *vocab* ("Services"/liturgical labels) de-synagogues via
   the static `label(org,key)` helper (already shipped in v11-03-03). No
   collection-scoping dependency for perform/card vocab.
2. **Gig-packet print:** SAME chart print as CRC. No new layout — just tenant-scoped
   data + de-synagogued labels.
3. **David's starting state:** EMPTY library seed. He imports everything via MCP; no
   starter songs/templates seeded. (His first `/perform` open shows the empty state —
   which is the correct proof the org-scoping works.)

---

## Scope (for /paul:plan)

- **P1 — org-scope the public web read paths** (the live fix): `getAllSetlists` +
  `/perform` + `/perform/setlist/[id]` detail (cross-tenant not-found wall) +
  gig-packet print + audit all `server-setlists` callers. Server org source =
  `headers()` `x-org-id` → `coerceOrgId` (mirror MCP `orgFrom`).
- **P1 — org-aware consumer branding/metadata:** `PublicSetlistListing` wordmark +
  root-layout `generateMetadata()` + per-org metadataBase/manifest + perform-page
  title vocab.
- **David onboarding:** confirm his `brotherslazaroff` membership + empty-library
  state; e2e UAT (David authors via MCP → opens/prints on brotherslazaroff.live).
- **OUT of scope (→ v11-05):** templates/roster/congregation/service-personnel R+W
  scoping + CreationWizard de-synagogue vocab (depend on congregation/templates
  scoping). **OUT (→ v11-06):** isolation security audit.

## Approach / constraints

- Mirror the v11-02 MCP read-scoping pattern (in-memory/where filter to callerOrg;
  default `crc`; cross-tenant → standard not-found, no leaky code). Server components
  read org from the `x-org-id` header `proxy.ts` already sets.
- **/ui-ux-pro-max BLOCKING** (UI phase).
- Quality floor (v11.0 autonomy directive): tsc clean + tests green + AC proof every
  task; **deployed-surface probe required** (no local dev; CRC-default masks BL
  misresolution — this whole finding proves it). Re-probe brotherslazaroff.live AND
  centralreform.live after deploy (BL scoped+branded; CRC byte-identical).
- Autonomy: auto plan→apply→unify, auto-commit per phase, push origin master.

## Open questions (resolve in /paul:plan, bake in — don't gate)

- Per-org manifest: dynamic `app/manifest.ts` (reads org) vs static per-domain? (lean
  dynamic.)
- `getPersonalSetlists`/`getAllPublicSetlists` aliases (server-setlists.ts:242-243) —
  confirm all call sites get the org thread.

---

## Key files

| File | Role |
|------|------|
| `src/lib/server-setlists.ts` | `getAllSetlists` (+aliases) — **add orgId scoping** |
| `src/app/perform/page.tsx` | public landing — thread org; de-synagogue title |
| `src/app/perform/setlist/[id]/…` | detail — cross-tenant not-found wall |
| `src/components/performance/PublicSetlistListing.tsx` | "CRC Music" wordmark → org-aware |
| `src/app/layout.tsx` | static metadata → `generateMetadata()` (org-aware) |
| `src/lib/org/branding.ts` | `getOrgBranding` (shortName/tagline/forceDark) — ready |
| `src/lib/org/registry.ts` | `coerceOrgId` (header→org) |
| `src/lib/org/vocab.ts` | `label(org,key)` for de-synagogued titles |
| `docs/brotherslazaroff-domain-setup.md` | apex DNS ops (Daniel) |
| `scripts/e2e-bl-tenant-probe.mjs` | reuse for UAT |
