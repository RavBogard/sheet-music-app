# Beit Mitzvah music interface return — 2026-10-20

Implemented locally on `codex/beit-mitzvah-service-bridge` in `C:/Users/dsbog/CentralReform.live/sheet-music-service-bridge`, isolated from clean primary `master` at `ede1b8ee`. Parent Astra owns integration and release. No deploy, secret provisioning, actual setlist/resource mutation, reader edit, or Overlays edit occurred.

## Delivered

- Versioned, CRC-only dedicated-service endpoint for transactional ceremony setup, reviewed projection, and individually granted resources. Stable ceremony IDs plus durable receipts/claims handle retries/concurrent joint ceremonies. A monotonic schedule-intent fence persists before setup, including failed setup, so delayed unprocessed jobs cannot undo newer intent. Ambiguity refuses; explicit staff links win. Reschedules retain the setlist and require editor reconciliation.
- Explicit staff splits persist a known `excludedSetlistId` in a new ceremony's request/intent/link; the excluded CRC source can never be reused by that ceremony. Source matching filters it before uniqueness checks, creates/reuses a distinct service, preserves the original source and claim pointer, and still detects ordinary source ambiguity. The original student's service remains linked.
- Native source setlist/template rows, explicit configured bonds/book defaults only, confirmed 10:00/16:00 Chicago start times, no fuzzy melody selection or participant names by default.
- Source editor screen/API for deliberate row/resource approval, shared directions, rights basis, withdrawal, and optimistic schedule reconciliation. Portal-linked visits load automatically and identify the service by name/date/type; optional manual references are hidden under Advanced lookup. Human Firebase ID verification checks revocation and current source editor role; service credentials and read-only View As cannot review.
- Distinct music moment, reader unit, and portal catalog identities; no inferred cross-namespace mapping. The portal owns its catalog mapping. Source order remains authoritative; order-only changes preserve semantic approvals. Private notes never become shared directions.
- Exact-generation 4 MiB PDF/MP3 source proxy with short tickets and live grant/catalog/source rechecks before and after byte download. No public-reader grant, library membership, Drive fallback, generated voice, student upload, or live Overlays command.

Contract/provisioning/release boundaries are in [CONTRACT.md](CONTRACT.md); runtime authority is `src/lib/beit-mitzvah/contract.ts`.

## Evidence and checks

Measured in this worktree:

- `node_modules/.bin/tsc.cmd --noEmit --pretty false`: passed.
- `npm run check:types`: passed (monitor type synchronization).
- Scoped ESLint over `src/lib/beit-mitzvah`, the new API routes, and the new source review page: passed.
- `node_modules/.bin/vitest.cmd run src/lib/beit-mitzvah/access.test.ts src/lib/liturgical-templates.test.ts src/lib/mcp/__tests__/write-receipts.test.ts src/lib/api-auth.test.ts --reporter=dot`: 59 tests passed, including 5 new auth/schema/ticket/payload/editor tests.
- Isolated Firestore emulator command: `firebase emulators:exec --project demo-beit-mitzvah-bridge --config <local config with Firestore port 8188> --only firestore "node node_modules/vitest/vitest.mjs run --config vitest.emulator.config.ts src/lib/beit-mitzvah/service.emulator.test.ts --reporter=verbose"`: 19 tests passed. Covers real Firestore joint concurrency/replay, canonical-claim ambiguity, cross-tenant IDs/catalog/tracks/exclusions, retained reschedule/reconciliation/old replay, failed-newer/late-older schedule intents, equal-revision duplicates/conflicts, moving/staying-member splits before/after source date/type edits, concurrent split retries, original preservation, curated metadata/directions, independent identity namespaces, source-order preservation/identity withdrawal, and ticket revocation. The 5 affected auth/schema tests were rerun and passed after the exclusion field was added.
- Browser review with the actual source page/components/CSS and synthetic auth/API fixtures at 390 px and 1280 px: portal query links automatically loaded the service; the manual ceremony reference stayed hidden; no horizontal overflow; approve/withdraw feedback worked at both widths; reconciliation feedback worked at phone width. Screenshots are in `visual/`. This is UI fixture verification, not live authentication or external delivery.
- Impeccable mechanical detector: no findings. Preserved the incumbent design and scoped the page to native forms.

The first emulator invocation failed before testing because Windows did not recognize a forward-slash executable path. Reran through `node node_modules/vitest/vitest.mjs`; the test runs above passed. Logs are local `.beit-*.log` files.

Automatic approval review rejected cleanup commands for temporary QA files with the generic reason “blocked by policy.” The local `.beit-qa/` synthetic fixture and `.beit-firebase.json` remain untracked and excluded from the implementation commit; their servers/emulators were stopped.

Storage metadata/download are stubbed with synthetic bytes in emulator tests. Real deployed Storage delivery, production authentication/configuration, and the full portal-to-source path were not exercised. The 4 MiB cap and PDF/MP3-only support are deliberate version-1 limits; files without an exact catalog manifest remain unavailable.

## Remaining / next action

### Remote CI correction checkpoint

Draft PR #16 initially failed run `39545870780`: the bridge's two optional server variables were absent from the central environment registry/example, and the new review screen bypassed the established translation catalogue. Both are now integrated: dedicated English/Hebrew `beitMitzvah` catalogues and translator notes preserve the English workflow, and unset server configuration still disables the integration. No credential, tenancy, source setup, or resource authorization logic changed.

The same CI run exposed existing lint errors/warnings. Named two test wrappers, captured the auth test probe in an effect, declared the collection reload before its hook consumer, completed two existing dependency arrays, and removed unused lint directives. The exact CI ESLint command now passes without weakening rules; TypeScript passes. Nine affected files' test suites passed (77 tests), including the environment and full catalogue gates.

Two existing test failures were investigated separately: the reconciliation fixture clicked before its action became enabled (now waits for readiness); offline cache failure reproduced under CI's Node 22 but not local Node 24 because native Response crossed jsdom's Blob/FileReader realm. Its fixture now returns browser-response Blob bytes directly, clears its byte store, and checks the exact cached content. Both suites pass under Node 22 (28 tests). Verbose evidence stays in local `.beit-qa/`; full required remote CI must pass at the new head before release. No tests were excluded and no gate was loosened.

Final full local gated rerun: 567 files passed, two failed, three skipped; 6,379 tests passed, 19 failed, 31 skipped. All failures are existing Windows-shell cases in `scripts/__tests__/coord-status.test.ts` and `setup-coord-worktree.test.ts`: Bash strips the Windows path separators and cannot find scripts (exit 127). Those cases passed on Linux CI's original run; no shell infrastructure change is part of this correction. The local gate is not claimed green. Final exact CI ESLint and TypeScript reruns passed after the fixture correction.

Parent integrates the portal adapter against the versioned schema and runs the required independent adversarial review of both repositories. When required checks and applicable rights/release gates are satisfied, provision the dedicated server credential and explicit CRC configuration following CONTRACT.md and the source repository's existing deployment policy; this work adds no separate Daniel checkpoint. Source staff then review actual assigned services and permissions. Preserve the portal reference-playback hold and existing generated-chant release gates. Do not grant resources merely because this local implementation passes.
