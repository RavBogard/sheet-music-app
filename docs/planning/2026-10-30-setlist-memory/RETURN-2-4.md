# Setlist memory, releases 2–4: return

Shipped 2026-10-30. PRs 20–26 are all merged and deployed.

## What Daniel and David get

- **"Give me the setlist for Shabbat."**
  - Claude reads it as Shabbat morning and asks who is leading; it never infers the rabbi.
  - `draft_service` drafts from the service's living profile. It fills only slots that are `standard` (someone said "keep it") or `usual` (the same chart on 3 of the last 5 regular weeks).
  - The result is read back exceptions-first (`readback.text`).
  - On a first Friday, Claude asks "Shir Shabbat or regular Friday night?".
- **Remembered answers.**
  - "Keep it in Dm" makes a standing choice for that profile; it is announced and can be undone.
  - With no such words, a change is a one-off.
  - Three regular weeks running of the same one-off prompts one offer to make it standard.
- **Profiles start on first use.** No back-fill of past rabbis, per Daniel. Randy's profiles start the first week one is built with the rabbi set.
- **Open items** stay on a setlist and are repeated in every readback until resolved.
- **`read_back_setlist`** gives the same summary for an existing setlist.
- **Beit Mitzvah siddur pages.**
  - A B'nei Mitzvah draft binds to `legacy-beit-mitzvah`.
  - Claude asks "Beit Mitzvah siddur, or the family's own booklet?". Answering the family's booklet, or later sending `update_setlist` `book: null`, means no pages at all.
  - When a prayer prints twice in a book (morning and Havdalah), re-booking marks the row stale. It never guesses.

## Also fixed along the way

- **False "Remote changes detected" on opening any setlist (PR 25).**
  - Cause: the browser's derived-count reconcilers queued updates with no precondition, and the sync engine then stamped a sibling commit's `updatedAt` onto them.
  - Fix: counts are now kept by the server. The engine re-stamps only rows that already carry a precondition, and fileIds are compared as a set.
  - The Sterneck Bar Mitzvah setlist's stored songCount was repaired (15 → 14).
- **Release 1 leftovers (PR 24):**
  - Doubled letters now match in spelling (Kadish/Kaddish).
  - Vocal parts are parts, not settings: 8 choir recordings were back-filled.
  - Back-fill write failures skip the row instead of aborting.
  - Export date bounds use the tenant's day.
- **Stricter page validation (PR 26):** a unit id is accepted only with one of that unit's own pages.

## Open

- Closed 2026-10-31 (PR 27): bind-on-type and `propose_liturgy_bindings` look up `legacy-beit-mitzvah` per service (`bnei_mitzvah_saturday` → morning, `havdalah_bnei_mitzvah` → evening; any other type gets no lookup). `readerBookFor` stays null for it on purpose: the reader has no Beit Mitzvah volume, and null is its normal answer.
- Closed 2026-10-31 (PR 27): BrosLaz `profile_match` now reads standing choices from the same scope `set_standing_choice` writes (`memoryServiceType` in `src/lib/profiles/keys.ts`).
- Monitoring:
  - Buses are assigned (David 2, Daniel 5).
  - The bridge starts with the studio PC, which Michael powers on.
  - Pre-service check: `get_bridge_health`.
