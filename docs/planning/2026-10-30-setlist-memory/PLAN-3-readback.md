# Setlist memory, release 3: readback and agent guide — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Give me the setlist for Shabbat" comes back as a short, exceptions-first readback computed by the server. Open items stay on a setlist until resolved. The agent guide teaches the whole flow.

**Architecture:**
- One pure function, `buildReadback`, turns draft or setlist rows into a headline, a short exceptions list and one "everything else" line.
- `draft_service` returns it. A new read tool, `read_back_setlist`, returns it for an existing setlist.
- Open items are an array on the setlist doc. Two editor tools add and resolve them.
- `.paul/AGENT-GUIDE.md` (served verbatim to CRC) gets a new first section, "Building a service", and loses references to retired tools.

**Tech Stack:** Next.js App Router, TypeScript, Firestore (firebase-admin), MCP SDK with zod, vitest, Firebase emulator tests.

**Spec:**
- `docs/planning/2026-10-30-setlist-memory/DESIGN.md`, sections 5.2–5.5.
- `docs/planning/2026-10-30-setlist-memory/DAVID-NOTES.md` (inputs 1–5).

## Global Constraints

- Never propose a setting or melody. The readback reports tiers; it never suggests a chart.
- Row order is the author's. Nothing here reorders, inserts or deletes tracks.
- Publish is retired. Do not mention `publish_setlist` or `preview_publish` as a step.
- Overlays contract fields on setlist and track stay unchanged. Adding `openItems` is allowed.
- No liturgical text in the repo.
- No Windows paths (`C:\…`) in any committed file. Tailwind reads `\hex` as a CSS escape and breaks the build.
- Tenant-scoped everywhere (`orgFrom(extra)`, `rowOrg`). Brothers Lazaroff gets open items and `read_back_setlist`, and has no profiles.
- Writes: admin or band_leader via `assertEditor`. Error codes go through `richError` and are registered in `src/lib/mcp/errors.ts`.
- A voice readback for a regular week is 5 items or fewer (DESIGN §6).
- The rabbi is never inferred.

## Review Focus

1. **A draft where every song slot is usual or standard** must read "Nothing new." plus the rest line, with no empty list wording. Test in Task 1.
2. **A slot filled from a usual tier that has no key on record** stays in the rest line, not the exceptions. The rest line counts it as "N with no key on record". Test in Task 1.
3. **More than 5 exceptions:** the voice text lists the first 5 in row order and ends "…and N more; say 'show all' for the list". `exceptions` still carries every item. Test in Task 1.
4. **Resolving an open item twice, or one from another tenant,** returns `open_item_not_found` and changes nothing. Test in Task 2.
5. **A setlist with no service type or rabbi slot** (old data, BrosLaz) gets a readback with no tiers. It lists only rows with no chart, plus open items, and never errors. Test in Task 3.

---

### Task 1: `buildReadback` and the draft readback

**Files:**
- Create: `src/lib/profiles/readback.ts`
- Test: `src/lib/profiles/__tests__/readback.test.ts`
- Modify: `src/lib/mcp/tools/draft-service.ts` (add `readback` to `DraftServiceResult`)
- Modify: `src/lib/profiles/__tests__/draft-service.emulator.test.ts` (one assertion)
- Modify: `src/lib/mcp/tools/index.ts` (draft_service description: mention `readback`)

**Interfaces:**
- Consumes: `Tier`, `Promotion` from `src/lib/profiles/tiers.ts`. `StandingChoice` (`byName`, `at`) from `src/lib/profiles/standing.ts`. `OVERRIDE_WINDOW_DAYS` (28). `getBook(slug)?.title` from `src/lib/books/registry.ts`.
- Produces:

```ts
export interface ReadbackRow {
    index: number
    label: string            // the row title, or the moment label for an open slot
    isSong: boolean
    hasChart: boolean
    tier: Tier | null        // null: no profile, or not a song row
    phrase: string | null    // the tier phrase, verbatim
    keyOnRecord: boolean
    standing?: { byName: string; at: string } | null
    promotion?: Promotion
}
export interface OpenItem { id: string; text: string; trackId: string | null; createdAt: string; createdByName: string }
export interface ReadbackItem { kind: "open_slot" | "no_chart" | "recent_standard" | "promotion" | "open_item"; index: number | null; text: string }
export interface Readback { headline: string; exceptions: ReadbackItem[]; rest: string; text: string }
export function buildReadback(input: {
    profileLabel: string | null; date: string | null; book: string | null; special: boolean
    rows: ReadbackRow[]; openItems: OpenItem[]; now: Date
}): Readback
export const READBACK_VOICE_MAX = 5
```

Rules (DESIGN §5.4). Write them as tests first:
- **headline:**
  - `"<profileLabel>, <Mon D>, <book title>."`, where the date renders "Nov 7" in UTC from `YYYY-MM-DD`.
  - Leave out a missing part with its comma.
  - Append " Marked special: changes are for this week only." when `special`.
- **exceptions, in this order:** song rows in row order, then open items in creation order.
  - `open_slot`: a song row with tier `last_time`, `other_service` or `new`. Text is `"<label>: <phrase>"`.
  - `no_chart`: a song row with no chart and tier null. Text is `"<label>: no chart yet"`.
  - `recent_standard`: tier `standard` with `standing.at` within 28 days of `now`. Text is `"<label>: your standard since <Mon D> (set by <byName>)"`.
  - `promotion`: any row with `promotion`. Text is `"<label>: third week of <chartName><in key>. Make it standard?"`.
  - `open_item`: text is `"Open: <text>"`.
- **rest:**
  - With a profile: `"Everything else is your usual <profileLabel>, <N> songs."`, where N = song rows with a chart not already listed.
  - Add `" (<K> with no key on record)"` when K > 0.
  - With no profile: `"<N> other songs have charts."`
  - When the list is empty, prefix "Nothing new. ".
- **text:**
  - `headline`, then the first 5 exceptions joined with " ", then `rest`.
  - When there are more than 5, insert `"…and <M> more; say 'show all' for the list."` before `rest`.

- [ ] **Step 1: Write the failing tests** in `readback.test.ts`. Cover:
  - `"lists open slots, recent standards, promotions and open items, in that order"`, with exact `kind` order and texts.
  - `"an old standard (40 days) goes to the rest line"`.
  - `"all usual → 'Nothing new.' and the song count"`.
  - `"usual with no key counts in the rest line, not as an exception"`.
  - `"more than 5 exceptions: text lists 5 and says how many more; exceptions keeps all"`.
  - `"special adds the this-week-only line to the headline"`.
  - `"no profile: no tier wording, lists rows with no chart"`.
- [ ] **Step 2:** Run `npx vitest run src/lib/profiles/__tests__/readback.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `buildReadback` in `src/lib/profiles/readback.ts`. It is pure, with no Firestore.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Wire it into `draftServiceTool`.**
  - Map the draft rows to `ReadbackRow`:
    - `hasChart` comes from `fileId`.
    - `keyOnRecord` is `key != null`.
    - `standing` comes from `loaded.rows[i].standing`, as `{ byName, at }`.
  - Pass `openItems: []`, `date: args.date` and `book: profile.book`, then return `readback` on the result.
  - In the emulator test's first case, add `expect(draft.readback.exceptions.map((e) => e.kind)).toEqual(["open_slot"])` and `expect(draft.readback.rest).toMatch(/1 songs?/)`.
- [ ] **Step 6: Verify.**
  - `npx tsc --noEmit -p .`
  - `npx eslint --max-warnings 0 <changed files>`
  - `npx firebase emulators:exec --project demo-draft-service --only firestore "npx vitest run -c vitest.emulator.config.ts src/lib/profiles/__tests__/draft-service.emulator.test.ts"`
  - Expected: PASS.
- [ ] **Step 7: Commit.** Message: `feat(profiles): exceptions-first readback on draft_service`.

### Task 2: Open items on a setlist

**Files:**
- Create: `src/lib/mcp/tools/open-items.ts`
- Test: `src/lib/mcp/__tests__/open-items.emulator.test.ts`
- Modify: `src/lib/mcp/tools/index.ts` (register two tools)
- Modify: `src/lib/mcp/tool-access.ts` (`WRITE_TOOLS` += both)
- Modify: `src/lib/mcp/errors.ts` (`open_item_not_found: 404`)
- Modify: the `get_setlist` implementation, so its result carries `openItems` (unresolved only, `[]` when absent)
- Modify: golden tool lists (`src/lib/mcp/__tests__/fixtures/p6-tool-lists-before.json` and the `tenant-mcp.test.ts` fixture), adding the two names on the authoring surface

**Interfaces:**
- Consumes: `OpenItem` from Task 1.
- Produces:
  - `addOpenItemTool(uid, { setlistId, text, trackId? }, org)` returns `{ ok, setlistId, item: OpenItem, openItems: OpenItem[] }`.
  - `resolveOpenItemTool(uid, { setlistId, itemId }, org)` returns `{ ok, setlistId, resolved: OpenItem, openItems: OpenItem[] }`.
  - `readOpenItems(data: Record<string, unknown>): OpenItem[]` is exported for Task 3.
  - Tool names are `add_open_item` and `resolve_open_item`.

Storage:
- The setlist doc has `openItems: Array<OpenItem & { resolvedAt: string | null; resolvedByName: string | null }>`.
- Writes run in a transaction, keep resolved items and increment `version`.
- `readOpenItems` returns unresolved items only, oldest first.
- `text` is trimmed, 1–300 characters. `trackId`, when given, must be a track of that setlist (`track_not_found`).
- Tool descriptions say:
  - **add_open_item:** "Record something this setlist still needs ('chart still needed', 'new arrangement; swap when it lands'). It is repeated in every readback until resolved."
  - **resolve_open_item:** "Mark an open item done."

- [ ] **Step 1: Write the failing emulator tests:**
  - `"adds an item and get_setlist shows it"`
  - `"resolve removes it from get_setlist and readOpenItems; the doc keeps it with resolvedAt"`
  - `"resolving twice → open_item_not_found, no write"`
  - `"BrosLaz cannot resolve a CRC item (open_item_not_found)"`
  - `"musician role is refused"`
  - `"empty text → invalid_argument"`
- [ ] **Step 2:** Run with the emulator command from Task 1, Step 6, on this file. Expected: FAIL.
- [ ] **Step 3:** Implement `open-items.ts`, then register the tools, classify them and add the error code.
- [ ] **Step 4:** Run this file plus `src/lib/mcp/__tests__/p6-tool-lists.golden.test.ts`, `tenant-mcp.test.ts` and `surfaces.test.ts`. Expected: PASS once the fixtures are updated.
- [ ] **Step 5: Commit.** Message: `feat(mcp): open items on a setlist`.

### Task 3: `read_back_setlist`

**Files:**
- Create: `src/lib/mcp/tools/read-back-setlist.ts`
- Test: `src/lib/mcp/__tests__/read-back-setlist.emulator.test.ts`
- Modify: `src/lib/mcp/tools/index.ts`, `src/lib/mcp/tool-access.ts` (`READ_TOOLS`), and the golden fixtures as in Task 2

**Interfaces:**
- Consumes:
  - `buildReadback` (Task 1) and `readOpenItems` (Task 2).
  - `findProfileTemplateFor` and `loadProfileTiers` from `src/lib/mcp/tools/service-profiles.ts`.
  - `profileKeyFor` and `rabbiRequired` from `src/lib/profiles/keys.ts`.
  - `slotKeyFor` and `loadSlotUses`, to tier this setlist's own rows.
- Produces: `readBackSetlistTool(uid, { setlistId }, org)`, returning `{ ok, setlistId, readback: Readback }`.

Behaviour:
- Read the setlist (tenant-checked, `setlist_not_found`) and its tracks in order.
- When the setlist has a stored `serviceType`, a rabbi slot where `rabbiRequired`, and a profile exists:
  - Tier each song row by its slot from history and standing. Use the same inputs `loadProfileTiers` uses, but key on this setlist's rows.
  - Read the setlist's own uses out of history, so a row does not count itself.
  - When a row's chart or key differs from a `standard` or `usual` tier, add an extra item `kind: "open_slot"` with text `"<label>: <chartName><in key> this week; usual is <phrase-chart><in key>"`.
- Otherwise tiers are null.
- The setlist's `special` flag sets `special`. `profileLabel` comes from the profile, else null.

- [ ] **Step 1: Write the failing emulator tests:**
  - `"a setlist matching its profile reads 'Nothing new'"`
  - `"a row in Cm where the usual is Dm is listed"`
  - `"open items are listed last"`
  - `"an untagged setlist gets a no-tier readback listing rows without charts"`
  - `"BrosLaz setlist works and never reads CRC data"`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the tool. Its description should start: "Read an existing setlist back the way it should be said aloud: exceptions first, then one line for everything else, plus open items. Use after any change and whenever the author asks 'what's on Saturday?'."
- [ ] **Step 4:** Run it with the golden tests. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(mcp): read_back_setlist`.

### Task 4: Agent guide — "Building a service"

**Files:**
- Modify: `.paul/AGENT-GUIDE.md`
- Test: whatever test asserts that CRC is served the file verbatim. It should still pass unchanged, because it compares against the file. Run `src/lib/mcp/__tests__/tenant-mcp.test.ts`.

Insert a new section, `## Building a service`, after the intro and before "When to ask vs. proceed". It contains these rules, in plain prose and short:

1. **Who is leading.** Ask who is leading before building Friday night or Shabbat morning ("Randy or you this week?"). Skip the question only when the request names the rabbi. Never infer it from past weeks or the calendar.
2. **"Shabbat" means Shabbat morning.** Say so in the first line ("Shabbat morning, Nov 7…").
3. **First Fridays.** A request for "Friday" in a week whose Friday is the month's first asks "Shir Shabbat or regular Friday night?".
4. **The flow.** Call `draft_service`, then say `readback.text` aloud. Show `readback.exceptions` as a short list on screen; give the full table only when asked. Then take short answers:
   - "yes" creates the setlist (`create_setlist_from_draft`);
   - "number 2 is the Klepper";
   - "keep it in Dm".
5. **One-off or standing.**
   - "this week" makes a one-off.
   - "keep it", "from now on", "always" or "standard" makes it standing (`standing: true`, or `set_standing_choice` on an existing setlist).
   - With no such words, it is a one-off; read `oneOffNote` back.
   - Read every `announcement` back.
   - When a row carries `promotion`, offer once.
6. **Special weeks.** When the author mentions guests, a memorial, a family's requests or a holiday, pass `special: true`. Changes on a special week are one-offs unless the author says "keep it".
7. **Email exceptions.** "Use Bryn's email about Saturday" means: read it with the client's Gmail connector, turn each request into a one-off change against the draft, and read back only those. Texts are pasted or dictated the same way.
8. **Open items.** Whatever can't be done yet becomes `add_open_item`. Repeat it until `resolve_open_item`.
9. **Ambiguous titles.** Resolve a low-confidence title through the profile and `get_song_history` first. Ask only when both are silent.
10. **`no_profile`.** Build that week from a recent setlist with `templateType` and `rabbi` set. The next draft learns from it.
11. **After any change,** `read_back_setlist` is the summary to say.

Also:
- Remove `record_bond_correction` and `publish_setlist` from the cheat-sheet.
- Add `draft_service`, `create_setlist_from_draft`, `get_service_profile`, `set_standing_choice`, `clear_standing_choice`, `get_song_history`, `export_setlists`, `read_back_setlist`, `add_open_item` and `resolve_open_item` under a new "Build and remember" bullet.

- [ ] **Step 1:** Edit the file. Use no exact Hebrew liturgical text and no Windows paths.
- [ ] **Step 2:** Run `npx vitest run src/lib/mcp/__tests__/tenant-mcp.test.ts`. Expected: PASS.
- [ ] **Step 3: Commit.** Message: `docs(mcp): agent guide teaches the build-and-readback flow`.

---

## Not in this release

- **A timeout on a stuck draft claim.** The claim is kept on purpose when the write may have landed, so that it never makes a duplicate. The draft expires in 30 minutes, and the hint already says to check `list_setlists` and re-draft.
- **BrosLaz `profile_match` reading standing choices.** That is release 4, with pages and `legacy-beit-mitzvah`.
