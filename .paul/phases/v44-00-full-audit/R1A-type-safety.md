# Full-Project Type Safety & Schema Drift Audit (v4.4)

Comprehensive code-level sweep for type safety violations, schema mismatches, unvalidated Firestore reads, nullability inconsistencies, date/timestamp shape divergence, and validation gaps.

**Audit Date:** April 14, 2026 | **Scope:** src/**/*.ts{,x} | **Items:** 37 issues

---

## CATEGORY T: TYPE ANNOTATIONS & ANY CASTS

### T-001: Server-side .data() as any without Zod validation
- **Where:** src/app/(main)/setlists/[id]/page.tsx:33
- **Smell:** const data = doc.data() as any — Firestore read with no type guard
- **Risk:** Missing fields silently become undefined; components receive incomplete Setlist objects
- **Fix:** const parsed = setlistSchema.parse({ id: doc.id, ...doc.data() })

### T-002: deepSerialize() accepts any parameter and uses any loop variables
- **Where:** src/lib/server-auth.ts:73-85
- **Smell:** function deepSerialize(obj: any): any with res: any = {}
- **Risk:** No circular reference detection; Timestamp conversion via duck typing (.toDate)
- **Fix:** Add typed generics with explicit type guards for Timestamp vs other objects

### T-003: serializeSetlist() parameter untyped
- **Where:** src/lib/server-auth.ts:87
- **Smell:** export function serializeSetlist(id: string, data: any)
- **Risk:** Callers assume any Firestore data works without validation
- **Fix:** Add Zod validation before deepSerialize; return partial Setlist type

### T-004: z.any() in chat route for libraryFiles array
- **Where:** src/app/api/chat/route.ts:20-21
- **Smell:** libraryFiles: z.array(z.any()).optional()
- **Risk:** Handler assumes { id, name } shape; Zod permits any; .map() crashes on wrong type
- **Fix:** Define driveFileSchema = z.object({ id: z.string(), name: z.string(), mimeType: z.string().optional() })

### T-005: Unchecked JSON cast in chord-validate route
- **Where:** src/app/api/ai/chord-validate/route.ts:36
- **Smell:** const { image, existingChords } = await ctx.req.json() as { image: string; existingChords: ... }
- **Risk:** No validation; client sends wrong shape and code crashes on .length or .map()
- **Fix:** Move type assertion to Zod schema; pass to createApiHandler instead

### T-006: Test mocks cast as any
- **Where:** src/lib/__tests__/users-firebase.test.ts:82,311,315,321,330,339
- **Smell:** Multiple } as any casts for Firebase mock objects
- **Risk:** Test types don't match production; signature changes silently pass
- **Fix:** Use proper mock interfaces or vitest.mock() instead of inline casts

### T-007: Untyped matrixContext in chat store
- **Where:** src/lib/chat-store.ts:34
- **Smell:** matrixContext?: { columns: any[]; rows: any[]; grid: any }
- **Risk:** No shape validation on any three properties
- **Fix:** Define MatrixContext interface with proper nested types

### T-008: SetlistMatrixView grid inner value is any
- **Where:** src/components/setlist/v2/SetlistMatrixView.tsx:22
- **Smell:** Record<string, Record<string, { track: any | null }>>
- **Risk:** Track objects may lack required fields; rendering dereferences unsafely
- **Fix:** Define Track interface; type as Record<string, Record<string, { track: Track | null }>>

### T-009: Admin SoundSystemSection config as any
- **Where:** src/components/admin/SoundSystemSection.tsx:63
- **Smell:** const raw: any = configData || {}
- **Risk:** Unexpected config shape crashes form rendering
- **Fix:** Parse configData with Zod sound-system schema before consuming

---

## CATEGORY V: VALIDATION & API INPUT

### V-001: ai/chord-validate route has no POST schema
- **Where:** src/app/api/ai/chord-validate/route.ts:31-87
- **Smell:** No schema: option; body cast as { image, existingChords }
- **Risk:** Malformed requests crash; no size limit on base64 image
- **Fix:** Define Zod schema; pass schema: to createApiHandler

### V-002: ai/transposer route JSON.parse without try-catch
- **Where:** src/app/api/ai/transposer/route.ts:110
- **Smell:** const data = JSON.parse(cleanJson) with no error handling
- **Risk:** 500 Internal Error if AI returns malformed JSON
- **Fix:** Wrap in try-catch; return 422 with error message

### V-003: ai/transposer/scan JSON.parse crash
- **Where:** src/app/api/ai/transposer/scan/route.ts:100
- **Smell:** const chords = JSON.parse(responseText) unhandled
- **Risk:** Unhandled exception crashes route
- **Fix:** Wrap in try-catch with user-facing response

### V-004: setlists/import/parse JSON.parse returns 500 instead of 400
- **Where:** src/app/api/setlists/import/parse/route.ts:133
- **Smell:** throw new Error() on parse, caught and re-thrown
- **Risk:** User sees 500 when issue is input; not retried correctly
- **Fix:** Separate try-catch for JSON.parse; return 422

### V-005: webhooks/resend JSON.parse at function entry
- **Where:** src/app/api/webhooks/resend/route.ts:78
- **Smell:** const event = JSON.parse(body) at try block start
- **Risk:** Truncated body returns 500; Resend retries indefinitely
- **Fix:** Catch JSON.parse separately; return 400 for malformed JSON

### V-006: set-sound-engineer lacks authorization check
- **Where:** src/app/api/admin/set-sound-engineer/route.ts:25-59
- **Smell:** role: band_leader allows any band_leader to modify any user
- **Risk:** Band leader escalates another user's access
- **Fix:** Add check: if (ctx.auth.uid !== targetUserId && !ctx.auth.isAdmin) return 403

### V-007: library/archive lacks ownership check
- **Where:** src/app/api/library/archive/route.ts:22-61
- **Smell:** role: band_leader; no createdBy verification
- **Risk:** Band leader can archive any file
- **Fix:** Load doc; verify ownerId matches uid or isAdmin

### V-008: library/rename lacks ownership check
- **Where:** src/app/api/library/rename/route.ts:22-58
- **Smell:** role: band_leader; no ownership verification
- **Risk:** Band leader can rename any file
- **Fix:** Add ownership check before update

---

## CATEGORY S: SCHEMA & SHAPE DIVERGENCE

### S-001: UserRole enum mismatch across files
- **Where:** src/lib/roles.ts:25 vs src/types/models.ts:87
- **Smell:** roles.ts: 5 values (no 'denied'); models.ts: 6 values (includes 'denied')
- **Risk:** deriveRoles() doesn't handle 'denied' users correctly
- **Fix:** Unify UserRole export from roles.ts with all 6 values; add 'denied' to ROLE_HIERARCHY

### S-002: updateRoleSchema excludes 'denied'
- **Where:** src/lib/validations.ts:26
- **Smell:** z.enum(['admin', 'band_leader', 'musician', 'member', 'pending']) — no 'denied'
- **Risk:** Can't validate role='denied' updates
- **Fix:** Add 'denied' to enum

### S-003: assignmentStatusSchema catch('pending') masks corruption
- **Where:** src/types/schemas.ts:19
- **Smell:** .catch('pending') silently converts missing status
- **Risk:** Corrupted doc becomes pending; user thinks assignment open
- **Fix:** Remove catch; validate strictly; return null if missing

### S-004: chat route currentSetlist and libraryFiles use z.any()
- **Where:** src/app/api/chat/route.ts:20-21
- **Smell:** z.array(z.any()).optional()
- **Risk:** Handler type-asserts shapes; Zod permits any values
- **Fix:** Define SetlistTrack and DriveFile Zod schemas

### S-005: schedulingAssignmentSchema eventDate transform confusing
- **Where:** src/types/schemas.ts:120
- **Smell:** firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || null)
- **Risk:** Double-negative; undefined becomes null silently
- **Fix:** Use explicit z.union() for null/undefined handling

---

## CATEGORY N: NULLABILITY INCONSISTENCIES

### N-001: SetlistMusician.uid optional but filtered
- **Where:** src/types/models.ts:60-65; src/app/api/setlist/publish/route.ts:131
- **Smell:** uid?: string but code filters m => m.uid && ...
- **Risk:** Components assume every musician has uid; crash on guest musicians
- **Fix:** Either make uid required or add kind: '
