# Phase v11-03 — Domain + branding · CONTEXT

> Discussion handoff for `/paul:plan v11-03`. Created 2026-06-08 via `/paul:discuss-phase`.
> Captures Daniel's product/design calls (the sanctioned product-ambiguity stop in the v11.0 autonomy directive). Routing is technical (no ambiguity); branding + vocab are Daniel-decided below.

## Phase summary

Make `brotherslazaroff.live` serve the shared deployment as a fully BL-branded, band-vocabulary instance — host-resolved to the `brotherslazaroff` tenant — while leaving CRC 100% unchanged. Three strands: **routing**, **branding**, **vocab/UI trim**. `/ui-ux-pro-max` is BLOCKING (UI phase).

DNS/domain plumbing is handled separately by `docs/brotherslazaroff-domain-setup.md` (Vercel domain add + Squarespace A/CNAME). This phase is the in-app routing + look + copy.

## Goals (confirmed with Daniel 2026-06-08)

1. **Host→tenant routing.** A request to `brotherslazaroff.live` (apex or `www`) is resolved to org `brotherslazaroff` server-side and that org drives theme + labels for the whole response. CRC and `localhost`/`*.vercel.app` keep resolving to `crc`.
2. **Brothers Lazaroff branding — dark + photographic.** Band chrome, not synagogue. Anchored on BL's REAL brand (see Brand source below), rendered on the app's dark canvas. CRC's indigo+amber + Righteous/Poppins is untouched.
3. **Vocab + UI trim — per-tenant conditional.** BL sees band vocab (gig / venue / set) and synagogue-only fields (rabbi, service-type, sanctuary) are hidden for BL. **CRC copy and fields are 100% unchanged** — org-driven label map + conditional rendering, never a global rename.

## Daniel's decisions (the taste calls)

| Decision | Choice | Notes |
|---|---|---|
| **Visual direction** | **Dark + photographic** | Near-black canvas, full-bleed live-band photography, bold display headline, BL accent color. Gritty live-music feel. |
| **Brand assets** | **Pull from their existing site** | Source palette/logo/photos from `brotherslazaroff.com` (it's David's own band — assets are his to use). |
| **Vocab/UI trim** | **Per-tenant conditional** | `label(org, key)` resolver + feature flags; CRC path unchanged. Safest for CRC. |

## Brand source — brotherslazaroff.com (scraped 2026-06-08)

- **Real brand identity:** white/light background, **navy/dark-blue** primary, wordmark "Brothers Lazaroff" in **white + blue with a light shadow**, clean sans-serif headings, live-performance + community photography (band on stage, Hanukkah Hullabaloo, farmers-market sets). Modern, energetic, professional.
- **Band facts (for copy/about):** St. Louis–based; folk/rock/blues with subtle jazz; led by **brothers David & Jeff Lazaroff**; a 6-to-15-piece ensemble + songwriting/production team; a dozen+ albums/EPs/live recordings. Events: LazJazz Fest, Hanukkah Hullabaloo, Bros 4 Joes.
- **⚠️ Light→dark nuance for /ui-ux-pro-max:** their *site* is light/white + navy; Daniel wants the *app chrome* dark+photographic. Resolution: keep **navy-blue as the BL accent** and use **their live-performance photography as hero imagery**, but on the app's dark canvas (consistent with Perform mode + iPad legibility). The /ui-ux-pro-max pass should honor the navy + photographic DNA, not invent a new palette.

## Approach notes

- **Routing:** wire `resolveOrgIdByDomain(host)` (already in `src/lib/org/registry.ts`, already maps `brotherslazaroff.live`→`brotherslazaroff` and strips `www.`) into **`src/proxy.ts`** (Next 16 proxy — this repo has no `middleware.ts`). Resolve per-request, stamp the org, and make it available to the client for theming + labels (header/cookie/server-context — pick during plan). Preserve `localhost`/`*.vercel.app`→`crc`.
- **Branding:** org-driven theme tokens (canvas/accent/display-font) selected by resolved org; BL = dark canvas + navy accent + their photography; CRC = current indigo+amber. `/ui-ux-pro-max` drives the actual visual design (BLOCKING). Decide photo hosting (likely `public/brands/brotherslazaroff/` or Storage) + the precise navy hex (extract from their CSS during build).
- **Vocab:** an org-aware `label(org, key)` resolver (default = current CRC strings so CRC is literally unchanged; BL overrides → gig/venue/set/…) + conditional rendering to hide rabbi field + service-type selector for BL. No edits to CRC literal copy.
- **CRC-unchanged guard:** regression check that `crc` resolution yields the exact current theme + labels + fields (snapshot or explicit assertions).

## Open questions (resolve during /paul:plan or build)

1. **Exact BL accent hex** — extract the precise navy from brotherslazaroff.com CSS during the build step.
2. **Photography** — which live shots to use, and where to host them (repo `public/` vs Firebase Storage). David can supply hi-res if the scraped ones are too low-res.
3. **Full vocab term list** — lock the BL mapping. Draft to confirm: service→**gig** (or set), sanctuary/venue→**venue**, setlist→**set** (or keep "setlist"?), "Led by" (rabbi)→hide or →**bandleader**, service-type selector→hidden for BL. Confirm the full key list during plan.
4. **Org→theme propagation mechanism** — server context vs cookie vs response header; pick the cleanest seam for `src/proxy.ts` → client theme/labels during plan.

## Constraints / quality floor (from v11.0 autonomy directive)

- `/ui-ux-pro-max` BLOCKING on this UI phase.
- E/Q every task: `tsc` clean + tests green + AC proof. (Note: local `next build` fails on `/api/cron/aggregate-corrections` for missing Vercel-injected `CRON_SECRET` — rely on the Vercel build as the build gate.)
- **CRC must be provably unchanged** (theme + vocab + fields) — this is the cross-tenant-safety equivalent for a UI phase.
- Autonomous: auto-proceed, auto-commit per phase, push `origin master`. Stop only for further product ambiguity / unresolvable failure / CRC regression.
