# Session findings — 2026-05-22

Notes from a Cowork session building a walkdown chord chart, binding it to two tracks on tonight's Kabbalat Shabbat setlist, reordering openers, and adding closer options. Real issues observed in the MCP and in the centralreform.live UI, plus a couple of agent-behavior lessons.

## Reproducible bugs

### 1. `list_setlists` date filter drops in-range eventDates when sorted by `recent_event`

First query I ran tonight:

```
list_setlists({ sort: 'recent_event', from: '2026-05-22', to: '2026-05-23', limit: 10 })
→ []
```

The setlist "Kabbalat Shabbat — May 22, 2026" with `eventDate: "2026-05-22T12:00:00.000Z"` should match — it's inside the window. A subsequent `list_setlists({ sort: 'recent_write', limit: 20 })` (no date filter) returned it as the second row.

Suspect: the from/to filter is being applied against the doc's write timestamp instead of `eventDate` when sort is `recent_event`, or there's an off-by-one on the upper bound. Either way the failure mode is silent and the agent then concludes the setlist doesn't exist — leading me to wrongly ask the user "is there even a setlist for tonight?" (the user, looking right at it, was understandably frustrated).

### 2. Older bonded setlist rows are missing the `mimeType` stamp, which changes how the row renders

The Adonai Sifatai row had `type: "song"`, a valid `songId`/`fileId`, and a PDF in the library — but rendered in the UI as a "sub-attached document" style (small chart icon + chevron + lighter text, no key badge), unlike Mi Chamocha right below it which rendered as a bold song row.

`get_setlist` for that row showed no `mimeType` field at all. A no-op `update_track({ songId: <same>, type: "song", title: "Adonai Sifatai" })` re-bond wrote `mimeType: "application/pdf"` onto the row, after which (per the user) it presumably renders correctly.

So: the UI's "is this a real song row" check depends on `mimeType` being denormalized onto the track doc, but rows bonded before whatever migration added that field have it missing. A `backfill_heal_metadata` pass that stamps `mimeType` from each bonded library entry onto its referencing track rows would fix every stale row at once.

## MCP tool gaps

### 3. `save_scraped_chart` doesn't accept `key` / `bpm` / `leadMusician`

I used `save_scraped_chart` for the first walkdown upload because the content is plain text. The library entry it created had no `key` field, which meant the bonded row pulled `key: null` from the catalog despite my having set `key: "Em"` on the row explicitly. I had to delete that chart, base64-encode the same content, and re-upload via `upload_chart({ mimeType: "text/plain", key: "Em" })` to get the key onto the library entry.

Parity fix: `save_scraped_chart` should accept the same optional metadata fields `upload_chart` does. It's the natural tool for the "I have chord-chart text, save it as a library entry" path, and there's no reason to force a base64 detour just to attach a key.

### 4. `edit_enrichment` name + description undersell what it does

The name and the "library_index review row" framing in the description made me hesitate to use it on Adonai Sifatai, whose row had `enrichmentStatus: null` (i.e. it's not in the review queue at all). It worked fine — but only after I tried the dry-run gate. A clearer name like `edit_library_entry` (or at minimum, a line in the description that says "works on any `library_index` row, not just review-queue ones") would have saved a step.

### 5. No way to update a library entry's `key` after upload without going through `edit_enrichment`

Related to #3. If a chart is in the library with no key, the only path to add one is the admin-only enrichment edit tool. A non-admin band leader who notices a key is wrong has no way to fix it. A musician-or-band-leader-scoped `update_song({ id, key, bpm, ... })` would close this.

## centralreform.live UX issues

### 6. `type: "prayer"` rows with a bonded chart render as sub-attached docs instead of as full chart-bearing rows

When I first bonded the walkdown chart to the "Maariv Arevim" row (which was created with `type: "prayer"`), the row kept its prayer styling (gray, light text) but gained a small chart icon + chevron. Clicking it didn't open the chart for the user. Changing the row to `type: "song"` fixed it.

Two options:
- (a) Refuse to bond a chart onto a non-song row at the API layer — return a clear error like "prayer rows can't carry charts; change type to 'song' first or use type 'song' with a prayer-flavored title."
- (b) Render bonded prayer rows with the same chart-access affordance as song rows (full title + key badge + tap-to-open chart), so the bond is actually usable.

Right now there's a third state — bonded-but-hidden — that's silent failure.

### 7. The "sub-attached doc" rendering style is invisible-to-the-user as a distinct row state

The user (Daniel) had no idea why two rows looked different from the others, even though both were `type: "song"` and bonded to charts. The UI is signaling something via the icon+chevron+lighter-text style, but it's not clear what — and after refresh, the style sometimes disappears (apparently keyed on `mimeType` presence, per #2). Either the style should go away entirely once #2 is backfilled, or it needs a tooltip / label so users know what state the row is in.

### 8. Hebrew transliteration normalization in the catalog is inconsistent

The library entry for the traditional Adonai S'fatai chart was stored as **"Adonai sfatai (trad)"** — lowercase `s`, missing apostrophe / vowel for the shewa. The user wanted "Adonai S'fatai (trad)". This is a chronic Hebrew-transliteration issue: shewa nā ('S'f-, l'D-, b'r-) renders inconsistently across the catalog. The known-limitation note on `search_library` already calls out the variant-spelling problem; that same normalizer would help on save/enrichment, not just on search.

### 9. Enrichment lag is hurting curation

The two Adon Olam entries I needed to slot in as closers both had `enrichmentStatus: "pending"` with `retryQueued: true` and no `collection` field — meaning the agent couldn't tell from the catalog which is "core" (CRC) and which is "supplemental" (Shireinu) without guessing from filename heuristics. The user explicitly asked for "CRC library first, then a Shireinu option" and I had to guess.

Fixes worth considering:
- Surface enrichment age/lag in `search_library` and `list_library` responses so callers can flag "this row is unenriched, ask the user for collection"
- Run a faster enrichment pass on `retryQueued: true` rows
- Provide a `pending_enrichment_count` field in `list_library`'s coverage block so operators can see backlog at a glance

## Agent-behavior lessons (for future Claude Code work on this MCP)

### 10. When a date-windowed list returns empty, widen the search before assuming nothing matches

I went straight from `list_setlists({ from, to }) → []` to asking the user "should I create a new setlist for tonight?" — when in fact #1 was masking an existing setlist. A safer pattern: if `from`/`to` returns empty and the user explicitly named the date, retry without the filter and grep the results client-side before declaring the row missing.

### 11. For ambiguous UI bug reports ("X looks weird"), ask for a screenshot or use `read_widget_context` before guessing

The user said "traditional for adonai sifatai is listed weird on the website" — I guessed it was a typo in the title (which it also was) and renamed the library entry. The actual complaint was about the row's *rendering style*, which I only understood after the screenshot. The right move was to read the widget context or ask "can you share a screenshot of what looks weird" before changing anything.

### 12. `update_track` with `position` is the right primitive for "move one row"; don't reach for `reorder_setlist`

Moving Hallelujah Riff to position 1 via `update_track({ patch: { position: 1 } })` was a one-liner. The older path through `reorder_setlist` requires reading the full track-id list, splicing, and writing it back, with optimistic-concurrency surface area to manage. The `position` patch field is a quietly important affordance.

## Quick-win priority list

If I were ranking these by ratio of user-visible fix to dev effort:

1. **#2 (mimeType backfill)** — silently fixes a fleet of rows that look broken.
2. **#1 (`list_setlists` date filter)** — agents will keep hitting this and concluding setlists don't exist.
3. **#6 (prayer rows can't carry charts but accept the bond)** — silent failure, easy refusal-at-API fix.
4. **#3 (`save_scraped_chart` parity with `upload_chart`)** — small API surface change, saves the base64 detour.
5. **#9 (enrichment lag visibility)** — needs design but unblocks curation across the catalog.
