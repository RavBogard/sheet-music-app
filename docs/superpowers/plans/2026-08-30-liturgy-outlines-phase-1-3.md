# Liturgy-Aware Service Outlines (Phases 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Daniel author a service outline through Claude/MCP that carries liturgy page numbers and named honors, and print it as a rabbi's service sheet.

**Architecture:** The setlist IS the outline. Two optional fields are added to `SetlistTrack` (`liturgyRef`, `honors`) and one to `Setlist` (`book`). A checked-in, two-tier book registry (`src/data/books/`) resolves prayer names to printed page numbers at *authoring* time, so nothing at render time depends on an external repo. Existing MCP write tools widen to carry the new fields plus three orphaned ones already on the model (`performer`, `description`, `estimatedMinutes`). A new `generate_service_sheet` MCP tool renders the rabbi's paper via `pdf-lib`, alongside the existing gig-packet path.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Admin SDK (Firestore + Storage), Zod (MCP input schemas), `pdf-lib` (PDF generation), Vitest (unit + Firebase-emulator tiers).

**Spec:** `docs/superpowers/specs/2026-08-30-liturgy-outline-design.md` — read it before Task 1. This plan implements its Phases 1–3 only. Phases 4 (web lenses), 5 (cross-repo deep links), and 6 (legacy tier upgrade) get their own plans later.

## Global Constraints

- **Branch/deploy:** work on `master`; push with `git push origin master` (master is the production branch — NEVER `master:main`).
- **Gate:** `npx tsc --noEmit` + `npm test` + Vercel build. `npm run build` CANNOT run locally (`.env.local` lacks `NEXT_PUBLIC_FIREBASE_*`). There is no `typecheck` npm script; run `tsc` directly.
- **Test tiers:** `npm test` = `vitest run` (jsdom, excludes `**/*.emulator.test.ts`). `npm run test:emulator` = `firebase emulators:exec --only firestore,auth "vitest run --config vitest.emulator.config.ts"`. MCP **write**-tool tests are emulator-tier by house rule ("mocking would test the mock"). Pure functions are unit-tier.
- **pdf-lib tests require Node env:** put `// @vitest-environment node` as the first line — pdf-lib's `instanceof Uint8Array` checks break under jsdom.
- **MCP errors:** return `richError(machine_code, message, extras, hint)` from `@/lib/mcp/errors`, which yields `{ok:false, error:{...}}`. `jsonResult()` detects `ok === false` via `isErrorEnvelope()` and sets `isError: true`. NEVER emit a JSON-RPC `error.code: -32602`.
- **Import alias:** `@` → `./src`. `resolveJsonModule` is already `true` in tsconfig.
- **Hebrew does not render.** All PDF text uses `pdf-lib` `StandardFonts` (WinAnsi/CP1252). Run every string through `toWinAnsi()` from `@/lib/pdf/text-chart-pdf`. The rabbi sheet is a transliteration/English document in v1; embedding a Unicode font via `fontkit` is explicitly out of scope.
- **No Firestore rules change.** `setlists`/`tracks` rules gate by role, not by field; new optional fields need no rules deploy.
- **All new fields are optional.** Zero migration. No existing setlist changes behavior.
- **Time-dependent tests** use `vi.useFakeTimers()`.
- Do not modify the existing `SetlistTrack.pageNumber` field — it means "page of the bonded PDF chart" and is a different concept.

---

## File Structure

**Create:**
- `src/lib/books/types.ts` — `BookRegistryEntry`, `BookFile`, `BookUnit`, `PageMapEntry`, `LiturgyRef`
- `src/lib/books/registry.ts` — load + validate registry and book files; `getBook`, `listBooks`, `validateLiturgyRef`
- `src/lib/books/lookup.ts` — `lookupBookPage()` name/alias/unit matching with confidence
- `src/lib/books/__tests__/registry.test.ts`, `src/lib/books/__tests__/lookup.test.ts`
- `src/data/books/registry.json` — the five-book index
- `src/data/books/{shabbat-maariv,shabbat-shacharit,shirei-tshuvah}.json` — trimmed feed snapshots (generated)
- `src/data/books/{crc-friday,crc-saturday}.json` — hand-verified page maps
- `scripts/sync-books.mjs` — regenerate feed snapshots from the shireishabbat repo
- `src/lib/pdf/service-sheet-pdf.ts` — the rabbi-sheet renderer
- `src/lib/pdf/__tests__/service-sheet-pdf.test.ts`
- `src/lib/mcp/tools/books.ts` — `listBooksTool`, `lookupBookPageTool` handlers
- `src/lib/mcp/tools/__tests__/books.test.ts`
- `src/lib/mcp/tools/service-sheet.ts` — `generateServiceSheet` handler
- `src/lib/mcp/__tests__/mcp-service-sheet.emulator.test.ts`
- `src/lib/mcp/__tests__/mcp-outline-fields.emulator.test.ts`
- `src/lib/mcp/tools/__tests__/outline-schema-parity.test.ts`

**Modify:**
- `src/types/models.ts:36-61` (`SetlistTrack`), `:88-127` (`Setlist`)
- `src/lib/mcp/tools/index.ts:184-221` (shared patch fields), `:663-686` (create_setlist), `:944-961` (update_setlist), `:964-1013` (add_track_to_setlist), `:1016-1091` (bulk_add_tracks), `:1353-1434` (propose_setlist_changes), plus new registrations in `registerReadTools` (320-660) and `registerWriteTools` (661-3035)
- `src/lib/mcp/tools/setlist-write.ts:272-296` (`AddTrackArgs`) and its payload build
- `src/lib/mcp/server-tracks-write.ts:400-425` (`UpdateTrackPatch` + `UPDATABLE_FIELDS`), `:1429-1441` (`BulkAddTrackInput`)
- `src/lib/mcp/tools/propose-changes.ts:71-87` (`ProposalInput`) and `buildNewTrackPayload`
- `src/lib/mcp/tools/templates.ts:57-83` (`COPYABLE_TRACK_FIELDS`, `TemplateTrack`)

---

# PHASE 1 — Book Foundation

## Task 1: Book registry types and loader

**Files:**
- Create: `src/lib/books/types.ts`, `src/lib/books/registry.ts`, `src/data/books/registry.json`, `src/data/books/crc-friday.json` (stub, real data lands in Task 3)
- Test: `src/lib/books/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BookRegistryEntry`, `BookFile`, `BookUnit`, `PageMapEntry`, `LiturgyRef` types; `listBooks(): BookRegistryEntry[]`, `getBook(slug: string): BookFile | undefined`, `validateLiturgyRef(ref: LiturgyRef): {ok: true} | {ok: false, machineCode: string, message: string}`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/books/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { listBooks, getBook, validateLiturgyRef } from "../registry"

describe("book registry", () => {
    it("lists every registered book with slug, title, tier and page count", () => {
        const books = listBooks()
        expect(books.length).toBeGreaterThanOrEqual(1)
        for (const b of books) {
            expect(typeof b.slug).toBe("string")
            expect(b.slug.length).toBeGreaterThan(0)
            expect(typeof b.title).toBe("string")
            expect(["feed", "pagemap"]).toContain(b.tier)
            expect(b.pages).toBeGreaterThan(0)
        }
    })

    it("returns a book file by slug and undefined for an unknown slug", () => {
        const slug = listBooks()[0].slug
        expect(getBook(slug)?.slug).toBe(slug)
        expect(getBook("no-such-book")).toBeUndefined()
    })

    it("accepts a liturgyRef whose folio is inside the book's page range", () => {
        const book = listBooks()[0]
        expect(validateLiturgyRef({ book: book.slug, folio: 1 })).toEqual({ ok: true })
    })

    it("rejects an unknown book slug with machine code unknown_book", () => {
        const res = validateLiturgyRef({ book: "no-such-book", folio: 1 })
        expect(res.ok).toBe(false)
        expect(res).toMatchObject({ machineCode: "unknown_book" })
    })

    it("rejects a folio outside the book's page range", () => {
        const book = listBooks()[0]
        const res = validateLiturgyRef({ book: book.slug, folio: book.pages + 500 })
        expect(res.ok).toBe(false)
        expect(res).toMatchObject({ machineCode: "folio_out_of_range" })
    })

    it("rejects a folio below 1", () => {
        const book = listBooks()[0]
        expect(validateLiturgyRef({ book: book.slug, folio: 0 })).toMatchObject({
            ok: false,
            machineCode: "folio_out_of_range",
        })
    })

    it("rejects a unitId that does not exist in a feed-tier book", () => {
        const feed = listBooks().find((b) => b.tier === "feed")
        if (!feed) return // no feed books registered yet (Task 2 adds them)
        const res = validateLiturgyRef({
            book: feed.slug,
            unitId: "nope.not-a-unit@nowhere",
            folio: 1,
        })
        expect(res).toMatchObject({ ok: false, machineCode: "unknown_unit_id" })
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/books/__tests__/registry.test.ts`
Expected: FAIL — cannot resolve module `../registry`.

- [ ] **Step 3: Write the types**

Create `src/lib/books/types.ts`:

```ts
/**
 * Liturgy book registry types.
 *
 * Two tiers of book:
 *  - 'feed'    — generated from the shireishabbat Typst pipeline's JSON feed.
 *                Units carry stable AR-3 ids (`section.unit@occasion-service`)
 *                and printed folio numbers.
 *  - 'pagemap' — legacy books with no structured source. A hand-verified list
 *                of {name, aliases, page} entries, checked once against the
 *                printed book by Daniel.
 *
 * Both tiers answer the same question: "what printed page is this prayer on?"
 */

export interface BookRegistryEntry {
    /** Stable slug used by Setlist.book and SetlistTrack.liturgyRef.book. */
    slug: string
    /** Human-readable name shown on the rabbi sheet and in list_books. */
    title: string
    tier: "feed" | "pagemap"
    /** Highest printed page number in the book; upper bound for folio validation. */
    pages: number
    /** Where this data came from (feed filename, or the source PDF url). */
    source: string
}

/** A prayer/liturgical moment in a feed-tier book. */
export interface BookUnit {
    /** AR-3 stable id, e.g. 'shma.mi-chamocha@rh-shacharit'. */
    id: string
    /** Display name, e.g. 'Mi Chamocha'. */
    name: string
    /** Printed page numbers this unit spans, ascending. */
    folios: number[]
}

/** A prayer entry in a pagemap-tier book. */
export interface PageMapEntry {
    /** Display name as printed in the book, e.g. 'Mi Chamocha'. */
    name: string
    /** Alternate spellings/transliterations that should match this entry. */
    aliases: string[]
    /** Printed page number. */
    page: number
}

export interface BookFile {
    slug: string
    title: string
    tier: "feed" | "pagemap"
    pages: number
    /** Feed tier only. */
    units?: BookUnit[]
    /** Pagemap tier only. */
    entries?: PageMapEntry[]
}

/** A track's reference into a liturgy book. Mirrors SetlistTrack.liturgyRef. */
export interface LiturgyRef {
    book: string
    unitId?: string
    folio: number
}

export type LiturgyRefValidation =
    | { ok: true }
    | { ok: false; machineCode: string; message: string }
```

- [ ] **Step 4: Write the registry data files**

Create `src/data/books/registry.json`. Feed-book page counts come from the spec (§2.2); Task 2 verifies them against the real feeds and Task 3 fills in the page maps.

```json
[
    {
        "slug": "crc-friday",
        "title": "CRC Friday Siddur",
        "tier": "pagemap",
        "pages": 48,
        "source": "https://www.centralreform.org/wp-content/uploads/Friday-Siddur.pdf"
    },
    {
        "slug": "crc-saturday",
        "title": "CRC Saturday Siddur",
        "tier": "pagemap",
        "pages": 54,
        "source": "https://www.centralreform.org/wp-content/uploads/Saturday-Siddur.pdf"
    }
]
```

Create `src/data/books/crc-friday.json` as a stub with one real entry so the loader has something to load before Task 3 fills it in:

```json
{
    "slug": "crc-friday",
    "title": "CRC Friday Siddur",
    "tier": "pagemap",
    "pages": 48,
    "entries": [
        { "name": "Mi Chamocha", "aliases": ["Mi Khamokha", "Mi Chamocha Ba'elim"], "page": 1 }
    ]
}
```

Note in your commit message that the `crc-friday` page value is a placeholder replaced wholesale in Task 3.

- [ ] **Step 5: Write the registry loader**

Create `src/lib/books/registry.ts`:

```ts
import registryJson from "@/data/books/registry.json"
import crcFriday from "@/data/books/crc-friday.json"
import type {
    BookFile,
    BookRegistryEntry,
    LiturgyRef,
    LiturgyRefValidation,
} from "./types"

/**
 * Book files are imported statically (not read from disk at runtime) so they
 * bundle correctly on Vercel serverless and cost nothing per call. Add each
 * new book file to BOOK_FILES as it lands.
 */
const BOOK_FILES: Record<string, BookFile> = {
    "crc-friday": crcFriday as BookFile,
}

const REGISTRY = registryJson as BookRegistryEntry[]

export function listBooks(): BookRegistryEntry[] {
    return REGISTRY
}

export function getBook(slug: string): BookFile | undefined {
    return BOOK_FILES[slug]
}

export function getRegistryEntry(slug: string): BookRegistryEntry | undefined {
    return REGISTRY.find((b) => b.slug === slug)
}

/**
 * Validate a liturgyRef against the registry before it is written to a track.
 * A wrong page number reaching the rabbi's sheet is the one failure mode this
 * feature cannot afford, so every write goes through here.
 */
export function validateLiturgyRef(ref: LiturgyRef): LiturgyRefValidation {
    const entry = getRegistryEntry(ref.book)
    if (!entry) {
        return {
            ok: false,
            machineCode: "unknown_book",
            message: `Unknown book '${ref.book}'. Known books: ${REGISTRY.map((b) => b.slug).join(", ")}.`,
        }
    }
    if (!Number.isInteger(ref.folio) || ref.folio < 1 || ref.folio > entry.pages) {
        return {
            ok: false,
            machineCode: "folio_out_of_range",
            message: `Page ${ref.folio} is outside '${entry.slug}' (1–${entry.pages}).`,
        }
    }
    if (ref.unitId) {
        const book = getBook(ref.book)
        const known = book?.units?.some((u) => u.id === ref.unitId)
        if (!known) {
            return {
                ok: false,
                machineCode: "unknown_unit_id",
                message: `Unit '${ref.unitId}' is not in book '${ref.book}'.`,
            }
        }
    }
    return { ok: true }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/books/__tests__/registry.test.ts`
Expected: PASS (7 tests; the feed-tier test self-skips until Task 2).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/books src/data/books
git commit -m "feat(books): book registry types, loader and liturgyRef validation"
```

---

## Task 2: Feed snapshot sync script

**Files:**
- Create: `scripts/sync-books.mjs`, `src/data/books/shabbat-maariv.json`, `src/data/books/shabbat-shacharit.json`, `src/data/books/shirei-tshuvah.json`
- Modify: `src/data/books/registry.json`, `src/lib/books/registry.ts` (BOOK_FILES), `package.json` (script)
- Test: `src/lib/books/__tests__/registry.test.ts` (extend)

**Interfaces:**
- Consumes: `BookFile`, `BookUnit` from Task 1.
- Produces: three feed-tier book files whose `units[]` entries are `{id, name, folios}`; `npm run sync:books`.

**Source of truth:** the shireishabbat repo at `C:\Users\dsbog\shireishabbat`. Its `dist/*-feed.json` files have top-level keys `schemaVersion, volume, title, printing, license, sections, units, pageIndex`. A unit looks like `{"id":"emaariv.barchu@rh1-maariv","name":"Barchu","section":1,"caption":"...","folios":[2],"blocks":[...]}`. Full feeds are 287KB / 682KB / 1.05MB — we keep only `id`, `name`, `folios`.

**READ-ONLY on that repo.** Do not write to it, do not run its build.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/books/__tests__/registry.test.ts`:

```ts
describe("feed-tier book snapshots", () => {
    const FEED_SLUGS = ["shabbat-maariv", "shabbat-shacharit", "shirei-tshuvah"]

    it.each(FEED_SLUGS)("%s is registered as a feed-tier book", (slug) => {
        const entry = listBooks().find((b) => b.slug === slug)
        expect(entry).toBeDefined()
        expect(entry?.tier).toBe("feed")
        expect(entry?.pages).toBeGreaterThan(0)
    })

    it.each(FEED_SLUGS)("%s snapshot has units with ids, names and folios", (slug) => {
        const book = getBook(slug)
        expect(book).toBeDefined()
        expect(book!.units!.length).toBeGreaterThan(0)
        for (const u of book!.units!) {
            expect(u.id).toMatch(/@/) // AR-3 ids always carry an @occasion-service suffix
            expect(typeof u.name).toBe("string")
            expect(Array.isArray(u.folios)).toBe(true)
            expect(u.folios.length).toBeGreaterThan(0)
            for (const f of u.folios) expect(Number.isInteger(f)).toBe(true)
        }
    })

    it("every unit folio is within its book's declared page count", () => {
        for (const slug of FEED_SLUGS) {
            const entry = listBooks().find((b) => b.slug === slug)!
            for (const u of getBook(slug)!.units!) {
                for (const f of u.folios) {
                    expect(f).toBeGreaterThanOrEqual(1)
                    expect(f).toBeLessThanOrEqual(entry.pages)
                }
            }
        }
    })

    it("validates a real unitId from the machzor", () => {
        const book = getBook("shirei-tshuvah")!
        const unit = book.units![0]
        expect(validateLiturgyRef({
            book: "shirei-tshuvah",
            unitId: unit.id,
            folio: unit.folios[0],
        })).toEqual({ ok: true })
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/books/__tests__/registry.test.ts`
Expected: FAIL — the three feed books are not registered.

- [ ] **Step 3: Write the sync script**

Create `scripts/sync-books.mjs`:

```js
#!/usr/bin/env node
/**
 * Regenerate trimmed feed-tier book snapshots from the shireishabbat Typst
 * pipeline's JSON feeds.
 *
 * The full feeds carry every block of liturgical text (287KB–1.05MB each).
 * The outline layer only needs "which unit is on which printed page", so we
 * keep {id, name, folios} per unit and drop everything else.
 *
 * Snapshots are committed to git on purpose: the setlist path must never
 * depend on the shireishabbat repo being present, built, or deployed.
 *
 * Usage: npm run sync:books [-- --repo <path-to-shireishabbat>]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const DEFAULT_REPO = "C:\\Users\\dsbog\\shireishabbat"
const OUT_DIR = resolve(process.cwd(), "src", "data", "books")
const EXPECTED_SCHEMA_VERSION = 1

const VOLUMES = [
    { slug: "shabbat-maariv", feed: "shabbat-maariv-feed.json", title: "Shirei Shabbat — Friday Night" },
    { slug: "shabbat-shacharit", feed: "shabbat-shacharit-feed.json", title: "Shirei Shabbat — Shabbat Morning" },
    { slug: "shirei-tshuvah", feed: "shirei-tshuvah-feed.json", title: "Shirei Tshuvah — Rosh Hashanah" },
]

function repoPath() {
    const i = process.argv.indexOf("--repo")
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : DEFAULT_REPO
}

function trim(feed, vol) {
    if (feed.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
        throw new Error(
            `${vol.slug}: feed schemaVersion ${feed.schemaVersion} != expected ${EXPECTED_SCHEMA_VERSION}. ` +
                `The feed contract changed — review build/schema/feed.schema.json before re-running.`,
        )
    }
    const units = []
    let maxFolio = 0
    for (const u of feed.units ?? []) {
        const folios = (u.folios ?? []).filter((f) => Number.isInteger(f)).sort((a, b) => a - b)
        if (folios.length === 0) continue
        for (const f of folios) if (f > maxFolio) maxFolio = f
        units.push({ id: u.id, name: u.name ?? u.id, folios })
    }
    if (units.length === 0) throw new Error(`${vol.slug}: feed produced zero units`)
    return { slug: vol.slug, title: vol.title, tier: "feed", pages: maxFolio, units }
}

function main() {
    const repo = repoPath()
    const dist = join(repo, "dist")
    if (!existsSync(dist)) {
        console.error(`shireishabbat dist/ not found at ${dist}. Pass --repo <path>.`)
        process.exit(1)
    }
    const summary = []
    for (const vol of VOLUMES) {
        const feedPath = join(dist, vol.feed)
        if (!existsSync(feedPath)) {
            console.error(`missing feed: ${feedPath}`)
            process.exit(1)
        }
        const book = trim(JSON.parse(readFileSync(feedPath, "utf8")), vol)
        writeFileSync(join(OUT_DIR, `${vol.slug}.json`), JSON.stringify(book, null, 4) + "\n", "utf8")
        summary.push({ slug: book.slug, units: book.units.length, pages: book.pages })
    }
    console.table(summary)
    console.log("\nUpdate src/data/books/registry.json `pages` if any value changed above.")
}

main()
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add alongside the existing entries:

```json
"sync:books": "node scripts/sync-books.mjs",
```

- [ ] **Step 5: Run the sync script**

Run: `npm run sync:books`
Expected: a table of three rows (slug, units, pages) and three new files in `src/data/books/`. Record the printed `pages` values — you need them in the next step.

If it exits non-zero because a feed is missing, STOP and report; do not hand-write snapshot data.

- [ ] **Step 6: Register the three books**

Add three entries to `src/data/books/registry.json`, using the **actual** `pages` values printed by the script (the spec's ~76/151/202 are approximate):

```json
{
    "slug": "shabbat-maariv",
    "title": "Shirei Shabbat — Friday Night",
    "tier": "feed",
    "pages": 76,
    "source": "shireishabbat dist/shabbat-maariv-feed.json"
},
{
    "slug": "shabbat-shacharit",
    "title": "Shirei Shabbat — Shabbat Morning",
    "tier": "feed",
    "pages": 151,
    "source": "shireishabbat dist/shabbat-shacharit-feed.json"
},
{
    "slug": "shirei-tshuvah",
    "title": "Shirei Tshuvah — Rosh Hashanah",
    "tier": "feed",
    "pages": 202,
    "source": "shireishabbat dist/shirei-tshuvah-feed.json"
}
```

Then wire them into `src/lib/books/registry.ts`:

```ts
import registryJson from "@/data/books/registry.json"
import crcFriday from "@/data/books/crc-friday.json"
import shabbatMaariv from "@/data/books/shabbat-maariv.json"
import shabbatShacharit from "@/data/books/shabbat-shacharit.json"
import shireiTshuvah from "@/data/books/shirei-tshuvah.json"

const BOOK_FILES: Record<string, BookFile> = {
    "crc-friday": crcFriday as BookFile,
    "shabbat-maariv": shabbatMaariv as BookFile,
    "shabbat-shacharit": shabbatShacharit as BookFile,
    "shirei-tshuvah": shireiTshuvah as BookFile,
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/books/__tests__/registry.test.ts`
Expected: PASS, including the four new feed-tier tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/sync-books.mjs package.json src/data/books src/lib/books
git commit -m "feat(books): sync trimmed feed snapshots for the three Shirei volumes"
```

---

## Task 3: Legacy CRC page-map extraction — HUMAN GATE

**Files:**
- Modify: `src/data/books/crc-friday.json`, `src/data/books/crc-saturday.json` (create), `src/data/books/registry.json`, `src/lib/books/registry.ts`
- Create: `docs/superpowers/plans/artifacts/2026-08-30-crc-pagemap-checklist.md`

**Interfaces:**
- Consumes: `BookFile`, `PageMapEntry` from Task 1.
- Produces: two pagemap-tier book files with verified `entries[]`.

**This is the one human gate in Phases 1–3.** A wrong page number here prints a wrong page number on the shtender. Do not skip the checklist, and do not commit the maps as verified before Daniel confirms.

Sources (public):
- `https://www.centralreform.org/wp-content/uploads/Friday-Siddur.pdf` (48pp)
- `https://www.centralreform.org/wp-content/uploads/Saturday-Siddur.pdf` (54pp)

- [ ] **Step 1: Download both PDFs to the scratchpad**

```bash
curl -sSL -o "$SCRATCH/Friday-Siddur.pdf" https://www.centralreform.org/wp-content/uploads/Friday-Siddur.pdf
curl -sSL -o "$SCRATCH/Saturday-Siddur.pdf" https://www.centralreform.org/wp-content/uploads/Saturday-Siddur.pdf
```

Substitute your session's scratchpad directory for `$SCRATCH`. Verify both files are non-trivial in size before continuing.

- [ ] **Step 2: Extract the page map by reading the PDFs**

Use the Read tool with the `pages` parameter (max 20 pages per call) to read each PDF in batches: pages 1-20, 21-40, 41-48 for Friday; 1-20, 21-40, 41-54 for Saturday.

For each prayer/liturgical moment that a service outline would ever reference, record:
- `name` — the title as printed in the book
- `aliases` — alternate transliterations you can see or reasonably expect Claude to use (e.g. "Mi Chamocha" / "Mi Khamokha"); include the Hebrew string if it is legible, since aliases are matched but never printed
- `page` — **the printed page number shown on the page**, NOT the PDF page index

**Critical:** these are transliteration-first books with corrupted/non-Unicode Hebrew fonts, and the printed folio may be offset from the PDF page index (front matter, covers). Determine the offset explicitly by finding a page whose printed number you can read, and state the offset in the checklist. If a page has no printed number, record the entry with the folio derived from the offset and flag it in the checklist.

- [ ] **Step 3: Write both book files**

Write `src/data/books/crc-friday.json` (replacing the Task 1 stub) and `src/data/books/crc-saturday.json` in this shape:

```json
{
    "slug": "crc-friday",
    "title": "CRC Friday Siddur",
    "tier": "pagemap",
    "pages": 48,
    "entries": [
        { "name": "Candle Lighting", "aliases": ["Hadlakat Nerot"], "page": 4 },
        { "name": "Mi Chamocha", "aliases": ["Mi Khamokha"], "page": 23 }
    ]
}
```

(The two entries above are shape examples — use your extracted data.)

- [ ] **Step 4: Register crc-saturday and wire it into the loader**

`src/data/books/registry.json` already carries `crc-friday` and `crc-saturday` from Task 1. Confirm both `pages` values match what you observed. Then add to `BOOK_FILES` in `src/lib/books/registry.ts`:

```ts
import crcSaturday from "@/data/books/crc-saturday.json"
// ...
    "crc-saturday": crcSaturday as BookFile,
```

- [ ] **Step 5: Write the verification checklist for Daniel**

Create `docs/superpowers/plans/artifacts/2026-08-30-crc-pagemap-checklist.md` — one table per book, every entry on its own row, sorted by page:

```markdown
# CRC Siddur page-map verification

Check each printed page number against the physical book. Mark ✗ and write the
correct number for any that is wrong. Extraction offset used: printed page N =
PDF page N + <offset> (state it, per book).

## CRC Friday Siddur (48pp)

| ✓/✗ | Prayer | Page |
|-----|--------|------|
|     | Candle Lighting | 4 |
|     | Mi Chamocha | 23 |

## CRC Saturday Siddur (54pp)

| ✓/✗ | Prayer | Page |
|-----|--------|------|
|     | ... | ... |
```

Flag separately, above the tables, any entry whose page you inferred rather than read.

- [ ] **Step 6: STOP — hand the checklist to Daniel**

Report to Daniel: the checklist path, the per-book offset you used, the entry counts, and any inferred entries. **Do not proceed to Task 4 until he confirms.** Apply any corrections he returns directly to the JSON files before committing.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/books/__tests__/registry.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit (only after Daniel's confirmation)**

```bash
git add src/data/books src/lib/books docs/superpowers/plans/artifacts
git commit -m "feat(books): hand-verified CRC Friday/Saturday siddur page maps"
```

---

## Task 4: Page lookup and confidence

**Files:**
- Create: `src/lib/books/lookup.ts`, `src/lib/books/__tests__/lookup.test.ts`

**Interfaces:**
- Consumes: `getBook`, `getRegistryEntry` from Task 1; `BookFile` types.
- Produces: `lookupBookPage(book: string, query: string): LookupResult` where
  `LookupResult = { ok: false; machineCode: string; message: string } | { ok: true; matches: BookMatch[] }`
  and `BookMatch = { name: string; folio: number; unitId?: string; confidence: "high" | "medium" | "low" }`.

Confidence mirrors the MCP server's existing bond-confidence contract: `high` commits silently, `medium` commits but is surfaced in the proposal summary, `low` with more than one candidate stops and asks.

- [ ] **Step 1: Write the failing test**

Create `src/lib/books/__tests__/lookup.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { lookupBookPage } from "../lookup"

describe("lookupBookPage", () => {
    it("returns unknown_book for an unregistered slug", () => {
        expect(lookupBookPage("no-such-book", "Mi Chamocha")).toMatchObject({
            ok: false,
            machineCode: "unknown_book",
        })
    })

    it("finds a feed-tier unit by name and returns its first folio and unitId", () => {
        const res = lookupBookPage("shirei-tshuvah", "Barchu")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches.length).toBeGreaterThan(0)
        const top = res.matches[0]
        expect(top.unitId).toMatch(/@/)
        expect(top.folio).toBeGreaterThan(0)
        expect(["high", "medium", "low"]).toContain(top.confidence)
    })

    it("is case- and punctuation-insensitive", () => {
        const a = lookupBookPage("shirei-tshuvah", "barchu")
        const b = lookupBookPage("shirei-tshuvah", "Bar'chu!")
        expect(a.ok && b.ok).toBe(true)
        if (!a.ok || !b.ok) return
        expect(a.matches[0]?.unitId).toBe(b.matches[0]?.unitId)
    })

    it("matches a pagemap alias, not just the primary name", () => {
        const res = lookupBookPage("crc-friday", "Mi Khamokha")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches[0]?.name).toBe("Mi Chamocha")
        expect(res.matches[0]?.unitId).toBeUndefined()
    })

    it("returns an empty match list rather than an error when nothing matches", () => {
        const res = lookupBookPage("crc-friday", "Zzzz Not A Prayer")
        expect(res).toMatchObject({ ok: true })
        if (!res.ok) return
        expect(res.matches).toEqual([])
    })

    it("marks a single exact match high and multiple partial matches low", () => {
        const exact = lookupBookPage("crc-friday", "Mi Chamocha")
        expect(exact.ok).toBe(true)
        if (!exact.ok) return
        expect(exact.matches[0].confidence).toBe("high")
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/books/__tests__/lookup.test.ts`
Expected: FAIL — cannot resolve `../lookup`.

- [ ] **Step 3: Write the lookup implementation**

Create `src/lib/books/lookup.ts`:

```ts
import { getBook, getRegistryEntry } from "./registry"

export interface BookMatch {
    name: string
    folio: number
    unitId?: string
    confidence: "high" | "medium" | "low"
}

export type LookupResult =
    | { ok: false; machineCode: string; message: string }
    | { ok: true; matches: BookMatch[] }

/** Fold case, strip punctuation/diacritics-ish noise, collapse whitespace. */
function norm(s: string): string {
    return s
        .toLowerCase()
        .replace(/['’`"]/g, "")
        .replace(/[^a-z0-9\u0590-\u05FF]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
}

const MAX_MATCHES = 8

/**
 * Resolve a prayer name to printed page number(s) in one book.
 *
 * Exact normalized match on a name or alias → 'high' when it is the only exact
 * hit, 'medium' when several entries match exactly (a book with two settings of
 * the same prayer). Substring matches are 'medium' alone, 'low' when there are
 * several — which is the signal for the caller to stop and ask Daniel rather
 * than guess a page.
 */
export function lookupBookPage(book: string, query: string): LookupResult {
    const entry = getRegistryEntry(book)
    if (!entry) {
        return {
            ok: false,
            machineCode: "unknown_book",
            message: `Unknown book '${book}'. Call list_books for valid slugs.`,
        }
    }
    const file = getBook(book)
    if (!file) {
        return {
            ok: false,
            machineCode: "book_data_missing",
            message: `Book '${book}' is registered but its data file is not loaded.`,
        }
    }

    const q = norm(query)
    if (!q) return { ok: true, matches: [] }

    const exact: BookMatch[] = []
    const partial: BookMatch[] = []

    const consider = (
        name: string,
        candidates: string[],
        folio: number,
        unitId?: string,
    ) => {
        const normed = candidates.map(norm)
        if (normed.some((c) => c === q)) {
            exact.push({ name, folio, unitId, confidence: "high" })
        } else if (normed.some((c) => c.includes(q) || q.includes(c))) {
            partial.push({ name, folio, unitId, confidence: "medium" })
        }
    }

    if (file.tier === "feed") {
        for (const u of file.units ?? []) {
            consider(u.name, [u.name, u.id], u.folios[0], u.id)
        }
    } else {
        for (const e of file.entries ?? []) {
            consider(e.name, [e.name, ...e.aliases], e.page)
        }
    }

    if (exact.length > 1) for (const m of exact) m.confidence = "medium"
    if (exact.length === 0 && partial.length > 1) for (const m of partial) m.confidence = "low"

    return { ok: true, matches: [...exact, ...partial].slice(0, MAX_MATCHES) }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/books/__tests__/lookup.test.ts`
Expected: PASS.

If the "Barchu" test fails because that unit name differs in the real snapshot, open `src/data/books/shirei-tshuvah.json`, pick a real unit name, and use it in the test — do not weaken the assertion.

Run: `npx tsc --noEmit` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/books
git commit -m "feat(books): name/alias page lookup with match confidence"
```

---

# PHASE 2 — Model + MCP

## Task 5: Model fields and the Firestore write path

**Files:**
- Modify: `src/types/models.ts:36-61` and `:88-127`; `src/lib/mcp/server-tracks-write.ts:400-425`
- Test: `src/lib/mcp/__tests__/mcp-outline-fields.emulator.test.ts` (create)

**Interfaces:**
- Consumes: `LiturgyRef` shape from Task 1 (declared structurally in models.ts to keep `src/types` dependency-free).
- Produces: `SetlistTrack.liturgyRef`, `SetlistTrack.honors`, `Setlist.book`; `UPDATABLE_FIELDS` extended with the five outline fields.

The write path has no schema validator — it uses a literal `UPDATABLE_FIELDS` allowlist plus per-field `!== undefined` guards. A field absent from that array is silently dropped, which is exactly why `pageNumber` is inert today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/__tests__/mcp-outline-fields.emulator.test.ts`. Model the setup on `src/lib/mcp/__tests__/mcp-setlist-write.emulator.test.ts` (read it first — it is the canonical pattern):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi.fn().mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn(),
}))

import {
    createSetlist,
    addTrackToSetlist,
    updateSetlistTrack,
} from "../tools/setlist-write"
import { getSetlist } from "../tools/setlists"

describe("outline fields survive the MCP write path (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const db = () => getFirestore(app)

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-outline-fields" })
        await db().collection("users").doc(ADMIN).set({ displayName: "Rabbi Daniel", role: "admin" })
    })
    afterAll(async () => { await deleteApp(app) })
    beforeEach(async () => {
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    // NOTE: confirm createSetlist's success shape before relying on it. The
    // sibling suite mcp-setlist-write.emulator.test.ts has a `newSetlist()`
    // helper — copy its extraction rather than guessing between `{ok, id}` and
    // `{ok, setlist:{id}}`. Adjust the cast below to match.
    async function newSetlist() {
        const res = await createSetlist(ADMIN, {
            name: "Erev Shabbat — outline test",
            eventDate: "2026-09-04",
            book: "crc-friday",
        })
        expect(res).toMatchObject({ ok: true })
        return (res as { setlist: { id: string } }).setlist.id
    }

    it("persists book on the setlist", async () => {
        const id = await newSetlist()
        const sl = await getSetlist(ADMIN, { id })
        expect(sl).toMatchObject({ book: "crc-friday" })
    })

    it("persists liturgyRef, honors, performer, description and estimatedMinutes on add", async () => {
        const setlistId = await newSetlist()
        const res = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Candle Lighting",
            type: "reading",
            performer: "Congregation",
            description: "Blessing over the candles, read responsively.",
            estimatedMinutes: 3,
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
        })
        expect(res).toMatchObject({ ok: true })
        const trackId = (res as { trackId: string }).trackId
        const doc = await db().collection("tracks").doc(trackId).get()
        expect(doc.data()).toMatchObject({
            performer: "Congregation",
            description: "Blessing over the candles, read responsively.",
            estimatedMinutes: 3,
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
        })
    })

    it("updates outline fields through update_track's patch allowlist", async () => {
        const setlistId = await newSetlist()
        const added = await addTrackToSetlist(ADMIN, { setlistId, title: "Mi Chamocha", type: "prayer" })
        const trackId = (added as { trackId: string }).trackId
        const res = await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            patch: {
                performer: "Band",
                estimatedMinutes: 4,
                liturgyRef: { book: "crc-friday", folio: 23 },
            },
        })
        expect(res).toMatchObject({ ok: true })
        const doc = await db().collection("tracks").doc(trackId).get()
        expect(doc.data()).toMatchObject({
            performer: "Band",
            estimatedMinutes: 4,
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
    })

    it("leaves outline fields untouched when the patch omits them", async () => {
        const setlistId = await newSetlist()
        const added = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Mi Chamocha",
            type: "prayer",
            performer: "Band",
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
        const trackId = (added as { trackId: string }).trackId
        await updateSetlistTrack(ADMIN, { setlistId, trackId, patch: { key: "G" } })
        const doc = await db().collection("tracks").doc(trackId).get()
        expect(doc.data()).toMatchObject({
            key: "G",
            performer: "Band",
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:emulator -- --testNamePattern="outline fields"`
Expected: FAIL — `book`, `liturgyRef` and `honors` are not accepted or not persisted.

- [ ] **Step 3: Add the model fields**

In `src/types/models.ts`, inside `SetlistTrack` (after `pageNumber` at line 59, before `unmatched`):

```ts
    /**
     * Reference into a liturgy book (siddur/machzor) for this moment —
     * "this row is on p.<folio> of <book>". Distinct from `pageNumber`,
     * which addresses a page of this row's own bonded chart PDF.
     * `folio` is the PRINTED page number, resolved at authoring time from
     * the book registry (src/data/books) so nothing at render time depends
     * on an external repo. `unitId` is an AR-3 stable id and is present only
     * for feed-tier books.
     */
    liturgyRef?: { book: string; unitId?: string; folio: number }
    /**
     * Named congregants honored at this moment — "Rachel Cohen, birthday,
     * lights the candles". Free-text names; not linked to contacts. Printed
     * on the rabbi's service sheet. Never copied by templates or clone.
     */
    honors?: Array<{ name: string; note?: string }>
```

In `Setlist` (after `serviceNotes` at line 108):

```ts
    /**
     * Registry slug of the liturgy book used at this service (one book per
     * service), e.g. 'crc-friday'. Optional — setlists with no book (a gig,
     * a rehearsal) behave exactly as before. See src/data/books/registry.json.
     */
    book?: string
```

- [ ] **Step 4: Extend the write allowlist and the patch type**

In `src/lib/mcp/server-tracks-write.ts`, extend `UpdateTrackPatch` (line 400-414) with:

```ts
    /** Service-flow fields — on the model since v6 but unreachable via MCP until now. */
    performer?: string
    description?: string
    estimatedMinutes?: number
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
```

And extend `UPDATABLE_FIELDS` (line 416-425):

```ts
const UPDATABLE_FIELDS = [
    "key",
    "bpm",
    "leadMusician",
    "title",
    "notes",
    "type",
    "songId",
    "referenceLink",
    "performer",
    "description",
    "estimatedMinutes",
    "liturgyRef",
    "honors",
] as const
```

Find the `FREEFORM_FIELDS` list in the same file (used near line 498-508 to apply `sanitizeFreeformString`) and add `"performer"` and `"description"` to it — they are user-authored prose and must be sanitized like `notes`. Do NOT add `liturgyRef`, `honors`, or `estimatedMinutes` there: the first two are objects and the third is numeric, and `sanitizeFreeformString` takes a string.

For `honors`, sanitize the nested strings where the patch is applied. Add this helper near `sanitizeFreeformString`'s call site in the same file and apply it when the field is `honors`:

```ts
/** Honors carry user-authored names/notes; sanitize the nested strings. */
function sanitizeHonors(
    value: unknown,
): Array<{ name: string; note?: string }> | undefined {
    if (!Array.isArray(value)) return undefined
    return value
        .filter((h): h is { name: string; note?: string } =>
            !!h && typeof h === "object" && typeof (h as { name?: unknown }).name === "string",
        )
        .map((h) => ({
            name: sanitizeFreeformString(h.name),
            ...(typeof h.note === "string" ? { note: sanitizeFreeformString(h.note) } : {}),
        }))
}
```

- [ ] **Step 5: Extend the add and bulk-add inputs**

In `src/lib/mcp/tools/setlist-write.ts`, extend `AddTrackArgs` (line 272-296) with the same five fields:

```ts
    performer?: string
    description?: string
    estimatedMinutes?: number
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
```

Then find where `addTrackToSetlist` builds the track payload (it uses explicit `if (x !== undefined)` guards) and add the same guard for each of the five fields, sanitizing `performer` and `description` with `sanitizeFreeformString` and `honors` with `sanitizeHonors`.

In `src/lib/mcp/server-tracks-write.ts`, extend `BulkAddTrackInput` (line 1429-1441) with the same five fields, and mirror the payload guards in `bulkAddTracks`.

In `src/lib/mcp/tools/setlist-write.ts`, add `book?: string` to the create/update setlist args types and persist it on the setlist doc with the same `!== undefined` guard pattern used for `rabbi`/`serviceNotes`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:emulator -- --testNamePattern="outline fields"`
Expected: PASS (4 tests).

Run: `npm test` — expected: no regressions.
Run: `npx tsc --noEmit` — expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/models.ts src/lib/mcp/server-tracks-write.ts src/lib/mcp/tools/setlist-write.ts src/lib/mcp/__tests__/mcp-outline-fields.emulator.test.ts
git commit -m "feat(outline): liturgyRef, honors and service-flow fields on the track write path"
```

---

## Task 6: Shared Zod fragment across the five write schemas

**Files:**
- Modify: `src/lib/mcp/tools/index.ts:184-221`, `:663-686`, `:944-961`, `:964-1013`, `:1016-1091`, `:1353-1434`
- Modify: `src/lib/mcp/tools/propose-changes.ts:71-87` and its `buildNewTrackPayload`
- Test: `src/lib/mcp/tools/__tests__/outline-schema-parity.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks (schema-only).
- Produces: exported `outlineFields` Zod fragment; all five write schemas accept the same outline field set.

`trackPatchFields` (index.ts:184-198) is already a shared const consumed by `bulkTrackPatchSchema` and `updateTrackPatchSchema`. Extend that pattern rather than inventing a new one.

- [ ] **Step 1: Write the failing parity test**

Create `src/lib/mcp/tools/__tests__/outline-schema-parity.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { z } from "zod"
import { outlineFields, updateTrackPatchSchema, bulkTrackPatchSchema } from "../index"

const SAMPLE = {
    performer: "Congregation",
    description: "Read responsively.",
    estimatedMinutes: 3,
    liturgyRef: { book: "crc-friday", folio: 4 },
    honors: [{ name: "Rachel Cohen", note: "birthday" }],
}

describe("outline field parity across write schemas", () => {
    it("exports every outline field", () => {
        expect(Object.keys(outlineFields).sort()).toEqual([
            "description",
            "estimatedMinutes",
            "honors",
            "liturgyRef",
            "performer",
        ])
    })

    it("update_track's patch schema accepts the full outline field set", () => {
        expect(updateTrackPatchSchema.safeParse(SAMPLE).success).toBe(true)
    })

    it("bulk_update_tracks' patch schema accepts the full outline field set", () => {
        expect(bulkTrackPatchSchema.safeParse(SAMPLE).success).toBe(true)
    })

    it("rejects a liturgyRef missing its folio", () => {
        const bad = { liturgyRef: { book: "crc-friday" } }
        expect(updateTrackPatchSchema.safeParse(bad).success).toBe(false)
    })

    it("rejects a non-integer folio and a negative estimatedMinutes", () => {
        expect(updateTrackPatchSchema.safeParse({ liturgyRef: { book: "x", folio: 1.5 } }).success).toBe(false)
        expect(updateTrackPatchSchema.safeParse({ estimatedMinutes: -1 }).success).toBe(false)
    })

    it("rejects an honor with no name", () => {
        expect(updateTrackPatchSchema.safeParse({ honors: [{ note: "birthday" }] }).success).toBe(false)
    })

    it("every outline field is a Zod schema, so spreading into an inputSchema is valid", () => {
        for (const [, schema] of Object.entries(outlineFields)) {
            expect(schema instanceof z.ZodType).toBe(true)
        }
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/mcp/tools/__tests__/outline-schema-parity.test.ts`
Expected: FAIL — `outlineFields` is not exported.

- [ ] **Step 3: Define the shared fragment**

In `src/lib/mcp/tools/index.ts`, immediately above `trackPatchFields` (line 184), add:

```ts
/**
 * Outline fields shared by every setlist-row write surface — add_track_to_setlist,
 * bulk_add_tracks, update_track, bulk_update_tracks and propose_setlist_changes.
 *
 * Defined once because these five schemas have drifted before (`position` is
 * accepted by update_track but rejected by bulk_update_tracks). A parity test
 * in __tests__/outline-schema-parity.test.ts guards against re-drift.
 */
export const outlineFields = {
    performer: z
        .string()
        .optional()
        .describe(
            "Who leads this moment: 'Rabbi', 'Cantor', 'Congregation', 'Band'. Printed on the rabbi's service sheet.",
        ),
    description: z
        .string()
        .optional()
        .describe(
            "Body text for readings/prayers — responsive reading text or stage directions. Printed under the row on the service sheet.",
        ),
    estimatedMinutes: z
        .number()
        .int()
        .min(0)
        .max(600)
        .optional()
        .describe("Rough duration of this moment, for run-sheet timing."),
    liturgyRef: z
        .object({
            book: z
                .string()
                .min(1)
                .describe("Book registry slug — call list_books for valid values."),
            unitId: z
                .string()
                .min(1)
                .optional()
                .describe(
                    "Stable liturgical unit id (feed-tier books only), e.g. 'shma.mi-chamocha@rh-shacharit'. Get it from lookup_book_page.",
                ),
            folio: z
                .number()
                .int()
                .min(1)
                .describe(
                    "PRINTED page number in that book. Resolve it with lookup_book_page rather than guessing — a wrong page prints on the rabbi's sheet.",
                ),
        })
        .optional()
        .describe(
            "Where this moment is in the service's liturgy book. Use lookup_book_page against the setlist's `book` to resolve it.",
        ),
    honors: z
        .array(
            z.object({
                name: z.string().min(1).max(120).describe("Person being honored."),
                note: z
                    .string()
                    .max(200)
                    .optional()
                    .describe("Why/what, e.g. 'birthday — candle lighting'."),
            }),
        )
        .max(12)
        .optional()
        .describe(
            "Named congregants honored at this moment. Printed prominently on the rabbi's sheet. Never copied by templates or clone_setlist — honors are per-service.",
        ),
} as const
```

- [ ] **Step 4: Spread the fragment into all five schemas**

1. `trackPatchFields` (line 184) — add `...outlineFields,` as its first entry. This covers `update_track` and `bulk_update_tracks` automatically.
2. `add_track_to_setlist` `inputSchema` (line 966-1010) — add `...outlineFields,` after `notes`.
3. `bulk_add_tracks` — inside the per-row `z.object({...})` (line 1021-1069), add `...outlineFields,` after `notes`.
4. `propose_setlist_changes` — inside the per-proposal `z.object({...})` (line 1360-1424), add `...outlineFields,` after `notes`.
5. `create_setlist` (line 665-685) and `update_setlist` (line 947-960) `inputSchema` — add:

```ts
                book: z
                    .string()
                    .optional()
                    .describe(
                        "Liturgy book slug used at this service (one book per service), e.g. 'crc-friday'. Call list_books for valid slugs. Page references on this setlist's rows resolve against it.",
                    ),
```

- [ ] **Step 5: Carry the fields through the staging path**

In `src/lib/mcp/tools/propose-changes.ts`, extend `ProposalInput` (line 71-87) with the same five fields (copy the block from Task 5 Step 5). Then find `buildNewTrackPayload` and add the five fields to the payload it builds, using the same `!== undefined` guard style already used there for `notes`/`key`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools/__tests__/outline-schema-parity.test.ts`
Expected: PASS (7 tests).

Run: `npm test` and `npx tsc --noEmit` — expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/tools/index.ts src/lib/mcp/tools/propose-changes.ts src/lib/mcp/tools/__tests__/outline-schema-parity.test.ts
git commit -m "feat(mcp): shared outline field fragment across all five setlist write schemas"
```

---

## Task 7: Registry-backed validation on write

**Files:**
- Modify: `src/lib/mcp/tools/setlist-write.ts`, `src/lib/mcp/server-tracks-write.ts`, `src/lib/mcp/tools/propose-changes.ts`
- Test: `src/lib/mcp/__tests__/mcp-outline-fields.emulator.test.ts` (extend)

**Interfaces:**
- Consumes: `validateLiturgyRef` from Task 1, `getRegistryEntry`.
- Produces: every write surface rejects an invalid `liturgyRef` with `richError` before touching Firestore.

Zod checks the *shape* of a `liturgyRef`; only the registry knows whether the book exists and the page is inside it. This is the guard that keeps a hallucinated page number off the shtender.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/mcp/__tests__/mcp-outline-fields.emulator.test.ts` — **nested INSIDE the existing top-level `describe`**, so it can reach the `db()`, `ADMIN` and `newSetlist()` helpers defined there. Placing it as a sibling top-level describe will fail with "newSetlist is not defined".

```ts
    describe("liturgyRef validation (emulator)", () => {
    it("rejects an unknown book slug", async () => {
        const setlistId = await newSetlist()
        const res = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Mi Chamocha",
            type: "prayer",
            liturgyRef: { book: "not-a-book", folio: 4 },
        })
        expect(res).toMatchObject({
            ok: false,
            error: { machine_code: "unknown_book" },
        })
    })

    it("rejects a folio past the end of the book", async () => {
        const setlistId = await newSetlist()
        const res = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Mi Chamocha",
            type: "prayer",
            liturgyRef: { book: "crc-friday", folio: 9999 },
        })
        expect(res).toMatchObject({
            ok: false,
            error: { machine_code: "folio_out_of_range" },
        })
    })

    it("rejects a unitId that is not in the named feed book", async () => {
        const setlistId = await newSetlist()
        const res = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Barchu",
            type: "prayer",
            liturgyRef: { book: "shirei-tshuvah", unitId: "nope@nowhere", folio: 2 },
        })
        expect(res).toMatchObject({
            ok: false,
            error: { machine_code: "unknown_unit_id" },
        })
    })

    it("writes nothing when validation fails", async () => {
        const setlistId = await newSetlist()
        await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Mi Chamocha",
            type: "prayer",
            liturgyRef: { book: "not-a-book", folio: 4 },
        })
        const snap = await db().collection("tracks").get()
        expect(snap.size).toBe(0)
    })

    it("rejects an unknown book on create_setlist", async () => {
        const res = await createSetlist(ADMIN, {
            name: "Bad book",
            eventDate: "2026-09-04",
            book: "not-a-book",
        })
        expect(res).toMatchObject({ ok: false, error: { machine_code: "unknown_book" } })
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:emulator -- --testNamePattern="liturgyRef validation"`
Expected: FAIL — invalid refs are persisted.

- [ ] **Step 3: Add a shared guard helper**

Create the helper in `src/lib/mcp/tools/setlist-write.ts` (exported so the other two write modules reuse it):

```ts
import { validateLiturgyRef, getRegistryEntry } from "@/lib/books/registry"
import type { LiturgyRef } from "@/lib/books/types"

/**
 * Guard a liturgyRef against the book registry before any write. Returns a
 * RichErrorEnvelope to return directly, or null when the ref is fine (or absent).
 * A wrong page number reaching the rabbi's printed sheet is the one failure
 * mode this feature cannot afford.
 */
export function liturgyRefGuard(ref?: LiturgyRef): RichErrorEnvelope | null {
    if (!ref) return null
    const res = validateLiturgyRef(ref)
    if (res.ok) return null
    return richError(res.machineCode, res.message, { liturgyRef: ref }, "Call list_books for valid slugs, then lookup_book_page to resolve the page.")
}

/** Guard a setlist-level book slug. */
export function bookSlugGuard(book?: string): RichErrorEnvelope | null {
    if (!book) return null
    if (getRegistryEntry(book)) return null
    return richError("unknown_book", `Unknown book '${book}'.`, { book }, "Call list_books for valid slugs.")
}
```

- [ ] **Step 4: Call the guards on every write surface**

Add the guard call immediately after the editable-setlist load and before any Firestore write, in each of:

- `addTrackToSetlist` (`setlist-write.ts`) — `const bad = liturgyRefGuard(args.liturgyRef); if (bad) return bad`
- `updateTrack` (`server-tracks-write.ts`) — guard `patch.liturgyRef`
- `bulkAddTracks` (`server-tracks-write.ts`) — guard each row's `liturgyRef` during the pre-validation pass, so `mode:'atomic'` rejects the whole batch with no writes (matching its existing all-or-nothing contract)
- `bulkUpdateSetlistTracks` (`server-tracks-write.ts`) — guard each patch in the same pre-validation pass
- `proposeSetlistChanges` (`propose-changes.ts`) — guard each proposal at **stage** time, so Daniel sees the rejection before commit
- `createSetlist` / `updateSetlist` (`setlist-write.ts`) — `bookSlugGuard(args.book)`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:emulator -- --testNamePattern="outline fields|liturgyRef validation"`
Expected: PASS (9 tests total across both describes).

Run: `npm test` and `npx tsc --noEmit` — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp
git commit -m "feat(mcp): registry-backed liturgyRef and book validation on every write surface"
```

---

## Task 8: list_books and lookup_book_page MCP tools

**Files:**
- Create: `src/lib/mcp/tools/books.ts`, `src/lib/mcp/tools/__tests__/books.test.ts`
- Modify: `src/lib/mcp/tools/index.ts` (register inside `registerReadTools`, lines 320-660)

**Interfaces:**
- Consumes: `listBooks`, `getRegistryEntry` (Task 1); `lookupBookPage` (Task 4).
- Produces: `listBooksTool(): {ok: true, books: [...]}` and `lookupBookPageTool(args): {ok: true, book, query, matches} | RichErrorEnvelope`.

These are read-only and take no uid — but keep the `(uid, args)` signature shape for consistency with neighbouring handlers.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/tools/__tests__/books.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { listBooksTool, lookupBookPageTool } from "../books"

describe("list_books", () => {
    it("returns every registered book with slug, title, tier and pages", () => {
        const res = listBooksTool()
        expect(res.ok).toBe(true)
        expect(res.books.length).toBeGreaterThanOrEqual(5)
        const slugs = res.books.map((b) => b.slug)
        expect(slugs).toContain("crc-friday")
        expect(slugs).toContain("shirei-tshuvah")
        for (const b of res.books) {
            expect(["feed", "pagemap"]).toContain(b.tier)
            expect(b.pages).toBeGreaterThan(0)
        }
    })
})

describe("lookup_book_page", () => {
    it("resolves a prayer to a page in a pagemap book", () => {
        const res = lookupBookPageTool({ book: "crc-friday", query: "Mi Chamocha" })
        expect(res).toMatchObject({ ok: true, book: "crc-friday" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches[0].folio).toBeGreaterThan(0)
        expect(res.matches[0].confidence).toBe("high")
    })

    it("returns unitId for a feed-tier book", () => {
        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Barchu" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches[0].unitId).toMatch(/@/)
    })

    it("returns an isError envelope for an unknown book", () => {
        const res = lookupBookPageTool({ book: "no-such-book", query: "x" })
        expect(res).toMatchObject({ ok: false, error: { machine_code: "unknown_book" } })
    })

    it("returns ok with an empty match list when nothing matches", () => {
        const res = lookupBookPageTool({ book: "crc-friday", query: "Zzzz Not A Prayer" })
        expect(res).toMatchObject({ ok: true })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toEqual([])
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/mcp/tools/__tests__/books.test.ts`
Expected: FAIL — cannot resolve `../books`.

- [ ] **Step 3: Write the handlers**

Create `src/lib/mcp/tools/books.ts`:

```ts
import { listBooks } from "@/lib/books/registry"
import { lookupBookPage, type BookMatch } from "@/lib/books/lookup"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"

export interface ListBooksOk {
    ok: true
    books: Array<{ slug: string; title: string; tier: "feed" | "pagemap"; pages: number }>
}

export function listBooksTool(): ListBooksOk {
    return {
        ok: true,
        books: listBooks().map(({ slug, title, tier, pages }) => ({ slug, title, tier, pages })),
    }
}

export interface LookupBookPageArgs {
    book: string
    query: string
}

export interface LookupBookPageOk {
    ok: true
    book: string
    query: string
    matches: BookMatch[]
}

export function lookupBookPageTool(
    args: LookupBookPageArgs,
): LookupBookPageOk | RichErrorEnvelope {
    const res = lookupBookPage(args.book, args.query)
    if (!res.ok) {
        return richError(
            res.machineCode,
            res.message,
            { book: args.book },
            "Call list_books for valid slugs.",
        )
    }
    return { ok: true, book: args.book, query: args.query, matches: res.matches }
}
```

- [ ] **Step 4: Register both tools**

In `src/lib/mcp/tools/index.ts`, inside `registerReadTools` (lines 320-660, alongside `get_setlist`), add:

```ts
    server.registerTool(
        "list_books",
        {
            description:
                "List the liturgy books (siddurim and machzorim) this system can reference. Returns each book's `slug` (use it for a setlist's `book` and for liturgyRef.book), title, `tier` ('feed' = generated from the Shirei Typst pipeline with stable unit ids; 'pagemap' = hand-verified page list for a legacy book), and page count. Call this before setting a setlist's book or resolving page numbers.",
            inputSchema: {},
        },
        async () => jsonResult(listBooksTool()),
    )

    server.registerTool(
        "lookup_book_page",
        {
            description:
                "Resolve a prayer or liturgical moment to its PRINTED page number in one book. Use this when adding rows to a setlist that has a `book` set — never guess a page number, because it prints on the rabbi's service sheet. Returns matches with `folio` (printed page), `unitId` (feed-tier books only — pass it through to liturgyRef so the reference survives a re-pagination), and `confidence`: 'high' commits silently, 'medium' should be mentioned when you summarize the change, 'low' with several matches means ask Daniel which one he means rather than picking.",
            inputSchema: {
                book: z
                    .string()
                    .min(1)
                    .describe("Book slug from list_books, e.g. 'crc-friday'."),
                query: z
                    .string()
                    .min(1)
                    .describe("Prayer/moment name, e.g. 'Mi Chamocha'. Case- and punctuation-insensitive; aliases are matched."),
            },
        },
        async (args) => jsonResult(lookupBookPageTool(args)),
    )
```

Add the import at the top of the file alongside the other tool-module imports:

```ts
import { listBooksTool, lookupBookPageTool } from "./books"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools/__tests__/books.test.ts`
Expected: PASS (5 tests).

Run: `npm test` and `npx tsc --noEmit` — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/tools/books.ts src/lib/mcp/tools/__tests__/books.test.ts src/lib/mcp/tools/index.ts
git commit -m "feat(mcp): list_books and lookup_book_page read tools"
```

---

## Task 9: Templates carry outline structure (but never honors)

**Files:**
- Modify: `src/lib/mcp/tools/templates.ts:57-83`
- Test: `src/lib/mcp/tools/__tests__/templates-outline.test.ts` (create)

**Interfaces:**
- Consumes: the model fields from Task 5.
- Produces: `COPYABLE_TRACK_FIELDS` extended with `performer`, `description`, `estimatedMinutes`, `liturgyRef`; `honors` deliberately excluded.

"Clone last week's Friday night" is the actual weekly motion, so the outline structure must ride along. Rachel's birthday must not.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/tools/__tests__/templates-outline.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { COPYABLE_TRACK_FIELDS } from "../templates"

describe("template copyable fields", () => {
    it("carries the outline structure fields", () => {
        for (const f of ["performer", "description", "estimatedMinutes", "liturgyRef"]) {
            expect(COPYABLE_TRACK_FIELDS).toContain(f)
        }
    })

    it("never carries honors — they are per-service, not per-template", () => {
        expect(COPYABLE_TRACK_FIELDS).not.toContain("honors")
    })

    it("still carries the original song fields", () => {
        for (const f of ["type", "title", "key", "bpm", "leadMusician", "referenceLink", "notes", "songId", "fileId", "fileName"]) {
            expect(COPYABLE_TRACK_FIELDS).toContain(f)
        }
    })
})
```

`COPYABLE_TRACK_FIELDS` is currently module-private (`const`, not `export const`) — export it as part of this task.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/mcp/tools/__tests__/templates-outline.test.ts`
Expected: FAIL — `COPYABLE_TRACK_FIELDS` is not exported.

- [ ] **Step 3: Extend and export the field list**

In `src/lib/mcp/tools/templates.ts`, replace lines 57-83:

```ts
/**
 * Fields copied setlist→template and template→setlist.
 *
 * `honors` is deliberately absent: honors name specific congregants at a
 * specific service ("Rachel Cohen — birthday, candle lighting") and must never
 * ride a template into next week's service.
 */
export const COPYABLE_TRACK_FIELDS = [
    "type",
    "title",
    "key",
    "bpm",
    "leadMusician",
    "referenceLink",
    "notes",
    "songId",
    "fileId",
    "fileName",
    "performer",
    "description",
    "estimatedMinutes",
    "liturgyRef",
] as const

type CopyableTrackField = (typeof COPYABLE_TRACK_FIELDS)[number]

export interface TemplateTrack {
    type?: string
    title?: string
    key?: string | null
    bpm?: number | null
    leadMusician?: string | null
    referenceLink?: string | null
    notes?: string | null
    songId?: string | null
    fileId?: string | null
    fileName?: string | null
    performer?: string | null
    description?: string | null
    estimatedMinutes?: number | null
    liturgyRef?: { book: string; unitId?: string; folio: number } | null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools/__tests__/templates-outline.test.ts`
Expected: PASS (3 tests).

Run: `npm test` and `npx tsc --noEmit` — expected: clean. If `CopyableTrackField` is now unused, leave it — it is referenced by the copy loop.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/templates.ts src/lib/mcp/tools/__tests__/templates-outline.test.ts
git commit -m "feat(templates): carry outline fields through templates, never honors"
```

---

# PHASE 3 — Rabbi Service Sheet

## Task 10: The service-sheet renderer

**Files:**
- Create: `src/lib/pdf/service-sheet-pdf.ts`, `src/lib/pdf/__tests__/service-sheet-pdf.test.ts`

**Interfaces:**
- Consumes: `SetlistTrack`, `Setlist` types; `toWinAnsi` from `@/lib/pdf/text-chart-pdf`; `getRegistryEntry` from `@/lib/books/registry`.
- Produces: `renderServiceSheetPdf(input: ServiceSheetInput): Promise<Uint8Array>` and the `ServiceSheetInput` type.

Read `src/lib/pdf/text-chart-pdf.ts` before starting — it is the closest existing analog (letter-size layout, font embedding, pagination) and this renderer should read like a sibling of it.

**Layout:** letter 612×792, 54pt margins. Header block (service name 18pt bold; date · rabbi · book 10pt). Honors summary box if any honors exist. Then one row per track: title 11pt bold left, **printed page number 14pt bold right-aligned**, a 9pt grey cue line (performer · lead · honors), and wrapped 8pt description when present. `header`-type rows render as a divider rule with centered label, not as rows. New page when the cursor passes the bottom margin — **never truncate**; the two-page target is asserted by test, not enforced at runtime.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/__tests__/service-sheet-pdf.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest"
import { PDFDocument } from "pdf-lib"
import { renderServiceSheetPdf } from "../service-sheet-pdf"

const BASE = {
    setlistName: "Erev Shabbat",
    eventDate: "2026-09-04",
    rabbi: "Rabbi Daniel",
    book: "crc-friday",
    bookTitle: "CRC Friday Siddur",
}

function track(over: Record<string, unknown> = {}) {
    return { id: "t1", title: "Mi Chamocha", type: "prayer", ...over }
}

describe("renderServiceSheetPdf", () => {
    it("produces a valid single-page PDF for a short service", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track(), track({ id: "t2", title: "Shalom Rav" })],
        })
        const pdf = await PDFDocument.load(bytes)
        expect(pdf.getPageCount()).toBe(1)
    })

    it("keeps a realistic 30-row service to two pages or fewer", async () => {
        const tracks = Array.from({ length: 30 }, (_, i) =>
            track({
                id: `t${i}`,
                title: `Moment ${i}`,
                performer: i % 3 === 0 ? "Congregation" : "Band",
                liturgyRef: { book: "crc-friday", folio: i + 1 },
            }),
        )
        const pdf = await PDFDocument.load(await renderServiceSheetPdf({ ...BASE, tracks }))
        expect(pdf.getPageCount()).toBeLessThanOrEqual(2)
    })

    it("paginates rather than truncating a very long service", async () => {
        const tracks = Array.from({ length: 200 }, (_, i) => track({ id: `t${i}`, title: `Moment ${i}` }))
        const pdf = await PDFDocument.load(await renderServiceSheetPdf({ ...BASE, tracks }))
        expect(pdf.getPageCount()).toBeGreaterThan(2)
    })

    it("renders a row that has no liturgyRef without failing", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ liturgyRef: undefined }), track({ id: "t2", liturgyRef: { book: "crc-friday", folio: 23 } })],
        })
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    })

    it("renders honors without throwing and grows the header block", async () => {
        const withHonors = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }] })],
        })
        expect((await PDFDocument.load(withHonors)).getPageCount()).toBe(1)
    })

    it("does not throw on Hebrew input (degrades via toWinAnsi)", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ title: "מי כמוך" })],
        })
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    })

    it("renders header rows as dividers without a page number", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ id: "h1", title: "Kabbalat Shabbat", type: "header" }), track()],
        })
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    })

    it("handles an empty setlist", async () => {
        const pdf = await PDFDocument.load(await renderServiceSheetPdf({ ...BASE, tracks: [] }))
        expect(pdf.getPageCount()).toBe(1)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/pdf/__tests__/service-sheet-pdf.test.ts`
Expected: FAIL — cannot resolve `../service-sheet-pdf`.

- [ ] **Step 3: Write the renderer**

Create `src/lib/pdf/service-sheet-pdf.ts`:

```ts
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { toWinAnsi } from "./text-chart-pdf"

/**
 * The rabbi's service sheet: the printed order of a service, with the printed
 * page number in that day's siddur/machzor, who leads each moment, and who is
 * being honored. This is the paper that sits on the shtender — legibility at
 * lectern distance beats density.
 *
 * Charts, keys and BPM deliberately do NOT appear; that is the musicians' lens
 * (Perform mode / gig packet).
 *
 * All text passes through toWinAnsi: pdf-lib StandardFonts are WinAnsi-only, so
 * Hebrew degrades to '?' rather than corrupting the document. v1 is an
 * English/transliteration sheet by design.
 */

export interface ServiceSheetTrack {
    id: string
    title?: string
    type?: string
    performer?: string
    leadMusician?: string
    description?: string
    estimatedMinutes?: number
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
}

export interface ServiceSheetInput {
    setlistName: string
    eventDate?: string
    rabbi?: string
    book?: string
    bookTitle?: string
    serviceNotes?: string
    tracks: ServiceSheetTrack[]
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = MARGIN

const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.42, 0.42, 0.47)
const RULE = rgb(0.78, 0.78, 0.82)

function clean(s: unknown): string {
    return typeof s === "string" ? toWinAnsi(s).trim() : ""
}

/** Greedy word wrap against a real font metric. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ""
    for (const w of words) {
        const next = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(next, size) <= maxW) {
            line = next
        } else {
            if (line) lines.push(line)
            line = w
        }
    }
    if (line) lines.push(line)
    return lines
}

export async function renderServiceSheetPdf(
    input: ServiceSheetInput,
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create()
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const body = await pdf.embedFont(StandardFonts.Helvetica)

    let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN

    const need = (h: number) => {
        if (y - h < BOTTOM) {
            page = pdf.addPage([PAGE_W, PAGE_H])
            y = PAGE_H - MARGIN
        }
    }

    // ---- Header -----------------------------------------------------------
    const title = clean(input.setlistName) || "Service"
    page.drawText(title, { x: MARGIN, y: y - 18, size: 18, font: bold, color: INK })
    y -= 26

    const meta = [clean(input.eventDate), clean(input.rabbi), clean(input.bookTitle) || clean(input.book)]
        .filter(Boolean)
        .join("   ·   ")
    if (meta) {
        page.drawText(meta, { x: MARGIN, y: y - 10, size: 10, font: body, color: MUTED })
        y -= 18
    }
    page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_W - MARGIN, y },
        thickness: 1,
        color: RULE,
    })
    y -= 16

    // ---- Honors summary ---------------------------------------------------
    const allHonors = input.tracks.flatMap((t) =>
        (t.honors ?? []).map((h) => ({ ...h, at: clean(t.title) })),
    )
    if (allHonors.length > 0) {
        const lines = allHonors.map((h) => {
            const who = clean(h.name)
            const why = clean(h.note)
            const at = h.at ? ` (${h.at})` : ""
            return why ? `${who} — ${why}${at}` : `${who}${at}`
        })
        const boxH = 18 + lines.length * 12
        need(boxH + 10)
        page.drawRectangle({
            x: MARGIN,
            y: y - boxH,
            width: CONTENT_W,
            height: boxH,
            borderColor: RULE,
            borderWidth: 1,
        })
        page.drawText("HONORS", { x: MARGIN + 8, y: y - 14, size: 8, font: bold, color: MUTED })
        let hy = y - 26
        for (const line of lines) {
            page.drawText(line, { x: MARGIN + 8, y: hy, size: 9, font: body, color: INK })
            hy -= 12
        }
        y -= boxH + 14
    }

    // ---- Rows -------------------------------------------------------------
    for (const t of input.tracks) {
        const rowTitle = clean(t.title)
        if (t.type === "header") {
            need(28)
            y -= 6
            page.drawLine({
                start: { x: MARGIN, y },
                end: { x: PAGE_W - MARGIN, y },
                thickness: 0.75,
                color: RULE,
            })
            const label = rowTitle.toUpperCase()
            const w = bold.widthOfTextAtSize(label, 9)
            page.drawText(label, {
                x: MARGIN + (CONTENT_W - w) / 2,
                y: y - 13,
                size: 9,
                font: bold,
                color: MUTED,
            })
            y -= 24
            continue
        }

        const cueParts = [clean(t.performer), clean(t.leadMusician)].filter(Boolean)
        for (const h of t.honors ?? []) {
            const who = clean(h.name)
            const why = clean(h.note)
            cueParts.push(why ? `${who} — ${why}` : who)
        }
        const cue = cueParts.join("   ·   ")
        const descLines = t.description
            ? wrap(clean(t.description), body, 8, CONTENT_W - 70)
            : []

        const rowH = 16 + (cue ? 11 : 0) + descLines.length * 10 + 6
        need(rowH)

        page.drawText(rowTitle || "(untitled)", {
            x: MARGIN,
            y: y - 12,
            size: 11,
            font: bold,
            color: INK,
        })

        if (t.liturgyRef) {
            const folio = String(t.liturgyRef.folio)
            const w = bold.widthOfTextAtSize(folio, 14)
            page.drawText(folio, {
                x: PAGE_W - MARGIN - w,
                y: y - 13,
                size: 14,
                font: bold,
                color: INK,
            })
        }
        y -= 16

        if (cue) {
            page.drawText(cue, { x: MARGIN, y: y - 8, size: 9, font: body, color: MUTED })
            y -= 11
        }
        for (const line of descLines) {
            page.drawText(line, { x: MARGIN + 10, y: y - 7, size: 8, font: body, color: MUTED })
            y -= 10
        }
        y -= 6
    }

    return await pdf.save()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/pdf/__tests__/service-sheet-pdf.test.ts`
Expected: PASS (8 tests).

If the 30-row test exceeds two pages, tighten row spacing (the `y -= 6` row gap and the 16pt title advance) until it fits — do not shrink the page-number size below 14pt or the title below 11pt; legibility at the lectern is the point.

Run: `npx tsc --noEmit` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/service-sheet-pdf.ts src/lib/pdf/__tests__/service-sheet-pdf.test.ts
git commit -m "feat(pdf): rabbi service-sheet renderer"
```

---

## Task 11: generate_service_sheet MCP tool

**Files:**
- Create: `src/lib/mcp/tools/service-sheet.ts`, `src/lib/mcp/__tests__/mcp-service-sheet.emulator.test.ts`
- Modify: `src/lib/mcp/tools/index.ts` (register inside `registerWriteTools`)

**Interfaces:**
- Consumes: `renderServiceSheetPdf` (Task 10); `getRegistryEntry` (Task 1).
- Produces: `generateServiceSheet(uid, args): Promise<GenerateServiceSheetOk | RichErrorEnvelope>` with envelope `{ok, downloadUrl, expiresAt, storagePath, sizeBytes, pageCount, setlistName, trackCount}`.

**Read `src/lib/mcp/tools/library-download.ts` lines 200-619 first** — `generateGigPacket` is the pattern for rate limiting, setlist loading, bucket resolution, `file.save`, and `getSignedUrl` (v4, 10-minute TTL). Reuse its helpers where they are exported; mirror them where they are not. Storage path convention: `service-sheets/{setlistId}/{Date.now()}-{nonce}.pdf`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/__tests__/mcp-service-sheet.emulator.test.ts`. Mirror the storage mocking used by `src/lib/mcp/__tests__/mcp-gig-packet.emulator.test.ts` (read it first):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const saveSpy = vi.fn().mockResolvedValue(undefined)
const signedUrlSpy = vi.fn().mockResolvedValue(["https://signed.example/sheet.pdf"])
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: () => ({ save: saveSpy, getSignedUrl: signedUrlSpy }),
        }),
    }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn().mockResolvedValue(null) }))

import { generateServiceSheet } from "../tools/service-sheet"
import { createSetlist, addTrackToSetlist } from "../tools/setlist-write"

describe("generate_service_sheet (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const db = () => getFirestore(app)

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-service-sheet" })
        await db().collection("users").doc(ADMIN).set({ displayName: "Rabbi Daniel", role: "admin" })
    })
    afterAll(async () => { await deleteApp(app) })
    beforeEach(async () => {
        saveSpy.mockClear()
        signedUrlSpy.mockClear()
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function seedService() {
        const created = await createSetlist(ADMIN, {
            name: "Erev Shabbat — Sept 4",
            eventDate: "2026-09-04",
            rabbi: "Rabbi Daniel",
            book: "crc-friday",
        })
        const setlistId = (created as { setlist: { id: string } }).setlist.id
        await addTrackToSetlist(ADMIN, {
            setlistId, title: "Kabbalat Shabbat", type: "header",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId, title: "Candle Lighting", type: "reading",
            performer: "Congregation",
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday" }],
        })
        await addTrackToSetlist(ADMIN, {
            setlistId, title: "Mi Chamocha", type: "prayer",
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
        return setlistId
    }

    it("returns a signed download url and a real page count", async () => {
        const setlistId = await seedService()
        const res = await generateServiceSheet(ADMIN, { setlistId })
        expect(res).toMatchObject({
            ok: true,
            downloadUrl: "https://signed.example/sheet.pdf",
            trackCount: 3,
        })
        const ok = res as { pageCount: number; sizeBytes: number; storagePath: string }
        expect(ok.pageCount).toBeGreaterThanOrEqual(1)
        expect(ok.sizeBytes).toBeGreaterThan(0)
        expect(ok.storagePath).toContain(setlistId)
        expect(saveSpy).toHaveBeenCalledTimes(1)
    })

    it("saves a real PDF (starts with %PDF)", async () => {
        await generateServiceSheet(ADMIN, { setlistId: await seedService() })
        const buf = saveSpy.mock.calls[0][0] as Buffer
        expect(buf.subarray(0, 4).toString()).toBe("%PDF")
    })

    it("rejects an unknown setlist", async () => {
        const res = await generateServiceSheet(ADMIN, { setlistId: "nope" })
        expect(res).toMatchObject({ ok: false, error: { machine_code: "setlist_not_found" } })
    })

    it("generates for a setlist with no book set", async () => {
        const created = await createSetlist(ADMIN, { name: "Rehearsal", eventDate: "2026-09-05" })
        const setlistId = (created as { setlist: { id: string } }).setlist.id
        await addTrackToSetlist(ADMIN, { setlistId, title: "Warmup", type: "note" })
        expect(await generateServiceSheet(ADMIN, { setlistId })).toMatchObject({ ok: true })
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:emulator -- --testNamePattern="generate_service_sheet"`
Expected: FAIL — cannot resolve `../tools/service-sheet`.

- [ ] **Step 3: Write the handler**

Create `src/lib/mcp/tools/service-sheet.ts`. Follow `generateGigPacket` in `library-download.ts` for the rate-limit call, setlist load, bucket resolution and signed-URL block; the sheet-specific part is:

```ts
import { PDFDocument } from "pdf-lib"
import { renderServiceSheetPdf } from "@/lib/pdf/service-sheet-pdf"
import { getRegistryEntry } from "@/lib/books/registry"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"

const SERVICE_SHEET_SIGNED_URL_TTL_MS = 10 * 60 * 1000

export interface GenerateServiceSheetArgs {
    setlistId: string
}

export interface GenerateServiceSheetOk {
    ok: true
    downloadUrl: string
    expiresAt: string
    storagePath: string
    sizeBytes: number
    pageCount: number
    setlistName: string
    trackCount: number
}

export async function generateServiceSheet(
    uid: string,
    args: GenerateServiceSheetArgs,
): Promise<GenerateServiceSheetOk | RichErrorEnvelope> {
    // 1. rate limit (tier "api", bypass for trusted leaders) — mirror generateGigPacket
    // 2. load the setlist; return richError("setlist_not_found", ...) when absent
    // 3. load tracks in performance order via getTracksForSetlist
    // 4. render:
    const bytes = await renderServiceSheetPdf({
        setlistName: setlist.name,
        eventDate: typeof setlist.eventDate === "string" ? setlist.eventDate : undefined,
        rabbi: setlist.rabbi,
        book: setlist.book,
        bookTitle: setlist.book ? getRegistryEntry(setlist.book)?.title : undefined,
        serviceNotes: setlist.serviceNotes,
        tracks: tracks.map((t) => ({
            id: t.id,
            title: t.title,
            type: t.type,
            performer: t.performer,
            leadMusician: t.leadMusician,
            description: t.description,
            estimatedMinutes: t.estimatedMinutes,
            liturgyRef: t.liturgyRef,
            honors: t.honors,
        })),
    })
    const buffer = Buffer.from(bytes)
    const pageCount = (await PDFDocument.load(bytes)).getPageCount()
    // 5. save to `service-sheets/${args.setlistId}/${Date.now()}-${nonce}.pdf`
    // 6. getSignedUrl({action:"read", version:"v4", expires: Date.now() + SERVICE_SHEET_SIGNED_URL_TTL_MS})
    // 7. return the GenerateServiceSheetOk envelope
}
```

Fill in steps 1, 2, 3, 5, 6 and 7 by mirroring `generateGigPacket` exactly — same helpers, same error machine codes, same bucket resolution. Do not invent a second storage convention. The specific things to reuse from `library-download.ts`:

- `checkUserRateLimit(uid, "api", { bypass: isTrustedLeader(roles) })` → return `rateLimitEnvelope(limited.error)` when it returns non-null
- `gigPacketBucket()` — the bucket resolver reading `FIREBASE_STORAGE_BUCKET`; reuse it as-is (export it if it is module-private) rather than writing a second resolver
- `getTracksForSetlist` from `@/lib/server-tracks` for performance-ordered rows
- `file.save(buffer, { contentType: "application/pdf", metadata: {...} })`
- `file.getSignedUrl({ action: "read", version: "v4", expires: <ms epoch> })`
- `richError("setlist_not_found", ...)` for a missing setlist — same machine code the read tools use

Unlike the gig packet, there is no size cap and no missing-charts appendix: the sheet is text-only and small.

- [ ] **Step 4: Register the tool**

In `src/lib/mcp/tools/index.ts`, inside `registerWriteTools` (near the `generate_gig_packet` registration at line 3018):

```ts
    server.registerTool(
        "generate_service_sheet",
        {
            description:
                "Render the rabbi's printed service sheet for a setlist — the order of the service with the PRINTED page number in that day's siddur/machzor, who leads each moment, named honors, and reading text. Returns a 10-minute Firebase Storage signed download URL (`downloadUrl`, `expiresAt`, `sizeBytes`, `pageCount`, `storagePath`). This is the paper that goes on the shtender; it deliberately omits charts, keys and BPM — use generate_gig_packet for the band's charts. Rows without a page reference simply print without a number.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe("Setlist id (from list_setlists or create_setlist)."),
            },
        },
        async (args, extra) => jsonResult(await generateServiceSheet(uidFrom(extra), args)),
    )
```

Add the import alongside the other tool-module imports:

```ts
import { generateServiceSheet } from "./service-sheet"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:emulator -- --testNamePattern="generate_service_sheet"`
Expected: PASS (4 tests).

Run: `npm test` and `npx tsc --noEmit` — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/tools/service-sheet.ts src/lib/mcp/tools/index.ts src/lib/mcp/__tests__/mcp-service-sheet.emulator.test.ts
git commit -m "feat(mcp): generate_service_sheet — the rabbi's printed service sheet"
```

---

## Task 12: Ship and verify on production

**Files:** none (deploy + verification)

**Interfaces:**
- Consumes: everything above.
- Produces: a verified prod deployment and a UAT entry for Daniel.

- [ ] **Step 1: Run the full gate**

```bash
npx tsc --noEmit
npm test
npm run test:emulator
```

Expected: all clean. Do not proceed on a failure — fix it or report it.

- [ ] **Step 2: Push to production**

```bash
git push origin master
```

Then confirm the Vercel build succeeds. `npm run build` cannot run locally, so the Vercel build IS the build gate — if it fails, fix forward.

- [ ] **Step 3: Verify against the live MCP surface**

Using the production MCP server, in order:

1. `list_books` → expect five books with the tiers and page counts from the registry.
2. `lookup_book_page` with `{book: "crc-friday", query: "Mi Chamocha"}` → expect a high-confidence match with the page Daniel verified in Task 3.
3. `create_setlist` with `book: "crc-friday"` and `isTest: true` → note the id.
4. `bulk_add_tracks` adding a header row, a reading with `performer`, `description`, a `liturgyRef` and an honor, and a song row with a `liturgyRef`.
5. `get_setlist` → confirm every outline field round-tripped.
6. `generate_service_sheet` → open the returned `downloadUrl` and confirm the PDF shows the honors box, the page numbers, and the section divider.
7. `add_track_to_setlist` with `liturgyRef: {book: "crc-friday", folio: 9999}` → confirm it is REJECTED with `folio_out_of_range` and that no row was created.
8. Delete the test setlist.

- [ ] **Step 4: Log the human verification**

Append to `.paul/UAT-PENDING.md`:

```markdown
- [ ] Liturgy outlines (Phases 1–3): print a real Friday-night service sheet
      via generate_service_sheet and check it at the shtender — page numbers
      correct against the printed CRC Friday Siddur, honors box readable at
      lectern distance, fits on one or two pages.
```

- [ ] **Step 5: Report to Daniel**

Report: the deployed commit SHA, the results of each numbered probe in Step 3 (with the actual page numbers returned), the signed URL of the generated sample sheet, and the UAT item awaiting him. State plainly anything that did not work.

---

## Notes for the executor

**Discovered adjacent gap, deliberately NOT in scope:** `bpm` is present on `AddTrackArgs`, `UpdateTrackPatch`, `BulkAddTrackInput`, `ProposalInput` and `COPYABLE_TRACK_FIELDS`, but absent from the Zod `trackPatchFields` — so it is unreachable through `update_track` and `bulk_update_tracks` for exactly the same reason `performer` was. It is a one-line fix in the file Task 6 already edits, but it is not in the approved spec. Mention it to Daniel; do not implement it unbidden.

**Legacy unhydrated setlists:** MCP-created setlists are written `hydrated: true` at creation (`clone-setlist.ts:262`, `templates.ts:872`), and the embedded-`tracks[]` fan-out is browser-only. Outline fields therefore ride the top-level `tracks/{id}` path exclusively. If you find an MCP write path that reads an embedded `tracks[]` array, stop and report rather than widening it.

**Do not touch the shireishabbat repo.** Task 2 reads its `dist/*.json` and nothing more. That repo has its own two-surface protocol; work inside it belongs to Phase 5.
