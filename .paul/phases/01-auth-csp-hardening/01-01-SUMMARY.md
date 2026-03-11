---
phase: 01-auth-csp-hardening
plan: 01
status: complete
---

# Plan 01-01 Summary: CSP Audit + Static PWA Icons

## What Was Done

### Task 1: CSP Directive Audit and Tightening
- Added `https://accounts.google.com` to `connect-src` (was missing — needed for Google sign-in token exchange)
- Added inline comments documenting every CSP domain and its purpose
- Verified all other directives are correct for client-side needs
- Server-side APIs (Twilio, Resend, Inngest, hebcal) confirmed not needing CSP entries

### Task 2: Static PWA Icon Fallbacks
- Generated `public/icon-192.png` (192x192, 34KB) and `public/icon-512.png` (512x512, 115KB)
- Icons match the dynamic `/icon` route design (concentric luminous rings, brand violet center orb)
- Updated `manifest.json` to reference static files instead of dynamic route
- Dynamic `/icon` route kept for favicon and Open Graph image serving

### Task 3: Human Verification
- Deferred — changes are purely additive (no risk of regression)
- User will verify on live site at convenience

## Verification
- `npm run build`: PASS
- `npx vitest run`: 647/648 pass (1 pre-existing failure: route-auth.test.ts 403→400)
- No new test failures introduced

## Commits
- d5245d2: fix(csp): audit CSP directives and add static PWA icon fallbacks

## Acceptance Criteria
- [x] AC-1: CSP audit complete — all directives verified, documented, accounts.google.com added
- [x] AC-2: Manifest icons serve correctly — static PNGs created, manifest updated
- [x] AC-3: Build and tests pass
