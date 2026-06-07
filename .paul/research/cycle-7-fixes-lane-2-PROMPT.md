# Cycle-7-fixes Lane 2 — iPad-Mini UI fixes

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-TRIAGE.md`** + **`.paul/research/cycle-7-instance-2-HANDOFF.md`** (your source-of-truth) → THIS FILE.

**Role:** IMPLEMENTER. Standard CODER.md §Worktree-setup.

**Bearer:** admin `crl_live_*` from pool row `ASSIGNMENT=cycle-7-fixes-lane-2`.

**Wall-clock budget:** ~75 min.

**Branch:** `feat/cycle-7-fixes-2-ipad-ui`
**Worktree:** `sheet-music-app-cycle-7-fixes-2-ipad-ui/`
**Cut from:** origin/master tip.

---

## §0 — Mission

Close three iPad-Mini UI findings from Instance 2 — David's actual device. The combination of C7I2-001 (David can't read setlist card titles on his iPad) and C7I2-002 (chart-fetch failures trap users with no escape) is the real Friday-night UX risk: David picks up his iPad, the title column is single-letter-per-line, he taps the wrong card, and then when he taps a track that has a broken chart bond (46% of setlists do per Instance 4 C7I4-001), the app strands him on "Loading chart…" forever.

**Evidence:** screenshots in `.paul/research/cycle-7-instance-2-artifacts/` — especially `r7-upcoming-services-cropped.png` (the C7I2-001 headline image showing `C / E / Ma...` truncation).

---

## §1 — Scope (C7I2-001 — `/setlists` Upcoming Services card truncation)

**Surface:** `src/app/(main)/setlists/page.tsx` (or its child components — verify). The card layout has Edit + download + kebab action cluster eating the title column at iPad-Mini viewport (768×1024).

**Approach:**
- Add CSS `min-width: 0` to the action cluster's flex parent so the title gets allocated space first.
- Collapse the inline action cluster to a single overflow-menu button at viewport widths <820px. Edit + download + kebab move into a popover.
- Title column gets `min-width: 12ch` + `word-break: keep-all` (no per-letter wrap).

**Acceptance:**
- At 768×1024 (iPad-Mini portrait), "Eitan Shabbat Morning 2/21" renders on 1-2 lines (not 1-letter-per-line).
- All action affordances (edit, download, kebab) reachable via either inline buttons (≥820px) or overflow menu (<820px).
- Desktop (>1024px) viewport is visually unchanged or improved.

---

## §2 — Scope (C7I2-002 — `/perform/[fileId]` infinite spinner)

**Surface:** `src/app/perform/[fileId]/page.tsx` (or the PDF-fetch hook it consumes — likely `src/hooks/use-setlist-performance.ts` per Instance 3 code-grep cross-ref). The "Loading chart…" state has no timeout, no retry, no error UI, no back affordance.

**Approach:**
- Add 15-second timeout on the chart-fetch promise.
- On timeout (or any error): render an error state with the chart title, the error reason (`fetch failed`, `404`, `auth required`, etc.), a **Retry** button, a **Back to setlist** link (if entry was from a setlist), and a **Back to library** link (universal fallback).
- Surface the error type to telemetry (existing webVitals / Sentry path if available).

**Acceptance:**
- Forced 404 (e.g. invalid fileId in URL) renders error UI within ≤15s, not infinite spinner.
- Forced auth failure (unauthed access to auth-required chart) renders error UI with "sign in" affordance.
- Retry button re-attempts fetch (visible to user via spinner restart).
- Back affordances always reachable; no dead-end state.

---

## §3 — Scope (C7I2-003 — `/library` long-track-row left-edge clipping)

**Surface:** `src/app/(main)/library/page.tsx` + `src/components/library/SongChartsLibrary.tsx` (or wherever the row template lives).

**Approach:**
- Add `padding-left` to the leftmost cell of long track rows so the first character isn't flush against the viewport edge on iPad-Mini.
- Verify other long content (composer attributions, multi-part medleys) doesn't introduce similar clipping.

**Acceptance:**
- "Adonai Oz (Klepper-Freelander) - Al Hanisim (Frimer) - Al Kol Eileh (Shemer)" row at iPad-Mini viewport renders with `A` visible (not clipped behind viewport edge).
- Long-row text wraps cleanly within the row's allocated width.

---

## §4 — REPROs (mandatory)

In SHIP-NOTICE `## Repros`:

- **REPRO-L2-card-title-iPad-Mini:** Playwright at iPad-Mini profile (`viewport: 768×1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2`); navigate `/setlists`; pick the "Eitan Shabbat Morning 2/21" card; screenshot. Expect readable title; compare to `cycle-7-instance-2-artifacts/r7-upcoming-services-cropped.png` for visible delta.
- **REPRO-L2-chart-spinner-timeout:** force a chart-fetch failure (use an invalid fileId in URL); observe error UI renders within ≤15s with retry + back affordances.
- **REPRO-L2-library-row-clipping:** Playwright at iPad-Mini; navigate `/library`; locate the long track-row; verify first character is visible.

---

## §5 — Hard rules

- Don't touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- HEADS-UP Lane 1 (test-isolation) before touching `src/components/performance/*`; Lane 1 may edit `PublicSetlistListing.tsx` in the same window.
- HEADS-UP Lane 3 (chart-bond) before touching `src/hooks/use-setlist-performance.ts` — likely shared file. Coordinate via inbox.

---

## §6 — HANDOFF requirements

SHIP-NOTICE `msg-from-coder-2-cycle7-fixes-2-ship` to `.coord/inbox/supervisor.md`:
- Ship SHA + branch + commit summary
- Per-acceptance PASS/FAIL with screenshot evidence
- `## Repros` with prod-SHA-stamped Playwright transcripts
- Bearer-burn: mark pool row `ASSIGNMENT=cycle-7-fixes-lane-2` → `ASSIGNMENT=burned`

---

## §7 — Bail-out conditions

- HARD-BLOCK if responsive layout fix requires touching `SetlistGrid.tsx` (which is forbidden) — likely it doesn't (action cluster is presumably in a wrapping list component, not Grid), but verify.
- DEGRADED-OK if `webVitals` telemetry surface isn't wired for the new error-state events — note in HANDOFF as INFO, move on.

---

*from supervisor*
