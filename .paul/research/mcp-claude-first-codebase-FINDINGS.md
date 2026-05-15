# MCP Claude-First Eval — Codebase Findings

**Date:** 2026-05-15 (post-Wave-6 ship; 22 MCP tools live)
**Author:** Claude Opus 4.7 (this conversation)
**Sibling:** `.paul/research/mcp-claude-first-cowork-PROMPT.md` (cowork attempt prompt)
**Plan it executes:** `.paul/research/mcp-claude-first-research-plan.md`
**Synthesis target:** `.paul/research/mcp-claude-first-SYNTHESIS.md` (produced once cowork report lands)

## Executive summary

The current 22-tool MCP surface covers about **40-50% of leader-side workflows** by raw count of UI affordances. The gaps cluster in five high-leverage areas:

1. **Setlist lifecycle** (clone, duplicate, transfer, publish, archive) — the workflows Daniel actually does most weeks
2. **Document-driven import** — v7.0's flagship feature, completely absent from MCP
3. **Bulk operations** — BatchActionBar's multi-select is one of the UI's biggest wins; MCP forces caller-side loops
4. **Scheduling** — assign/respond/suggest are entirely UI-only; the schedule view itself is rich and conflict-aware
5. **Templates + congregation context** — leaders pick from a template library and a known rabbi/musician roster; MCP knows neither

The codebase passes also surface **one cross-tool data-vocabulary bug** (`type: 'section'` vs `'header'`) that will silently corrupt setlists if leaders mix UI and MCP edits today. That should be fixed regardless of where the eval lands.

The "frontend can shrink to read-only" thesis looks **partially defensible**: the dashboard, library browse, library upload (lite), and setlist meta editor are good candidates for retirement IF MCP adds the missing tools. The setlist grid editor itself (drag-reorder, multi-select, inline cell edit) and the scheduling view should likely stay as spatial UI even in a Claude-first world.

---

## Pass A — UI surface × MCP coverage matrix

Format: surface | primary actions | MCP coverage today | gap notes

### Setlists dashboard (`/setlists`)

| Surface | Primary actions | MCP coverage | Gap notes |
|---|---|---|---|
| `SetlistDashboard` list view | list, search, filter by rabbi, view as cards/matrix/calendar | `list_setlists` ✅ (date range + limit), `search_library`-style query missing | No name/rabbi filter on MCP — would need client-side filter. No matrix view equivalent (a per-song × per-week grid). |
| `CreationWizard` | new-setlist from template (FRIDAY_NIGHT, SHABBAT_MORNING, etc.); custom new | `create_setlist` ✅ accepts `serviceType` but **no template instantiation** — the wizard pre-seeds tracks from `liturgical-templates.ts` | **GAP A-1 (HIGH):** No way for MCP to say "create from template X". Daniel's wizard auto-populates 15-30 placeholder rows; MCP starts blank. |
| `handleCloneNextWeekClick` | clone the most recent setlist for next week's date | **❌ no MCP equivalent** | **GAP A-2 (CRITICAL):** This is THE 90%-case workflow per auto-memory. Cowork would have to: list → get → re-create setlist + loop add_track_to_setlist for every row + re-bond every chart + re-set every key/lead. Many-tool fragile. |
| `DuplicateSetlistDialog` | duplicate any setlist to a new id | **❌ no MCP equivalent** | **GAP A-3 (HIGH):** Same as clone but for arbitrary past setlist. |
| `TransferSetlistDialog` → `/api/setlist/transfer` | give ownership to another user by email | **❌ no MCP equivalent** | **GAP A-4 (LOW):** Rare action; keep in UI. |
| `DeleteSetlistDialog` | delete with typed-confirm | `delete_setlist` ✅ admin-or-owner | UI requires typed name; MCP fires immediately. See Pass C. |
| `handleSaveAsTemplateClick` / `handleSaveAsDefaultClick` | promote a setlist to a reusable template | **❌ no MCP equivalent** | **GAP A-5 (MED):** Would matter as templates accumulate. |
| `ImporterModal` (document-driven) | upload .docx/.pdf/.txt → 6-step pipeline → setlist | **❌ no MCP equivalent** | **GAP A-6 (HIGH):** v7.0 flagship. Pipeline: `extract-document` → `extract-structure` → `parse` → `resolve` → `commit-document` → `execute`. Interactive interview between steps (set service type, fix titles, split lines). |
| `SetlistMatrixView` | per-song × per-week grid view | partially via `list_setlists` + repeated `get_setlist`; expensive | **GAP A-7 (LOW):** Read-only analytical view; keep in UI. |

### Setlist editor (`/setlists/[id]`)

| Surface | Primary actions | MCP coverage | Gap notes |
|---|---|---|---|
| `SetlistGrid` | inline cell edits (title, key, BPM, lead, type, notes, referenceLink, songId) | `update_setlist` (meta only) + `add_track_to_setlist` + `remove_track` + `reorder_setlist` ✅ | No `update_track` tool — every cell-edit on an existing row requires remove + re-add or no MCP path at all. **GAP A-8 (CRITICAL).** |
| `AddBar` primary CTA (Song picker) | "+ Song" with Recent / Library / Custom triplet | `search_library` + `add_track_to_setlist({songId})` | Recent-songs ranking is **NOT exposed** via MCP. Daniel's Recent list ranks by `SongRecentEntry.performedAt`. MCP `search_library` has no recency boost. **GAP A-9 (MED).** |
| `AddBar` chevron (non-Song tiles) | Section / Reading / Prayer / Transition / Stage note | `add_track_to_setlist({type})` ✅ since Wave 5 G-10 | **BUG A-10 (HIGH):** UI writes `type: 'section'`; MCP enum + importer + performance view + templates all use `'header'`. Setlists edited via BOTH paths will have inconsistent track types. `MobileRowCard.tsx:74` accommodates both, but `SetlistRow.tsx:29` checks `=== 'header'` only — UI-added section headers will render as plain song rows in the performance view. |
| `BatchActionBar` | multi-select rows → bulk set type / key / lead / delete | **❌ no MCP equivalent** | **GAP A-11 (HIGH):** Per Daniel weekly workflow ("Randy leads songs 2, 4, 7"), bulk is core. Cowork would loop N times. |
| `ChartBindDialog` / `ChartBindPopover` | bind a library chart to a track row | implicitly via `add_track_to_setlist({songId})` | If row already exists and just needs a chart bound: no path. Have to remove + re-add. **GAP A-12 (MED).** |
| `RecordingBindPopover` | bind an audio recording to a row | **❌ no MCP equivalent** | **GAP A-13 (LOW):** Audio/recordings entirely UI-only. |
| `SetlistMetaEditSheet` | name / date / rabbi / serviceType / serviceNotes | `update_setlist` ✅ since Wave 1 + Wave 6 echo | Fully covered. |
| `DragHandleCell` | drag-to-reorder rows | `reorder_setlist` ✅ | Conceptually covered but the UI is fundamentally spatial. See Pass D — KEEP. |
| `ReconciliationProvider` | sync-conflict resolution (other-editor activity) | **❌ no MCP equivalent** | **GAP A-14 (MED):** MCP writes are blind to concurrent edits. The UI shows conflict toasts; MCP just overwrites. |
| Musician picker (in-grid) → `/api/scheduling/assign` | assign musician to a setlist | **❌ no MCP equivalent** | **GAP A-15 (HIGH):** Whole scheduling subsystem is UI-only. |
| `PublishDialog` → `/api/setlist/publish` + resend-email | publish + email musicians (with per-musician opt-out, subject, note); track `publishedAt`, `notified`, `emailed`, `usageRecorded` | **❌ no MCP equivalent** | **GAP A-16 (CRITICAL):** End of every weekly cycle. Task 10 of the eval probes this. |
| `PrintModal` → `/api/setlist/print/{personal,public,prepare}` + `email-packets` | generate band/personal/public print packets | **❌ no MCP equivalent** | **GAP A-17 (MED):** "Get the band a paper packet" is real but moving to tablets per auto-memory. |

### Library (`/library`)

| Surface | Primary actions | MCP coverage | Gap notes |
|---|---|---|---|
| `LibraryTab` (core / supplemental / uploads / audio) | browse by collection | `search_library({collection})` partial — no `collection` arg today | **GAP A-18 (LOW):** Could add a filter; search_library is general. |
| `LibraryFilters` | filter by key, BPM, lead, tags | `search_library` covers `key`, `bpmMin`, `bpmMax` ✅; tags + lead missing | **GAP A-19 (LOW):** Tags/lead filters. |
| `UploadDialog` | local-file upload with optional key/BPM/tags | `upload_chart` ✅ (since Wave 3, hardened in Wave 5 G-7/G-8) | Fully covered. |
| `ScraperModal` | URL → Gemini-extract → save | `scrape_chart_from_url` + `save_scraped_chart` ✅ | Fully covered, with G-6 negative-result detection (Wave 5). |
| `LibraryFileRow` rename | rename a library entry | **❌ no MCP equivalent** | **GAP A-20 (MED):** Renames not bulk; can be done in UI. |
| `LibraryFileRow` archive | soft-delete (status: archived) | `delete_chart` ✅ but HARD delete | **MISMATCH A-21 (HIGH):** UI is soft; MCP is hard. See Pass C. |
| `LibraryFileRow` delete | hard delete | `delete_chart` ✅ | Covered, but no soft-delete option. |
| `SelectionActionBar` | bulk archive / move / tag | **❌ no MCP equivalent** | **GAP A-22 (MED):** Bulk library ops. |
| `ContentSearchResults` / `/api/library/search-content` | search inside chart text + lyrics (not just titles) | **❌ no MCP equivalent** | **GAP A-23 (MED):** "Find me the song that has the line 'Heveinu shalom aleichem'" is a real query — MCP can only search titles. |
| `AddToSetlistSheet` | from library, add a chart to a setlist | covered via `add_track_to_setlist({songId})` ✅ | Two-tool composition, but works. |
| `useAddToSetlist` recent-setlist boost | suggest user's recent setlists | partial via `list_setlists` ✅ | UI ranking is opaque; MCP order is date-desc. |
| `/api/library/detect-key` | AI key detection | **❌ no MCP equivalent** | **GAP A-24 (LOW):** AI helper; keep in UI. |
| `/api/library/chord-cache` | cached chord parse | **❌ no MCP equivalent** | Internal; not user-facing. |

### Schedule (`/schedule`)

| Surface | Primary actions | MCP coverage | Gap notes |
|---|---|---|---|
| Services view (grouped by setlist) | see all upcoming assignments | **❌ no MCP equivalent** | **GAP A-25 (HIGH):** Multi-setlist view, conflict-aware. |
| Calendar view (`UnifiedCalendar` mode='planning') | spatial calendar of services + assignments | **❌ no MCP equivalent** | **GAP A-26 (LOW):** Calendar is inherently spatial — KEEP. |
| `/api/scheduling/assign` | assign musician(s) to a setlist | **❌ no MCP equivalent** | **GAP A-27 (HIGH):** Daniel's task-9 in the eval probes this. |
| `/api/scheduling/respond` | musician accepts/declines | **❌ no MCP equivalent** | **GAP A-28 (MED):** Musician-side; not in scope this round but worth noting. |
| `/api/scheduling/suggest` | AI-suggest musicians for a setlist | **❌ no MCP equivalent** | **GAP A-29 (MED):** "Who should we book for Friday?" is naturally chat-shaped. |
| `/api/scheduling/suggest-band` | suggest a full band lineup | **❌ no MCP equivalent** | **GAP A-30 (MED):** Same. |
| `/api/scheduling/unassign` | remove an assignment | **❌ no MCP equivalent** | **GAP A-31 (MED):** Per task-9 reassignment story. |
| `/api/scheduling/remind` | nudge a musician | **❌ no MCP equivalent** | **GAP A-32 (LOW):** Bandleader workflow. |
| `/api/scheduling/history` | who-has-played-what | **❌ no MCP equivalent** | **GAP A-33 (LOW):** Analytics; could be chat-friendly. |

### Manage (`/manage` + `/manage/templates`)

| Surface | Primary actions | MCP coverage | Gap notes |
|---|---|---|---|
| `PeopleSection` | role assignment + access audit | **❌ no MCP equivalent** | **GAP A-34 (LOW):** Admin-only; keep in UI. |
| `AccessAuditLog` | review who-did-what | **❌ no MCP equivalent** | **GAP A-35 (LOW):** Read-only audit; could be chat-friendly. |
| `LibraryDataSection` | sync from Drive, audit | **❌ no MCP equivalent** | **GAP A-36 (LOW):** Maintenance; UI fine. |
| `SoundSystemSection` | bridge setup, monitor config | **❌ no MCP equivalent** | OUT OF SCOPE (monitor deferred). |
| `DuplicateScanner` | find duplicate library entries | **❌ no MCP equivalent** | **GAP A-37 (MED):** Library hygiene; chat-friendly ("find dupes and merge"). |
| `PDFHealthScanner` | check chart bytes for issues | **❌ no MCP equivalent** | **GAP A-38 (LOW):** Internal QA. |
| `/manage/templates` page | manage saved templates | **❌ no MCP equivalent** | **GAP A-39 (MED):** Pairs with A-1 and A-5. |
| `/api/admin/*` (set-role, set-upload-permission, set-sound-engineer, delete-user, migrations) | role grants + maintenance | **❌ no MCP equivalent** | **GAP A-40 (LOW):** Admin-only; rare; keep in UI. |

### Coverage rollup

- **Fully covered:** setlist meta CRUD, basic track CRUD, library browse + upload + scrape, monitor read/write, delete_setlist, delete_chart (with caveats).
- **Partially covered:** library search (titles only), library filters (no tags/lead), template creation (no template lookup).
- **Not covered at all:** clone-and-tweak (THE 90% case), document import, publish + email, scheduling subsystem, bulk operations, soft-delete/archive, recordings, content search, templates, transfers, in-grid musician picker, congregation context.

**Coverage estimate: ~40-50% by affordance count, but the missing surfaces include the highest-leverage workflows.** Closing 5-8 specific gaps would lift coverage above 80%.

---

## Pass B — Hidden context audit

What does the UI implicitly know or show that MCP doesn't surface? Severity ranked.

| Tag | What the UI knows | MCP gap | Severity |
|---|---|---|---|
| B-1 | Missing-chart badges per row (the setlist editor renders a "?" or warning icon when a track's `fileId`/`songId` doesn't resolve to a real chart) | No `get_setlist` field surfaces binding health; cowork can't see which rows are unbonded | **HIGH** — cowork will publish a setlist with broken rows and not know |
| B-2 | Recent-songs ranking (AddBar's primary picker ranks via `SongRecentEntry.performedAt`) | `search_library` is alphabetical+match-relevance, no `recent: true` mode | **HIGH** — Daniel picks ~80% of songs from "what we played recently"; MCP forces a full-library cognitive load |
| B-3 | Scheduling conflicts ("Randy is already on the 28th") | No scheduling tool at all, let alone conflict detection | **HIGH** — task-9 of the eval will hit this |
| B-4 | Recent-rabbis list (the rabbi filter in SetlistDashboard auto-populates `availableRabbis` from prior setlists) | No `list_rabbis` or congregation-roster tool | **HIGH** — cowork has to invent rabbi names |
| B-5 | Congregation config (rabbi names, vocal lead pool, instrument list, default service-types) — `useCongregation()` + `congregation-store` | No MCP tool exposes this; cowork has to ask Daniel for every name | **HIGH** — every task in the eval will leak this gap |
| B-6 | Template library + their pre-seeded tracks (`liturgical-templates.ts` — FRIDAY_NIGHT, SHABBAT_MORNING, etc.) | No `list_templates` or `create_from_template` | **HIGH** — pairs with A-1 |
| B-7 | Other-editor activity (sync indicator, latency badges, conflict resolution via `ReconciliationProvider`) | MCP writes are fire-and-forget; no notion of "another tab is editing this" | **MED** — could cause cross-tool conflicts |
| B-8 | Library duplicate suggestions (UploadDialog shows similar titles before upload commits) | `upload_chart` returns a dedup-rejection envelope, but no pre-flight "are you sure?" | **MED** — Wave 5 G-5 helps but the UX is reactive, not proactive |
| B-9 | Live publish state (PublishDialog shows `isPublished`, `notified`, `emailed`, `emailTargets`, `usageRecorded` per setlist) | `get_setlist` doesn't surface publish status; no `publish_setlist` tool | **HIGH** — pairs with A-16 |
| B-10 | Bonded-chart count per chart (delete_chart's bonded-track guard tells you AFTER you try; the UI shows usage upfront via /api/library/usage) | No `get_chart_usage` tool | **MED** — would make safe cleanup easier |
| B-11 | Saved templates as starting points (CreationWizard menu) | Pairs with A-1, A-5, A-39 | **HIGH** |
| B-12 | Audio recordings tied to tracks (`RecordingBindPopover` shows recordings for the current song) | No recordings tool surface at all | **LOW** — recordings are musician-side mostly |
| B-13 | Public-share URL for a setlist (publish flow generates `/perform/setlist/[id]` link) | Implicit — no `get_share_url` tool | **LOW** — derivable from setlist id |
| B-14 | Liturgical date awareness (the wizard suggests dates based on Friday/Saturday cadence) | No "next Shabbat" tool; cowork has to compute it from real-world date | **MED** — Wave 5 G-14 surface validation helps slightly |
| B-15 | The "this song was last played on date X by rabbi Y" history (`recordSongUsage` writes this; surfaced in UI somewhere?) | `get_song` returns metadata but no usage history | **MED** — useful for "have I played this recently?" |
| B-16 | Print packet contents preview (PrintModal shows what each packet will contain before generating) | No print/packet tool at all | **LOW** — packets becoming legacy |
| B-17 | UI's `canEditSetlist` check (admin OR band_leader OR owner — see `setlist-permissions.ts`) | MCP tools mirror this server-side but the caller can't query "can I edit?" in advance | **LOW** — caller can just try and catch the error |

**Bottom-line:** B-1, B-2, B-3, B-4, B-5, B-6, B-9, B-11 are the high-severity hidden-context gaps. Most can be closed with **a single `get_congregation_context` tool** (rabbis, vocal leads, instruments, templates, recent-songs ranking) plus per-tool field additions (e.g., `get_setlist` echoes binding health + publish state).

---

## Pass C — Reversibility + safety audit

| Action | UI safety | MCP safety today | Mitigation needed |
|---|---|---|---|
| Delete setlist | `DeleteSetlistDialog` — typed-name confirmation | `delete_setlist` — fires immediately on call; admin-or-owner gate; cascades to tracks | **HIGH** — add `confirm: 'I understand'` arg OR a 24h soft-delete + `restore_setlist` tool. Task 11 of the eval probes this. |
| Delete chart | `LibraryFileRow` defaults to archive (`status: 'archived'`); explicit "permanently delete" is a separate action | `delete_chart` — HARD delete; bonded-track guard refuses if attached; best-effort Storage cleanup | **CRITICAL** — mismatch with UI. MCP should default to archive (soft) and require an explicit `mode: 'hard'` to permanently delete. See A-21. |
| Bulk track edits | `BatchActionBar` — explicit multi-select then "apply" button | No MCP tool; would loop add/remove | **MED** — once `bulk_update_tracks` is added, give it a `dry_run` flag and a `max_affected` cap. |
| Transfer ownership | `TransferSetlistDialog` — type the email, type-to-confirm | No MCP tool | If added, require email + confirm token. |
| Publish + email | `PublishDialog` — per-musician opt-out, subject preview, "are you sure" via the dialog | No MCP tool | **CRITICAL** — emails are irreversible. Any future `publish_setlist` needs an explicit `send_emails: true` flag + recipient echo in the response. Default to `dry_run: true`. |
| Set role / set upload permission | UI lives in `PeopleSection` admin panel; explicit | No MCP tool | If ever added, mirror Wave 4 admin gate. |
| `set_matrix_*` (monitor admin) | UI requires soundEngineer flag | MCP `set_matrix_*` admin/SE gated + Wave 4 fire-and-forget caveat | **OK** for now; monitor deferred. |
| `reorder_setlist` | UI drag-and-drop is visible/reversible | MCP gets `{ok: true}` — no visual feedback | Wave 6 G-11 partially covers via `update_setlist` echo, but `reorder_setlist` doesn't echo. **LOW** — add echo. |
| `add_track_to_setlist` (single) | UI shows row inserted with visual confirm | MCP returns `{trackId, order}` | Covered. |
| Rename setlist / chart | Both fan out denormalized copies (scheduling_assignments + tracks) | `update_setlist({name})` covers setlist ✅; chart rename has NO MCP tool | Pairs with A-20. |

**Top safety priorities:**
1. **`delete_chart` should default to archive** (or expose `archive_chart` + keep `delete_chart` for hard) — matches the UI's existing posture and lets cleanup probes be reversible.
2. **Setlist deletion needs an undo window or a confirm token** — task 11 of the eval is specifically designed to probe this.
3. **Any future `publish_setlist` must default to dry-run** — once email goes, it's gone. The PublishDialog's per-musician opt-out should be mirrored in tool args (`recipients: [{uid, email, include: bool}]`).

---

## Pass D — Frontend-shrink ROI map

Per leader-side UI surface, a verdict. Weighted by Daniel's frequency-of-use (auto-memory says clone-and-tweak is the 90% case, so `/setlists/[id]` editor is highest traffic).

| Surface | Verdict | LOC est. | Rationale |
|---|---|---|---|
| `SetlistDashboard` list | **Read-only-only** | save 200-400 LOC of write affordances if Claude handles clone/duplicate/transfer | List + filter view is genuinely useful for "what's on this week?". Wizard, clone-next-week, save-as-template, etc. can move to MCP. |
| `CreationWizard` | **Delete** if A-1 + A-5 close | save ~300 LOC | Wizard's purpose is "pick a template + date + initial state" — naturally chat-shaped. |
| `ImporterModal` (document-driven) | **Keep** initially; **delete** in v9.x once A-6 closes well | save ~600 LOC | Has interactive cleanup steps; cowork's task 8 probes whether MCP can replace it. Likely "keep" near-term. |
| `SetlistGrid` (editor) | **Keep** | n/a | Drag-reorder, multi-select, inline cell-edit are spatial. Even Claude-first leaders will want a grid for the 20-30 row editing case. |
| `AddBar` Song picker | **Keep** but slim it | save ~100 LOC if recent-songs ranking exposed | The picker is genuinely a UI affordance (Recent/Library/Custom). MCP can do this but the UI is faster for "browse, then click". |
| `AddBar` non-song tiles | **Keep** | n/a | Already chat-replaceable but 5 buttons isn't much surface. |
| `BatchActionBar` | **Read-only-only** if A-11 closes (bulk_update_tracks) | save ~250 LOC | The multi-select + apply pattern is spatial; the *operations* it triggers can be MCP-driven. Could keep selection in UI, fire via MCP. |
| `ChartBindDialog` | **Delete** if A-12 closes | save ~200 LOC | The bind action is conversational ("bind chart X to row 3"). |
| `RecordingBindPopover` | **Keep** | n/a | Audio is inherently UI. |
| `SetlistMetaEditSheet` | **Delete** | save ~150 LOC | `update_setlist` already covers this fully. Just route the "edit meta" button to a Claude prompt. |
| `PublishDialog` | **Read-only-only** (show publish state) if A-16 closes | save ~400 LOC of the dialog | Publish is conversational ("publish to band, opt out Sarah"). But the per-musician opt-out grid is mildly spatial. |
| `PrintModal` | **Keep** initially; **delete** as band moves to tablets | n/a | Tablet move per auto-memory will retire this anyway. |
| `SetlistMatrixView` | **Keep** | n/a | Per-song × per-week analytical grid — purely spatial. Read-only is fine. |
| `LibraryPage` | **Keep** but slim writes | save ~300 LOC if A-20/A-22/A-23 close | Browse is spatial; upload + rename + archive can move to MCP. |
| `UploadDialog` / `ScraperModal` | **Delete** | save ~400 LOC | Fully covered by MCP since Wave 3 + 5. |
| `SchedulePage` | **Read-only-only** if A-25..A-33 close | save ~500 LOC of write surface | Calendar view stays (spatial); the assign/respond write flow goes to MCP. |
| `ManagePage` (people, library data, sound system, scanners) | **Keep** | n/a | Admin-rare; chat fit is low. |
| `/manage/templates` | **Delete** if A-39 closes | save ~150 LOC | Template lookup + edit is chat-shaped. |

**Estimated total shrink if all corresponding MCP gaps close: ~3000-4000 LOC of editor-side surface area** (out of the wider codebase). Most savings concentrated in: PublishDialog (~400), CreationWizard (~300), UploadDialog+ScraperModal (~400), SetlistDashboard write paths (~300), Schedule writes (~500), BatchActionBar (~250).

The shrink is real but **not transformative** — the codebase saves ~5-8% surface area in exchange for substantial MCP investment. Frontend doesn't become a pure read-only shell; it becomes "spatial-only" (grids, calendars, drag-reorder, multi-select) plus performance/library browse views.

---

## Cross-pass synthesis (preliminary, pre-cowork)

**The five highest-leverage MCP additions, in priority order:**

1. **`clone_setlist(sourceId, newDate, options?)`** — closes A-2 and unblocks the 90%-case weekly workflow. Should accept a tweak-list (`swap song 3 for X`, `drop last`, `set rabbi: Daniel`) so the entire clone-and-tweak is one tool call. **Highest single ROI.**

2. **`update_track(setlistId, trackId, patch)` + `bulk_update_tracks(setlistId, patches[])`** — closes A-8 + A-11. Without these, any MCP flow that touches existing rows has to remove + re-add, which is fragile and noisy.

3. **`publish_setlist(setlistId, options)` with dry-run default** — closes A-16. Highest-stakes safety surface (emails). The PublishDialog's per-musician opt-out should appear in tool args.

4. **`get_congregation_context()` → {rabbis, vocalLeads, instruments, templates, recentSongs}** — closes B-1..B-6 in one tool. Without this, every cowork task has to ask Daniel "who's the rabbi?" "who's the bassist?" "what templates exist?". Critical for the "Claude-first" vision.

5. **Soft-delete model on `delete_chart` + `archive_chart` + `restore_*`** — closes A-21 and the task-11 recovery gap. Brings MCP into alignment with the UI's existing safety posture.

**Other high-value additions (rank 6-10):**

6. **`create_setlist_from_template(templateId, eventDate, overrides?)`** — closes A-1, A-5, A-39, B-11.
7. **Scheduling tools** (`assign_musician`, `suggest_musicians`, `unassign`, `list_assignments`) — closes A-15, A-25..A-33. Cluster of 4-5 tools.
8. **Document-driven import as a single MCP tool** — closes A-6. Probably exposed as `import_setlist_from_document(buffer, mimeType, options)` with interactive callbacks via tool-result echoes.
9. **`search_chart_content(query)`** — closes A-23. Lets Claude find songs by lyric.
10. **`get_setlist` enhancements** — surface binding health, publish state, recent-edits (closes B-1, B-9).

**The `section` vs `header` vocabulary bug (A-10) should be fixed regardless of MCP work** — it silently corrupts setlists across the two surfaces today.

---

## Open questions for Daniel (post-cowork)

These are the questions the synthesis will need answered. Cowork's report may surface some; Daniel decides the rest:

- Q1 — Soft-delete chart: archive default + opt-in hard? Or keep delete hard + add separate `archive_chart`? (My recommendation: archive default, hard via flag.)
- Q2 — Clone-setlist signature: should the tweak-list be a separate followup (`clone_setlist` then `bulk_update_tracks`), or atomic with one tool? (My rec: atomic, with a `tweaks: [{...}]` array.)
- Q3 — Document-import as ONE tool or a tool-chain? The UI flow has 6 interactive steps. (My rec: ONE high-level tool with an optional `dry_run` returning the parsed structure for review; if approved, run it.)
- Q4 — Should `publish_setlist` write the email immediately (with dry_run) or stage it (`stage_publish` → `confirm_publish`)? (My rec: dry_run default, single call, returns recipient list for caller-side approval before re-call with `dry_run: false`.)
- Q5 — Frontend-shrink phasing: which UI surfaces retire FIRST, given the dev-time cost of each? (My rec: UploadDialog + ScraperModal + CreationWizard + SetlistMetaEditSheet first — small wins. PublishDialog + ImporterModal later — bigger surfaces but higher cowork-validation cost.)

---

## How this dovetails with cowork's report

When cowork returns its `mcp-claude-first-cowork-REPORT.md`, the synthesis pairs:

- Cowork's **missing-tool wishlist** ↔ my **Pass A coverage matrix** (do they agree on priorities?)
- Cowork's **"context I wished I had"** ↔ my **Pass B hidden-context list** (overlap = highest confidence)
- Cowork's **safety / near-miss notes** ↔ my **Pass C reversibility audit** (these should converge)
- Cowork's **per-task verdicts** ↔ my **Pass D shrink-ROI verdicts** (where cowork says "claude_faster" AND I say "delete the UI" → strongest signal to retire that surface)

The disagreements are the most interesting signal. If cowork says "I could clone a setlist fine" but I say "GAP A-2 CRITICAL", either cowork found a hidden composition I missed, or it didn't actually finish (worth re-reading the transcript).

The synthesis output (`mcp-claude-first-SYNTHESIS.md`) is a prioritized roadmap, sized for PAUL phases. Each top-5 addition is a candidate v7.1 phase or its own small milestone.
