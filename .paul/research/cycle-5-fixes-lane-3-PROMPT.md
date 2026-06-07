# Cycle-5-fixes Lane 3 — A11y rollup

You are `cycle5-fixes-3-a11y`, a coder lane in the cycle-5-fixes
parallel wave. Source-of-truth scoping:
`sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` (Lane 3).

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-3-a11y`
- **Branch:** `feat/cycle5-fixes-3-a11y`
- **Worktree:** `sheet-music-app-cycle5-fixes-3-a11y/`
- **Base SHA:** `6dbc106bc`
- **Estimated:** 2-3h

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/README.md` + `shared/master-tip.md` +
   `shared/decisions.md` (focus 2026-05-18T23:50Z C4-002/C4-003/C4-004
   a11y-revisit block + cycle-3.5 a11y-sweep `8ef1ca190`).
2. Read `sheet-music-app/.coord/agents.md` — find your row.
3. Read this prompt's referenced triage Lane 3 section.
4. ACK msg-001 to supervisor inbox confirming startup + base SHA.

## §3 — Scope (6 findings)

From triage Lane 3:

- **C5B-015 HIGH** — Song-key badge fails WCAG 2 AA color contrast
  (axe-confirmed). Element: `<span data-testid="key-badge"
  class="font-mono text-sm font-bold px-2 py-0.5 bg-brand/15 text-brand
  rounded-lg shrink-0 text-center">Em</span>`. Fix: darken `text-brand`
  for AA against `bg-brand/15`, OR use solid `bg-brand` with
  `text-brand-foreground` (inverse). Apply at key-badge component
  level (`src/components/setlist/key-badge.tsx` OR wherever this
  `<span data-testid="key-badge">` lives — search by testid).
- **C5D-014 HIGH** — `src/components/library/SearchOverlay.tsx:109-114`
  has `<Tabs><TabsList><TabsTrigger>×2</TabsList></Tabs>` with NO
  `<TabsContent>` siblings. Same structural failure as cycle-4 C4-004.
  Fix: replace with plain segmented control (ToggleGroup or custom
  2-button), same shape as the C4-004 fix at
  `src/components/library/SongChartsLibrary.tsx` (commit `e2214bc92`).
- **C5B-001 MED** — Skip-link `href="#main-content"` on unauth shell
  has no matching target. Fix: wrap login-card content in
  `<main id="main-content">` (or rename skip-link href to match an
  existing landmark). Apply at root layout
  (`src/app/layout.tsx`) so every unauth surface inherits.
- **C5D-015 MED** — `--secondary-foreground` dark-mode contrast
  against `--secondary` alpha-0.4 likely sub-AA. Light mode is fine
  (~9:1); dark mode `oklch(0.82 0.01 265)` over `oklch(0.45 0.18 275 /
  0.4)` is ~4.25:1 standalone — alpha-composite pushes it lower. Fix:
  empirically measure with axe-core in dark mode on a surface using
  `bg-secondary` + `text-secondary-foreground` (likely admin chrome /
  settings cards). If <4.5:1, bump dark `--secondary-foreground` L to
  ~0.90 OR drop alpha on `--secondary`.
- **C5B-008 LOW** — Login Google sign-in button SSR'd `disabled`; no-JS
  users see unclickable button. Fix: SSR-enable (clickable via OAuth
  redirect pre-hydration) OR add `<noscript>` banner. **Recommend
  SSR-enable** — Google OAuth redirect works pre-JS.
- **C5B-009 MED** — Login page has no link to Privacy / Terms /
  SMS-Consent / Changelog. GDPR/CCPA pre-signin disclosure concern.
  Fix: add footer to `src/app/login/page.tsx` linking those pages
  (and apply same to `/perform` unauth landing if it lacks them).
  Coordinate with Lane 6's C5D-002 (Footer.tsx Privacy/Terms link —
  same intent at a different surface).

## §4 — Hard boundaries

- **NO touch to** repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- **NO touch to** Lane 6's `src/components/Footer.tsx` or
  `src/components/v2/v2-footer.tsx` — that's their C5D-002 territory.
  C5B-009 is `/login`-specific footer, distinct surface.
- **Cycle-3.5 a11y-sweep wrappers** (`button.tsx` + `input.tsx`
  dev-mode warnings) — DO NOT REMOVE; you may extend.
- **Cycle-3.5 + cycle-4 a11y carry-forwards** (per-callsite aria-labels,
  44×44 touch floor on action buttons, `/perform` `<main>` landmark,
  `/login` SSR skeleton) — preserve.
- **Logic-Pro density per [[feedback_no_cover_art]]** — no decorative
  additions; row-density unchanged.

## §5 — Tests + build (required before push)

- axe-core sweep on `/login`, `/perform`, `/perform/setlist/<id>`,
  `/library`, `/manage/library-review`, `/monitor` — ZERO violations
  (matches cycle-4 fixes-a11y-revisit close-out criterion).
- `src/__tests__/a11y/touch-targets.test.tsx` 4/4 ✓ (cycle-3.5
  baseline must stay green).
- Component snapshot test for `key-badge` showing the new color
  combination's contrast ratio computation.
- `next build --webpack` clean; full unit suite green.

## §6 — Push protocol

1. `git fetch origin && git rebase origin/master`.
2. Re-run tests + axe-core sweep.
3. `git push origin feat/cycle5-fixes-3-a11y:master`.
4. SHIP-NOTICE to supervisor inbox with:
   - Final SHA.
   - Per-surface axe verdicts (0 violations everywhere).
   - C5D-015 empirical contrast measurement (the math said likely
     sub-AA; report what axe found). If borderline, file as
     `daniel_discussion_required`.
   - Key-badge contrast ratio post-fix (target ≥4.5:1).
   - Worktree teardown request.

## §7 — Coordination contract

- Claim `src/app/layout.tsx` (skip-link target — coordinate with
  Lane 4 which may touch middleware adjacent to layout). Lane 4 is
  middleware-focused; you're layout/component-focused — shouldn't
  collide on this file but claim to be safe.
- Claim `src/app/globals.css` (color tokens — C5B-015 brand + C5D-015
  secondary-foreground).
- Claim `src/components/library/SearchOverlay.tsx` (TabsList refactor).
- Claim `src/components/setlist/key-badge.tsx` (or its actual location;
  search by `data-testid="key-badge"`).
- Claim `src/app/login/page.tsx` (footer addition + signin button SSR
  enable).

Go.
