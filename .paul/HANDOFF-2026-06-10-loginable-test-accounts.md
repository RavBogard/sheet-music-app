# PAUL Handoff

**Date:** 2026-06-10
**Status:** paused — clean (loginable-test-accounts phase COMPLETE; committed + pushed)

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** CRC Music (sheet-music-app) — multi-tenant (CRC + Brothers Lazaroff). Next.js + Firebase (`crcmusiccharts`); the git repo is the `sheet-music-app/` subdirectory; `.paul/` is inside it. Production branch is `master`; push `origin master` (NOT `master:main`). Multi-computer box — `git pull` before the next session.
**Core value:** The band gets the right charts + recordings on their iPads each week; Daniel authors setlists conversationally via Claude + MCP (the browser app is the band/consumer surface only).

---

## Current State

**Version:** `11.2.0` (`package.json`, tag `v11.2.0`). No package bump for this phase (standalone tooling, no milestone).
**Phase:** standalone **loginable-test-accounts** — ✅ COMPLETE (2/2 plans, both LOOP COMPLETE). No PAUL milestone active.
**Git:** `master` tip `1eca4b4b6a` (this phase's commit), pushed to `origin/master`, Vercel auto-deploy triggered. Working tree clean (only pre-existing untracked stress-test research/docs remain — not part of this phase).

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [both plans complete]
```

---

## What Was Done (this session — all shipped to `master` in `1eca4b4b6a`)

Built the standalone **loginable-test-accounts** phase off the stress-test report's INCOMPLETE item 3 (`.paul/research/TOOLING-BRIEF-test-account-login.md`): `create_test_account` minted `disabled:true`, so browser persona testing was impossible.

- **Plan 01** — `create_test_account({ loginable: true })` mints an ENABLED account (NO password) and returns a one-time `loginUrl` built on the existing QR custom-token mechanism: a pre-approved, single-use, high-entropy `qr-sessions` doc consumed by a new headless `/test-login?code=…` route (`signInWithCustomToken` → `syncSessionCookie` → redirect). `loginable` flag stamped on `users/{uid}` + `mcpTestUsers/{uid}`; `qr-sessions` added to the revoke/cleanup cascade. Default (no-flag) path byte-identical (`disabled:!loginable`).
- **Plan 02** — browser-session TTL enforcement: hourly `GET /api/cron/disable-expired-test-accounts` (disable + `revokeRefreshTokens` via exported `disableExpiredLoginableAccounts`) + `/api/auth/session` POST rejection for expired loginable accounts (isTestUid-gated, no normal-user cost). Audit confirmed data-gating verifiers (`server-auth.ts:39`, `drive-file-auth.ts:45`) already use `verifySessionCookie(cookie, true)` — no change. Exposure bounded to ~2h.

**Key decisions (Daniel, 2026-06-10), baked into the plans:**
1. **Login path** = one-time custom-token URL via the QR mechanism, NOT a static secret. VERIFY-FIRST confirmed the QR PUT-approval path mints a custom token for the *approver's own uid* and needs a second already-signed-in device → hard-coupled to physical-device handoff. So we reuse ONLY the `qr-sessions` store + the `GET /api/auth/qr` consume endpoint and add `/test-login`; public `/login` + `/qr/[code]` untouched.
2. **TTL** = cron disable + `revokeRefreshTokens` (kill outstanding ID tokens within ≤1h) + session-mint check + checkRevoked confirmation. Rationale: client Firestore reads authorize via the Firebase ID token, not the app session cookie — so disable+revoke is the only real cutoff; a session-mint-only block would leave Firestore readable past TTL.

**Scope note:** the brief's "generated strong password, returned once" was SUPERSEDED by decision 1 (the custom-token URL is the credential; no password, no Email/Password provider). AC-1 became "open the one-time login URL."

**Gates (green every loop):** `tsc --noEmit` clean · emulator `mcp-test-tokens` 34/34 (28 prior + 6 new) · `SKIP_ENV_VALIDATION=1 next build` clean with `/test-login` + `/api/cron/disable-expired-test-accounts` registered. /ui-ux-pro-max invoked for the `/test-login` UI.

---

## What's In Progress

Nothing. Working tree clean, no active loop.

---

## What's Next

**No blocking PAUL work.** Pick one when you resume:
1. **`/paul:discuss-milestone`** (or `/paul:milestone`) — scope the next milestone (Daniel's call; MCP-first authoring completeness + band/consumer-surface polish are the standing guides).
2. **The stress-test browser run** this tooling was built to unblock can now proceed (mint a `loginable:true` account → open `loginUrl` → real Web SDK auth).
3. **Resume v7.1 `.coord/` hardening** — cycle-13 (`.coord/cycle-13-CHARTER.md`), independent of the PAUL loop.

**UAT-PENDING for THIS phase (live/safe, test-namespaced):** in `.paul/UAT-PENDING.md` — (a) browser persona sign-in end-to-end via a minted `loginUrl`; re-open the same link → fails (single-use); (b) AC-2 session-mint rejection on an expired account; (c) admin+loginable refused.

**Still-open earlier UAT (unchanged, not from this phase):** v11.2 BL-connector reconnect → BUG-1 (create→propose→commit) + BUG-9 (`preview_publish` BL roster size) live retests; v11.1 broslaz authed-surface checklist. Both live/safe; independent of this phase.

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state (read first) |
| `.paul/phases/loginable-test-accounts/` | This phase's 01/02 PLAN + SUMMARY |
| `.paul/research/TOOLING-BRIEF-test-account-login.md` | The phase's source-of-record |
| `src/lib/mcp/tools/test-tokens.ts` | `create_test_account` + `loginable` + `disableExpiredLoginableAccounts` |
| `src/app/test-login/` | Headless QR-custom-token consume route |
| `src/app/api/cron/disable-expired-test-accounts/route.ts` | Hourly TTL cutoff cron |
| `src/app/api/auth/session/route.ts` | Session-mint rejection for expired loginable |
| `.paul/UAT-PENDING.md` | Deployed-surface checks to run |

---

## Resume Instructions

1. `git pull` first (multi-computer box).
2. Read `.paul/STATE.md` for latest position.
3. Run `/paul:resume` (or go straight to `/paul:discuss-milestone`).
4. Push `origin master` (NOT `master:main`).

---
*Handoff created: 2026-06-10 (loginable-test-accounts phase pause)*
