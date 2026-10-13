# Phase 7 — i18n guide for the extraction lanes

Infra landed on branch `mt-p7-infra` (lane 1). This guide is what the three extraction lanes need; none of them should have to touch shared infrastructure. If you think you must, stop and tell the lead.

Rules that do not bend: no liturgical text anywhere in the repo (UI strings are fine; never add prayer text, not even in a test fixture); never re-sort setlist rows; do not rename fields Overlays reads; CRC and BL English output must not change (the golden tests under `src/__tests__/mt-p7/golden`, `src/__tests__/mt-p1-lane2`, `src/lib/org/__tests__` and `src/lib/pdf/__tests__/service-sheet-pdf.golden.test.ts` stay green). Platform console and MCP text stay English.

## 1. The API

Client components:

```tsx
import { useT, useFormat, useI18n, useReadingDirection } from "@/i18n/client"

const t = useT()
<Button aria-label={t("common.close")}>{t("setlists.newSetlist")}</Button>
t("library.fileCount", { count: n })          // plural
t("setlists.deleteConfirm", { name: s.name }) // {var}
```

Server components, route handlers, server actions:

```ts
import { getT, getI18n, getFormat } from "@/i18n/server"

const t = await getT()                 // request's tenant + the user's ui-lang cookie
const { t, fmt, lang, dir } = await getI18n()
return NextResponse.json({ error: t("api.fileNotFound"), code: "not_found" }, { status: 404 })
```

No request (cron, Inngest, emails): `getOrgConfig(orgId)` first, then `tForOrg(orgId)` (synchronous, tenant's language).

`orgString(orgId, key)` and `label(orgId, key)` still work unchanged; they are thin wrappers over the `org` namespace (`t("org.setlist")`) in the tenant's language. New code uses `t("org.…")`.

Lookup order: tenant override (`vocabulary.overrides["ns.key"]`, or for `org.*` the phase 1 un-prefixed key) → active language → English → the key itself. Tenant tokens `{id} {name} {shortName} {abbreviation} {host}` work in every string.

## 2. Catalogue layout: adding a namespace

```
src/i18n/en/<ns>.json      English — the source of truth
src/i18n/he/<ns>.json      Hebrew (the translation subagent fills this)
src/i18n/notes/<ns>.json   translator notes, one per key
```

- A new namespace is a new file. Nothing to register: `require.context` (webpack/Turbopack) and `import.meta.glob` (vitest) pick every file up. Lanes never edit a shared file to add strings.
- Each lane owns its namespaces; never add keys to another lane's file. Shared words (Save, Cancel, Close, Delete, Loading…) go in `common` — **only the lead adds to `common`**; until then, put the word in your own namespace (duplicates are fine, the translators see the notes).
- File names: lower camelCase or kebab (`setlistGrid`, `perform`, `admin-users`). The `org` namespace has no `en/org.json` (its English is `STRING_BASE`).
- Values are strings; nested objects are allowed and become dotted keys (`{"dialog": {"title": …}}` → `ns.dialog.title`). Keys starting with `$` are ignored (use `"$comment"` for file notes).
- **Notes files are flat**, even when the English file nests: one entry per dotted key below the namespace (`{"dialog.title": {"where": …}}`). The catalogue test looks notes up by the dotted key only (corrected at the lane merge; all three lanes found this).

### Key naming

- `ns.camelCaseMeaning`: name what it means, not where it sits or what it says (`setlists.deleteConfirm`, not `setlists.areYouSureText`).
- One key per sentence. Never build a sentence from fragments (`t("a") + name + t("b")`): use `{var}` — word order differs in Hebrew.
- Plurals: `key_one`, `key_other` in English (and an optional exact `key_zero`); Hebrew adds `key_two`. Call `t("ns.key", { count })`. Never `count === 1 ? … : …`.
- Keys are literal strings at the call site (`t("ns.key")`). The catalogue test only checks literal keys; if you must choose a key at runtime, map to literal keys in an object (`const LABEL = { light: "settings.light", … } as const`).
- Don't uppercase in code (`.toUpperCase()` does nothing to Hebrew); write the English in the case it shows or use CSS `uppercase`.

### Notes per key (required — the catalogue test fails without one)

`src/i18n/notes/<ns>.json`, keyed like the English file (plural variants share the base key's note):

```json
{
  "deleteConfirm": {
    "where": "Setlist editor: confirm dialog when deleting a whole setlist",
    "who": "leaders",
    "maxLength": 60,
    "context": "{name} is the setlist's name"
  }
}
```

`where` (screen + element), `who` (leaders / musicians / admins / anyone with the link), `maxLength` (characters before it breaks the layout: buttons ~20, badges ~10), optional `context` (what each `{var}` is, ambiguity: "chart" = sheet music), optional `"translate": false` for machine text (ids, URLs, brand tokens).

Glossary for translators (the translation lane owns the Hebrew; keep English consistent): service, setlist (BL: set), chart (the sheet music file), band leader, Vocal Lead (not "Lead"), wedge (monitor), Perform mode.

## 3. Dates and numbers: the mechanical swap

Client: `const fmt = useFormat()`. Server: `const fmt = await getFormat()` (or `(await getI18n()).fmt`).

| Today | Replace with |
|---|---|
| `d.toLocaleDateString('en-US' \| undefined, opts)` | `fmt.date(d, opts)` |
| `d.toLocaleString('en-US' \| undefined, opts)` | `fmt.dateTime(d, opts)` |
| `d.toLocaleTimeString(...)` | `fmt.time(d, opts)` |
| `n.toLocaleString('en-US')` | `fmt.number(n)` |
| `formatDistanceToNow(d, { addSuffix: true })` | `fmt.relative(d)` |
| date-fns `format(d, 'PPP')`, `format(d, 'MMM d')` | `fmt.pattern(d, 'PPP')` |

- Inputs may be `Date`, ms, ISO string or a Firestore `Timestamp` (`{ toDate() }`); a missing or invalid date returns `""` (keep your own `|| t("…noDate")` fallback).
- English tenants (CRC, BL) format in the runtime zone exactly as today (golden: `src/__tests__/mt-p7/golden/date-format-cases.ts`). A Hebrew tenant formats in its own zone (Asia/Jerusalem) in Hebrew. `locale.formatTimeZone` ("tenant" | "runtime") in the tenant config overrides that.
- Leave alone: `Intl.DateTimeFormat` uses that compute values rather than display them (`src/lib/org/locale.ts`, `src/lib/parse-event-date.ts`, the Hebrew-calendar math in `greeting.ts` / `liturgical-calendar.ts`), machine formats (`yyyy-MM-dd`, ISO), and lowercased search keys in `use-setlist-dashboard.ts` (search must keep matching English input; add a Hebrew variant beside it if needed).
- One known behaviour note: calls that passed `undefined` as the locale used the browser's locale; the helper uses `en-US` for English. Identical for en-US browsers (the band's iPads).

Inventory (55 call sites, 25 files): `src/components/dashboard/*` (5), `src/components/setlist/*` (11 incl. date-fns), `src/components/performance/*` (3), `src/components/admin/*` (6), `src/hooks/use-setlist-dashboard.ts` (4), `src/hooks/use-upcoming-prep.ts`, `src/lib/firestore-helpers.ts` (2), `src/lib/liturgical-templates.ts`, `src/app/(main)/schedule/page.tsx`, `src/app/(main)/DashboardClient.tsx`, `src/app/api/setlist/notify-band`, `resend-email`, `src/app/api/cron/scheduling-reminder` (emails: use `getFormat(orgId)`), `src/components/calendar/UnifiedCalendar.tsx`, `src/components/library/*` (2), `src/components/nav/NotificationBell.tsx`, `src/components/scheduling/ScheduleCard.tsx`, `src/components/settings/McpAccessSettings.tsx`, `src/components/ui/calendar.tsx`, `src/components/home/NextServiceCard.tsx`.

## 4. Right to left

The root `<html>` gets `lang="he" dir="rtl"` on a Hebrew tenant; the whole UI mirrors through the browser. Your job is to stop physical CSS from fighting it. Tailwind v4 has every logical utility.

| Physical (don't) | Logical (do) |
|---|---|
| `ml-*` `mr-*` | `ms-*` `me-*` |
| `pl-*` `pr-*` | `ps-*` `pe-*` |
| `left-*` `right-*` (positioning) | `start-*` `end-*` |
| `text-left` `text-right` | `text-start` `text-end` |
| `border-l` `border-r` | `border-s` `border-e` |
| `rounded-l` `rounded-tr` … | `rounded-s` `rounded-se` … |
| `-ml-*`, `-left-*` | `-ms-*`, `-start-*` |

- Leave symmetric centring alone (`left-1/2 -translate-x-1/2` stays centred). `space-x-*` and `gap-*` are already logical in Tailwind v4.
- `rtl:` / `ltr:` variants exist for the rare case with no logical utility, but prefer logical utilities: `rtl:` adds classes to CRC's DOM and it also fires inside a chart's `dir="ltr"` box (Tailwind matches `[dir="rtl"] *`).
- Counts today (band-facing + admin, `src/app` `src/components` `src/hooks`): `mr` 87, `ml` 54, `text-left` 58, `right-*` 57, `left-*` 55, `pl` 43, `pr` 26, `border-l` 23, `text-right` 11, `rounded-l/r/tl/tr` 10 — about 420 occurrences.
- Fixed toolbars positioned `right-4` (e.g. the TextScoreViewer control bar) become `end-4`.
- Physical swipe / drag math (`deltaX > 0`) must ask `useReadingDirection()`.

### Icons that point

```tsx
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
<DirectionalIcon icon={ChevronRight} className="w-4 h-4" />
```

Mirror arrows and chevrons that mean back/forward/next/previous/open-in-panel (`ChevronLeft/Right`, `ArrowLeft/Right`, `ChevronsLeft/Right`, `Undo2`/`Redo2` when they mean history). Do not mirror icons of physical things (play ▶, music notes, clocks, refresh, download, upload, logos). The class is added only on rtl, so CRC's DOM is unchanged. About 36 files import a left/right arrow or chevron today; the analysis estimated 13 that mean direction.

### Chart content keeps its own direction

Chord lines, systems and chart pages never flip. Infra already applied the rule at the four renderers: `PDFViewer` (`[data-pdf-scroll]`), `TextScoreViewer` (the monospace chord/lyric block), `SmartScoreViewer` (the OSMD container), `ImageScoreViewer` (`[data-image-scroll]`). They carry `dir="ltr"` only on an rtl page. For any new surface that shows chart content (a chord preview, a transposer sample, a printed chart preview):

```tsx
import { ChartContent, useChartContentDir } from "@/components/i18n/ChartContent"
<ChartContent className="font-mono">{chordLines}</ChartContent>
<pre {...useChartContentDir()}>{chordLines}</pre>
```

UI chrome around a chart (toolbars, page counters, zoom labels) stays in the page direction — keep it outside the chart box.

### Perform next/previous

```tsx
const { forwardKey, backKey, forwardSwipeSign, stepFor } = useReadingDirection()
```

Keyboard: `forwardKey` is ArrowRight in ltr, ArrowLeft in rtl. Tap zones: `stepFor("right")` is +1 in ltr, −1 in rtl. Swipes: a swipe whose sign equals `forwardSwipeSign` moves forward. **Decision for the perform lane:** song-to-song navigation follows the reading direction; page turns inside a PDF chart arguably follow the chart (left-to-right) — decide, log it, and keep CRC identical (in ltr every value equals today's behaviour).

## 5. The untranslated-string scan

`src/__tests__/i18n/no-raw-strings.test.ts` (scanner `scanner.ts`, scope `scope.ts`). It fails on user-visible literals that bypass `t()`: JSX text; string children (`{"x"}`, `{a ? "Yes" : "No"}`, template literals); attributes `title aria-label aria-description placeholder alt label description tooltip heading subtitle emptyText emptyMessage confirmLabel cancelLabel confirmText cancelText actionLabel helperText`; `toast*()` (incl. `toast.promise` messages), `alert/confirm/prompt`, `announce()`; message setters (`setError("…")`, `setStatusMessage("…")`); and in `src/app/api/**/route.ts`, sentence-like `error/message/detail/reason/hint/warning` values in `*.json({...})` bodies (machine codes like `"not_found"` are fine — keep sending one beside the translated message).

Not scanned: platform console, MCP, cron/webhook/bridge/inngest routes, `src/lib/ai`, tests, `src/i18n`.

Exceptions, in order of preference:
1. It is data, not UI (a song title, a person's name): it is not a literal, the scan does not see it.
2. A literal that must stay verbatim (brand name, a code sample): `// i18n-ignore: <reason>` on the line or the line above (`{/* i18n-ignore: <reason> */}` in JSX). File-wide: `// i18n-ignore-file: <reason>` in the first lines (dev-only pages).
3. `src/__tests__/i18n/allowlist.ts` (shared — avoid).

### The not-yet-migrated list

`src/__tests__/i18n/not-yet-migrated.ts`. Files under an entry are skipped. `dir/` = recursive, `dir/*` = files directly in it. When your directory is clean, **delete its line and only its line** (entries are separated by blank lines so parallel deletions merge cleanly). The test fails on a stale entry, so you cannot forget. Final state: empty list.

Also: `src/__tests__/i18n/catalogue.test.ts` — every literal `t("ns.key")` must exist in English, every English key needs a note, Hebrew keys must exist in English with the same `{placeholders}`. Hebrew completeness is always on (every English key needs Hebrew unless its note says `"translate": false`); `node scripts/i18n-he-missing.mjs --list` lists what is missing, see `src/i18n/notes/TRANSLATING.md`.

## 6. The pseudo-locale check

`qps` (ltr) and `qps-rtl` render every catalogue string as `⟦Šéţţîñĝš··⟧`; anything on screen without brackets did not come through `t()`.

In tests (reuse this for every component you migrate):

```tsx
import { renderPseudo, expectNoUntranslatedText, renderWithI18n } from "@/test-utils/i18n"

const r = renderPseudo(<SetlistCard setlist={fixture} />)            // add { rtl: true } for qps-rtl
expectNoUntranslatedText(r.container, { allow: [fixture.name], ignoreSelector: "[data-song-title]" })
renderWithI18n(<SetlistCard … />, { lang: "he", config: makeTestOrgConfig() })   // real Hebrew, rtl
```

In a dev browser: cookie `ui-lang=qps` or `ui-lang=qps-rtl` (outside production only, or with `I18N_PSEUDO=1`), or `I18N_PSEUDO_LOCALE=qps-rtl` in the environment.

Components rendered in unit tests without a provider still show English (test-setup primes the real catalogue), so existing tests that assert English text keep passing after extraction.

## 7. Language selection (for reference)

Tenant `locale.language` (`en` | `he`) with a per-user override: the host-only `ui-lang` cookie, set by the Language card in Settings (`src/components/settings/LanguageSettings.tsx`, shown only when the tenant's language is not English; options: the tenant's language and English). An English tenant ignores the cookie entirely, so CRC and BL can never flip.

## 8. Directories and string counts (for the lane split)

Scanner findings (occurrences, not unique strings) on master 745c1c16 + infra: **2,195 in 221 files, 63 list entries.** Suggested three-lane split (~720 each, disjoint directories):

**Lane A — band-facing: Perform, dashboard, nav, settings (~755)**

| Entry | Strings | Files |
|---|---:|---:|
| `src/components/performance/*` | 138 | 22 |
| `src/components/music/*` | 87 | 10 |
| `src/components/monitor/*` | 71 | 8 |
| `src/components/settings/*` | 57 | 3 |
| `src/hooks/*` | 46 | 7 |
| `src/components/dashboard/*` | 41 | 7 |
| `src/components/nav/*` | 38 | 6 |
| `src/app/(main)/settings/*` | 30 | 1 |
| `src/app/perform/setlist/` | 25 | 2 |
| `src/app/login/*` | 23 | 2 |
| `src/app/(main)/*` | 18 | 2 |
| `src/app/qr/[code]/*` | 18 | 1 |
| `src/components/ui/*` | 14 | 6 |
| `src/app/(main)/schedule/*` | 13 | 1 |
| `src/app/invite/[token]/*` | 13 | 1 |
| `src/app/(main)/monitor/` | 12 | 3 |
| `src/components/scheduling/*` | 12 | 1 |
| `src/components/*` | 11 | 2 |
| `src/app/(v2)/v2/*` | 10 | 1 |
| `src/components/home/*` | 10 | 1 |
| `src/components/calendar/*` | 9 | 3 |
| `src/components/v2/*` | 9 | 2 |
| `src/app/*` | 8 | 3 |
| `src/app/perform/[fileId]/*` | 8 | 1 |
| `src/components/audio/*` | 7 | 1 |
| `src/components/auth/*` | 7 | 1 |
| `src/components/people/*` | 5 | 1 |
| `src/app/auth-error/*` | 4 | 1 |
| `src/app/perform/*` | 4 | 1 |
| `src/components/offline/*` | 4 | 1 |
| `src/app/test-login/*` | 3 | 1 |

**Lane B — setlist editing, library, their APIs (~715)**

| Entry | Strings | Files |
|---|---:|---:|
| `src/components/library/*` | 205 | 11 |
| `src/components/setlist/*` | 177 | 11 |
| `src/components/setlist/grid/` | 120 | 23 |
| `src/components/setlist/importer/*` | 75 | 1 |
| `src/components/setlist/modals/*` | 34 | 4 |
| `src/app/api/setlist/` | 23 | 9 |
| `src/components/setlist/wizard/*` | 18 | 1 |
| `src/app/api/library/` | 15 | 5 |
| `src/app/api/setlists/` | 15 | 6 |
| `src/app/api/recordings/` | 13 | 2 |
| `src/app/(main)/library/*` | 5 | 1 |
| `src/lib/*` | 5 | 2 |
| `src/app/(main)/setlists/` | 4 | 1 |
| `src/app/api/charts/` | 3 | 2 |
| `src/app/api/intake/` | 3 | 1 |

Plus (not caught by the scanner — drawn with pdf-lib, not JSX): the service sheet's own labels in `src/lib/pdf/service-sheet-pdf.ts` (`"Service"`, `"HONORS"`, `"HONORS (CONT.)"`, `"(untitled)"`; header rows use `toUpperCase()`), and the print/gig-packet labels in `src/lib/print-pipeline.ts` and `src/lib/pdf/text-chart-pdf.ts`. Server-side: `tForOrg(orgId)` or pass a `t` in. Note those PDFs use WinAnsi fonts except the service sheet; Hebrew there needs the service sheet's Alef embedding (`src/lib/pdf/hebrew-fonts.ts`, `embed-ttf.ts`, `bidi-visual.ts`).

**Lane C — admin, legal, remaining APIs (~725)**

| Entry | Strings | Files |
|---|---:|---:|
| `src/components/legal/*` | 174 | 1 |
| `src/components/admin/*` | 136 | 6 |
| `src/app/(main)/manage/` | 115 | 4 |
| `src/app/(main)/sms-consent/*` | 79 | 1 |
| `src/app/(main)/privacy/*` | 66 | 1 |
| `src/app/(main)/terms/*` | 58 | 1 |
| `src/app/(main)/accessibility/*` | 30 | 1 |
| `src/app/api/auth/` | 23 | 5 |
| `src/components/admin/library/*` | 15 | 1 |
| `src/app/api/scheduling/` | 11 | 5 |
| `src/app/api/ai/` | 5 | 4 |
| `src/app/api/admin/` | 4 | 3 |
| `src/components/admin/people/*` | 4 | 1 |
| `src/app/api/push/` | 2 | 1 |
| `src/app/(main)/changelog/*` | 1 | 1 |
| `src/app/api/nudge-admin/*` | 1 | 1 |
| `src/app/api/tenant/` | 1 | 1 |

Legal pages (privacy, terms, SMS consent, accessibility, `src/components/legal`) are ~400 of lane C's strings and are long legal prose that CRC and BL serve verbatim (`legal.useCrcText`). Lead: decide whether Hebrew tenants get a translated legal text, the English text, or a shorter platform text before lane C spends time on it.

Emails, SMS and the calendar feed (`src/lib/email*.ts`, `src/lib/sms*`, feed routes) are template-string builders the scanner does not see; they are off for Nava (`schedulingEmails`, `notifyBand`). Not assigned; they keep working in English.
