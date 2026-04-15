---
phase: v43-10-auth-deep-dive
plan: 05
subsystem: testing
tags: [playwright, e2e, ci, github-actions]
duration: ~15min
completed: 2026-04-15T05:00:00Z
---

# P10-05: Playwright smoke + CI job

Extended existing `e2e/smoke.spec.ts` with proxy-gate + cookie regression tests, wired Playwright into GitHub Actions as new `e2e-smoke` job.

## Shipped
- 7 new test cases: unauthenticated redirects, /login render, /auth-error escape hatch, public-route admit, bounce-cookie path, forged companion cookie safe
- CI job builds + runs Playwright in headless chromium; uploads report on failure
- commit `d349bca`

## Deferred
Real-auth flows (sign-in with test user, promotion scenarios) need a dedicated Firebase test account + GitHub secrets + custom-token helper. Worth its own focused plan when the user has time for that setup.

## Verified
- `npx tsc --noEmit` clean
- Full suite 1270/1270 green
- CI job added to ci.yml (will run on next push)
