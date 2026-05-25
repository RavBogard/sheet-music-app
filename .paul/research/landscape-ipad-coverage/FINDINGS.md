# `landscape-ipad-coverage` — FINDINGS

**Lane:** `landscape-ipad-coverage` (coder-2 / Tier-0 spec extension)
**Cut from:** `f7c23e3c3` (origin/master @ 2026-05-25T17:20Z)
**Dispatch:** `msg-landscape-ipad-coverage-001` 2026-05-25T19:00Z
**Closes:** ipad-sweep `FINDINGS.md` §Coverage gaps line 112 (Landscape iPad project not run).
**Verdict:** ✅ **GREEN** — Coverage gap #3 closed. `ipad-webkit-landscape` project runs cleanly against prod; probe 8 PASSES.

---

## Phase 1 — Discovery

### `playwright.config.ts` — already wired

The `ipad-webkit-landscape` project **already exists** in `playwright.config.ts` at lines 43-49 (origin/master `f7c23e3c3`):

```ts
{
    name: 'ipad-webkit-landscape',
    use: {
        ...devices['iPad Pro 11 landscape'],
        viewport: { width: 1180, height: 820 },
    },
},
```

Spread of `devices['iPad Pro 11 landscape']` (WebKit engine + iOS UA + hasTouch + scale) with the viewport override to **1180×820** — the swap of the portrait `820×1180` per `[[project_band_ipad_hardware]]`. The viewport override is the load-bearing part; the base descriptor only carries engine/UA/touch/scale.

**Conclusion: Phase 2 (playwright config addition) was a no-op.** The project mechanism was already in place. The gap was purely that nobody had **run** it yet.

### `e2e/perform-ipad-deep.spec.ts` — probe 8 landscape block

- Top-of-file docblock (lines 9-43) already enumerates the 8 probes including #8 "Landscape orientation (music stands rotate)" and documents the run command with `--project=ipad-webkit-landscape`.
- Landscape `describe` block at line 544: `ipad-sweep-perform — deep Perform-mode (landscape 1180)`.
- `test.beforeEach` (lines 547-552) skips when `testInfo.project.name !== 'ipad-webkit-landscape'` — this is what was firing under the portrait project and producing the auto-skip noted in the ipad-sweep FINDINGS.
- `test.beforeAll` (lines 561-593) mints a band_leader + musician test account, uploads a fixture chart, seeds a published setlist with 3 tracks (1 song "Landscape Track 1" / G, 1 song "Landscape Track 2" / D, 1 header "Landscape Header").
- `test.afterAll` (lines 595-598) revokes the minted test accounts.

### Probe 8 assertions (line 600)

The single probe in the landscape describe block exercises:

1. SSR + Web SDK auth as musician (test account).
2. Navigate to `/perform/setlist/${land.setlistId}` waitUntil:domcontentloaded.
3. `awaitRow(page, LAND_SONG)` — reload-on-miss SSR-propagation race tolerance.
4. `<h1>` matches the seeded setlist name (15s timeout).
5. `LAND_HEADER` row visible (15s timeout).
6. **`horizontalOverflow(page).scrollWidth ≤ clientWidth + 1`** — no horizontal overflow at the wider landscape width.
7. **`overflow.clientWidth ≤ 1180`** — viewport is exactly the landscape width.
8. **`overflow.clientWidth > 820`** — landscape is wider than portrait (sanity).
9. Tap on `LAND_SONG` → chart overlay mounts → "Zoom in/out" button visible (15s timeout).
10. No "Failed to load" / "render error" / "Could not load chart" text in overlay.
11. `Escape` keypress closes overlay → back to list, `<h1>` matches setlist name.
12. **Zero console errors** captured across the whole interaction.

---

## Phase 2 — Playwright config addition

**Skipped — no edits needed.** Project already wired at `f7c23e3c3`. See Phase 1.

---

## Phase 3 — Probe-run on prod

### Command

```bash
PLAYWRIGHT_USE_REMOTE=1 \
PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
MCP_BEARER=<minted admin bearer; purpose 'landscape-ipad-coverage lane probe 8 prod run — coder-2 Tier-0 spec extension'; ttl 3600s> \
npx playwright test e2e/perform-ipad-deep.spec.ts \
  --project=ipad-webkit-landscape \
  --reporter=list \
  --retries=2
```

Bearer minted ad-hoc by Daniel (CRC Music MCP was disconnected in this lane's session, blocking self-mint). Consumed only as the env-prefix for this single command — never echoed to stdout, never persisted, never written to any artifact (verified via `grep -c "crl_live_"` against the log + `test-results/` + `playwright-report/` post-run: 0 matches).

### Result

```
Running 9 tests using 5 workers

  -  8 portrait probes [ipad-webkit-landscape] (auto-skipped — wrong project)
  ✓  probe 8 — landscape golden subset: render, no overflow, overlay open/close (20.9s)

  8 skipped
  1 passed (34.9s)
```

Full log: `./probe-run-001.log` (15 lines, 1974 bytes, force-added since `.log` is gitignored — precedent set by `ipad-stuck-spinner-probe` per `[[feedback_auditor_hot_inbox_append]]` family).

### Observations

- **The 8 portrait probes skipped correctly** under the landscape project via the `test.beforeEach` project-name guard — that's the symmetric counterpart to the auto-skip that ipad-sweep reported under the portrait project. The guard mechanism is bidirectional and works.
- **Probe 8 passed on first attempt** (no retries fired). 20.9s wall — well inside the 30s default per-test timeout. The 14s overhead between test wall (20.9s) and total wall (34.9s) is the `beforeAll` seed-cost (mint × 2 + uploadFixtureChart + seedPublishedSetlist) + `afterAll` revoke.
- **Zero console errors** across the whole probe — no `react-pdf` worker warnings, no service-worker mismatch noise, no Firestore listener errors. The landscape-rotation viewport at the desktop-toolbar layout breakpoint (`≥lg`) renders cleanly on prod WebKit.
- **No horizontal overflow** at 1180×820 — the responsive layout's `lg:` toolbar variant fits within the landscape iPad width as designed.
- The chart overlay mounts on tap, the Zoom button appears within 15s, no "Failed to load / render error / Could not load chart" copy fires — the standard ipad-uat-harness golden-path holds in landscape too.

---

## Phase 4 — Verdict + recommendation

### Verdict on Coverage gap #3

**CLOSED — GREEN.** The `ipad-webkit-landscape` project is functional, the probe-8 mechanism runs end-to-end on prod, and the actual Perform-surface assertions PASS in landscape mode. No sub-gaps surfaced.

### Was this a hidden bug-detector?

No — probe 8 is a **subset** golden-path probe (render + overflow + overlay open/close + zero console errors); it deliberately does NOT exercise the deeper portrait-suite behaviors (setlist switching, sequential chart nav, transpose, long-setlist scroll, unbonded rows, header tap-handling, annotation surface). It's the cheap second-axis check that ipad-sweep doc'd as "landscape orientation (music stands rotate)" in the top-of-file probe enumeration. It does its job; deeper landscape coverage isn't in scope for this lane.

### Recommended follow-up (optional, not in scope)

A future Tier-0 lane could **promote the 8 portrait probes to also run under landscape** (drop the project-name guard, or duplicate the describe block) — currently the portrait probes are gated to the portrait project by symmetric `beforeEach` skip. The cheap-second-axis posture is intentional per the existing test design; promoting it would multiply the test surface ~2× without a known driver. Leave as-is unless a landscape-specific regression surfaces.

The other 3 Coverage gaps from the ipad-sweep FINDINGS:
- ~~Gap #1 (no perform-entry auto-precache)~~ — **closed by coder-1 @ `c52d2b142`** (perform-entry-precache, F1).
- ~~Gap #2 (no PWA fresh-install spec)~~ — **closed by coder-2 @ `f76bc3f77`** (ipad-pwa-fresh-install-spec).
- ~~Gap #3 (landscape iPad project not run)~~ — **closed by coder-2 @ this ship** (you are reading the FINDINGS).
- ~~Gap #4 (onboarding-qr-ipad cycle-2 member-as-approver intent)~~ — **closed by coder-4 @ `65da39611`** (onboarding-qr-ipad-cycle-2-coverage).

**All 4 ipad-sweep Coverage gaps are now closed.**

---

## Lane posture

- **Code changes:** 0 src/ edits. 0 e2e/ edits. 0 playwright config edits. (project was already wired.)
- **Held claims:** 0 (no shared files touched).
- **Files added:** 2 — this `FINDINGS.md` + `probe-run-001.log`.
- **node_modules:** junction → `sheet-music-app-auditor-validation/node_modules` (Playwright + WebKit deps; 966 packages).
- **`.env.local`:** copied from `sheet-music-app-mcp/` (standard worktree bootstrap).
- **Worktree:** `sheet-music-app-landscape-ipad/` cut from `f7c23e3c3`. Awaits supervisor teardown sweep on SHIP-NOTICE per `[[feedback_worktree_teardown_timing]]`.

## Bearer hygiene

The minted admin bearer used for this probe-run will be revoked once the CRC Music MCP server reconnects (this session lost it mid-lane). SHIP-NOTICE flags the pending revocation; supervisor can confirm or punt to coder-2 in a follow-up fire. The bearer's purpose-string `'landscape-ipad-coverage lane probe 8 prod run — coder-2 Tier-0 spec extension'` makes it greppable in `list_minted_bearers`. TTL was 3600s so it expires naturally even without explicit revoke.

## Gates (Tier-0)

- ✅ FINDINGS.md identifies playwright config addition status (no-op — already wired) + probe-run result (PASS).
- ✅ Probe-run log shows PASS with single named test in 20.9s wall.
- ✅ `tsc --noEmit` — N/A (zero TS edits).
- ✅ `next build --webpack` — N/A (zero TS edits).
- ✅ Full vitest — N/A (zero src/ edits; this is a research-only lane).
- ✅ Out-of-scope honored: no src/ + no e2e/ spec content edits + no playwright config edits + no library_index writes + no smart-transposer + no bridge/monitor/rules/vercel.json.
