# Lane — iPad UAT harness: Web-SDK sign-in + WebKit/iPad Perform-mode coverage

**Wave:** ipad-uat-harness (standalone — "bulletproof for the band on iPads" before onboarding)
**Risk tier:** **2** (touches the client auth / sign-in capability — `signInWithCustomToken` in the browser). Auditor does independent prod-probe + binary verdict.
**Base SHA:** `8ff155982` (verify against `.coord/shared/master-tip.md` before cutting; rebase/cherry-pick per the narrow-lane caveat if origin moved)
**Lane id:** `ipad-uat-harness`
**Branch:** `feat/ipad-uat-harness`
**Worktree:** `sheet-music-app-ipad-uat-harness/`
**Est:** ~3–5 hr

---

## ⚠️ READ THIS FIRST — most of the plumbing already exists. Verify before building.

The supervisor scoped this against **origin/master** (not the canonical checkout, which is on a stale
`fix/b1-error-envelope-sweep` branch — do NOT trust the cwd; `git show origin/master:<path>` or work in
your own worktree cut from `8ff155982`). Confirmed-present on master:

1. **Server returns the customToken.** `src/app/api/auth/test-session/route.ts` already mints a fresh
   `responseCustomToken = await auth.createCustomToken(uid)` and returns it in the success body as
   `customToken` + `customTokenExpiresInSec` (META-003 server half — landed). **Verify this yourself**
   (`git show origin/master:src/app/api/auth/test-session/route.ts | grep -n customToken`). Do NOT
   re-implement the server side.
2. **A Playwright e2e suite exists** at `e2e/`: `helpers/auth.ts` (`mintTestAccount` via MCP
   `create_test_account`, `loginAsTestUser` via `/api/auth/test-session`, `revokeTestAccount`),
   `helpers/seed.ts` (`seedPublishedSetlist`), `perform-flow.spec.ts` (Perform-mode UAT), plus
   `library-review-flow.spec.ts`, `smoke.spec.ts`, `f023-live-rename.spec.ts`.
3. **Prod runs are already a thing.** `playwright.config.ts` supports `PLAYWRIGHT_USE_REMOTE=1` +
   `PLAYWRIGHT_BASE_URL=https://www.centralreform.live`. `perform-flow.spec.ts` is run against prod with
   `MCP_BEARER=crl_live_... --project=chromium` and skips when `MCP_BEARER` is unset.

**The gap (your job):** the harness lands only the **server `__session` cookie** — `loginAsTestUser`
ignores the returned `customToken`, so the browser's Firebase Web SDK `auth.currentUser` is still null,
and Perform mode has **never** been driven through Safari's engine at the band's real iPad viewport.

## Target hardware (Daniel-confirmed 2026-05-20)

The band is deploying **6× standard 11-inch iPads** (Daniel-confirmed: the *standard* iPad — NOT Mini,
NOT Air, NOT Pro). The current standard iPad (10th/11th gen, 10.9–11") has a **portrait CSS viewport of
820×1180**, deviceScaleFactor 2, touch. **Playwright has no exact descriptor for it** — `devices['iPad
(gen 7)']` is the older 810×1080 (10.2") model. So configure the WebKit project with an **explicit
viewport `{ width: 820, height: 1180 }`**: spread a WebKit base (e.g. `devices['iPad Pro 11']` for the
Safari UA / `hasTouch` / `deviceScaleFactor:2`) then **override the viewport to 820×1180**. If you can,
verify the real units' UA/viewport (Settings → Safari, or a quick check) and match actual hardware.
Portrait is the primary orientation (music stand); add a landscape variant if cheap.

## Why this matters

- The band runs Perform mode on **iPads**. The pickup pointer's top unscoped risk: iPad layout claims
  were *source-extrapolations, never measured at the real device width*. Real iOS Safari (WebKit)
  rendering of the PDFOverlay / react-pdf worker is the highest-risk untested surface before onboarding.
- Any client-listener-driven UI (realtime sync, drift banner, anything reading `auth.currentUser`
  client-side) can't be exercised until the Web SDK is actually signed in — that's META-003's open
  *client* half.

## Deliverables

### 1. Close META-003 client-half — populate `auth.currentUser` in the browser
Extend `e2e/helpers/auth.ts` `loginAsTestUser` (or add a sibling `signInWebSdk`) so that, after landing
the cookie, the **browser context** ends up with a real Firebase Web SDK session (`auth.currentUser`
non-null, ID token live). The route already returns `data.customToken`. The client call you need is
exactly what `src/components/auth/QRSignIn.tsx:137` does: `signInWithCustomToken(auth, token)` against
`auth` from `@/lib/firebase`.

**Mechanism — pick the most robust, smallest-footprint option and FLAG your choice early (Tier-2,
auditor reviews it):**
- **Option A (preferred if it works on WebKit): zero new prod surface.** Drive the sign-in from the
  Playwright page using the app's *own* loaded Firebase instance — e.g. navigate to an app route that
  bundles `@/lib/firebase`, then a `page.evaluate`/init-script bridge calls `signInWithCustomToken`.
  If `auth` isn't reachable from page scope, this option may not be viable — don't force it.
- **Option B (robust, tiny test-gated affordance): a `/test-signin` client page** that mirrors
  `QRSignIn`/`/qr/[code]/page.tsx` — reads a customToken (from a POST body or `sessionStorage`, **NOT a
  logged URL query**), calls `signInWithCustomToken(auth, token)`, redirects. **Security contract if you
  build this:** the customToken is bearer-equivalent — `Cache-Control: no-store`, never logged, never
  written to any tracked file, and the page must be inert/benign without a valid token (a customToken is
  only obtainable via the test bearer → `test-session`, so possession is the capability; document this
  for the auditor). Confirm with the auditor that no `^test-` gate is needed on the page itself, or add
  one.

Whichever you choose: the **acceptance bar** is a Playwright assertion that `auth.currentUser` (or an
equivalent in-page signal) is non-null after sign-in, proving the Web SDK is authed — not just the cookie.

### 2. WebKit + iPad project in `playwright.config.ts`
Add a project using Playwright's **WebKit** engine (Safari's actual engine, closest to iOS without
hardware) at the standard 11" iPad viewport — e.g.
`{ name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } } }`
(and optionally an `ipad-landscape` variant 1180×820). The viewport override is the load-bearing part —
the base descriptor is just for the WebKit engine/UA/touch/scale. Keep the existing `chromium` /
`mobile-chrome` projects intact. `playwright.config.ts` is a root config — **claim it in
`shared/claims.md`** before editing (low contention now, but follow protocol).

### 3. iPad Perform-mode coverage spec
Add `e2e/perform-ipad.spec.ts` (or extend `perform-flow.spec.ts` with an iPad project guard) that, at
the standard 11" iPad WebKit viewport (820×1180 portrait), signs in via Deliverable #1 and
asserts the band's golden path:
- Setlist heading + seeded track titles render (reuse `seedPublishedSetlist`).
- **No horizontal overflow** at the device width (`document.scrollingElement.scrollWidth <= clientWidth`, or per-row).
- Dense rows are **tap-friendly** — touch targets ≥ ~44px (the iOS HIG floor); reuse any existing
  touch-target helper if one exists in the repo.
- Tapping a bonded chart row opens the **PDFOverlay and the chart actually renders under WebKit** — this
  is the load-bearing assertion: it's the real test of react-pdf's worker on Safari. Your memory flags
  `react-pdf` v10's barrel sets `workerSrc` to a stub and the override must be unconditional
  (`[[feedback_react_pdf_worker]]`); a WebKit render failure here is exactly the iOS regression we're
  hunting. Assert the chart canvas/iframe is present and non-empty, not just that the overlay opened.
- Transposer popover responds without crashing; back-to-list returns to the dense view.
- No console errors beyond the accepted `CONSOLE_NOISE_PATTERNS` already defined in `perform-flow.spec.ts`.

### 4. Run it against prod + paste results
```
PLAYWRIGHT_USE_REMOTE=1 \
PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
MCP_BEARER=crl_live_...   # admin or band_leader \
npx playwright test e2e/perform-ipad.spec.ts --project=ipad-webkit
```
Paste the run summary (pass/fail per assertion) + any screenshots-on-failure into the SHIP-NOTICE. If a
WebKit-specific bug surfaces (likely the PDF worker), that is a **finding** — document it; decide with
the supervisor whether the fix is in-lane or a follow-up.

## Out of scope / hard rules
- Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`,
  `src/lib/mcp/error-envelopes.ts`.
- Do NOT change the `test-session` server route's auth contract (bearer verify, `^test-` uid gate,
  SEC-001 uid scrub, rich-error envelopes). You may *read* `customToken` from its response; you may not
  weaken its gates.
- Do NOT touch the in-flight setlist-fixes lanes' files (MCP tools under `src/lib/mcp/tools/**`). Your
  footprint is `e2e/**`, `playwright.config.ts`, and (only if Option B) one new test-gated client route.
- NEVER log, echo, or commit a customToken or bearer to any tracked file. Bearer/token pool lives outside
  the repo.

## Coordination
- Cut your worktree from `8ff155982`. Disjoint files from setlist-fixes A/B/C/D → no cross-lane contention.
- Tier 2 → **auditor does independent validation** (prod-probe of the sign-in + an iPad run). Supervisor
  is the relay hub. SHIP-NOTICE to `.coord/inbox/auditor.md` + copy `.coord/inbox/supervisor.md`.
- Apex→www gotcha: MCP/prod calls hit `https://www.centralreform.live` directly (apex 307 strips Authorization).
- Bearer: you'll need an admin/band_leader `crl_live_*` for `MCP_BEARER`. Dogfood `mint_admin_bearer` off
  the live root and revoke children post-run (per the wave's bearer discipline), or request one from Daniel.

## Gates before ship
- `npm run test` (0 fail) + `npm run test:emulator` (0 fail) — confirm you didn't break the existing suite.
- `next build --webpack` (`SKIP_ENV_VALIDATION=1`, exit 0) — only if you added a client route (Option B);
  if you stayed in `e2e/**` + config, a build is still cheap insurance.
- The iPad prod run (Deliverable #4) green, or its failures documented as findings.
- Push `feat/ipad-uat-harness:master`, OVERWRITE `master-tip.md`, SHIP-NOTICE per Tier-2 flow.

## First actions
1. ACK in `.coord/inbox/supervisor.md` (sign `from coder-5`).
2. Verify base SHA == `master-tip.md`; cut worktree from `8ff155982`.
3. `git show origin/master:src/app/api/auth/test-session/route.ts` — confirm `customToken` is returned.
4. Read `e2e/helpers/auth.ts`, `e2e/perform-flow.spec.ts`, `e2e/helpers/seed.ts`, `playwright.config.ts`,
   `src/components/auth/QRSignIn.tsx`, `src/lib/firebase.ts` (the `auth` export) — confirm exact shapes
   before writing (verify-before-write; don't trust this prompt's line numbers blindly).
5. Decide Option A vs B for Deliverable #1 and flag the choice in your ACK (it's the Tier-2 crux).
