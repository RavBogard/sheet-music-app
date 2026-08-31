# Liturgy Outlines Phase 4 — Musician Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the liturgy outline visible to the band — render page numbers, performer cues, honors, and descriptions on Perform-mode rows for every row type, name the prayer book on screen, and stop the gig-packet PDF from silently dropping page numbers.

**Architecture:** Presentation-only. Phase 1–3 already deliver `liturgyRef`, `honors`, `performer`, `description`, and `estimatedMinutes` to the client intact — both the SSR seed (`server-tracks.ts` spreads the raw doc) and the live Firestore→Dexie sync (`snapshot-listener.ts` spreads `change.data`; `LocalTrack` carries an index signature) pass fields through wholesale. No data plumbing changes. The work is (a) a compile-time guard against the recurring silent-field-drop class of bug, (b) rendering in `SetlistRow.tsx` plus a book name in the Perform header, and (c) closing the one live field-drop in the gig-packet print path.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, Tailwind v4 (OKLCH custom properties in `src/app/globals.css`), lucide-react icons, pdf-lib for the print pipeline, Vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-liturgy-outline-design.md` — see §7 Phasing row "4 — Web lenses", as narrowed by the scope decision below.

**Scope decision (Daniel, 2026-08-30):** Phase 4 ships **musician surfaces only**. The read-only rabbi web lens named in the spec is **dropped, not deferred-with-intent** — the rabbi surface is paper, and this app has no `rabbi` role to hang a lens off (roles are `admin | band_leader | musician | member | pending`; `rabbi` is a free-text field on the Setlist naming who leads). Do not build a `?view=` variant, a `rabbi/` sub-route, or any role-lens scaffolding in this plan.

**Premise correction (commit `16fe4e9996`):** the spec's ground-truth section originally claimed these fields were "all rendered by `ServiceFlowCard.tsx`" and the outline was "~70% present". Both were false. `ServiceFlowCard.tsx` is imported by nothing — it is dead code. The live renderer is `src/components/performance/SetlistRow.tsx`. Do **not** revive, edit, or import `ServiceFlowCard.tsx`; leave it exactly where it is (removing it is out of scope and would widen the diff).

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Target device:** 11" iPad, 820×1180, WebKit, held at arm's length by a standing musician mid-service. Glanceability beats density-purism where they conflict.
- **Touch targets:** minimum 44×44px. The row root already uses `min-h-11`; keep it.
- **Body text floor:** 16px (`text-base`) minimum for a row's primary line. The current passive outline row uses `text-sm` (14px) — raising it is part of this work, not an incidental change.
- **Contrast:** 4.5:1 minimum in **both** light and dark themes. `SetlistRow.tsx` carries three separate in-file comments recording prior axe-core failures (`text-amber-300` at 1.1:1, `text-blue-400` at 2.18:1, `opacity-60` compositing muted text to 3.59:1). Light mode is where this file breaks. Every new colored text token needs a `light` value and a `dark:` value, following the existing `text-blue-700 dark:text-blue-400` pattern.
- **Never `opacity-*` on text.** De-emphasis is done with the muted *color* token only — see the comment at `SetlistRow.tsx:179-182`.
- **Never convey meaning by color alone.** A page number gets a literal `p.` prefix; an honor gets an icon, not just a hue.
- **Icons:** lucide-react only, consistent sizing. No emoji as icons, ever.
- **House visual rule:** max-density text rows, Logic-Pro track-list style. No cover art, no cards, no large section gaps. (The `ui-ux-pro-max` `--design-system` generator returns a landing-page pattern for this query — "Webinar Registration", 48px gaps, 32px+ type. It is wrong for this surface; ignore its style/pattern/landing output. Its typography match, Righteous/Poppins, is already the project's font pairing.)
- **Bundle:** `src/lib/books/registry.ts` statically imports all five book JSON files (~80KB total). It must **never** be imported by a client component. Use the lightweight resolver built in Task 2 instead.
- **User-facing strings:** never call the CRC books "legacy". "Legacy" is the shireishabbat repo's internal family name for its own rebuild; to CRC these are the current books.
- **Do not regress the shipped honors contract:** `honors` are deliberately never copied by templates or `clone_setlist`. Nothing in this plan touches that.
- **Gate:** `npx tsc --noEmit` + `npm test`. `npm run build` **cannot** run locally (`.env.local` lacks `NEXT_PUBLIC_FIREBASE_*`); Vercel's build is the build gate.
- **Deploy:** push to `origin master` (production branch — **not** `master:main`).
- **Test isolation:** implementers run **foreground, scoped** test commands only (`npx vitest run <path>`). The controller runs the full suite. Never background a test run and poll it.

---

## File Structure

**Create:**
- `src/types/track-fields.ts` — runtime census of `SetlistTrack`'s field names plus a type-level exhaustiveness assertion. One responsibility: make "someone added a track field and a projection silently dropped it" a compile error instead of a production bug.
- `src/types/__tests__/track-fields.test.ts` — asserts each known projection either forwards or explicitly declares-dropped every censused field.
- `src/lib/books/titles.ts` — slug→display-title resolver that imports **only** `registry.json`. Deliberately separate from `registry.ts` so client code can name a book without pulling the book corpus into the bundle.
- `src/lib/books/__tests__/titles.test.ts` — behavior plus a source-level guard that `titles.ts` never imports `./registry`.
- `src/components/performance/__tests__/SetlistRow.outline.test.tsx` — rendering assertions for the new outline treatment.

**Modify:**
- `src/components/performance/SetlistRow.tsx` — the outline row treatment (the visible deliverable).
- `src/hooks/use-setlist-performance.ts` — expose `book` from the setlist doc (currently never destructured).
- `src/app/perform/setlist/[id]/SetlistPerformClient.tsx` — render the book name in the header.
- `src/lib/print-generation.ts` — `PrintTrackPayload` gains `liturgyRef`/`honors`.
- `src/lib/print-pipeline.ts` — `PrintTrack` gains the same; flow rows render the folio.
- `src/components/setlist/PrintModal.tsx` — forward the two fields in its hand-built track map.

---

## Task 1: Track field census + projection guard

**Why this task exists:** this codebase has eight hand-maintained field lists that silently drop unknown fields with no error. That is why `SetlistTrack.pageNumber` was functionally dead for months, and why the gig-packet path (Task 3) still drops `liturgyRef` today. Adding a ninth field without a guard means a ninth bug. This task makes the omission a `tsc` failure. Keep it small — one const, one type assertion, one test.

**Files:**
- Create: `src/types/track-fields.ts`
- Create: `src/types/__tests__/track-fields.test.ts`
- Read (do not modify): `src/types/models.ts`, `src/lib/queue-utils.ts`, `src/lib/print-pipeline.ts`

**Interfaces:**
- Consumes: `SetlistTrack` from `@/types/models`.
- Produces: `TRACK_FIELDS` (a `readonly` tuple of every `SetlistTrack` key) and `TrackFieldName`. Task 3's test imports both.

- [ ] **Step 1: Create the census file with an empty array and let the compiler write it for you**

Create `src/types/track-fields.ts`:

```ts
import type { SetlistTrack } from "@/types/models"

/**
 * Runtime census of every field on `SetlistTrack`.
 *
 * WHY THIS EXISTS: several modules project a SetlistTrack into a narrower
 * shape by hand-listing fields (queue-utils' `toQueueItem`, print-pipeline's
 * `PrintTrack`, PrintModal's payload builder, the MCP read/write allowlists).
 * Each is a place where adding a field to SetlistTrack silently does nothing.
 * That failure mode has shipped repeatedly — `pageNumber` was inert for months,
 * and the gig-packet path dropped `liturgyRef` from the day it was added.
 *
 * The assertion below turns "field added, projection not updated" from a
 * silent runtime drop into a compile error that names the missing field.
 *
 * WHEN YOU ADD A FIELD TO SetlistTrack: add its name here, then run the
 * projection test — it will tell you which projections must decide whether
 * to forward the field or declare it intentionally dropped.
 */
export const TRACK_FIELDS = [] as const

export type TrackFieldName = (typeof TRACK_FIELDS)[number]

/**
 * Compile-time exhaustiveness. If a key of SetlistTrack is missing from
 * TRACK_FIELDS, `Unregistered` is not `never` and this assignment fails —
 * and the TypeScript error text names the missing keys.
 */
type Unregistered = Exclude<keyof SetlistTrack, TrackFieldName>
const _exhaustive: [Unregistered] extends [never]
    ? true
    : { ERROR: "Unregistered SetlistTrack fields"; missing: Unregistered } = true
void _exhaustive
```

- [ ] **Step 2: Run tsc and read the field names out of the error**

Run: `npx tsc --noEmit`

Expected: a failure on `_exhaustive` whose message enumerates every key of `SetlistTrack`. Copy those names into `TRACK_FIELDS` as string literals, in the order they are declared in `src/types/models.ts`. Do not guess the list from memory or from this plan — the compiler's list is the authority.

- [ ] **Step 3: Run tsc again to verify the census is complete**

Run: `npx tsc --noEmit`
Expected: PASS (no error on `track-fields.ts`).

- [ ] **Step 4: Write the projection test**

Create `src/types/__tests__/track-fields.test.ts`. The test encodes, for each known projection, which censused fields it forwards and which it deliberately drops, and asserts the two sets together cover the census exactly. `FORWARDED` lists must be derived by **reading the projection's source**, not assumed.

```ts
import { describe, it, expect } from "vitest"
import { TRACK_FIELDS, type TrackFieldName } from "@/types/track-fields"

/**
 * Each entry describes one hand-maintained projection of SetlistTrack.
 * `forwarded` = fields the projection carries through.
 * `intentionallyDropped` = fields it deliberately omits, each with a reason.
 *
 * The assertion is coverage, not correctness of intent: every censused field
 * must appear in exactly one of the two lists. When SetlistTrack grows a
 * field, this test fails until someone makes a decision about it here.
 */
interface Projection {
    name: string
    forwarded: readonly TrackFieldName[]
    intentionallyDropped: Readonly<Record<string, string>>
}

const PROJECTIONS: Projection[] = [
    // Populated in Step 5.
]

describe("SetlistTrack projections", () => {
    it("censuses at least the outline fields", () => {
        for (const f of ["liturgyRef", "honors", "performer", "description", "estimatedMinutes"]) {
            expect(TRACK_FIELDS).toContain(f)
        }
    })

    it.each(PROJECTIONS)("$name accounts for every censused field", (p) => {
        const dropped = Object.keys(p.intentionallyDropped)
        const accounted = new Set<string>([...p.forwarded, ...dropped])

        const unaccounted = TRACK_FIELDS.filter((f) => !accounted.has(f))
        expect(unaccounted, `${p.name} neither forwards nor declares-dropped these fields`).toEqual([])

        const overlap = p.forwarded.filter((f) => dropped.includes(f))
        expect(overlap, `${p.name} lists these as both forwarded and dropped`).toEqual([])

        for (const [field, reason] of Object.entries(p.intentionallyDropped)) {
            expect(reason.length, `${p.name}.${field} needs a real reason`).toBeGreaterThan(10)
        }
    })
})
```

- [ ] **Step 5: Populate PROJECTIONS by reading each projection's source**

Read each source file and fill in one `Projection` entry per module. There are two in this task's scope:

1. `toQueueItem` in `src/lib/queue-utils.ts:46-59`. Read the returned object literal. Note it renames `title`→`name` and synthesises `fileId` for non-song rows — both count as *forwarded* for census purposes (the information survives). Fields such as `notes`, `leadMusician`, `liturgyRef`, and `honors` are genuinely absent; declare each dropped with the reason "QueueItem drives the PDF chart-navigation overlay, which renders no outline metadata".
2. `PrintTrack` in `src/lib/print-pipeline.ts:26-48`. Read the interface's members. As of this task, `liturgyRef` and `honors` are absent — declare them dropped with the reason "not yet plumbed; Task 3 of this plan forwards them". **Task 3 moves them to `forwarded`.**

Do not add entries for the MCP read/write allowlists — those are covered by the existing parity test at the MCP layer and are out of this plan's scope.

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/types/__tests__/track-fields.test.ts`
Expected: PASS.

- [ ] **Step 7: Prove the guard actually catches a drop**

Temporarily delete one field name (e.g. `"performer"`) from a projection's `forwarded` list and re-run the test. Expected: FAIL, naming `performer` as unaccounted. Restore it and re-run. Expected: PASS. Record both outcomes in your report — a guard that has never been seen to fail is not a guard. (This project shipped a schema parity test that asserted `safeParse(...).success`, which Zod keeps `true` while stripping unknown keys; it passed 10/10 against a completely broken schema. Do not repeat that.)

- [ ] **Step 8: Commit**

```bash
git add src/types/track-fields.ts src/types/__tests__/track-fields.test.ts
git commit -m "feat(types): compile-time census of SetlistTrack fields

Turns the recurring silent-field-drop bug into a tsc error. Projections
declare what they forward and what they deliberately drop; the census
assertion fails when a new track field is accounted for by neither."
```

---

## Task 2: Render the outline on Perform rows, and name the book

**Why these ship together:** a page number without the book it refers to is worse than no page number — it is a confident wrong instruction to a musician mid-service. The spec names "wrong page number on the shtender" as the one unaffordable failure. The row treatment and the book name are one deliverable.

**Files:**
- Create: `src/lib/books/titles.ts`
- Create: `src/lib/books/__tests__/titles.test.ts`
- Create: `src/components/performance/__tests__/SetlistRow.outline.test.tsx`
- Modify: `src/components/performance/SetlistRow.tsx`
- Modify: `src/hooks/use-setlist-performance.ts`
- Modify: `src/app/perform/setlist/[id]/SetlistPerformClient.tsx`

**Interfaces:**
- Consumes: `SetlistTrack` (`liturgyRef`, `honors`, `performer`, `description`), `BookRegistryEntry` from `@/lib/books/types`.
- Produces: `bookTitle(slug?: string): string | undefined` from `@/lib/books/titles`.

- [ ] **Step 1: Write the failing titles test**

Create `src/lib/books/__tests__/titles.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { bookTitle } from "@/lib/books/titles"

describe("bookTitle", () => {
    it("resolves a known slug to its display title", () => {
        expect(bookTitle("crc-friday")).toBeTruthy()
        expect(typeof bookTitle("crc-friday")).toBe("string")
    })

    it("returns undefined for an unknown slug or no slug", () => {
        expect(bookTitle("not-a-book")).toBeUndefined()
        expect(bookTitle(undefined)).toBeUndefined()
    })

    it("never says 'legacy' in a user-facing title", () => {
        for (const slug of ["crc-friday", "crc-saturday"]) {
            expect(bookTitle(slug)?.toLowerCase()).not.toContain("legacy")
        }
    })

    // BUNDLE GUARD: titles.ts must not pull in registry.ts, which statically
    // imports all five book JSON files (~80KB). This module exists precisely
    // so a client component can name a book without that payload.
    it("does not import the heavy registry module", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/books/titles.ts"), "utf8")
        expect(src).not.toMatch(/from\s+["'](\.\/registry|@\/lib\/books\/registry)["']/)
        expect(src).not.toMatch(/data\/books\/(crc|shabbat|shirei)/)
    })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/books/__tests__/titles.test.ts`
Expected: FAIL — cannot resolve `@/lib/books/titles`.

- [ ] **Step 3: Implement the resolver**

Create `src/lib/books/titles.ts`:

```ts
import registryJson from "@/data/books/registry.json"
import type { BookRegistryEntry } from "./types"

/**
 * Slug → display title, for surfaces that must NAME a book without needing
 * its contents.
 *
 * Deliberately separate from `./registry`, which statically imports all five
 * book JSON files (~80KB) so the MCP tools can resolve page lookups on the
 * server. Client components must import THIS module, never that one.
 * `registry.json` is a small array of {slug, title, tier, pages, source}.
 */
const TITLES: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(
        (registryJson as BookRegistryEntry[]).map((b) => [b.slug, b.title])
    )
)

export function bookTitle(slug: string | undefined): string | undefined {
    if (!slug) return undefined
    return TITLES[slug]
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/books/__tests__/titles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing row-rendering test**

Create `src/components/performance/__tests__/SetlistRow.outline.test.tsx`. Follow whatever render/import conventions the sibling tests in `src/components/performance/__tests__/` already use — read one first and match it.

Assert, for a `type: 'prayer'` row carrying `liturgyRef: { book: 'crc-friday', folio: 12 }`, `performer: 'Congregation'`, `honors: [{ name: 'Rachel Cohen', note: 'birthday — candle lighting' }]`, and a long `description`:

1. the page number renders as the string `p. 12`;
2. the performer text renders;
3. the honoree's name renders, and the note renders;
4. the description renders;
5. a row with **no** `liturgyRef` renders no `p.` text and does not throw;
6. a `type: 'header'` row **with** `honors` renders the honoree's name (the spec places service-wide honors on header rows — they must not vanish into the divider);
7. a `type: 'header'` row with a `liturgyRef` renders its page number;
8. a `type: 'song'` row is **unchanged** — it still shows its key badge and its `leadMusician || performer` second line, and does **not** grow an outline block. Assert this against the existing song-row behavior so the change is provably additive.

Run: `npx vitest run src/components/performance/__tests__/SetlistRow.outline.test.tsx`
Expected: FAIL on the outline assertions.

- [ ] **Step 6: Implement the row treatment**

In `src/components/performance/SetlistRow.tsx`.

Add to the imports (verify `User` exists in the installed lucide-react version; if it does not, use `UserRound`, and if neither, use `Star` — do not substitute an emoji):

```tsx
import { FileMusic, ChevronRight, User } from "lucide-react"
```

Add derived values near the existing `hasSecondLine` (around line 76):

```tsx
// Outline fields — rendered for every row type. `folio` is stored at
// authoring time (never resolved at render), so this is a pure read.
const folio = track.liturgyRef?.folio
const honors = track.honors?.filter((h) => h?.name?.trim()) ?? []
const outlinePerformer = !isSong ? track.performer : undefined
```

Define a shared page-number element. Fixed width so numbers align vertically down the list — that column alignment is what makes the number findable at a glance, and it is the whole point of the treatment. `tabular-nums` keeps the digits from shifting.

```tsx
// The field the eye hunts for mid-service. Right-aligned in a fixed column
// so folios line up down the list; `p.` prefix so the meaning is never
// carried by position or color alone. Full-strength foreground even on
// de-emphasised rows — the row title may be muted, the page number never is.
const folioBadge = folio !== undefined ? (
    <span
        data-testid="folio"
        className="shrink-0 w-16 text-right font-bold text-lg tabular-nums text-foreground"
    >
        p.&nbsp;{folio}
    </span>
) : null
```

Define the sub-line block reused by non-song rows:

```tsx
const outlineDetail = (
    <>
        {outlinePerformer && (
            <p className="text-sm text-blue-700 dark:text-blue-400 truncate mt-0.5">
                {outlinePerformer}
            </p>
        )}
        {honors.length > 0 && (
            <ul className="mt-0.5 space-y-0.5">
                {honors.map((h, i) => (
                    <li key={`${h.name}-${i}`} className="flex items-center gap-1.5 text-sm">
                        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="text-foreground truncate">{h.name}</span>
                        {h.note && (
                            <span className="text-muted-foreground truncate">— {h.note}</span>
                        )}
                    </li>
                ))}
            </ul>
        )}
        {track.description && (
            // Clamped: the full text lives in the book on the page named to the
            // right. Two lines is enough to identify the moment, not read it.
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {track.description}
            </p>
        )}
    </>
)
```

Replace the two non-song branches of `songContent`. The `openableNonSong` branch becomes:

```tsx
) : openableNonSong ? (
    // Prayer/reading WITH a bonded chart: must read as tappable, not as a
    // passive dimmed label. Leading chart glyph + foreground title + trailing
    // chevron — affordance is shape-based (color-not-alone).
    <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
            <FileMusic className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="text-base text-foreground truncate min-w-0">{title}</span>
            <span className="flex-1" />
            {folioBadge}
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        {outlineDetail}
    </div>
) : (
    // Passive outline row. Title stays muted to preserve the song/non-song
    // distinction, but rises to 16px — 14px is below the readable floor for a
    // tablet read at arm's length while standing. De-emphasis is COLOR ONLY;
    // never re-introduce opacity here (see the rowClasses comment).
    <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
            <span className="text-base text-muted-foreground truncate min-w-0">{title}</span>
            <span className="flex-1" />
            {folioBadge}
        </div>
        {outlineDetail}
    </div>
)
```

For header rows, extend the existing `headerInner` block so a service-wide honor or a section page number is not swallowed by the divider. Keep the divider itself unchanged; append below it. Both the `isLeader` `<button>` branch and the plain `<div>` branch must render it — restructure so the extra content is emitted once, not duplicated by copy-paste.

```tsx
const headerExtra = (folio !== undefined || honors.length > 0) ? (
    <div className="flex items-center gap-2 px-4 pb-1">
        {honors.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm min-w-0">
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-foreground truncate">
                    {honors.map((h) => h.note ? `${h.name} — ${h.note}` : h.name).join(", ")}
                </span>
            </span>
        )}
        <span className="flex-1" />
        {folioBadge}
    </div>
) : null
```

Because `headerInner` currently returns from inside an `if (isHeader)` block with two branches, wrap each branch's return in a fragment so `headerExtra` follows the divider row in both. Do not change the divider's own markup, spacing, or the leader `<button>`'s `min-h-11`.

- [ ] **Step 7: Run the row test**

Run: `npx vitest run src/components/performance/__tests__/SetlistRow.outline.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the existing performance-component tests for regressions**

Run: `npx vitest run src/components/performance`
Expected: PASS. Song rows and header dividers are covered by existing tests — if any fail, the change was not additive; fix the implementation rather than the existing test, unless the existing test asserts the 14px passive title size, which this task intentionally changes (in that case update it and say so in your report).

- [ ] **Step 9: Commit the row treatment**

```bash
git add src/lib/books/titles.ts src/lib/books/__tests__/titles.test.ts src/components/performance/SetlistRow.tsx src/components/performance/__tests__/SetlistRow.outline.test.tsx
git commit -m "feat(perform): render the liturgy outline on Perform rows

Page number, performer, honors and description now render for every row
type. Before this, a non-song row showed its title and nothing else, so a
rabbi-authored outline was invisible on the band's iPads."
```

- [ ] **Step 10: Surface `book` through the performance hook**

In `src/hooks/use-setlist-performance.ts`: the setlist document reaches this hook via a wholesale spread, so `book` is already present on the object — it is simply never destructured or returned. Add `book` to the hook's return type (around the `currentTrackIndex: number` declaration at line 29) and to the returned object (around lines 234). Type it `string | undefined`. Do not add a fetch, a lookup, or a default.

- [ ] **Step 11: Render the book name in the Perform header**

In `src/app/perform/setlist/[id]/SetlistPerformClient.tsx`, near the setlist title in the header region (the same area as the back button and `KeepAwakeToggle`, around lines 236-271), render the resolved book name when present:

```tsx
{bookTitle(book) && (
    <p className="text-sm text-muted-foreground truncate">{bookTitle(book)}</p>
)}
```

Import `bookTitle` from `@/lib/books/titles` — **not** from `@/lib/books/registry`. Match the surrounding header's existing spacing and truncation conventions rather than inventing new ones.

- [ ] **Step 12: Verify no bundle regression and typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx vitest run src/lib/books`
Expected: PASS, including the bundle guard.

Then confirm by inspection that no file under `src/components/` or `src/app/perform/` imports `@/lib/books/registry`:

```bash
grep -rn "books/registry" src/components src/app || echo "clean"
```
Expected: `clean`.

- [ ] **Step 13: Commit**

```bash
git add src/hooks/use-setlist-performance.ts src/app/perform/setlist/[id]/SetlistPerformClient.tsx
git commit -m "feat(perform): name the prayer book in the Perform header

A page number without its book is a confident wrong instruction. Resolves
the slug through the lightweight titles module so the 80KB book corpus
stays out of the client bundle."
```

---

## Task 3: Carry page numbers into the gig-packet PDF

**Why:** `PrintModal.tsx` hand-builds each track object field by field, and neither `PrintTrackPayload` nor `PrintTrack` declares `liturgyRef`. The musician's printed packet therefore omits page numbers today — the exact field Daniel named as the minimum requirement for the musician version. This is a live bug, not a new feature.

**Files:**
- Modify: `src/lib/print-generation.ts`
- Modify: `src/lib/print-pipeline.ts`
- Modify: `src/components/setlist/PrintModal.tsx`
- Modify: `src/types/__tests__/track-fields.test.ts`
- Read for reference: `src/lib/pdf/service-sheet-pdf.ts`

**Interfaces:**
- Consumes: `TRACK_FIELDS` from Task 1; the `liturgyRef` shape from `SetlistTrack`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Widen the two payload types**

In `src/lib/print-generation.ts`, add to `PrintTrackPayload` (after `description?: string`):

```ts
    /** Phase 4: printed page in the service's prayer book. The musician's
     *  packet needs this for the same reason the rabbi's sheet does. */
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
```

Add the identical two members to `PrintTrack` in `src/lib/print-pipeline.ts` (after its `description?: string`), with the same comment.

- [ ] **Step 2: Forward them from PrintModal**

In `src/components/setlist/PrintModal.tsx`, inside the `tracks.map(t => ...)` object literal (around lines 197-214), after `description: t.description,`:

```ts
                    liturgyRef: t.liturgyRef,
                    honors: t.honors,
```

- [ ] **Step 3: Update the Task 1 projection entry**

In `src/types/__tests__/track-fields.test.ts`, move `liturgyRef` and `honors` from the `PrintTrack` projection's `intentionallyDropped` map into its `forwarded` list, and delete their "not yet plumbed" reasons.

Run: `npx vitest run src/types/__tests__/track-fields.test.ts`
Expected: PASS.

- [ ] **Step 4: Render the folio in the printed packet**

Read `src/lib/print-pipeline.ts` in full to find where non-song / service-flow rows are drawn, and read `src/lib/pdf/service-sheet-pdf.ts` (the folio treatment, the `clean()`/`toWinAnsi()` helpers, and the wrapping logic) for the established house treatment.

Render the folio as `p. <n>`, right-aligned on the row, mirroring the rabbi sheet. Requirements:

- If the packet uses pdf-lib `StandardFonts`, **all** strings must pass through the same WinAnsi sanitisation the service sheet uses. Hebrew cannot render in StandardFonts and degrades to `?` — honoree names and notes must be transliterated by the author, and the renderer must not crash on non-WinAnsi input.
- Never let a folio overlap or get overlapped by the row title. The service sheet had a shipped bug where a long cue line ran past the physical page edge and printed a congregant's name off-paper inside a structurally valid PDF that all eight tests passed. Measure the title's width with `font.widthOfTextAtSize` and reserve the folio column before drawing, exactly as the service sheet now does.
- A row with no `liturgyRef` prints with no number and never blocks generation.

- [ ] **Step 5: Test the packet rendering**

Add assertions to the print-pipeline's existing test file (locate it under `src/lib/__tests__/` or alongside; match the existing suite's conventions). Cover: a flow row with a folio renders `p. 12`; a row without one renders no `p.`; a row whose title is long enough to reach the folio column does not overlap it. Prefer a content-stream assertion over a "did it produce bytes" assertion — a PDF that renders text off-page is still structurally valid, which is how the earlier overflow bug passed its whole suite.

Run: `npx vitest run <the print-pipeline test path>`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/print-generation.ts src/lib/print-pipeline.ts src/components/setlist/PrintModal.tsx src/types/__tests__/track-fields.test.ts
git commit -m "fix(print): gig packet was silently dropping page numbers

PrintTrackPayload, PrintTrack and PrintModal's hand-built track map all
omitted liturgyRef, so the musician's packet printed no page numbers —
the one field the musician version was required to carry."
```

---

## Verification (controller runs these, not the implementers)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm test` — full suite. Baseline before this branch is **3704 passed / 10 failed**, all ten pre-existing and unrelated (verified at `13de94a8ed` by detached checkout; the tenth, `bridge/src/__tests__/x32-query-after-command.test.ts`, is a documented load-flake that passes solo). Any *new* failure is this branch's.
- [ ] Push to `origin master`, wait for Vercel, confirm the deployed sha at `/api/version`.
- [ ] **Production probe on a real iPad-width viewport** (820×1180 WebKit): author a setlist through MCP with a book, a prayer row carrying a folio and an honor, a header row carrying a service-wide honor, and one row with no folio. Open `/perform/setlist/<id>`. Confirm: the page numbers align in a column and are legible at arm's length; the book name shows in the header; the honoree's name is not truncated away; the no-folio row looks deliberate rather than broken; song rows are visually unchanged. Delete the test setlist afterward.
- [ ] Generate a gig packet for that setlist and confirm the page numbers print.
- [ ] Append any human-judgment item to `.paul/UAT-PENDING.md`.

---

## Self-Review

**Spec coverage.** Phase 4's row reads "Read-only rabbi web view; Perform-mode polish for outline-rich setlists on 11" iPads." The rabbi web view is deliberately dropped per Daniel's scope decision, recorded at the top of this plan. The Perform-mode half is covered by Task 2. Two items are in this plan but *not* in the spec's Phase 4 row: the gig-packet fix (Task 3) and the field census (Task 1). The gig-packet fix is a live bug against the spec's own §1 purpose — "versions for the musicians that at the very least include page numbers" — discovered during the Phase 4 audit; it belongs here. The census is scoped tightly to the two projections this plan touches and exists because this exact bug class has now shipped three times.

**Placeholder scan.** Two steps direct the implementer to read a file rather than handing them the code: Task 1 Step 2 (the compiler generates the field list — deliberate, since a hand-copied list from this plan could drift from `models.ts`) and Task 3 Step 4 (the print-pipeline's row-drawing code was not read while writing this plan). Task 3 Step 4 is the weakest step in the document; its implementer should be given the more capable model and should report the exact insertion point they chose.

**Type consistency.** `bookTitle(slug: string | undefined): string | undefined` is used identically in Tasks 2 Step 11 and its test. `liturgyRef` is written with the same shape — `{ book: string; unitId?: string; folio: number }` — in `models.ts`, `PrintTrackPayload`, and `PrintTrack`. `TRACK_FIELDS`/`TrackFieldName` are produced in Task 1 and consumed in Task 3 Step 3.

**Known gap, accepted:** `estimatedMinutes` is censused and forwarded but rendered nowhere in this plan. The rabbi sheet deliberately draws no timing column, and no one asked for one on the iPads. Leaving it unrendered is a decision, not an oversight.
