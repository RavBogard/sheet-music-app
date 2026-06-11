# Milestone brief — Worthiness & Access fixes (post-stress-test, 2026-06-10)

**For:** `/paul:discuss-milestone` → next milestone (suggested name: *v11.3 Worthiness & Access*).
**Sources (read all three):**
- `.paul/research/STRESS-TEST-REPORT-2026-06-10.md` (run 1, MCP layer)
- `.paul/research/STRESS-TEST-REPORT-2026-06-10-browser.md` (run 2, browser/Playwright)
- `.paul/research/BUG-cowork-chart-upload-2026-06-10.md` (David's upload dead-end)
**Oracle:** `docs/ACCESS-POLICY.md` **v0.3** — note three decisions ratified today
(D-Q1 schedule, D-Q2 anon transpose OPEN, D4-rev1 member library ✅) change how
findings below must be read.

## Triage decisions already made (Daniel, 2026-06-10)

| Finding | Disposition |
|---|---|
| BUG-3 (RUM not tenant-scoped) | **Closed, not-a-bug** — D7 ratified global ops view |
| BUG-8 (member sees library) | **Closed via policy** — D4-rev1 relaxes to member-✅. No code. |
| Browser Policy Q1 (/schedule anon redirect) | **Closed via policy** — D-Q1. No code. |
| BUG-4 (anon transpose dead) | **Real fix** — D-Q2: OPEN to anon. Not a UX gate. |
| D8 notify/publish redesign | **Separate future milestone.** Do not pull into this one. |
| F-4 duplicate June-13 setlist | Daniel deletes by hand. Not milestone work. |

## Proposed phases (by family + severity)

### Phase 1 — Anon access correctness (P1 family; prime-directive violations)
- **BUG-5** (P2→likely P1): anon `GET /api/library/file/[id]` for Storage-backed
  (`upload-*`) charts → 401 `missing_bearer`; Drive-backed → 200. New uploads are
  Storage-backed, so anon deep links to recent charts are dead. **VERIFY FIRST:**
  cold-device (empty HTTP cache) anon Perform render of an `upload-*` chart —
  blank ⇒ P1. Evidence in run 2 §BUG-5.
- **BUG-4** (P2): anon transpose dead-ends ("Waiting for scan…", 401s on
  `/api/library/chord-cache` + `/api/ai/transposer/scan`). Per D-Q2 the fix is an
  **anon path for scan + chord-cache**, with abuse protection (rate-limit
  anonymous AI-scan; mind the existing cold-load 429s in F-6 — don't double-punish).
  Authed transpose verified working — do not regress it.

### Phase 2 — Agent chart-upload path (P1; David's report)
- Primary: `import_chart_from_drive` accepts `.docx` + Google Docs, converts to
  PDF **server-side** (Drive API export / convert-on-copy). Agent passes
  references, never bytes.
- Secondary: chunked inline `upload_chart` (init/append/commit) for non-Drive
  sources.
- Out of scope: the Cowork sandbox proxy (Anthropic-side; reported separately).

### Phase 3 — Harness & hygiene (P2)
- **BUG-9**: `/test-login` missing from `proxy.ts` public allowlist
  (`publicPrefixes`) → 307 to /login before code consumption. Root cause already
  code-confirmed (run 2 §BUG-9). No end-user impact, but it broke two stress-run
  pre-flights; fix + a regression test.
- **BUG-7**: `GET /api/auth/qr?code=<malformed-with-/>` → 500; must be 4xx
  (v11.2 error contract).
- **BUG-1** (run 1): orphaned `[role-*] tiny` rows in CRC `library_index` —
  VERIFY FIRST whether `revoke_test_account`/`cleanup_all_test_data` cascade
  library uploads of revoked accounts (run 2's sweep reported `library:0` —
  confirm coverage, then delete the two orphans).

### Phase 4 — /perform performance (P2)
- **BUG-2**: p75 LCP 2600 / FCP 3012–3247 / TTFB 1398–1545 ms on the
  highest-traffic route; **CLS regressed 0.15 → 0.2 between the two runs.**
  VERIFY FIRST cold-load vs steady-state composition; suspect chart-image
  reflow for CLS. Healthy comparators: /setlists LCP 1.1s CLS 0.02.

### Phase 5 — P3 polish
- **BUG-6**: `manifest-brotherslazaroff.json` serves the HTML app shell (PWA
  install broken on broslaz). Check `proxy.ts` matcher excludes only
  `manifest.json`, not org-suffixed variants.
- **F-6**: cold landing fires `/api/auth/qr` POST → 429 then self-heals;
  `/api/web-vitals` also 429s. Rate-limit tuning or client backoff.

## Carry-forward UAT (NOT milestone-blocking — append to UAT-PENDING)
From run 2 `## INCOMPLETE`: anon recordings playback (D2 veto cell), leader-crc
authoring wall on broslaz **in the UI** (data layer ✅), Pass B offline
degradation, leader create→reorder→delete in UI, QR single-use isolated
end-to-end. Plus run 1's standing items.

## Verification expectations
Every fixed BUG gets a regression test (e2e or named probe). Phase 1 + 3 fixes
should be re-verifiable by re-running the stress prompt's relevant cells —
cite the coverage-table cell each test covers.
