# STRESS-TEST RUN 3 — Post-v11.3/v11.4 verification + D8 surface (2026-06-11)

Self-contained. Successor to runs 1–2 (2026-06-10 reports in this folder).
Oracle: `docs/ACCESS-POLICY.md` **v0.4**. Two executors split the cells:

- **Executor M (Cowork)** — MCP layer + the chunked-upload proof (MUST run from
  the Cowork sandbox; that environment IS the regression target). No browser needed.
- **Executor B (browser)** — Cowork+Chrome if `list_connected_browsers` is
  non-empty, else Claude Code + Playwright per the run-2 adapter. Viewports
  1180×820 / 390×844 / 1440×900.

Each executor: pre-flight gate (STOP loudly on missing prerequisites; document
any deviation method precisely — improvised auth via the app's own endpoints is
permitted ONLY if every token comes from the app's real flows and the method is
written down). Report appends to
`.paul/research/STRESS-TEST-REPORT-2026-06-11-run3-<M|B>.md`, BUG numbering
from **BUG-10**. Coverage table mandatory. Cleanup ledger → CLEANUP VERIFIED.

## ABSOLUTE STOP-GATES (both executors)

1. **NEVER call `publish_setlist` with `recipients` on a real setlist** — that
   now actually sends. The no-auto-blast cell tests the *refusal* path and
   `dryRun` only.
2. No real emails/push: dryRun/preview only. 3. No monitor fader/mute/matrix
   changes. 4. Everything created is test-namespaced (`uidPrefix` per executor:
   `r3m` / `r3b`) and swept; contacts you create are deleted.

## Executor M — cells

### M1. David's scenario, end-to-end (the v11.3-02 proof)
1. `import_chart_from_drive` on a Drive-hosted `.docx` (David's "Queen Jane
   Approximately.docx" if findable via search, else any Drive doc) → expect
   server-side PDF conversion, org-stamped library row.
2. Chunked path from the sandbox: generate a ~60 KB PDF locally →
   `begin_chunked_chart_upload` → `append_chart_upload_chunk` ×N →
   `commit_chunked_chart_upload` → verify via `search_library` + `get_chart_status`.
3. Bond the resulting songId to a TEST setlist row (create your own isTest
   setlist; never touch real setlists). Then delete chart + setlist.

### M2. D8 no-auto-blast contract
- `publish_setlist` on your own isTest setlist with NO `recipients` → expect
  structured refusal (`recipients_required`), nothing sent.
- `preview_publish` → expect candidate audience derivation + `savedContacts[]`
  array present. Record audience sizes per org (post-backfill: both orgs should
  derive the unified roster; flag counts for Daniel's eyes, not as bugs).

### M3. Contacts CRUD + tenancy
- `create_contact` (test-named) on CRC bearer; `list_contacts` on BOTH bearers
  → the contact must appear ONLY org-scoped (CRC yes, broslaz no). Mirror-test
  one on broslaz. `delete_contact` both. Org leakage here = P1 (new D8 invariant).

### M4. Regression spot-checks (MCP)
- `GET /api/auth/qr?code=..%2Fetc`-class malformed → 400 not 500 (BUG-7).
- `sweep_orphan_test_data` dry-run-style: confirm the two old `[role-*] tiny`
  orphans are GONE from `search_library` (BUG-1 closed in v11.3-03).
- v11.2 error-contract spot-checks still hold (structured 404s, ISO timestamps).
- Writes land in the bearer org (create+delete one isTest setlist per bearer;
  NOTE: cross-org authoring DENIAL is obsolete post-v11.4-04 — do not file it).

## Executor B — cells

### B1. v11.3 fix regressions (anon, both hosts)
- Storage-backed chart deep link `/api/library/file/upload-*` → 200 PDF anon (BUG-5).
- Anon transpose: full flow → chords detected + notation transposes; console
  free of 401s; hammer it lightly to confirm the anon `ai` rate-limit responds
  4xx-graceful, not 500 (BUG-4).
- `/test-login` reachable signed-out (BUG-9) — verify via a fresh loginable account end-to-end.
- broslaz PWA manifest fetch → valid JSON (BUG-6). Cold landing: no 429s on
  qr/web-vitals (F-6).
- `/perform` CLS at 1180×820: visually stable + `get_web_vitals_summary` p75
  trend (BUG-2: CLS should be heading to ~0; LCP/TTFB note trend only).

### B2. Carry-forward UAT cells (runs 1–2 INCOMPLETE)
- Anon recording playback (D2 cell — still the open copyright-comfort veto; report what anon can play).
- Offline degradation mid-Perform (devtools offline → graceful?).
- Leader UI walk: create → add 3 → reorder → delete in the UI (test leader).
  Post-v11.4-04 the leader should see authoring affordances on BOTH hosts —
  verify, and verify the created setlist lands in the HOST org.
- QR single-use isolated: claim a code end-to-end, then prove reuse fails (410).
- `/manage` People render is Daniel-only UAT (admin) — skip, note ⏭.

### B3. D8 browser surface
- PublishDialog: v11.4 shipped contacts as MCP-only after finding PublishDialog
  is ORPHANED (mounted nowhere). Verify from the UI: is there any browser path
  that auto-sends without explicit recipients? (Expect: no publish UI at all,
  or one that requires selection. Any auto-send path = P0.)

### B4. v11.5-01 H4 — Perform-setlist nav branding tenancy (anon, both hosts)
- On **brotherslazaroff.live**, open a real setlist's Perform view
  `/perform/setlist/<id>` signed-out → the top nav must show the Brothers
  Lazaroff brand (the white/blue wordmark, or the "BL" monogram fallback) +
  "Brothers Lazaroff"; it must **never** show "CRC Music" or the CRC `/logo.jpg`,
  including on first paint (no CRC→BL flash). Then visit the
  `/perform/setlist/<id>/track/<trackId>` sub-route → same BL brand (one layout
  covers both). **Any "CRC Music"/CRC logo on a broslaz route = P1 tenancy leak
  (oracle invariant-1).**
- Repeat on **centralreform.live** `/perform/setlist/<id>` → CRC brand
  ("CRC Music" + `/logo.jpg`) unchanged / byte-identical to today.
- Regression-proven by `src/app/perform/setlist/__tests__/layout.test.tsx`
  (server-prop level); this cell is the live first-paint visual confirm.

## Report

Same contract as runs 1–2: summary w/ severity counts + worthiness delta vs
run 2's 7.5/10 · findings (VERIFY FIRST, no fix prescriptions) · policy
questions · coverage table mapping every cell above · cleanup ledger →
CLEANUP VERIFIED. Flag explicitly: which v11.3/v11.4 fixes are CONFIRMED DEAD
(regression-proven) vs merely untested.
