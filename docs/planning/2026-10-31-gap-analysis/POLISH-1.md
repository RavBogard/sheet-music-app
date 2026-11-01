# Polish 1: usability and re-audit remainders

Daniel (2026-11-01) chose "polish, hardening and usability" next, with these three jobs first:
1. **Band: open tonight's setlist fast.** From an iPad home screen to the right setlist and the
   first chart in the fewest taps, signed out or in.
2. **Leader: last-minute swap.** Change a song or key minutes before a service, from the iPad (or
   Claude), and every iPad picks it up.
3. **Add a new chart.** Upload or import a new song and get it onto a setlist correctly the first
   time.

Also fix every remaining item in `audit/REAUDIT.md` except the Perform render loop (separate PR).
That includes:
- **Remove the Setlists calendar/matrix view entirely** (Daniel). Remove the view toggle,
  `SetlistMatrixView`, its API route if nothing else uses it, and its i18n keys and tests.
- Contrast: the editor's section-only rows (`MobileRowCard.tsx` ~397, `/80`) and the Scraper's
  empty state.
- Editor section-only rows must be at least 44px on touch.
- 200% text on a phone: the editor's page column overflow.
- The 10–11px font sizes that are off the DESIGN.md type scale: move them to the scale.

## Approach for the three jobs
- **Walk each job yourself:**
  - **Where to walk it:** live on production with a test account (see below), at 820×1180 and
    390×844.
  - **What to record:** count the taps and screens, and note every hesitation point (an unclear
    label, a wrong default, a dead end, a slow step).
  - **What to fix:** the friction, inside the existing design system (`docs/design/DESIGN.md`).
    Ideas to check, not mandates:
    - `/perform` opens straight to tonight's service when there is one today.
    - A "Tonight" shortcut on the dashboard.
    - The swap sheet defaults to the same moment's charts.
    - The upload flow ends with "Add to <next service>".
- **Record the before and after tap counts** in the PR body.
- **No new product concepts or wording themes.** Behaviour or copy changes that a reasonable
  musician would expect are fine.

## Rules
- Perform stays bulletproof.
- Keep every `data-testid`.
- Use DESIGN.md tokens only; the no-raw-palette guard is enforced.
- Keep the 44px hit areas.
- i18n in English and Hebrew, with translator notes.
- Both tenants.
- Do NOT touch `SetlistPerformClient.tsx` or `SaveOfflineButton.tsx`; another builder is fixing a
  render loop there right now. If a job's fix needs them, list it for a follow-up.

## Test account
From `C:\Users\dsbog\centralreform.live\sheet-music-app`:
1. Run `BEARER=$(node scripts/supervisor-prod-bearer.mjs)`.
2. Call JSON-RPC `tools/call` `create_test_account` on `https://www.centralreform.live/api/ops/mcp`
   with `{"role":"band_leader","loginable":true,"ttlSec":7200,"uidPrefix":"gap","label":"polish"}`.
3. Visit the returned `loginUrl`.
4. Revoke it at the end.

Never save, reorder or upload real data on production. Walk the flows up to the final save, then
cancel.
