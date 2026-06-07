# Public setlist listing — upcoming-first + past/future delineation (coder-3, Tier 2)

**Dispatched by:** supervisor 2026-05-22 · **Daniel ask** (on iPad now): the band's setlist
homepage shows **Shavuot Yizkor (May 23) ABOVE Kabbalat Shabbat (May 22)** — wrong; and
there's no separation between upcoming and past services. **LAUNCH-RELEVANT** (band sees this
on iPads this weekend; Kabbalat Shabbat is tonight, Fri May 22).
**Type:** frontend, `src/` only, Tier 2 (ships to PROD). **Worktree:** fresh off origin/master.

## Root cause (CONFIRMED by supervisor)
Daniel's iPad is on the PUBLIC `/perform` surface, which renders
`src/components/performance/PublicSetlistListing.tsx`. Its sort (~L44-49) is **descending**:
```
.sort((a,b) => (db?.getTime()||0) - (da?.getTime()||0))   // db - da = newest/furthest first
```
→ May 23 sorts above May 22, and there is NO upcoming/past split. (The authed `/setlists`
dashboard is ALREADY correct — do NOT touch it; use it as the reference, see below.)

## The fix
Make `PublicSetlistListing.tsx` mirror the dashboard's split:
1. **Upcoming** (eventDate >= today-at-00:00, so TODAY counts as upcoming) sorted **ASCENDING**
   (soonest first) → Kabbalat Shabbat (today) sits above Shavuot Yizkor (tomorrow). Show at TOP
   under an "Upcoming" header.
2. **Past** (eventDate < today) sorted **DESCENDING** (most recent first); null-dated trail
   after, in stable order. Show below under a "Past services" header.
Keep the existing test/owner filters (`s.isTest !== true && !isTestUid(s.ownerId)`) and the
existing card markup/visual style — only restructure ordering + add the two section headers.

**Reference implementation to mirror** (do not import from a hook into a public client comp
unnecessarily — replicate the small pure logic, or extract a tiny shared helper if clean):
`src/hooks/use-setlist-dashboard.ts:421-441` (the `today.setHours(0,0,0,0)` boundary, the
`upcoming` asc sort, the `pastOrNoDate` desc+undated logic) and the section-header pattern in
`src/components/setlist/SetlistDashboard.tsx:141-181` ("Upcoming Services" / "Library & Past
Events" `<h4>` headers).

**Also check (secondary, same-bug):** `src/components/performance/SetlistDrawer.tsx` (the
in-Perform setlist switcher) — if it orders setlists, apply the same upcoming-first rule for
consistency. If it doesn't sort by date, leave it. Keep scope tight.

## /ui-ux-pro-max (REQUIRED — visible UI change)
Run `/ui-ux-pro-max` for the section-header + grouping layout. Match the existing public
listing aesthetic (the rounded Link cards, muted headers); the dashboard's uppercase
tracking-widest `<h4>` is the house style. Mobile/iPad 820×1180 first.

## Tests (REQUIRED — proof)
Add/extend a test for `PublicSetlistListing` (or a pure ordering helper if you extract one):
- today's setlist sorts ABOVE a tomorrow setlist (the exact May22-above-May23 regression)
- a past setlist renders in the Past group, below all upcoming
- past group is desc (most-recent past first); undated trail last
- isTest/test-uid rows still excluded

## Gates (real `npm ci` — junction false-fails login-bundle-size, see [[feedback_fresh_worktree_gate_setup]])
- the new/updated test GREEN · `check:types` · eslint clean (touched) · `next build --webpack` exit 0

## Ship (Tier 2)
Read `.coord/shared/master-tip.md`; FF onto fresh origin/master; re-run gates; `git push origin master`.
Update master-tip + your agents.md row; SHIP-NOTICE → `.coord/inbox/auditor.md` (Tier 2); HEADS-UP supervisor.
rmdir node_modules junction before teardown.
