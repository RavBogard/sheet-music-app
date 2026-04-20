---
phase: v45-07-library-cache-invalidation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/library/UploadDialog.tsx
  - src/hooks/use-library.ts
  - src/hooks/__tests__/use-library.test.ts
autonomous: true
---

<objective>
## Goal
After a successful upload via `UploadDialog`, make the new file appear in library search / setlist picker / chat file search **within 2 seconds**, no cold reload required.

## Purpose
Live-gig report #2 (2026-04-20, Rabbi Daniel): "when I upload new documents, they don't show up in the library or setlist etc searches immediately." Three stacked caches currently mask fresh uploads: (a) react-query `staleTime: 24h` in `use-library.ts`, (b) browser HTTP `Cache-Control: public, max-age=120`, (c) edge `s-maxage=300`. The server already calls `revalidatePath` to handle (c). This plan closes (a) + (b) on the client side, plus adds cross-tab invalidation via the existing `library-cache` BroadcastChannel (infra already shipped in v1.3).

## Output
- UploadDialog invalidates the local react-query `library` key + broadcasts to other tabs after a successful POST
- `useLibrary` subscribes to the broadcast and invalidates on message
- A regression test confirms the invalidation call fires on upload success
</objective>

<context>
@.paul/STATE.md
@src/components/library/UploadDialog.tsx
@src/hooks/use-library.ts
@src/lib/library-cache.ts
@src/app/api/library/upload/route.ts
@src/app/api/library/list/route.ts
</context>

<skills>
No UI/UX skill required — this is cache plumbing, no visible surface change.
</skills>

<acceptance_criteria>

## AC-1: Upload success invalidates local react-query cache
```gherkin
Given the user uploads a file via UploadDialog and the POST returns 2xx
When the success branch runs
Then `queryClient.invalidateQueries({ queryKey: ['library'] })` fires (exact predicate — matches all v2 entries regardless of collection/force/user)
And `useLibrary` refetches with `force=true` so the browser HTTP cache is bypassed
```

## AC-2: Upload success broadcasts to other tabs
```gherkin
Given a successful upload in tab A
When the success branch runs
Then `broadcastCacheInvalidation()` fires on the `library-cache` BroadcastChannel
And any other tab with `useLibrary` mounted refetches within one event-loop turn
```

## AC-3: useLibrary listens for cross-tab invalidation
```gherkin
Given `useLibrary` is mounted
When a `{ type: 'invalidate' }` message arrives on the `library-cache` BroadcastChannel
Then `queryClient.invalidateQueries({ queryKey: ['library'] })` fires
And the listener cleans up on unmount
```

## AC-4: Regression test
```gherkin
Given the UploadDialog test renders the component
When a successful upload is simulated (fetch returns 2xx)
Then queryClient.invalidateQueries is called with queryKey including 'library'
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Invalidate + broadcast on upload success in UploadDialog</name>
  <files>src/components/library/UploadDialog.tsx</files>
  <action>
    In `UploadDialog.tsx`:
    1. Import `useQueryClient` from `@tanstack/react-query` and `broadcastCacheInvalidation` from `@/lib/library-cache`.
    2. Inside the component, call `const queryClient = useQueryClient()`.
    3. In `handleUpload`, after the `setSuccess(true)` line and BEFORE `onUploadComplete?.(...)`, add:
         queryClient.invalidateQueries({ queryKey: ['library'] })
         broadcastCacheInvalidation()
       Ordering: invalidate local first (instant, same-tab), then broadcast.

    Do NOT:
      - Remove or change the existing `onUploadComplete` callback invocation
      - Touch any UI copy (success toast stays)
      - Modify the fetch/abort logic
      - Change setTimeout for dialog close
  </action>
  <verify>
    npx tsc --noEmit
    rg "invalidateQueries.*library" src/components/library/UploadDialog.tsx
  </verify>
  <done>AC-1 + AC-2 satisfied — local invalidation + cross-tab broadcast fire on success</done>
</task>

<task type="auto">
  <name>Task 2: Subscribe to invalidation in useLibrary</name>
  <files>src/hooks/use-library.ts</files>
  <action>
    In `useLibrary`:
    1. Import `useQueryClient` from `@tanstack/react-query` and `listenForCacheInvalidation` from `@/lib/library-cache`.
    2. Inside the hook, add `const queryClient = useQueryClient()`.
    3. Add a useEffect that calls listenForCacheInvalidation with a callback that invalidates queryKey=['library']. Return the cleanup function from the effect.

    The `force=true` bypass for the browser HTTP cache is already implemented via the queryKey encoding `force` and the `fetchLibrary` no-store branch. When we invalidate, react-query will refetch with whatever queryKey is currently mounted — so to force the refetch to bypass the browser cache, we need to call `queryClient.invalidateQueries({ queryKey: ['library'] })` AND the next refetch will use the existing queryKey (with `force` passed in as mounted). This is sufficient for the gig-safe case: the upload dialog is only reachable from /library, which uses `useLibrary(force=true)` on an invalidation. Verify by reading UploadDialog's parent.

    Double-check: if `useLibrary` is mounted with `force=false` elsewhere (e.g., chat file search), invalidation will refetch through the browser HTTP cache, possibly serving stale. Mitigation (deferred if out of scope this plan): add a one-shot `force=true` refetch after invalidate. For this plan, implement basic invalidation only; note the browser-cache gap in SUMMARY.md as a deferred observation if confirmed.

    Do NOT:
      - Change the `fetchLibrary` signature or the queryKey shape
      - Touch the `hydrate` flow
      - Disable the 24h staleTime (invalidation overrides staleTime per react-query semantics)
  </action>
  <verify>
    npx tsc --noEmit
    rg "listenForCacheInvalidation" src/hooks/use-library.ts
  </verify>
  <done>AC-3 satisfied — hook subscribes + invalidates + cleans up</done>
</task>

<task type="auto">
  <name>Task 3: Regression tests</name>
  <files>src/hooks/__tests__/use-library.test.ts</files>
  <action>
    Append a new `describe("invalidation on broadcast (v45-07)", ...)` block:
      - Mock `listenForCacheInvalidation` from `@/lib/library-cache` via vi.hoisted
      - Mock queryClient.invalidateQueries
      - Render the hook
      - Grab the callback passed to listenForCacheInvalidation (via the mock's `.mock.calls[0][0]`)
      - Invoke the callback
      - Assert invalidateQueries was called with queryKey=['library']
      - Unmount and assert the cleanup function was called

    Keep the existing tests in the file intact.
  </action>
  <verify>
    npx vitest run src/hooks/__tests__/use-library.test.ts
    npm test 2>&1 | tail -5
  </verify>
  <done>AC-4 satisfied — regression coverage for invalidation</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- The upload API route — it already does revalidatePath
- react-query staleTime config
- Fuse.js search in library-store
- library-cache.ts (infra stable, just using it)
- Any UI copy or success visuals

## SCOPE LIMITS
- No IDB changes (library-cache.ts's IDB layer is currently vestigial — out of scope to rip out)
- No server-side changes
- No chat file search subscription work (useLibrary refactoring covers it implicitly since chat uses the same hook)
- No handling of upload-error paths (those already toast; invalidation only fires on success)
- No optimistic UI of the uploaded file appearing pre-refetch (deferred — 2s refetch is fast enough)

</boundaries>

<verification>
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm test` — full suite green
- [ ] `npx next build` — build passes
- [ ] Manual grep: invalidateQueries + broadcastCacheInvalidation in UploadDialog
- [ ] Manual grep: listenForCacheInvalidation in use-library
</verification>

<success_criteria>
- Upload success invalidates local cache + broadcasts to other tabs + refetches library list
- Regression tests assert the invalidation fires
- Zero tsc errors, suite green, next build passes
- SUMMARY.md notes the browser-HTTP-cache nuance if relevant
</success_criteria>

<output>
`.paul/phases/v45-07-library-cache-invalidation/v45-07-SUMMARY.md`
</output>
