# PAUL Handoff

**Date:** 2026-06-09 (session 8)
**Status:** paused — milestone idle (v11.1 closed); this session shipped two post-close broslaz fixes

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** centralreform.live — multi-tenant digital sheet-music + setlist app. CRC (synagogue) + Brothers Lazaroff (band) tenants.
**Core value:** The band gets the right charts + recordings on their iPads each week; Daniel authors setlists conversationally via Claude + MCP. Now MULTI-TENANT.

---

## Current State

**Version:** 11.1.0 (tag `v11.1.0`)
**Phase:** None active — v11.1 milestone COMPLETE + archived.
**Plan:** None. Loop idle.

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○        (idle — ready for /paul:discuss-milestone or /paul:milestone)
```

**Git:** on `master`, pushed to `origin master`. Tip `10c04099e1` (broslaz branding v11.1-05). Push `origin master` (NOT master:main).

---

## What Was Done (session 8)

1. **Diagnosed "BrosLaz setlist not displaying" (TWO reports).** NOT a display bug. Both setlists were genuinely stored `orgId: "crc"` (verified in prod Firestore). Root cause: Daniel's account was `orgIds: ["crc"]` only — NOT a broslaz member. MCP **pins org into the bearer at MINT time** (`src/app/api/mcp/oauth/token/route.ts:107-109` → `resolveMintOrg` → `createMcpToken` bakes orgId onto the `mcpTokens` doc; `verifyBearer` reads that baked value per request — it is NOT re-resolved from the live claim). So a crc-pinned bearer always lands crc; the broslaz UI correctly hid them (cross-tenant wall working).

2. **Fixed the `/manage` People-list invisibility bug.** Daniel wasn't listed (he thought it was the SUPER_ADMIN hardcode — it wasn't). Real cause: his user doc (seeded 2026-01-27, pre-convention) lacked a `createdAt` field, and `subscribeToAllUsers` queries `orderBy("createdAt","desc")` — Firestore silently drops docs missing the orderBy field. Confirmed he was the ONLY one of 20 users missing it. **Fix applied:** backfilled `createdAt` onto his user doc (set to his createTime) via Firestore MCP. He now appears.

3. **Daniel self-granted broslaz membership** via the `/manage` People tri-state toggle. VERIFIED (read-only) his Auth claim + user doc are now `orgIds: ["crc","brotherslazaroff"]` (lockstep, written 21:25:33Z).

4. **Deleted 2 test setlists** (`6794e894…`, `387631f3…`) + their 10 tracks via Firestore MCP (Daniel: `delete-both`).

5. **Shipped v11.1-05 — authentic Brothers Lazaroff branding** (commit `10c04099e1`, pushed). Designed via `/ui-ux-pro-max`, grounded in real assets from brotherslazaroff.com:
   - Real white-and-blue Western-slab **wordmark** in nav (desktop+mobile) + login title (new `OrgBranding.wordmarkUrl`; replaces the "BL" monogram+text).
   - **Teal/cyan palette** (was generic navy): canvas oklch(0.16 .028 198) ≈ their `#002020` bg, accent oklch(0.72 .115 210) ≈ their `#43B7CE`. All `[data-org="brotherslazaroff"]` tokens + bl-hero gradient + manifest themeColor (`#04201f`) retuned.
   - **Live hero photo** (Joe's Cafe) under the login bl-hero gradient (`--bl-hero-image`).
   - **Zilla Slab** vintage-slab headings for broslaz (preload-free; variable applied only on the broslaz `<body>` so CRC never loads it).
   - Assets: `public/brands/brotherslazaroff/{wordmark.png, hero.jpg}`.
   - CRC byte-identical (all scoped under `[data-org]` / flags `""` for CRC). tsc clean · branding+vocab tests 12/12 · `next build` clean.

---

## What's In Progress / Outstanding

- **ACTION ON DANIEL (carries the original issue to closure):** reconnect Claude Desktop's Brothers Lazaroff MCP connector to `https://www.brotherslazaroff.live/api/mcp` (www direct; apex 308-redirects + drops auth header). His membership is correct now, but his existing bearer is still crc-pinned from before the grant — only a fresh mint reads `x-org-id: brotherslazaroff` and bakes the right org. Until he reconnects, new authoring still lands crc.
- **Optional branding polish (offered, not done):** (a) BL PWA app icon — `icon-192/512.png` is still the shared/generic icon; manifest colors are BL but the icon image isn't. (b) Desktop active-nav glow uses a hardcoded indigo `oklch(… 275)` that bleeds through on broslaz; swap to `--brand`.

---

## What's Next

**Immediate:** Confirm the v11.1-05 branding looks right on the live brotherslazaroff.live (Vercel auto-deploy of `10c04099e1`) and that Daniel's reconnect makes authoring land broslaz.

**After that:** Either polish (`icon`/`glow` above) or open the next milestone — `/paul:discuss-milestone` / `/paul:milestone`. Backlog still pending: recordings-collection org-scoping (+ upload orgId stamp), SERVICE_TYPE_LABELS vocab table, v7.0 fold-forward re-triage. v7.1 hardening continues independently via `.coord/`.

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state |
| `.paul/ROADMAP.md` | Phase overview |
| `src/lib/org/branding.ts` | Per-tenant brand config (added `wordmarkUrl`) |
| `src/app/globals.css` | `[data-org="brotherslazaroff"]` teal tokens + bl-hero + slab heading rule |
| `src/app/api/mcp/oauth/token/route.ts` | Where MCP bearer org is pinned at mint (the "lands crc" mechanism) |
| `src/lib/org/membership-server.ts` | `resolveMintOrg` (no-escalation: host org IF member, else primary) |

---

## Resume Instructions

1. Read `.paul/STATE.md` for latest position.
2. Loop is idle (v11.1 closed) — no plan to resume.
3. If Daniel reports branding/authoring feedback, act on it directly. Otherwise `/paul:discuss-milestone`.

---

*Handoff created: 2026-06-09 (session 8)*
