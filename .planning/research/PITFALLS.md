# Pitfalls Research

**Domain:** Worship music performance app (Next.js / Firebase / PDF pipeline)
**Researched:** 2026-03-01
**Confidence:** HIGH (grounded in codebase inspection + domain knowledge)

## Critical Pitfalls

### Pitfall 1: Adding `tune` field to SetlistTrack without migration breaks existing documents

**What goes wrong:**
A new `tune` (or `arrangement`) field is added to the `SetlistTrack` interface and the editor UI, but the hundreds of existing tracks stored in Firestore have no `tune` field. Components that read `track.tune` render `undefined` or blank. Worse, the print pipeline's `computeContentHash` does not include `tune` in its hash computation, so adding the field later invalidates no caches --- musicians get stale printed outlines missing tune names even after data is updated.

**Why it happens:**
Firestore is schemaless. There is no migration step when you add a TypeScript field. Developers add the field to `SetlistTrack` in `src/types/models.ts`, update the editor form, and assume it flows through. But existing documents in Firestore never get the field, the Zod schema in `src/types/schemas.ts` needs a `.nullish().catch(undefined)` entry, the print pipeline's `PrintTrack` interface needs the field, and the cover page renderer needs to display it in a new column.

**How to avoid:**
1. Add `tune` to `SetlistTrack` in `models.ts` as `tune?: string` (optional, backward-compatible).
2. Add a matching `.nullish().catch(undefined)` entry in `setlistTrackSchema` in `schemas.ts` --- the `.passthrough()` on the schema will not surface the field as typed without this.
3. Add `tune` to `PrintTrack` in `print-pipeline.ts` and include it in the cover page column layout.
4. Add `tune` to `computeContentHash` so changing a tune name invalidates the PDF cache.
5. Update the clone/template functions in `setlist-firebase.ts` so `tune` is preserved when cloning for next week.
6. Do NOT run a backfill migration on existing docs. Since the field is optional and the Zod schema catches undefined, old documents render cleanly with blank tune. The band leader fills it in manually as they edit each setlist.

**Warning signs:**
- Cover page outline shows blank where tune name should be.
- Printed outline from cache does not show tune even after editing track.
- Clone-for-next-week loses tune data.
- `setlistTrackSchema` parse output silently drops the `tune` field because it is not in the schema (the `.passthrough()` keeps it in raw data but it is not typed).

**Phase to address:**
Phase 1 (Outline Features) --- this is the first feature being built.

---

### Pitfall 2: Redesigning live performance view without testing on actual music stands

**What goes wrong:**
The performance view gets redesigned for "glanceability" on a developer's laptop, but musicians use phones propped on music stands at arm's length in dim lighting. Text that looks fine at 14px on a desktop is unreadable at 2-3 feet. Key badges and lead musician names become invisible. The current view (in `src/app/perform/setlist/[id]/page.tsx`) uses `text-[10px]` for section headers, track type labels, and reference links --- these are already borderline for stage use.

**Why it happens:**
Developers test in Chrome DevTools responsive mode, which simulates screen dimensions but not viewing distance. A phone at 12 inches (hand-held) is different from a phone propped on a music stand at 24-36 inches. Additionally, worship services happen in rooms with mixed lighting --- overhead stage lights wash out screens, and sanctuary lighting varies from bright daytime to dim evening Shabbat services.

**How to avoid:**
1. Define minimum font sizes for stage use: 16px minimum for primary info (tune name, key), 14px minimum for secondary info (lead musician), nothing below 12px.
2. Test with an actual phone on an actual music stand. Print a test screenshot at the device's physical size and tape it to a stand --- can you read it from 3 feet?
3. Prioritize information hierarchy: Tune name and Key must be readable at a glance. Lead musician is nice-to-have. Notes, BPM, and reference links are drill-down only.
4. Use high-contrast color pairs. The current `text-muted-foreground` on `bg-background` may not have sufficient contrast under stage lighting.
5. The current view has `max-w-[80px] truncate` on lead musician badges. If the redesign adds a tune column, truncation will make critical info unreadable.

**Warning signs:**
- Musicians still bring the printed Excel spreadsheet to services despite the app being available.
- Band leader asks "what tune is that?" during rehearsal while looking at the app.
- Any text element using `text-[10px]` or `text-xs` for information that musicians need at a glance.

**Phase to address:**
Phase 2 (Live Performance View Redesign) --- but prototype and test with musicians in Phase 1 if possible.

---

### Pitfall 3: Fixing `as any` in bulk creates type errors that break the build

**What goes wrong:**
A developer replaces 30+ `as any` assertions in one commit. Half of them expose genuine type mismatches that have been silently working at runtime --- Firestore Timestamps cast to `any` to access `.seconds`, React component props typed incorrectly, API response shapes that drift from their declared types. The build breaks. The developer adds `@ts-expect-error` or introduces new (correct but complex) types that other team members do not understand.

**Why it happens:**
The `as any` casts in this codebase fall into distinct categories that require different fixes:
- **Firestore Timestamp access** (`(value as any).seconds`): Needs the `FirestoreDate` type guard from `models.ts` or the `toDate()` helper from `firestore-helpers.ts`. Already partially solved but inconsistently applied.
- **Component prop drilling** (e.g., `initialSetlists as any` in `setlists/page.tsx`): Server Components pass serialized data to Client Components. The serialization strips Timestamp methods. Fix requires ensuring server-side data is pre-serialized.
- **API route responses** (`assignments as any[]`): Response shapes vary between Firestore Admin SDK and client SDK. Need shared types or Zod validation at the boundary.

Fixing them all at once creates a massive, unreviewable diff.

**How to avoid:**
1. Categorize the 38 `as any` instances by root cause (Firestore Timestamps, prop drilling, API shapes, genuine unknown data).
2. Fix one category per commit. Start with Firestore Timestamps since there is already a `toDate()` helper and `FirestoreDate` type.
3. For each fix, verify the runtime behavior has not changed --- add a test or at minimum a console assertion.
4. Leave `as any` in place for intentionally dynamic code (e.g., Zod's `z.custom<any>` in `schemas.ts` line 5) --- annotate these with `// Intentional: Zod requires any for custom validators`.
5. Never fix `as any` in the same PR as a feature change. Type safety is a standalone concern.

**Warning signs:**
- A PR that touches 15+ files to "fix types" without tests.
- `@ts-expect-error` or `@ts-ignore` appearing where `as any` was removed.
- Build failures on Vercel after merging type fixes that passed locally (different TS strictness settings).

**Phase to address:**
Dedicated technical debt phase, after outline features ship but before live view redesign. The live view redesign will touch many of the same files, so type safety should be resolved first to avoid merge conflicts.

---

### Pitfall 4: Print pipeline cache invalidation misses new fields

**What goes wrong:**
The `computeContentHash` in `src/lib/print-pipeline.ts` (line 73-86) only includes `fileId`, `transposition`, `preferFlats`, and `capoFret` in its hash. It omits `title`, `key`, `leadMusician`, `notes`, `type`, `performer`, and `estimatedMinutes`. If a band leader changes a song's key or lead musician assignment and reprints, they get the cached PDF with the old cover page because the hash has not changed.

The hash also omits the `tune` field that is about to be added. A musician could update the tune name, reprint, and get a stale outline.

**Why it happens:**
The hash was originally designed to detect changes that affect the PDF chart pages (transposition settings). The cover page outline was a secondary concern. But now that the outline is becoming the primary output --- "the thing musicians actually look at" --- the hash needs to include all cover page data.

**How to avoid:**
1. Immediately expand `computeContentHash` to include all fields that appear on the cover page: `title`, `key`, `leadMusician`, `tune`, `notes`, `type`, `performer`.
2. Add a version number to the hash computation so future field additions automatically invalidate old caches: `const CACHE_VERSION = 2` prepended to the hash input.
3. Consider whether result caching is still the right strategy. With 5-10 musicians and infrequent prints, cache misses have minimal cost. An aggressive cache may cause more confusion than it saves in generation time.
4. Add a "force regenerate" option to the print UI so musicians can bypass the cache when they know something changed.

**Warning signs:**
- Band leader edits a setlist, reprints, and the outline shows old data.
- `stats.fromResultCache: true` in logs when the user just made edits.
- Adding a new field to `PrintTrack` without also adding it to `computeContentHash`.

**Phase to address:**
Phase 1 (Outline Features) --- must be fixed when adding the tune field, or the outline feature will ship broken.

---

### Pitfall 5: Silent `.catch(() => {})` patterns hide failures in the publish pipeline

**What goes wrong:**
The publish flow (`src/app/api/setlist/publish/route.ts`) uses `Promise.all` at line 214 to run usage recording and email sending in parallel. If email delivery fails, the user sees "Published successfully" but musicians never receive the notification. The 7 remaining `.catch(() => {})` patterns (down from 40+ previously) in auth context, QR routes, and storage cleanup mean that failures in authentication, session management, and offline caching are invisible.

In the context of a live worship service, this is not just a debugging inconvenience. If the band leader publishes the updated setlist before a Bat Mitzvah and the email silently fails, musicians arrive with the wrong outline.

**Why it happens:**
Fire-and-forget patterns are convenient when you want "best effort" behavior. But the codebase applies `.catch(() => {})` uniformly to both critical paths (email delivery, Firestore writes) and genuinely optional paths (analytics, cache pre-warming). There is no distinction between "this failure is fine" and "this failure must be surfaced."

**How to avoid:**
1. Classify each silent catch into three categories:
   - **Critical**: Must surface to user (email delivery, Firestore writes, auth operations). Replace with proper error handling and user-facing error messages.
   - **Degraded**: Should log but not block (cache writes, analytics, cleanup). Replace with `.catch(err => logger.warn(...))`.
   - **Intentional**: Truly fire-and-forget (cleanup of already-deleted resources, expected permission errors). Keep the silent catch but add a comment: `// Expected: Firestore rules block client-side task deletion`.
2. In the publish route specifically: separate the critical email result from the optional usage recording. If email fails, surface it: "Published, but notification emails failed to send."
3. Add a `criticalCatch` utility that logs and re-throws, vs a `silentCatch` utility that logs and swallows. Grep for bare `.catch(() => {})` in CI.

**Warning signs:**
- Musicians say "I didn't get the email" after publication.
- Firestore writes silently fail and the UI shows stale data (e.g., `use-upcoming-prep.ts` line 59).
- QR login sessions fail to clean up (`api/auth/qr/route.ts` line 103) and orphaned sessions accumulate.

**Phase to address:**
Phase 1 (Critical Stability) --- fix the publish route's error handling before the Bat Mitzvah. Remaining catches can be addressed in the technical debt phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `JSON.parse(JSON.stringify(data))` for Firestore sanitization (setlist-firebase.ts line 50, 98) | Strips `undefined` values that Firestore rejects | Silently drops Date objects, functions, and any non-JSON-serializable values. A Firestore Timestamp in `additionalData` becomes `{}` | Never in production paths. Use a dedicated `stripUndefined()` utility that preserves Dates and Timestamps. |
| `.passthrough()` on all Zod schemas (9 instances in schemas.ts) | Future fields do not break parsing | Unknown fields pass through unvalidated. If a typo creates `tuen` instead of `tune`, it persists in Firestore forever with no warning. New fields get no type safety until explicitly added to the schema. | During active development when schema is unstable. Remove passthrough once the schema stabilizes. |
| `data()!` non-null assertions on Firestore document reads (publish route line 60, QR route line 98) | Avoids null-checking boilerplate | Runtime crash if document is missing or corrupted. Firestore documents can be deleted between the exists check and the data access in a race condition. | Never. Always check `data()` result and handle null. |
| Fire-and-forget chord cache writes (`cacheChords().catch(...)` in print-pipeline.ts line 600) | Print job completes faster | If cache write fails, the next print re-extracts chords (wasting AI credits and time). No monitoring of cache write failure rate. | Acceptable if cache miss cost is low. Currently chord extraction uses Gemini API calls which are not free. Add monitoring. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firestore Timestamps in Server Components | Passing Firestore Timestamps directly from Server Components to Client Components. `Timestamp.toDate()` is a method that gets stripped during RSC serialization, leaving a plain `{seconds, nanoseconds}` object that breaks `toDate()` calls in client code. | Call `toDate()` on the server side before passing data to Client Components. Use the existing `toDate()` helper from `firestore-helpers.ts` at the Server/Client boundary. |
| PDF cache in Firebase Storage | Assuming cached PDFs are always valid. The cache key does not include all cover-page-relevant fields. Also, Firebase Storage has no built-in TTL --- cached PDFs accumulate forever. | Include a `CACHE_VERSION` in the hash. Add a lifecycle rule to the Storage bucket to delete objects older than 30 days. Or, delete cached PDFs when a setlist is updated. |
| Resend email delivery | Treating the Resend API response as confirmation of delivery. Resend returns `200` when the email is accepted for delivery, not when it is delivered. Bounces and rejections come via webhooks, which the codebase partially handles. | Check email status via the Resend webhook handler. Surface "pending" vs "delivered" vs "bounced" in the publish confirmation UI. The `PublishDialog` already tracks email events but the status display may not be visible enough. |
| Google Drive file fetching in print pipeline | Assuming Drive API responses are immediate. Large PDFs or slow connections cause the `fetchFileById` call to time out in the print pipeline, failing the entire job. | The existing `fetchFileById` has a Storage-first strategy (faster) with Drive fallback. Ensure timeouts are set on Drive API calls. The pre-extraction warmup (`preExtractChords`) helps but only for chord data, not the PDF bytes themselves. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 Firestore reads in print pipeline | Print takes 10+ seconds for a 20-track setlist because each track checks chordData subcollection individually (print-pipeline.ts line 94-100) | Batch-load all chordData in a single `collectionGroup` query or use `Promise.all` on the chord cache reads instead of sequential awaits in the track loop | With any setlist over 10 tracks. Already noticeable in production. |
| Cover page overflow with long setlists | Cover page truncates at `yOffset < 60` (print-pipeline.ts line 293). A 30-track setlist loses the last tracks from the outline. No second cover page is generated. | Add page overflow logic: when yOffset is exhausted, start a new cover page. Or reduce row height for large setlists. | Saturday morning services with 25-30 items (songs + liturgical elements). Current cutoff is roughly 35 rows. |
| Multiple simultaneous Firestore subscriptions in MusicianPicker | MusicianPicker (855 lines) opens 3-4 concurrent subscriptions: musicians, assignments, blockouts, email events. Each subscription triggers state updates, causing cascading re-renders. | Consolidate into a single composite hook that batches state updates. Use `useSyncExternalStore` or Zustand slice instead of multiple `useState` + `useEffect` pairs. | Already happening --- picker is slow to load on first open. Gets worse with more musicians. |
| Synchronous PDF generation blocking server | pdf-lib operations are synchronous. A 20-track setlist with transposition generates ~50MB of intermediate buffers on the main thread. | Move PDF generation to an Inngest background job (already in the stack). Return a job ID to the client and poll for completion. The print-pipeline already has progress reporting. | With concurrent print requests from multiple musicians printing simultaneously before a service. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `initAdmin()` returns `false` but callers do not check (print-pipeline.ts line 497 calls `initAdmin()` but ignores the return value) | In preview/staging deployments without credentials, the pipeline continues execution and hits cryptic Firestore errors instead of failing fast | Check the return value of `initAdmin()`. Return a clear 503 "Service unavailable" from API routes when Admin SDK is not initialized. |
| QR code session with 6 alphanumeric characters after filtering (qr/route.ts line 26) | 36^6 = ~2.2 billion possibilities, but with high session volume and no rate limiting on the QR poll endpoint, brute-force is feasible. The code is also the full authentication token --- no second factor. | Add rate limiting on the QR poll endpoint. Track failed attempts per session. Add HMAC or timestamp component to the code. Expire codes after 2 minutes instead of allowing indefinite polling. |
| `JSON.parse(JSON.stringify(data))` as "sanitization" (setlist-firebase.ts line 50) | This is not sanitization. It strips functions and symbols but does not prevent Firestore injection (overwriting system fields like `ownerId`) or XSS in string fields. The `additionalData` parameter is spread directly into the document. | Validate `additionalData` against the `setlistSchema` before writing. Whitelist allowed fields. Never spread user-provided data directly into Firestore documents. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing the full chart as default in performance view | Musicians scroll through 3-page PDF charts they already know by heart while trying to find the next song in the setlist. The chart obscures the outline. | Make the outline view the default. Charts are drill-down only --- tap a song to see its chart. This is the planned redesign, but the trap is making chart access too hidden. Keep a clear "View Chart" button on each track row. |
| Tune column on printed outline is blank for most songs | Band leader adds `tune` to 5 songs but the other 25 songs have no tune name. The printed outline looks broken with sparse blank columns. | Show tune name inline with the song title (e.g., "Barchu (Friedman)") rather than as a separate column. If tune is blank, just show the title with no parenthetical. No empty cells. |
| Print outline row numbering counts headers | Cover page numbers every track including section headers, making the numbers discontinuous for songs (e.g., song 1, song 2, [HEADER], song 4). Currently the code numbers by `index + 1` including all tracks. | Either: (a) skip numbering for headers entirely (current behavior skips headers in the number column but still increments `index`), or (b) use a separate song counter that only increments for songs. The current code at print-pipeline.ts line 333 uses `index + 1` which counts headers. |
| Changed-since-published banner is too subtle during live performance | The amber "UPDATED" banner in the perform view uses `text-xs` (10-12px) and can be dismissed. If the setlist changes mid-service, musicians may not notice. | Use a persistent, non-dismissable indicator when the live setlist has unpublished changes. Consider a full-width red banner with larger text for mid-service changes. |

## "Looks Done But Isn't" Checklist

- [ ] **Tune field added to editor:** Also update `setlistTrackSchema` in schemas.ts, `PrintTrack` in print-pipeline.ts, cover page renderer, `computeContentHash`, clone-for-next-week, save-as-template, and the publish email template.
- [ ] **Cover page redesigned:** Verify it handles 30+ track setlists without truncation. Test with section headers (they take extra vertical space). Test with long tune names and long musician names simultaneously.
- [ ] **Live view redesigned for glanceability:** Test on a real phone at music-stand distance (24-36 inches). Test in both light and dark mode. Test with a service that has 30 items --- does it scroll smoothly?
- [ ] **Error handling fixed:** Verify the publish route surfaces email failures to the UI. Check that `initAdmin()` return value is respected in all API routes. Ensure no new `.catch(() => {})` patterns are introduced.
- [ ] **`as any` removed:** Verify `npm run build` passes with strict mode. Check that no `@ts-expect-error` was added as a replacement. Run `npm test` to catch runtime regressions.
- [ ] **Print cache invalidation:** After editing a setlist field that appears on the cover page, reprint and verify the new data appears. Check `stats.fromResultCache` is `false` after edits.
- [ ] **N+1 chord extraction fixed:** Measure print time for a 20-track setlist before and after. Target: under 5 seconds for a cache-warm print.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tune field missing from cache hash | LOW | Add field to `computeContentHash`, deploy. Old cached PDFs with wrong data will be replaced on next print. No data loss. |
| Live view unreadable on music stands | MEDIUM | Increase font sizes, simplify layout. But if musicians have already given up on the app and gone back to printed Excel outlines, rebuilding trust takes time. Ship a quick fix before the next service. |
| Bulk `as any` removal breaks build | LOW | Revert the commit. Re-approach one category at a time. No data loss, only lost developer time. |
| Silent email failure on publish | HIGH | If musicians missed a service update, there is no recovery --- the service already happened with the wrong setlist. Prevention is the only strategy. Add email delivery confirmation to the publish flow immediately. |
| Print pipeline cache serves stale data | LOW | Add "force regenerate" button. Clear the `print-cache/` prefix in Firebase Storage. Deploy updated hash function. |
| Cover page truncation for long setlists | LOW | Add second cover page logic. Short-term: reduce row height or font size for setlists over 25 items. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Tune field migration gaps | Phase 1: Outline Features | After adding tune, edit a track's tune, reprint, verify it appears on cover page. Clone setlist, verify tune preserved. |
| Live view unreadable at distance | Phase 2: Live View Redesign | Physical test: phone on music stand, read tune + key from 3 feet in dim lighting. |
| Bulk `as any` removal breaks build | Phase 3: Type Safety | Each category-fix PR passes `npm run build` and `npm test` independently. No single PR touches more than 5 files. |
| Cache invalidation misses new fields | Phase 1: Outline Features | Add integration test: edit track field, verify hash changes, verify new PDF generated. |
| Silent error swallowing | Phase 1: Critical Stability | After fixing publish route, send a test publish with Resend in sandbox mode. Verify failure surfaces in UI. |
| Cover page overflow | Phase 2: Print Pipeline | Test with a 35-track Saturday morning service. Verify all tracks appear on outline. |
| N+1 chord extraction | Phase 2: Print Pipeline | Benchmark: print 20-track setlist, measure wall time. Target < 5s cache-warm. |
| MusicianPicker re-render cascade | Phase 3: Technical Debt | Profile with React DevTools. Verify picker opens in < 500ms with 10 musicians. |
| Firebase Admin init not checked | Phase 1: Critical Stability | Deploy to Vercel preview without env vars. Verify 503 response instead of cryptic errors. |

## Sources

- Codebase inspection: `src/types/models.ts`, `src/types/schemas.ts`, `src/lib/print-pipeline.ts`, `src/lib/setlist-firebase.ts`, `src/app/perform/setlist/[id]/page.tsx`, `src/lib/firebase-admin.ts`, `src/app/api/setlist/publish/route.ts`, `src/app/api/auth/qr/route.ts`
- `.planning/PROJECT.md` --- project requirements and context
- `.planning/codebase/CONCERNS.md` --- known issues catalog
- Domain knowledge: worship music performance patterns, music stand ergonomics, liturgical service structures

---
*Pitfalls research for: CentralReform.Live worship music app*
*Researched: 2026-03-01*
