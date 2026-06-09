# PAUL Handoff

**Date:** 2026-06-09 (session 5 — v11.0 MILESTONE COMPLETE + released)
**Status:** paused (clean — milestone fully closed, tree clean, in sync with origin/master, tag pushed)

---

## READ THIS FIRST

You have no prior context. This document + STATE.md tell you everything.

**Project:** sheet-music-app (centralreform.live) — band charts/recordings on iPads; setlists authored via Claude + MCP. Now MULTI-TENANT (2nd live tenant: Brothers Lazaroff on brotherslazaroff.live).
**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.

---

## Current State

**App version:** `package.json` **11.0.0** · git tag **`v11.0.0`** (pushed) · origin/master tip **`02a6bcb27c`**.
**Milestone v11.0 Brothers Lazaroff Multi-Tenant — ✅ COMPLETE 2026-06-09 (6/6 phases + v11-02b, 23 plans).**

```
PLAN ──▶ APPLY ──▶ UNIFY        [v11.0 — all phases complete; milestone archived]
  ✓        ✓        ✓
```

**No active PAUL phase/plan.** Awaiting the next milestone. v7.1 Production Hardening continues separately via the bongo `.coord/` system (cycle-13 in flight) — independent of the PAUL loop.

---

## What Was Done (this session)

1. `/paul:resume` → reconciled state (v11-05 was SHIPPED; milestone at 5/6). Archived the session-4 handoff.
2. **Planned + executed + unified all 3 slices of v11-06 (cross-tenant isolation security audit — the close gate):**
   - **v11-06-01** (`99d625c492`) rules-layer: scoped `leadHistory` (closed the v11-05-04 deferral); adversarial Firestore-rules isolation across the v11-05 collections; **hardened** `scheduling_assignments`/`scheduling_history` reads (`orgReadOk`) + **fixed** deny-by-default per-org congregation branding read (guarded `/config/{doc}` wildcard); rules deployed. Also fixed 3 pre-existing stale emulator tests (verified pre-existing via `git stash`).
   - **v11-06-02** (`666a4b60d5`) MCP escape + host-spoof: `verifyBearer` proven bearer-authoritative (ignores forged `x-org-id`); CI-locked invariant that no MCP tool accepts a caller-suppliable org selector. Test-only, no escape found.
   - **v11-06-03** (`5e16e28a98`+`2a8441d6e5`) live close-gate: NEW `scripts/mint-throwaway-bl-bearer.mjs` (claim-free) + extended `scripts/e2e-bl-tenant-probe.mjs` to the v11-05 collections; **live prod probe 19/19** (BL-isolated + CRC-intact); `AUDIT.md` **verdict GO**.
3. **Phase transition + `/paul:complete-milestone`:** pushed the phase, Vercel deployed, re-probed 19/19; MILESTONES.md § v11.0 entry + `.paul/milestones/v11.0-ROADMAP.md` snapshot + PROJECT.md evolved + ROADMAP collapsed.
4. **Release:** Daniel chose bump+tag → `package.json` 10.1.0 → **11.0.0** (`0a3cca1f4d`) + annotated tag **`v11.0.0`** created and **pushed** to origin.

Quality floor held throughout: tsc 0 · full emulator **941/941** · non-emulator **3323/0** · firestore.rules + Vercel deployed · live probe 19/19.

---

## What's In Progress

Nothing. v11.0 is closed and released; tree clean; everything pushed.

---

## What's Next

**Immediate:** Nothing required. When ready for new PAUL work → **`/paul:discuss-milestone`** (scope the next milestone). Otherwise v7.1 hardening continues via `.coord/` (run a coder/supervisor/auditor role there, unrelated to the PAUL loop).

**Standing UAT-PENDING (non-blocking):** David Lazaroff's hands-on UX confirmation on `brotherslazaroff.live` (sign in → author via MCP → view/print). Server-side + live MCP isolation is already proven (probe 19/19); this is the human-experience pass.

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live state — milestone complete, no active phase |
| `.paul/MILESTONES.md` § v11.0 | Permanent milestone record |
| `.paul/milestones/v11.0-ROADMAP.md` | Archived ROADMAP snapshot at close |
| `.paul/phases/v11-06-isolation-audit/AUDIT.md` | Close-gate sign-off (verdict GO, live 19/19, residual register) |
| `scripts/e2e-bl-tenant-probe.mjs` | Reusable BL/CRC live isolation probe (DAVID_BEARER + CRC_BEARER) |
| `scripts/mint-throwaway-bl-bearer.mjs` | Claim-free throwaway BL bearer for probes (`--apply` / `--revoke <id>`) |

---

## Reusable gotchas (carry forward)

- **`issue-bl-bearer.mjs --apply` OVERWRITES David's `orgIds` claim to `['brotherslazaroff']`** — would drop his `crc` membership. For probe bearers use `mint-throwaway-bl-bearer.mjs` (claim-free) instead.
- Prod-script admin auth on this box: firebase-CLI refresh-token → temp `authorized_user` ADC (firebase-tools public OAuth client) → `GOOGLE_APPLICATION_CREDENTIALS`; delete the temp file after.
- CRC bearer for probes: `CRC_BEARER=$(node scripts/supervisor-prod-bearer.mjs)`. MCP endpoint: `https://www.centralreform.live/api/mcp` (hit www directly; apex 307 drops auth header).
- Three accepted v11-06 residuals (low-risk, defense-in-depth) in AUDIT.md: setlistTemplates app-only; scheduling_history orgId-absent rows; users claim-based (no orgId field).
- `git pull` first next session (multi-computer); push `origin master` (NOT `master:main`).

---

## Resume Instructions

1. `git pull` (multi-computer).
2. Read `.paul/STATE.md` (milestone complete; no active phase).
3. `/paul:discuss-milestone` to start the next milestone — or work v7.1 via `.coord/`.

---
*Handoff created: 2026-06-09 (session 5 — v11.0 complete + released)*
