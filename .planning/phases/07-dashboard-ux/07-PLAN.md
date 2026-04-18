# Plan 07: Dashboard UX Consolidation

**Phase:** 7 - Dashboard UX Consolidation
**Status:** Ready to execute

## Goal
Elevate the `<NextServiceCard>` so that unauthenticated (guest) and pending users have immediate, frictionless access to upcoming public setlists. Ensure all changes adhere to `ui-ux-pro-max` guidelines.

## Requirements
- ✓ UX-01: Break `<NextServiceCard>` out of the `isMember` check in `DashboardClient.tsx`.
- ✓ QA-01: Verify `<NextServiceCard>` has `cursor-pointer`, stable hover states, and proper skeleton loading to prevent layout shifts.

## Proposed Changes

### 1. `src/app/(main)/DashboardClient.tsx` (Layout Restructure)
- **Task**: Move the rendering logic for `<NextServiceCard>` and its skeleton loader outside of the `{user && isMember}` conditional block.
- **Action**: Place it directly under the "Hero Header" section so it is universally visible.
- **Action**: Ensure the `onClick` handler still navigates to `/perform/setlist/[id]` (which is accessible to guests).
- **Action**: Leave the remaining logic for `isMember`, `profile?.role === 'pending'`, and `!user` below the hero card.

### 2. `src/components/home/NextServiceCard.tsx` (UI/UX Review)
- **Task**: Audit and update the component against `ui-ux-pro-max` standards.
- **Action**: Verify the root element has `cursor-pointer`.
- **Action**: Ensure hover states use `transition-colors` or `transition-all` without scaling that causes layout shifts.
- **Action**: Check contrast ratios for text and badges (e.g., the "LIVE" badge).

## Verification Criteria
- [ ] Guest (unauthenticated) visits `/`: Sees the Next Service card at the top, and QR code/login below.
- [ ] Pending user visits `/`: Sees the Next Service card at the top, and the pending illustration below.
- [ ] Member visits `/`: Sees the Next Service card at the top, and their dashboard below.
- [ ] Clicking the Next Service card as a Guest routes successfully to `/perform/setlist/[id]`.
- [ ] No layout shifts occur when the card loads (skeleton matches dimensions).

---
*Plan: 07-PLAN*
*Phase: 07-dashboard-ux*