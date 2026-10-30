# Profiles and Remembered Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each recurring service there is a living profile. The server drafts a setlist from it and labels every row with how sure it is (standard / usual / last time / other service / new). A change someone tells it to keep ("keep it in Dm") is remembered for next week.

**Architecture:** Profiles are `setlistTemplates` docs with a `profile` block. Tracks gain a `slotKind` field (`moment` | `song` | `open`) and a `house` provenance field. Standing choices live in a new tenant-scoped `standing_choices` collection keyed by (scope, slotKey). Each tier is computed on read from stored standing choices and from history (`src/lib/history/`); nothing caches tiers. A draft is stored in `service_drafts` with a TTL; the setlist is created only when the author commits.

**Tech Stack:** Next.js App Router, TypeScript, firebase-admin Firestore, MCP (`server.registerTool` + zod), vitest, Firebase emulator tests.

**Spec:** `docs/planning/2026-10-30-setlist-memory/DESIGN.md` (§5.1–5.5, §5.8). Interface recon: the session scratchpad's `plan2-recon.md` (not committed; a Windows path here broke the Tailwind build).

## Global Constraints

- Never propose which setting or melody the band plays. A slot is filled only at tier `standard` or `usual`. Every other slot is drafted open (no fileId) and listed.
- Row order is the author's. Nothing edits an existing setlist except an explicit tool call by the author.
- Publish is retired. Do not add notify or publish steps.
- Overlays contract: the names and types of the setlist fields `id, name, date, eventDate, tracks[]` and the track fields `id, order, title, type, songId, notes, liturgyRef, momentId` do not change. Added fields are fine.
- No liturgical text in the repo.
- Every new collection and query is org-scoped (`orgFrom(extra)`, `rowOrg`). Each new store gets an emulator test that asserts both `crc` and `brotherslazaroff`.
- Standing writes require admin or band_leader, checked by `assertEditor`.
- New tools go on the authoring surface (not `OPS_TOOLS`), except seed and back-fill tools, which go on ops. Every new tool is listed in `READ_TOOLS` or `WRITE_TOOLS`.
- Ops write tools follow F-05: `dryRun` defaults to true, and a real run needs `dryRun:false, force:true`.
- Errors use `richError(code, message, extras?, hint?)`. Validation failures surface as `isError` results.
- Tier N/M: **usual = the same chart (partGroup) on ≥3 of the last 5 non-special services of the profile in which the slot appears.** Constants `USUAL_MIN = 3`, `USUAL_WINDOW = 5`.
- Row phrases, exact strings:
  - standard: `your standard {chart}{ in key}`
  - usual: `the usual {chart}{ in key}`
  - last time: `last time it was {chart}{ in key}`
  - other service: `done before at {serviceLabel}, not here`
  - new: `new — which chart?`
  - key missing: `key not on record` replaces the ` in key` part.

## Review Focus

1. **Cross-tenant leaks.** A BrosLaz standing choice must never shape a CRC draft, and the reverse. Covered by the emulator test in Task 3.
2. **A rabbi never inferred.** `draft_service` for `friday_night` or `shabbat_morning` with no `rabbiSlot` must refuse (`rabbi_required`). It must not fall back to the last setlist's rabbi. Task 5.
3. **Special weeks never count.** A special setlist in the window must not make a chart "usual" or trigger a promotion offer. Task 2.
4. **Instrument parts are one song.** "Barchu (Walkdown) Bb" and "Barchu (Walkdown)" count as the same chart for tiers (partGroup). Task 2.
5. **A tug of war is visible.** When a standing change overrides another person's change from the last 28 days, the response carries `overrode: {byName, at, fileId, key}`. Task 3.

---

### Task 1: Service class stored on setlists

Each setlist stores `serviceType`, `rabbiSlot` and `special`, so history and profiles can split by service without guessing.

**Files:**
- Modify: `src/types/models.ts`: add `serviceType?: string | null`, `rabbiSlot?: string | null` and `special?: boolean` to `Setlist`.
- Modify: `src/lib/history/classify.ts`: `classifyService` prefers the stored values when present.
- Modify: `src/lib/history/song-history.ts` and `load.ts`:
  - `HistorySetlist` gains `serviceType`, `rabbiSlot` and `special`.
  - `HistoryTrack` gains `momentId`. When the stored value is missing, fill it with `momentIdForUnit(liturgyRef.unitId)`.
- Modify: the `update_setlist` handler and its schema in `src/lib/mcp/tools/index.ts`: accept `special?: boolean` and `rabbiSlot?: "daniel_karen" | "randy" | null`.
- Create: `src/lib/mcp/tools/backfill-service-class.ts`, ops tool `backfill_setlist_service_class`:
  - For each setlist in the org, write the `classifyService` result where the fields are unset.
  - Use `updateRowsIfUnchanged` from `backfill-conditional-write.ts`.
- Test: `src/lib/history/__tests__/classify.test.ts`, `src/lib/mcp/tools/__tests__/backfill-service-class.test.ts`.

**Interfaces:**
- Produces: `classifyService({name, templateType?, rabbi?, serviceType?, rabbiSlot?, special?}): ServiceClass`. `HistorySetlist.special: boolean` and `HistoryTrack.momentId: string | null`.

- [ ] Test: `classifyService({name:"Shabbat with guests", serviceType:"shabbat_morning", special:false}).special === false`. The stored value wins.
- [ ] Test: with no stored fields, the current inference is unchanged (existing cases still pass).
- [ ] Test: the back-fill dry run reports `{scanned, changed[], skipped:{alreadySet, changedDuringRun}}` and writes nothing. A real run without `force` is refused.
- [ ] Implement. Run `npx vitest run src/lib/history src/lib/mcp/tools/__tests__/backfill-service-class.test.ts` and `npx tsc --noEmit`.
- [ ] Commit `feat(history): store service class on setlists`.

### Task 2: Profile keys, slot keys and tiers (pure)

**Files:**
- Create: `src/lib/profiles/keys.ts`
  - `profileKeyFor(serviceType: string, rabbiSlot: string | null): string` returns `serviceType` or `` `${serviceType}:${rabbiSlot}` ``.
  - `CRC_CORE_PROFILES`: an array of `{key, label, serviceType, rabbiSlot, book}`. Values (labels verbatim):
    - `friday_night:daniel_karen`, "Daniel Friday night", book crc-friday
    - `friday_night:randy`, "Randy Friday night", book crc-friday
    - `shabbat_morning:daniel_karen`, "Daniel Shabbat morning", book crc-saturday
    - `shabbat_morning:randy`, "Randy Shabbat morning", book crc-saturday
    - `shir_shabbat`, "Shir Shabbat", book legacy-shabbat-evening
    - `bnei_mitzvah_saturday`, "B'nei Mitzvah", book null
  - `rabbiRequired(serviceType): boolean`: true for `friday_night` and `shabbat_morning`.
  - `slotKeyFor(track: {momentId?, title, fileId?}, partGroupOf: (fileId) => string | null): string`
    - `` `moment:${momentId}` `` when there is a momentId;
    - otherwise `` `song:${partGroup ?? historyStem(title)}` ``.
- Create: `src/lib/profiles/tiers.ts`
  - `type Tier = "standard" | "usual" | "last_time" | "other_service" | "new"`.
  - `computeSlotTier(input): SlotTier`. Input: `{standing?: StandingChoice, profileUses: SlotUse[], otherUses: SlotUse[]}`. A `SlotUse` is `{eventDate, fileId, partGroup, chartName, key, special, serviceLabel}`, newest first.
  - Output: `{tier, fileId?, chartName?, key?, keyOnRecord, phrase, promotion?: {fileId, chartName, key, weeks: 3}}`.
  - `phrase(tier, chart, key, serviceLabel)` uses the exact strings in Global Constraints.
- Test: `src/lib/profiles/__tests__/tiers.test.ts`, `keys.test.ts`.

**Interfaces:**
- Produces: `profileKeyFor`, `CRC_CORE_PROFILES`, `rabbiRequired`, `slotKeyFor`, `computeSlotTier`, `Tier`, `SlotUse`, `SlotTier`.

Rules for `computeSlotTier`:
- standing present → `standard`, with the standing fileId and key.
- else, among the first 5 non-special `profileUses`, a partGroup appearing ≥3 times → `usual`. The key is the most frequent non-null key among those uses. If no use has a key, `keyOnRecord: false`.
- else profileUses non-empty → `last_time` (most recent use).
- else otherUses non-empty → `other_service`.
- else → `new`.
- Promotion: if standing is present and the 3 most recent non-special profileUses all share a chart+key that differs from it, set `promotion`.

- [ ] Tests:
  - standing beats history;
  - 3 of 5 → usual;
  - 2 of 5 → last_time;
  - specials ignored (3 special uses + 1 regular → last_time);
  - part rows share a partGroup;
  - usual with no keys → `keyOnRecord:false` and the phrase `the usual X, key not on record`;
  - other_service phrase;
  - new phrase;
  - promotion fires after 3 consecutive differing regular uses, and not when one of the 3 is special.
- [ ] Implement, run the tests and tsc, then commit `feat(profiles): profile keys and confidence tiers`.

### Task 3: Standing choices store and tools

**Files:**
- Create: `src/lib/profiles/standing.ts`
  - Collection `standing_choices`. Doc id `` `${org}__${encodeURIComponent(scope)}__${encodeURIComponent(slotKey)}` ``.
  - `StandingChoice`: `{orgId, scope, slotKey, fileId, chartName, key: string | null, leadMusician: string | null, by: uid, byName, at: ISO, quote: string | null, previous: Omit<StandingChoice, "previous"> | null}`.
  - `scope` is a profile key, or a bare serviceType for per-song memory (BrosLaz uses its serviceType, e.g. `gig`).
  - `readStanding(org, scopes: string[], slotKeys: string[]): Promise<Map<string, StandingChoice>>`. The map is keyed `` `${scope}|${slotKey}` ``.
  - `writeStanding(org, uid, choice)` runs in a transaction, sets `previous` to the old doc, and returns `{choice, overrode?}`.
    - `overrode` is set when the previous doc's `by !== uid` and it is younger than 28 days.
  - `clearStanding(org, uid, scope, slotKey)` restores `previous`, or deletes the doc when there is none.
- Create: `src/lib/mcp/tools/standing.ts`, two authoring tools.
  - `set_standing_choice {setlistId, trackId, quote?}`
    - `assertEditor`. Reads the row's fileId, key and lead, plus the setlist's class.
    - scope = `profileKeyFor(serviceType, rabbiSlot)`. It also writes a song-scope doc at the bare `serviceType` when the slot is a `song:` key.
    - Returns `{announcement, overrode?}`. The announcement is exactly `` `${chartName}${key ? ` in ${key}` : ""} is now standard for ${profileLabel}.` ``
    - With an `overrode`, it appends `` ` (${byName} set ${prevChart}${prevKey ? ` in ${prevKey}` : ""} on ${Mon D}.)` ``.
  - `clear_standing_choice {setlistId, trackId}` undoes the standing choice. It returns `{announcement: "Undone: back to " + (previous ? chart/key : "no standard") + "."}`.
- Modify: `firestore.rules`: add a `standing_choices` block, read for members of the doc's org, client write false.
- Modify: `index.ts` (registrations), `tool-access.ts` (`WRITE_TOOLS`).
- Test: `src/lib/profiles/__tests__/standing.emulator.test.ts`.
  - Both tenants, with no cross-reads.
  - `previous` chain and undo.
  - `overrode` only for another user within 28 days.
  - A member without admin or band_leader is refused.

- [ ] Write the emulator test, implement, run `npx vitest run -c vitest.emulator.config.ts src/lib/profiles` (with the emulator) and tsc, then commit `feat(profiles): standing choices`.

### Task 4: Profiles on `setlistTemplates`, seeding, `get_service_profile`

**Files:**
- Modify: `src/lib/mcp/tools/templates.ts`
  - Template doc gains `profile?: {key, serviceType, rabbiSlot, book, label}`.
  - `TemplateTrack` gains `slotKind?: "moment" | "song" | "open"`, `slotKey?: string` and `house?: {source: "history", count, of, seededAt} | null`. `normalizeTemplateTrack` passes them through.
  - `cloneSetlistFromTemplate` does not copy them onto setlist rows. `slotKey` is recomputed when needed.
- Create: `src/lib/profiles/seed.ts`
  - `seedProfile(def, setlists: HistorySetlist[], library): {tracks: TemplateTrack[], unsure: {label, reason}[], basedOn: {setlistId, eventDate}}`, pure.
  - The running order comes from the most recent non-special setlist matching the def (serviceType plus rabbiSlot).
  - Headers are copied.
  - Each song row is tiered with `computeSlotTier` over that profile's history:
    - `usual`: keep fileId and key, `slotKind` moment or song, `house` set.
    - Otherwise the row becomes `slotKind:"open"` with no fileId and its title kept as the label, and goes in `unsure`.
- Create: `src/lib/mcp/tools/seed-profiles.ts`, ops tool `seed_service_profiles {profiles?: string[], dryRun?, force?}`.
  - CRC only. For BrosLaz, return `{ok:true, seeded:[], note:"no recurring profiles for this tenant"}`.
  - The dry run returns each profile's track list summary plus `unsure`.
  - A real run upserts one `setlistTemplates` doc per profile key. It finds the doc by `profile.key` and orgId, and never touches templates without a `profile`.
- Create (authoring, READ): `get_service_profile {serviceType, rabbiSlot?}`
  - Returns the profile with each row's live `SlotTier` (`standing_choices` plus history).
  - Refuses with `rabbi_required` when `rabbiRequired(serviceType)` and there is no `rabbiSlot`.
- Test:
  - `src/lib/profiles/__tests__/seed.test.ts`: a fixture of 6 Randy Shabbat mornings, one special. Rows are usual or open as the rules say, and the special one is not the running-order base.
  - Emulator test: seeding is idempotent (a second real run gives 0 changes), and an existing non-profile template is untouched.

- [ ] Write the tests, implement, run them and tsc, then commit `feat(profiles): seed profiles from history`.

### Task 5: `draft_service` and `create_setlist_from_draft`

**Files:**
- Create: `src/lib/profiles/draft.ts` and `src/lib/mcp/tools/draft-service.ts`.
- **`draft_service`** (authoring, WRITE because it stores a draft): `{date: "YYYY-MM-DD", serviceType, rabbiSlot?, special?, name?}`.
  - Refuses with `rabbi_required` when `rabbiRequired(serviceType)` and there is no rabbiSlot. Hint: `"Ask the person building the setlist who is leading: Daniel/Karen or Randy. Never infer it."`
  - Refuses with `no_profile` when the profile hasn't been seeded. Hint: `"Build from a template or last setlist instead."`
  - Loads the profile and computes each row's tier.
  - Rows at `standard` or `usual` get fileId, key and lead. All other song rows stay open.
  - Stores `service_drafts/{draftId}`: `{orgId, uid, profileKey, date, rabbiSlot, special, rows, expiresAt: now + 30 min}`.
  - Returns `{draftId, profile:{key,label,book}, rows:[{index, label, type, slotKey, fileId?, chartName?, key?, tier, phrase, promotion?}], openIndexes: number[]}`.
  - `special` defaults to true for holiday-category service types.
- **`create_setlist_from_draft`** (authoring, WRITE): `{draftId, name?, choices?: [{index, fileId?, key?, leadMusician?, standing?: boolean, quote?}]}`.
  - `assertEditor`.
  - Applies the choices to the draft rows.
  - Creates the setlist through the existing creation path: tracks in draft order, the profile's `book` passed so liturgy and page binding run, and `serviceType`, `rabbiSlot`, `special` and `sourceTemplateId` stored.
  - For each choice with `standing:true`, calls `writeStanding`.
  - Deletes the draft.
  - Returns `{setlistId, announcements: string[], oneOffNote?: string}`.
    - `announcements` are the Task 3 announcement strings.
    - When any non-standing choice changes a chart or key on a filled row, `oneOffNote` is set. The text is exactly `` `${changes.join(", ")} ${changes.length === 1 ? "is" : "are"} just for this week. Say "keep it" to make ${changes.length === 1 ? "it" : "them"} standard.` `` Each change is formatted `"{chart} in {key}"`.
  - `special` drafts ignore `standing` unless it is explicitly true. That is the default anyway; there is no inference.
  - An expired or foreign-org draft gets the error `draft_not_found`.
- Modify: `firestore.rules`: `service_drafts` gets client read and write false.
- Test:
  - Unit test of `draft.ts` with fixtures.
  - Emulator test of the round trip, both tenants:
    - draft, then create;
    - a standing choice is written;
    - a one-off choice writes nothing to `standing_choices`;
    - a rabbi-less refusal;
    - a draft from another tenant is refused.

- [ ] Write the tests, implement, run them and tsc, then commit `feat(profiles): draft a service from its profile`.

### Task 6: One learning system

**Files:**
- Modify: `src/lib/mcp/tools/propose-changes.ts`, `computeProposalEnvelope`.
  - When the setlist has a stored serviceType, and the proposal's `songId` partGroup equals the slot's standing or usual chart (via `readStanding` and history), confidence is `high` and the flag is `profile_match`.
  - No other confidence change.
- Retire `record_bond_correction`. Remove its registration and its `OPS_TOOLS` and `WRITE_TOOLS` entries.
  - Keep `bond-corrections.ts` exports used elsewhere, and keep `titleContextHints` data and rules.
  - Add a one-line comment at `loadContextHint` that the hints are frozen and profiles replace them.
- Test: the existing propose tests still pass, plus one new case for `profile_match`. Update any tool-count assertions.

- [ ] Implement, run `npx vitest run src/lib/mcp` (targeted), `src/lib/mcp/__tests__/tool-access.test.ts` and tsc, then commit `refactor(profiles): propose reads profiles; retire record_bond_correction`.

### Task 7: Ship

- [ ] Open one PR for the release. The lead watches CI and merges when it is green.
- [ ] After deploy:
  - `backfill_setlist_service_class`: dry run, spot-check 10, then the real run.
  - `seed_service_profiles`: dry run.
- [ ] Write `docs/planning/2026-10-30-setlist-memory/SEED-REVIEW.md`: for each profile, the drafted running order and the `unsure` list. This is the one-time review for Daniel and David (DESIGN §5.1). Real seeding runs after their review, or right away if the dry run has no unsure rows for that profile.
- [ ] `RETURN-2.md` and a ROADMAP status update.

Not in this release (release 3): the exceptions-first readback text, open items, email exceptions, and the rewrite of `.paul/AGENT-GUIDE.md`. Tool descriptions in this release say only what each tool does.
