# RETURN — Multi-tenant phase 7 (Hebrew), 2026-10-13

Executor: Claude Code (Opus 5.5). Five Opus lanes:
- A, B, C: string extraction.
- D: residual strings, PDF labels and Hebrew font.
- E: Hebrew translation and glossary.

Then three independent Opus passes over the Hebrew: review, third pass, and a review of the delta.

Branch `claude/multitenant-2026-10-12`, merged to `master`. Shipped in three deploys:

| Deploy | Commit | Vercel |
|---|---|---|
| Infrastructure | `386aac9a` | `dpl_228yqQQQmLzn9BNDA8ez6f1caohJ` |
| Extraction (A+B+C) | `cd223f37` | `dpl_9SpMa1nCcLVzoV7uwj3EuaTQDcFZ` |
| Hebrew, residual strings, PDFs | `2c1b03bb` | `dpl_8979r1ZHBKJ24c2B4sjYz4fVQjc8` |

## Gate

**PASS.**

| Gate item | Evidence |
|---|---|
| CRC and BL English output matches the golden captures | Production HTTP golden after each of the three deploys: **all surfaces identical** for CRC and BL. That covers MCP instructions and the signed-in BL surfaces (throwaway BL bearers minted, then revoked: `a83jbduhE6NJcZLm8pK2`, `ZbB2DGKc1ljDowGi9spD`, `LsRiqeUZetKKbXZaF96E`). Unit goldens for crc and BL are unchanged throughout: titles, print footer, legal pages (byte-identical HTML), PDFs. |
| Every band-facing and admin screen in Hebrew, right to left, no untranslated string | Live on the throwaway Hebrew tenant `mtprobe4` (`crl-mtprobe4.vercel.app`, locale `he` / `rtl` / `Asia/Jerusalem`). Each page served `<html lang="he" dir="rtl">` with Hebrew text throughout. <br>• Signed out: `/login`, `/privacy`, `/terms`, `/accessibility`. <br>• Signed in as a tenant admin: `/` (→ Perform), `/setlists`, a setlist, `/library`, `/settings`, `/manage`, `/perform`, a Perform setlist, `/schedule`. <br>• The Latin that remains is data: setlist and song names, the email address, the version number, Rabbi Daniel Bogard's name. <br>• Scan (`src/__tests__/i18n/no-raw-strings.test.ts`, fails on any user-visible string bypassing `t()`) plus the pseudo-locale suites: **41 files, 294 tests passed**. The not-yet-migrated list is **empty**. <br>• `scripts/i18n-he-missing.mjs --list`: **0 missing**, every namespace. |
| Chord lines do not flip | Every chart renderer marks its content box `dir="ltr"` on an rtl page, through `ChartContent` / `useChartContentDir`: PDF, text chord chart, MusicXML, image, chart thumb, transposer. English pages get no attribute, so their DOM is unchanged. `src/__tests__/mt-p7/rtl-components.test.tsx` covers ltr and rtl. The throwaway tenant had no chart file, so this was not repeated live. |
| Dates in Asia/Jerusalem | Formatting goes through the tenant's `timeZone`. Live on `mtprobe4`: "יום שישי, 16 באוק׳" and "16 באוק׳ 2026" for a 16 October setlist. `src/__tests__/mt-p7/format.test.ts` covers it. |
| Hebrew PDFs on Vercel | A cover packet from `crl-mtprobe4.vercel.app/api/setlist/print` printed Hebrew labels, the Hebrew track title and the Hebrew footer (Alef embedded). The same request to CRC printed English labels and footer, and printed the Hebrew title instead of "?" (decision 2). |
| Review report | `docs/planning/2026-10-12-multitenant/P7-HE-REVIEW.md` (summary below). |

## Hebrew review (summary of P7-HE-REVIEW.md)

- **Translation:** 2,271 keys by lane E, plus a 98-key delta for lane D's strings. Glossary in `src/i18n/notes/GLOSSARY-he.md`, translator guide in `src/i18n/notes/TRANSLATING.md`.
- **Independent review** of 2,310 strings: **108 findings**.
  - 5 were wrong:
    - legal "us" rendered as the subject form, twice;
    - SMS "accepted", twice;
    - the capo-fret term.
  - The rest were wording drift: retry phrasing, glossary drift, progress-versus-button verb forms, and two legal copies that diverged.
- **Third pass** on all 108: 95 applied as proposed, 12 reworded, 1 kept with its reason logged.
- **Delta review** (98 keys): 6 findings. 2 applied; 4 optional ones logged.
- **Register:** no gendered address (infinitive and noun forms); formal register for the legal pages. Rulings recorded in the glossary, e.g. קבלת שבת for the Friday-evening service, מצב במה for Gig Mode.

## Test tails (merged tree `ff1717ee`)

- `npx tsc --noEmit`: 0.
- `npx vitest run`: **570 files** (3 skipped); **6,384 tests** passed.
  - The first run failed two goldens for the Hebrew test tenant (`testshul`), which the later Hebrew passes had changed: the v2 title word order and the Hebrew print footer.
  - Both were updated (`687495b0`). The crc and BL cases in the same files are unchanged.
- `npm run test:emulator`: **119 files, 2,204 tests** passed.
  - One testshul label expectation was updated to its Hebrew string (`ff1717ee`).
- Clean `next build --webpack` (after `rm -rf .next`): 0.
- `login-bundle-size`, `login-full-payload-size`, `login-import-graph-regression`: 3 passed.
  - Phase 7 had grown `/login` from 750 to 782 KB against the 760 KB budget. An earlier gate had measured a stale `.next`.
  - `d4be1d39` moved `useFormat` to `@/i18n/format-client`, which takes date-fns off `/login`. It also moved `tokensFor` to `string-tokens.ts`, which takes `STRING_BASE` off the client.
  - Result: 755 KB.

## Decisions

1. **Gender-free Hebrew register.** This is standard Israeli UI practice and suits an egalitarian community; the reviewer checked it.
2. **CRC and BL gig packets that contain Hebrew now print it** (Alef embedded) instead of "?". The handoff names the "?" defect as phase 7 work. All-Latin packets are byte-identical.
3. **The testshul goldens are Hebrew** by design. testshul is the Hebrew test tenant.
4. **Calendar-feed hints name the tenant** (`{community}`). They read "CRC" for crc and BL exactly as before, and the tenant's short name elsewhere.
5. **Template and wizard labels go through the tenant's service-type names.** For crc and BL these equal the catalogue; this was checked in code and against production Firestore.
6. **Bold kept inside translated sentences** through `interpolateNodes`: "browse" on the drop zone, and the setlist name in the transfer dialog.
7. **Legal, privacy, terms, SMS-consent, accessibility and `api-*` text is server-only**, so it stays out of client bundles.
8. **File extensions in Hebrew strings** (".csv") are wrapped in bidi isolates (U+2066/U+2069) so the dot stays on the left.

## Carried forward

- **`/setlists` first paint names "CRC Music" on any tenant but CRC.**
  - `SetlistDashboard` renders the dashboard without the server greeting. For a viewer with no name, the fallback reads "Welcome to CRC Music" / "ברוכים הבאים ל-CRC Music" until the browser swaps in the name greeting.
  - BL has the same flash today. Fixing it changes BL's first paint, so it was left alone.
  - Fix before Nava's onboarding (phase 8): pass the server greeting or the tenant short name.
- **Setlist card day badge** (`SetlistCards.tsx`, `getDate()`) uses the runtime's timezone.
  - Real setlists store `eventDate` as a Timestamp at 17:00–18:00 UTC, which is the same day everywhere that matters, so nothing shows wrong today.
  - A date-only string would show the previous day in America/Chicago. Pre-existing; low.
- **English oddities lane E found.** They were not changed, because changing them changes CRC and BL English:
  - `songCount_one`-style plurals;
  - "cowork" on the accessibility page;
  - "published" in the push description.
- **Library-review tab switch with an open row** crashed in jsdom. Pre-existing; check it in a browser.
- **Tenant "Books" footer.** For a non-CRC Hebrew tenant the footer reads "נוצר ב-{shortName} Books". Nava's branding should set its own `printFooter` in phase 8.
- **`crl-mtprobe4.vercel.app` is still attached to the Vercel project.**
  - Removing it needs a Vercel token: the CLI token here has expired, and the connector has no remove-domain action.
  - The tenant doc is deleted and its Firebase sign-in domain is deauthorized (list back to 8), so the address serves "No such site".
  - Manifest: `manifests/tenant-address-throwaway-remove-mtprobe4-2026-10-13T10-30-44-432Z.json`.
- **From earlier phases:**
  - perform-off rough edges;
  - the `MCP_FEATURE_FILTER` env entry;
  - phase 2 step 5;
  - `VERCEL_API_TOKEN` (Needs Daniel).

## Commits

| Commit | What it is |
|---|---|
| `386aac9a` | Merge: infrastructure (`t()`, catalogues, language and direction, Hebrew fonts, date helpers, RTL pieces, scan, pseudo-locale) |
| `46f0e1ba`, `df6b43e1` | Per-tenant social card and PWA manifest |
| `5755c375`, `8e89435d`, `cd223f37` | Merge of lanes A, B and C; lead fixes |
| `57e38435` | Merge: lane D |
| `d4be1d39` | Lead fixes: login payload, tenant service-type names, calendar hints |
| `ec61d832` | Merge: Hebrew translation, glossary, review and third pass |
| `dda2be76`, `a1f33b5b` | Hebrew calendar hints, Hebrew print footer, bidi isolates on extensions |
| `315b25e8`, `c0089c14` | Merge: Hebrew delta and its review; throwaway manifest |
| `687495b0`, `ff1717ee` | testshul goldens |
| `2c1b03bb` | Merge to master |

GATE: phase 7 infrastructure deployed ahead of the string extraction — proceeded because it renders English through the same strings (golden identical) and the lanes build on it.
GATE: Hebrew register without gendered address — proceeded because it is standard Israeli UI practice and suits an egalitarian community; the independent reviewer checked it.
GATE: CRC/BL gig packets containing Hebrew print Hebrew instead of "?" — proceeded because the handoff names the "?" defect as phase 7 work; all-Latin packets are byte-identical.
GATE: throwaway alias left attached on Vercel — proceeded because no Vercel credential is available here; the tenant and its sign-in domain are removed, so the address serves nothing.

## After the return (2026-10-13)

- **`/setlists` first-paint name fixed** (`b08f9b9b`, `dpl_DmZCbyNyu139cnDXrLpE7EfyQ1Tr`), approved by Daniel. The page passes the host tenant's branding short name to the dashboard, as the home page does.
  - Gates: tsc 0; vitest 6,385 passed, 1 failed (`ReconciliationProvider.test.tsx`, untouched; 3/3 solo); emulator 2,204; clean build 0; login 3/3.
  - Production golden before and after: all surfaces identical (signed out, and CRC MCP with the CRC bearer).
  - Live on BL with a throwaway member (`test-flash-bl-member@probe.invalid`, removed): server HTML and the hydrated page both read "Welcome to Brothers Lazaroff"; no page errors. CRC's name is unchanged ("CRC Music").
- **Vercel token in place.** Daniel supplied it; it is in `.env.local` and on the project as `VERCEL_API_TOKEN` (Production, Sensitive). `crl-mtprobe4.vercel.app` is detached; the project lists only the CRC and BL addresses and `sheet-music-app.vercel.app`.

GATE: BL's signed-in welcome line now names Brothers Lazaroff from the first paint — proceeded because Daniel approved the fix.
