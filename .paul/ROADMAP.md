# Roadmap: sheet-music-app (CentralReform.live)

> **♻️ 2026-06-07 PAUL RE-BASELINE.** PAUL went dormant at the v7.0 close (2026-05-14). The 439 commits since then ran through the bongo `.coord/` parallel-agent system (supervisor/auditor/coder cowork cycles), NOT the PAUL loop. This roadmap now records that work as the **v7.1 Production Hardening** milestone (below). The 2026-05-15 MCP-first authoring pivot still holds: Daniel authors via Claude + MCP; the browser app is the band/consumer surface only.

## Next Milestone

**v11.7 (candidate backlog)** — Photo-of-paper-chart import (dropped from v11.5 2026-06-14; recon in `.paul/milestones/v11.5.0-ROADMAP.md` § Phase v11.5-03); F3 library browse density/filters (thumbnails, composer/recency metadata, search ergonomics); F5 comms design layer (waits on the Antigravity mural/BL mockups); the v11.5-deferred infra adjacents not folded into v11.5-04 (recordings-collection org-scoping + `/api/recordings/upload` orgId stamp, `finalize_chart_upload` signed-URL org-stamp gap, SERVICE_TYPE_LABELS vocab table, v7.0 fold-forward re-triage); authed-broslaz design pass + cross-org leader-wall UI check. v7.1 Production Hardening continues independently via the bongo `.coord/` cadence.

## Active Milestone

**🚧 v11.6 — Airtight (Weekend Stress & Usability)** (OPENED 2026-06-17 · `package.json` → 11.6.0 at close · **1 of 4 phases complete**)
Status: 🚧 **In Progress** · Phases: **1 of 4** (01 ✅ discovery → 02/03/04 fixes) · **Oracle:** `docs/ACCESS-POLICY.md` **v0.4** (access-shaped findings) · **Triage bar widened to usability-AND-access** · **Source:** `.paul/MILESTONE-CONTEXT.md` (consumed at /paul:milestone 2026-06-17). **Discovery report:** `.paul/research/v11-6-01-stress-triage-REPORT-2026-06-17.md` (31 findings WS-01..31; drives 02/03/04).
**Doctrine:** A deliberately **narrow** hardening milestone — not a feature milestone. v11.5 hardened by reasoning; v11.6 hardens by **driving the real surface against the three real upcoming sets and fixing what actually breaks.** Authoring stays MCP-first; the broad backlog (photo-import, library density, comms layer) is pushed to v11.7.
Focus: Stress-test the band's *entire* path against the three upcoming **Camp Sabra weekend** sets and fix whatever isn't airtight — special weight on **text/plain chord-chart iPad reading** (two of three sets are scraped text charts on the less-hardened `TextScoreViewer` path) and **off-site flaky-wifi resilience** (a camp may break the "venue has wifi" assumption that justified dropping PWA offline). The three sets are the canonical stress fixtures (realism anchor, NOT a service-gate/deadline-triage axis — paper stays the implicit fallback). CRC + broslaz both live; CRC byte-identical where shared.

**Anchor fixtures (probed live 2026-06-17 — all chart-healthy, 0 missing/0 unreachable, none published):**
- Shir Shabbat — Juneteenth (Fri Jun 19) `a84f8cce-176e-4b5e-9653-4df71db6f5ba` — 22 tracks / 14 bonded, all PDF.
- Camp Sabra — Havdalah & Kids Singalong (Sat Jun 20) `7e005452-7c42-4cdc-b27d-ff0c78b6667b` — 15 / 9, mostly text/plain.
- Camp Sabra — Staff Concert (Late Night) (Sat Jun 20) `7c640a8a-358e-48ee-8523-6b8a0eca9d05` — 17 / 14, all text/plain.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11.6-01 | Stress sweep & triage — live Playwright (3 sets, wifi-drop sim) + multi-agent code audit → triaged findings report [DISCOVERY, verify-first, BLOCKS the rest] | 01 (research) ✅ | ✅ Complete | 2026-06-17 |
| v11.6-02 | Perform reading airtight — text/plain rendering + transpose/swipe/zoom on iPad-WebKit [P0/P1] | 01 nav+hydration · 02 text · 03 PDF/img+toolbar | 🚧 Planning | - |
| v11.6-03 | Off-site resilience (flaky wifi) — characterize wifi-drop w/ set open; decide bounded offline guarantee [P1, characterize→decide] | TBD | Not started | - |
| v11.6-04 | Authoring + publish round-trip — finalize 3 sets via MCP; airtight publish-&-deliver [P1, live send = STOP-gate] | TBD | Not started | - |

### Phase v11.6-01: Stress sweep & triage [DISCOVERY — verify-first, blocks the fix phases]
Focus: Generate airtight evidence of what's broken before touching prod code. Live **Playwright sweep** on the deployed prod surface (this Windows box, real 11" 820×1180 iPad-WebKit viewport) driving Perform reading + transpose + swipe/nav across all three sets, **with a wifi-drop simulation** (set already open). In parallel, a **multi-agent code audit** of the `TextScoreViewer` / `PDFViewer` / transpose / offline / publish code paths. Output: ONE triaged, severity-ranked findings report (usability-AND-access bar; err-public still governs access-shaped findings). NOT cowork for the browser probes (cowork can't launch WebKit — route to Claude Code on Windows). **No production code changes this phase.**
Plans: TBD (defined during /paul:plan)

### Phase v11.6-02: Perform reading airtight [P0/P1]
Focus: Fix the reading-surface defects the sweep surfaces, weighted to **text/plain chord-chart rendering** (the two camp sets) — transpose correctness, line/word wrap, swipe/zoom/nav on iPad-WebKit. /ui-ux-pro-max BLOCKING. Every fix gets a regression cell/test re-runnable by the Phase 01 sweep.
Plans: TBD (defined during /paul:plan)

### Phase v11.6-03: Off-site resilience (flaky wifi) [P1 — characterize→decide]
Focus: What happens when camp wifi drops with a set already open? Characterize the failure (does the open set/chart keep working? what re-fetches and 401s/spins?), then **decide** whether to re-introduce a bounded offline guarantee for the open set + its charts — revisiting the PWA-removal "venue has wifi" call for the off-site case. Likely carries a `checkpoint:decision` (offline scope is a genuine 2+-option fork: do-nothing vs. open-set cache vs. narrow service-worker shell). /ui-ux-pro-max BLOCKING if any UI is touched.
Plans: TBD (defined during /paul:plan)

### Phase v11.6-04: Authoring + publish round-trip [P1 — live send = STOP-gate]
Focus: Finalize the three sets via MCP (keys/BPM/order/bonds airtight — `verify_setlist_charts` clean, no surprises), close any authoring-flow gaps the sweep finds, and make **publish-&-deliver to the band** airtight (`publish_setlist` recipient model + QR sign-in + push/in-app notify). The actual live publish/notify send is a **STOP-gate** (`autonomous: false` for the send — notifies real people; dryRun/preview to test, real-send confirmation → `.paul/UAT-PENDING.md`).
Plans: TBD (defined during /paul:plan)

Constraints (locked at /paul:milestone 2026-06-17):
1. **Triage bar = usability-AND-access.** A real usability/correctness defect on the consumer surface counts as a bug even if it doesn't contradict a `docs/ACCESS-POLICY.md` v0.4 cell; `err-public` still governs any access-shaped finding.
2. **No local dev** — push to prod/Vercel; CRC + broslaz BOTH live. **CRC byte-identical** wherever a shared surface is touched.
3. **Quality floor (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build --webpack` before declaring any route-/shared-lib/client phase deployable; emulator-backed tests where rules/queries change; **/ui-ux-pro-max BLOCKING on every UI-touching phase** (02 reading, 03 offline UI).
4. **Verification:** every fixed item gets a regression cell/test; the Playwright sweep cells are re-runnable; text-render + offline behaviors get explicit cells. Method = live Playwright (Windows, real WebKit) + multi-agent code audit; manual Daniel UAT accrues to `.paul/UAT-PENDING.md`, not a primary gate.
5. **Fixtures + target:** the three named setlists are the canonical stress fixtures; iPad target = 11" 820×1180 WebKit.
6. **Autonomy posture (carried v11.0–v11.5):** run autonomously — waive PAUL approval/continuation gates, auto-commit + push per phase to prod `master`, bake decisions into PLANs, deploys/backfills as AUTO tasks (single-owner = executor). STOP only for product ambiguity, an unresolvable quality-gate failure, a discovered cross-tenant leak / CRC lock-out, OR a live publish/notify send (phase 04 STOP-gate).
7. **Explicit non-goals (deferred to v11.7):** photo-of-paper-chart import, F3 library browse density/filters, F5 comms design layer, the deferred infra adjacents (recordings org-scoping, `finalize_chart_upload` signed-URL org-stamp, SERVICE_TYPE_LABELS vocab, v7.0 fold-forward); identity-deepening stays on the Antigravity track.

## Most Recent Milestone (✅ COMPLETE)

**✅ v11.5 — Bulletproof Performance — COMPLETE** (OPENED 2026-06-11 · CLOSED 2026-06-16 · tag `v11.5.0` · **v11.5-03 photo-import DROPPED 2026-06-14** → v11.7 · **4 of 4 active phases complete**; archived `.paul/milestones/v11.5.0-ROADMAP.md`)
Status: ✅ **COMPLETE** · Phases: **4 of 4 active** (01/02/04/05; v11.5-03 dropped) · **Oracle:** `docs/ACCESS-POLICY.md` **v0.4** · **Source brief:** `.paul/research/MILESTONE-BRIEF-v11.5-bulletproof-performance.md`. Archived snapshot: `.paul/milestones/v11.5.0-ROADMAP.md`.
**Doctrine (ratified):** bulletproof > novel. The web app is the band/consumer surface — its job is **performance + quick edits**, not feature breadth. Authoring stays MCP-first. Identity-deepening (mural-led CRC, BL swagger) is a separate Antigravity mockup track, NOT this milestone.
Focus: Make the band/consumer web surface bulletproof — fix tenancy/anon correctness leaks, nail the Perform reading + in-service editing experience, then sweep harness hygiene and consumer polish. CRC + broslaz both live; CRC byte-identical where shared surfaces are touched.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11.5-01 | Tenancy + anon correctness — H4 + H5 + H9 [P0/P1] | 3/3 ✅ — 01 (H4 `180c9b666e`) · 02 (H5 `cd97ab21a3`) · 03 (H9 `d7cbb1a4e0`) | ✅ Complete | 2026-06-12 |
| v11.5-02 | The performance surface — H1 + F2 + H7/F1 + H3 [P1 · headline] | 4/4 ✅ — 01 (H3 `c687db99ee`) · 02 (H7/F1 `27c93a788b`) · 03 (F2 closed-as-shipped `80086d1f71`) · 04 (H1) | ✅ Complete | 2026-06-14 |
| ~~v11.5-03~~ | ~~Photo-of-paper-chart import~~ — **❌ DROPPED 2026-06-14** (Daniel reversed; → v11.7 backlog. Number retired, not renumbered.) | — | ❌ Dropped | - |
| v11.5-04 | Hygiene & harness — run-3 triage + design findings [P2] | 2026-06-16 | ✅ COMPLETE 4/4 | `7bffbca1a3` (03) +ops |
| v11.5-05 | Consumer polish quick wins — design audit [P3] | 01 (Q6+Q3) ✅ `dda03624f7` · 02 (Q5+F4) ✅ `bd7d786ec2` · 03 (Q4) ✅ `14ebb2448e` | ✅ Complete 3/3 | 2026-06-16 |

### Phase v11.5-01: Tenancy + anon correctness [P0/P1 — smallest first]
Focus: Consumer-surface correctness leaks (H4/H5) + an authoring-tier permission lockout (H9).
- **H4** ✅ (shipped `180c9b666e`) — CRC header leaking on broslaz `/perform/setlist/[id]`: `perform/setlist/layout.tsx` rendered `<AppNavigation/>` propless → nav fell back to the CRC default. Converted to an async server layout resolving `x-org-id`→`getOrgBranding` (covers detail + `track/[trackId]`; CRC byte-identical). Regression test + stress cell B4. (S)
- **H5** ✅ (shipped `cd97ab21a3`) — anon chord-cache write 401: the transposer's `saveNativeKey(…,'auto')` (fires for every viewer) hit the `role:'musician'`-gated `PATCH /api/library/chord-cache` → 401 + console noise + never cached. PATCH→`requireAuth:false` + field guard (anon: nativeKey forced 'auto' + lastUsed*; `chordsVerified`/manual provenance stay authed-musician) + added the missing `api` rate-limit. D-Q2 honored (shared bucket, no double-punish; authed unchanged). 6 regression cases. (S–M)
- **H9** (field-reported 2026-06-12, David) — **band_leaders are locked out of in-place library-metadata edits.** `edit_library_entry`/`edit_enrichment` (the only editor of tags/title/collection/key/bpm/leadMusician) is `assertAdmin`-gated (`library-review.ts:634`); the only band_leader chart-metadata write is `update_song` (key/bpm). So a band_leader cannot change a chart's **tags** (or title/leadMusician) except by delete-and-re-import — which breaks gig bonds and is impossible for direct-uploads lacking a Drive source. Contradicts the v11.4-04 doctrine (band_leaders = authoring tier). **Fix:** relax the gate to admin-OR-band_leader for a curation-safe subset (**tags, title, key, bpm, leadMusician**; `collection` stays admin-only) **+ add org-scoping** (`row.org ∈ caller orgIds`) — `library-review.ts` has NO tenancy check today, so the relaxation must not open a cross-tenant authoring hole (err-public ACROSS-tenant wall). **STOP-gate** (MCP auth/permission change → `autonomous: false`, approval before APPLY). Immediate field unblock = temp-bump David to admin via `/api/admin/set-role` (orgIds-preserving). **✅ SHIPPED `d7cbb1a4e0`** (Daniel approved): gate→`assertLibraryEditor` (admin|band_leader) + `forbidden_field` collection guard + cross-tenant `orgWall`→`row_not_found` (admin byte-identical); emulator authz 5/5. (S–M)
Plans: 01 (H4) ✅ · 02 (H5) ✅ · 03 (H9) ✅ — **Phase COMPLETE 3/3 (2026-06-12).** Deferred: org-scope the anon chord-cache writes (POST chordData + PATCH nativeKey). Next: Phase v11.5-02.

### Phase v11.5-02: The performance surface [P1 — the headline]
Focus: The Perform reading + in-service editing experience. UAT-heaviest phase (real 7-tablet iPad fleet).
- **H1** — landscape auto-fit + per-chart calibration override: auto fit-to-width/height per orientation; a leader-saved per-chart calibration (zoom/crop offset) overrides. Acceptance MUST include the real `.docx`-derived charts (literal-100% render wastes a third of the iPad). UAT across source types (MusicXML, clean PDF, scan, home-typeset). (M–L)
- **F2** — in-Perform shared key change (leader-only): change the broadcast key (and optionally swap a chart) without exiting Perform; the authoring flow's autosave pattern is the model. Distinguish clearly from per-device transpose. Leaders only; D6-style gating. (M)
- **H7 + F1** — `/perform` cold-open performance + "tonight" entry: field p75 LCP 2924 / FCP 3551 / TTFB 1632 / CLS 0.13 on the entry route while siblings are green. **Root-cause TTFB first** (server fetch), then the "big obvious tonight" entry treatment (route straight to the most-relevant set from cold open). (M)
- **H3** — seekable audio: HTTP Range support on the audio endpoint (run-3 B-11; wishlist "audio/recordings awkward"). (S–M)
Plans: 01 (H3) ✅ `c687db99ee` · 02 (H7/F1) ✅ `27c93a788b` (TTFB INFRA-BOUND, not app code; "next service" CTA) · 03 (F2) ✅ closed-as-shipped (live-director long-press, no code) · 04 (H1) ✅ — **Phase COMPLETE 4/4 (2026-06-14).** H1 shipped as **per-device** per-chart zoom (localStorage, Daniel-ratified; NOT shared Firestore) + tappable Fit reset; verified PDF/MusicXML already fit-to-width + reflow on rotate so no viewer churn. Crop deferred; image-chart calibration + standalone `/perform/[fileId]` route out of scope. Next: Phase v11.5-03.

### Phase v11.5-03: Photo-of-paper-chart import — ❌ DROPPED 2026-06-14
**Status:** DROPPED before any code. Daniel reversed the v11.5 funding call ("I don't want to do the photo import feature. I change my mind") at the v11.5-02→03 boundary, after VERIFY-FIRST recon but before Plan 01 was authored. No repo changes were made. Number RETIRED (04/05 keep their IDs — no renumber).
**Recon preserved (for v11.6 if revisited):** `processChartUpload` already accepts image MIME (png/jpeg/heic/heif) + auto-converts HEIC→JPEG; chunked upload trio is the multi-MB transport; `pdf-lib` embeds images (print pipeline, no EXIF rotation); `ImageScoreViewer`/`PDFViewer` render; H1 `chartZoom[fileId]` auto-plugs any chart type. MISSING: no `sharp`/`jimp` (zero image-normalization lib), no image→PDF in ingestion, no `"photo-import"` provenance, no photo-tuned MCP tool. MCP route `maxDuration`=60s/128MB (fine for one image). → moved to **v11.6 candidate backlog**.

### Phase v11.5-04: Hygiene & harness [P2]
Focus: Fold of run-3 stress triage + design findings; low-risk correctness + harness/ops.
- **M-11:** `contact_not_found` → 404 (error contract). (S)
- **M-10:** `publish_setlist` schema description → D8 contract. (S, doc)
- **Library hygiene:** delete the two `[role-*] tiny` rows + the ingested `.DS_Store`; **isTest/junk filter on consumer library browse AND the bind-chart picker** (both confirmed showing junk; get a stress-prompt cell); non-chart-file guard at ingestion; verify `delete_chart` for authors; consider `list_setlists({includeDeleted})`. **VERIFY FIRST** cascade coverage before deleting orphans. (M)
- **H8:** `cleanup_all_test_data` cascade releases monitor-bus assignments (orphaned uid on a real bus observed). (S)
- **F-8:** `orgIds` option on `create_test_account` (cross-tenant authoring becomes harness-testable). (S)
- **M-12:** chunked-upload session TTL → ~60 min + tool descriptions document Drive-staging as the primary agent path. (S)
- Permanent test `.docx` fixture in the app Drive folder (unverified conversion branch from run 3). (S)
- Band_leader-tier bearer for Daniel's Claude Code MCP config (three runs blocked on member-tier; document the setup). (S, ops)
- **Fold-opportunistically (planner's call):** the v11.6-deferred recordings org-scoping + `finalize_chart_upload` signed-URL org-stamp adjacents — pull in ONLY if low-cost here; else leave to v11.6.
Plans: 01 (M-11/M-10 error contracts) ✅ `d3ee8907fc` · 02 (library junk filter: browse + bind-picker + Drive-sync ingestion guard) ✅ `fa3cfd2a8a` · 03 (H8 monitor-bus cascade + F-8 `create_test_account` orgIds + M-12 chunked TTL 60m + Drive-primary docs + chord-cache tsc fix) ✅ `7bffbca1a3` · 04 (delete_chart-author VERIFY + prod junk-row deletion + `.docx` fixture + BL bearer doc) ✅ — **Phase COMPLETE 4/4 (2026-06-16).** VERIFY-FIRST: of the 3 scoped junk rows, only `.DS_Store` remained (deleted; the two `[role-*]` rows were already gone); folder/audio non-chart clutter left to v11.6. `tsc` clean on master (03). M-12 fold-opportunistic adjacents NOT pulled in → stay v11.6. Next: Phase v11.5-05.

### Phase v11.5-05: Consumer polish quick wins [P3 — from the design audit]
Focus: Small consumer-facing polish.
- **Q3:** branded, QR-aware error copy on both hosts ("This sign-in code expired or was used — ask for a fresh QR"). (S)
- **Q4:** anon `/setlists` — hide write controls (invariant-6) + suppress junk drafts from the anon archive. (S–M)
- **Q5:** chart titles never show raw filenames (".pdf"/".docx") on consumer surfaces. (S, data+display)
- **Q6:** BL subtitle vocab "Public sets", not "Public setlists". (S)
- **F4:** key badges on broslaz setlist rows (CRC has them; a transposing band needs them more). (S)
Plans: TBD (defined during /paul:plan)

Constraints (locked at /paul:milestone 2026-06-11):
1. **Oracle-bound** — a finding is a bug only if it contradicts a `docs/ACCESS-POLICY.md` **v0.4** cell. err-public prime directive holds (err toward letting someone see a chart; writes/admin stay gated).
2. **No local dev** — push to prod/Vercel; CRC + broslaz are BOTH live. **CRC byte-identical** wherever a phase touches shared surfaces.
3. **Quality floor (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build --webpack` before declaring any route-/shared-lib/client phase deployable (route-export + bundle-boundary lessons — `tsc`+`vitest` miss both); emulator-backed tests where rules/queries change; **/ui-ux-pro-max BLOCKING on every UI-touching phase** (01 header, 02 Perform surface, 03 photo-import UI, 05 polish).
4. **Verification expectations** — every fixed item gets a regression cell or test; **H4 + the library-junk filter get stress-prompt cells**; **H1 / F2 / photo-import get Daniel UAT on the real 7-tablet iPad fleet before milestone close**. Per-executor BUG-ID ranges in any new stress prompts.
5. **VERIFY-FIRST flags (baked in):** H4 (which layout renders detail vs list), H7 (root-cause TTFB / server-fetch before treatment), photo-import (`scrape_chart_from_url` / `salvage_chart_bytes` reuse), library-hygiene (cascade coverage before deleting orphans).
6. **Autonomy posture (carried v11.0–v11.4):** run autonomously — waive PAUL approval/continuation gates, auto-commit + push per phase to prod `master`, bake decisions into PLANs, deploys/backfills as AUTO tasks (single-owner = executor). STOP only for product ambiguity, an unresolvable quality-gate failure, or a discovered cross-tenant leak / CRC lock-out.
7. **Explicit non-goals (deferred — list stands):** H2 foot-pedal page-turns SKIPPED; F3 library density/filters → v11.6; F5 comms design layer → Antigravity track; identity-deepening → Antigravity track; STATE pre-existing candidates (recordings org-scoping, signed-URL org-stamp, SERVICE_TYPE_LABELS, v7.0 fold-forward) stay deferred (fold-opportunistically note in 04 only); authed-broslaz design pass → next stress run.

## Previous Milestone (✅ COMPLETE)

**✅ v11.4 — Publish & Notify (D8)** (COMPLETE 2026-06-11 · tag `v11.4.0` · 4 phases, 5 plans; archived `.paul/milestones/v11.4.0-ROADMAP.md`)
Status: ✅ COMPLETE · Phases: **4 of 4 complete** · Oracle → **v0.4** (D8 shipped) · **Spec backbone:** `docs/ACCESS-POLICY.md` §"Publish & notify (D8, ratified 2026-06-10)" — this milestone *implements* the already-ratified D8 decision (bump oracle → v0.4 when it ships; retire the "Until D8 ships, invariant 3 stands as-is" note) · **Context:** derived via `/paul:discuss-milestone` 2026-06-10 (`MILESTONE-CONTEXT.md`, consumed).
Focus: Replace today's implicit auto-blast publish/notify with an explicit, leader-driven, org-branded recipient model — across BOTH the browser `PublishDialog` AND the MCP `publish_setlist` path (Daniel's primary authoring surface) — so a publish can never again fan out to the wrong people (the v11.2 BUG-9 cross-tenant blast class). Channels governed: in-app + web-push + email; SMS gets no new feature work but must not auto-blast either (picker-fed or held). CRC byte-identical where shared.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11.4-01 | Recipient picker + no-auto-blast (D8 items 1+2) [P0 — safety core] | 01 (MCP no-blast + browser picker) ✅ | ✅ Complete | 2026-06-11 |
| v11.4-02 | Org-branded comms (D8 item 4) [P1] | 01 (EmailBranding + org-aware emails) ✅ | ✅ Complete | 2026-06-11 |
| v11.4-03 | Remembered ad-hoc recipients (D8 item 3) [P1] | 01 (MCP contacts: collection + CRUD + preview surfacing) ✅ | ✅ Complete | 2026-06-11 |
| v11.4-04 | Musician org-membership toggle + default-both backfill (D8 item 5) [P2 — LAST] | 01 (all-roles toggle) ✅ · 02 (default-both rollout) ✅ | ✅ Complete | 2026-06-11 |

### Phase v11.4-01: Recipient picker + no-auto-blast [P0 — safety core, prerequisite for 04]
Focus: Replace the implicit `resolveDefaultRecipients` auto-send with explicit recipient selection (D8 items 1+2). Browser `PublishDialog.tsx` gains a recipient picker (default = the publishing org's roster, leader checks/unchecks who receives); MCP `publish_setlist` requires an explicit recipients selection / confirm (`preview_publish` already surfaces the org-scoped audience from v11.2-02). in-app/push/email send ONLY to the selected set. Closes the BUG-9 blast class permanently on both surfaces. Preserve the v11.2-02 org-scope wall + v11-06-02 no-arg-injection invariant. Regression + emulator coverage citing tenancy invariant 3.
Plans: **01** ✅ COMPLETE (`v11.4-01-01` PLAN+SUMMARY; 3 tasks; /ui-ux-pro-max applied to Task 2). **T1** MCP `publish_setlist` real publish refuses on undefined recipients (`recipients_required`); dryRun/preview still auto-derives the candidate audience. **T2** `PublishDialog` per-musician toggle now governs ALL channels (in-app+push+email), default all-selected (CRC byte-identical), zero-selected disables Publish; a11y role=checkbox/aria-checked/≥44px. **T3** MCP emulator 29/29 (+4 D8 cases; 5 existing migrated to explicit recipients) + new `PublishDialog.test.tsx` 3/3. Preserved v11.2-02 org-scope wall + v11-06-02 no-arg-injection. Gates: tsc · emulator · components/setlist · next build all green. 1 live-send UAT item (STOP-gate). **Closes BUG-9 implicit-blast on both surfaces; HARD prereq for v11.4-04 satisfied.** Changes Daniel's MCP flow → preview then publish-with-recipients.

### Phase v11.4-02: Org-branded comms [P1]
Focus: Publish emails + gig-packet emails carry the publishing org's branding (logo/wordmark/from-name/footer), broslaz vs CRC, via the existing `getOrgBranding`/`branding.ts` seam (mirrors v11.1-01 nav-branding pattern). Touches `email-packets`/`resend-email` + email templates + packet PDF header. CRC byte-identical.
Plans: **01** ✅ COMPLETE (`v11.4-02-01` PLAN+SUMMARY; 3 tasks; /ui-ux-pro-max applied to Task 1). NEW per-tenant `EmailBranding` registry + `getEmailBranding(org)` in `branding.ts` (separate from browser-chrome `OrgBranding` → CRC byte-identical, since email header #1a1a2e ≠ themeColor #0e0d18). `email.ts` org-aware (from-name/header/footer/wordmark); `getFromEmail(org)` w/ `RESEND_FROM_EMAIL_BROSLAZ` + verified fallback. Branding sourced from the **setlist's** org (`rowOrg(setlist.orgId)`) on all 4 send paths (MCP publish + /publish + /resend-email + /email-packets). Tests: email.test 6/6 + branding.test +3; src/lib 1797/1797; tsc + next build green. **Scope note:** covered publish/gig-packet/resend EMAILS; the printed packet PDF header uses print-pipeline's existing `getOrgBranding` seam (already org-aware) — not re-touched here. 1 UAT item (live BL brand + Resend-domain ops step).

### Phase v11.4-03: Remembered ad-hoc recipients [P1]
Focus: The picker (from 01) gains "add a recipient the system doesn't know" (name + email/phone) → sends this publish + prompts to save them as a contact for next time. Contacts model decided at plan time (new `contacts` collection vs extend roster/people). Depends on v11.4-01.
**SURFACE RATIFIED (Daniel 2026-06-11): MCP contacts, NOT browser UI** — the browser `PublishDialog` picker is orphaned (mounted nowhere; verified via grep + git), and MCP `publish_setlist` already accepts ad-hoc email `recipients[]`, so the gap was persistence/reuse not sending. Contacts model = **new org-scoped `contacts` collection** (the recipients are non-account humans → a dedicated collection, not users/roster).
Plans: **01** ✅ COMPLETE (`v11.4-03-01` PLAN+SUMMARY; 3 tasks; no /ui-ux gate). **T1** `contacts` collection + Firestore rules (leader/admin, org-isolated; DEPLOYED to prod) + 6-case emulator rules test. **T2** `list/create/delete_contact` MCP tools (leader-gated via assertEditor, org-scoped via orgFrom; create validates name + email|phone, dedupes by email in-memory; delete cross-org not_found wall). **T3** `preview_publish.savedContacts[]` (org-scoped, informational — recommendation gate unchanged) + MCP emulator tests (CRUD, org isolation, non-leader denied, preview surfacing). NO publish/preview signature change — agent passes saved contacts as ordinary `recipients[]`. Gates: tsc · contacts emulator 12/12 · non-emulator MCP 449/449 · next build green; rules deployed. 1 UAT (live MCP smoke, no sends).

### Phase v11.4-04: Musician org-membership toggle + default-both backfill [P2 — LAST, hard-ordered]
Focus: Admin per-org membership control for musicians (mirror the band-leader tri-state from v11.1-02-02; claim+doc lockstep via `/api/admin/set-role`), **defaults to both orgs**, with a backfill of ALL existing people to both. **MUST ship after v11.4-01** — the picker is what makes default-both safe (else it re-creates the BUG-9 blast). Prod backfill = dry-run + idempotency marker + rollback (autonomy rule).
**SCOPE RATIFIED (Daniel 2026-06-11):** default-both applies to **EVERYONE incl. band_leaders/admins** → grants cross-tenant AUTHORING to all leaders (deliberate; supersedes the v11.1-02-02 "authoring-tier-only / consumers host-derived" framing). `rowOrgIds` default stays `['crc']` (safety net); "both" is explicit data.
Plans: **01** ✅ COMPLETE (`v11.4-04-01`; 2 tasks) — opened the `UserRow.tsx` Band-access tri-state control from leader-only to ALL non-pending rows (admin-only) + generalized copy + UserRow.test 3/3. Pure UI-gating change (set-role/updateUserRole already role-agnostic); tsc + next build green. **02** ✅ COMPLETE (`v11.4-04-02`; commit `47e83088a1`; 3 tasks) — **T1** `ensureUserProfile` create path seeds `orgIds:['crc','brotherslazaroff']` (new-account default-both); **T2** `scripts/v11-4-04-orgids-backfill.mjs` (firebase-CLI refresh-token ADC, mirrors v11-3-03; modes diagnose/dry-run/apply/rollback; doc+claim lockstep; idempotent skip-if-both; per-user prior-state snapshot incl. absent→delete) + 10-case pure-helper unit test (firebase-admin dynamically imported so helpers test admin-free); **T3** prod `--apply` run (Daniel-authorized, agent-executed): scanned=19 changed=15 skipped=4, re-diagnose → 0 remaining (idempotent), snapshot written (gitignored). Gates: tsc · vitest 10/10 + src/lib 1799/1799 · `next build` clean. **v11.4 now 4/4 CONTENT COMPLETE → `/paul:complete-milestone` (oracle → v0.4).**

Constraints (locked at /paul:milestone 2026-06-10):
1. **Sequencing invariant (HARD):** v11.4-04 (item 5 default-both + backfill) must NOT ship before v11.4-01 (items 1–2 picker). Picker first, backfill last — else default-both membership re-creates the v11.2 BUG-9 cross-tenant blast.
2. **No auto-blast EVER (item 1):** applies to every channel including SMS — even out-of-scope channels must be picker-gated or held, never implicit-roster.
3. **Tenancy invariants hold** (`docs/ACCESS-POLICY.md` §invariants): publish audience org-scoped (inv. 3); CRC byte-identical under broslaz-only changes (inv. 4); `isTest` never in a publish audience (inv. 5).
4. **MCP = primary surface:** the picker/no-blast contract covers `publish_setlist`, not browser-only. Preserve v11.2-02 org-scope wall + v11-06-02 no-arg-injection invariant.
5. **Quality floor (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build` before any shared-lib/client phase is deployable; emulator-backed tests where rules/queries change; **/ui-ux-pro-max BLOCKING on UI-touching phases** (01 picker, 03 contacts UI, 04 toggle UI); v11.4-04 backfill gets dry-run + idempotency marker + rollback.
6. **Publish/notify = canonical STOP-gate (notifies real people):** building each phase is autonomous + auto-commit/push per phase to `master`; any LIVE publish/send verification stays human-gated UAT (use `dryRun`/preview; never auto-blast a real roster to test). Real-send confirmation → `.paul/UAT-PENDING.md`.
7. **Autonomy posture (carried v11.0–v11.3):** run autonomously, bake decisions into PLANs, single-owner executor for the backfill. STOP only for product ambiguity, unresolvable quality-gate failure, or a discovered cross-tenant leak / CRC lock-out.

## Standalone Phase — loginable-test-accounts (✅ COMPLETE 2026-06-10, 2/2 plans)

Off the stress-test report's INCOMPLETE item 3 (`.paul/research/TOOLING-BRIEF-test-account-login.md`). Gave `create_test_account` an opt-in `loginable:true` so the Playwright stress harness can do real browser persona sign-in (real Web SDK auth state for client Firestore probes) — previously every test account was `disabled:true`. Standalone (no milestone); quality floor held every loop (tsc · emulator mcp-test-tokens 34/34 · `next build`).
- **Plan 01 ✅** — `loginable` mint (enabled account, NO password) + one-time **custom-token login URL** on the existing QR mechanism (pre-approved single-use `qr-sessions` doc, high-entropy code) + headless `/test-login?code=` consume route (`signInWithCustomToken`→`syncSessionCookie`) + `qr-sessions` added to the revoke/cleanup cascade. /ui-ux-pro-max satisfied. Default path byte-identical.
- **Plan 02 ✅** (depends_on 01) — browser-session **TTL enforcement**: hourly `/api/cron/disable-expired-test-accounts` (disable + `revokeRefreshTokens`) + `/api/auth/session` mint rejection for expired loginable accounts (isTestUid-gated, no normal-user cost) + checkRevoked audit (server-auth + drive-file-auth already `verifySessionCookie(cookie,true)`; no change). Exposure bounded to ~2h.

**UAT-PENDING (live/safe):** browser persona sign-in end-to-end + AC-2 session-mint rejection deployed-surface check (`.paul/UAT-PENDING.md`).

**Decisions (Daniel 2026-06-10):** (1) Login path — one-time custom-token URL via the QR custom-token store, NOT a static secret; the QR PUT-approval path is confirmed hard-coupled to physical-device handoff (mints a token for the *approver's own uid*), so we reuse only the `qr-sessions` store + the GET-consume endpoint and add a `/test-login` route; public `/login` + `/qr/[code]` untouched. (2) TTL — cron disable + `revokeRefreshTokens` (kill outstanding ID tokens within ≤1h) + session-mint check + checkRevoked (client Firestore authorizes via ID token, not the session cookie, so disable+revoke is the only real cutoff).
**Verified-first:** library_index/songs uploads already cascade-clean via `CASCADE_FIELDS` (`uploadedBy` + best-effort Storage) — no gap widened. Login is Google+QR only today (no email/password form), which is why the custom-token URL was chosen over a password form.

## Earlier Completed Milestone — v11.3 Worthiness & Access (✅ COMPLETE)

**✅ v11.3 — Worthiness & Access** (COMPLETE 2026-06-10 · tag `v11.3.0` · 5 phases, 10 plans; archived `.paul/milestones/v11.3.0-ROADMAP.md`)
Status: 🎉 ✅ MILESTONE COMPLETE (tag `v11.3.0`, 2026-06-10) · Phases: **5 of 5 complete** (01 ✅ · 02 ✅ · 03 ✅ · 04 ✅ · 05 ✅) — archived `.paul/milestones/v11.3.0-ROADMAP.md`; next milestone v11.4 via `/paul:milestone` · **Source:** `.paul/research/MILESTONE-BRIEF-2026-06-10-worthiness-access.md` (phase grouping + triage ratified by Daniel) · **Oracle:** `docs/ACCESS-POLICY.md` **v0.3** — a finding is a bug only if it contradicts a cell in that matrix · **Reports:** `.paul/research/STRESS-TEST-REPORT-2026-06-10.md` (MCP run 1) + `…-browser.md` (Playwright run 2) + `…/BUG-cowork-chart-upload-2026-06-10.md` (David's upload dead-end).
Focus: Close the post-stress-test findings the oracle confirms are real. Two **P1** families lead — anon read-access correctness (err-public prime-directive violations) and the agent chart-upload path (David's report) — then P2 hygiene, P2 /perform performance, and P3 polish. Phase order = the brief's family + severity grouping. CRC + broslaz both live; CRC byte-identical where shared surfaces are touched.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11.3-01 | Anon access correctness — BUG-5 + BUG-4 [P1] | 01 (BUG-5) ✅ · 02 (BUG-4) ✅ | ✅ Complete | 2026-06-10 |
| v11.3-02 | Agent chart-upload path [P1] | 01 (Drive convert) ✅ · 02 (chunked inline) ✅ | ✅ Complete | 2026-06-11 |
| v11.3-03 | Harness & hygiene — BUG-9 + BUG-7 + BUG-1 [P2] | 01 (BUG-9+7) ✅ · 02 (BUG-1) ✅ | ✅ Complete | 2026-06-10 |
| v11.3-04 | /perform performance — BUG-2 [P2] | 01 (verify) ✅ · 02 (CLS) ✅ · 03 (TTFB/FCP stream) ✅ | ✅ Complete | 2026-06-10 |
| v11.3-05 | P3 polish — BUG-6 + F-6 [P3] | 01 (BUG-6 + F-6) ✅ | ✅ Complete | 2026-06-10 |

### Phase v11.3-01: Anon access correctness [P1 — prime-directive violations]
Focus: Make anon deep-link reads actually work, per the err-public oracle (anon chart-via-deep-link = ✅ implied by D1; anon transpose = ✅ OPEN per D-Q2).
- **BUG-5** (P2→likely P1): anon `GET /api/library/file/[id]` → 401 `missing_bearer` for Storage-backed (`upload-*`) charts but 200 for Drive-backed. New uploads are Storage-backed → anon deep links to recent charts are dead. **VERIFY FIRST:** cold-device (empty HTTP cache) anon Perform render of an `upload-*` chart — blank ⇒ confirmed P1 (run 2 §BUG-5).
- **BUG-4** (P2): anon transpose dead-ends ("Waiting for scan…", 401s on `/api/library/chord-cache` + `/api/ai/transposer/scan`). Per **D-Q2** the fix is an **anon path** for scan + chord-cache *with abuse protection* (rate-limit anon AI-scan). Must NOT regress authed transpose; must NOT double-punish against F-6's existing cold-load 429s.
Plans: **01 (BUG-5) ✅ LOOP COMPLETE** — `/api/library/file/[id]` → public chart proxy mirroring `/api/drive/file` (serves `upload-*` via `fetchFileById`; `db-*` anon-public). Verify-first re-graded BUG-5 → P2 (Perform renders via `/api/drive/file`, anon-OK). · **02 (BUG-4) ✅ LOOP COMPLETE** — chord-cache GET+POST + transposer/scan POST → anon (`requireAuth:false`); scan gets an anon-only `ai` rate-limit (authed unchanged); anon scan results persist. **Phase ✅ COMPLETE 2026-06-10.** Gates green both plans (tsc · 6+7 route tests · next build). No client edits needed. UAT-PENDING: live anon chart open + transpose render (non-blocking).

### Phase v11.3-02: Agent chart-upload path [P1 — David's report]
Focus: Give the MCP/agent author a working chart-upload route (David's upload dead-end, `BUG-cowork-chart-upload-2026-06-10.md`).
- **Primary:** `import_chart_from_drive` accepts `.docx` + Google Docs and converts to PDF **server-side** (Drive API export / convert-on-copy). Agent passes references, never bytes.
- **Secondary:** chunked inline `upload_chart` (init/append/commit) for non-Drive sources.
- **Out of scope:** the Cowork sandbox proxy (Anthropic-side; reported separately).
Plans: **01 (Primary) ✅ LOOP COMPLETE 2026-06-10** — `DriveClient.fetchAsPdf` (Google-native export via existing `exportDoc` + `.docx`/Office convert-on-copy: copy→Google Doc→export PDF→delete temp) routed into `importChartFromDrive`; unconvertible types still refuse cleanly; binary/dryRun paths unregressed. Reuses dedup/org-stamp/rate-limit gates + `processChartUpload` (PDF already allowed). Gates green: tsc · 58/58 emulator (AC-1..AC-4 + `driveSourceIsConvertible` unit, cite David's report) · next build. No new tool args. · **02 (Secondary) ✅ LOOP COMPLETE 2026-06-11** — inline chunked upload `begin_chunked_chart_upload`→`append_chart_upload_chunk`×N→`commit_chunked_chart_upload` on the `upload_sessions` substrate; commit reassembles in index order → delegates to `finalizeChartUpload` → org-stamps (closes finalize's gap for the new path; signed-URL path's same gap deferred). Only begin+commit metered (per-chunk would exhaust 10/min). Gates green: tsc · 20/20 emulator (8 chunked AC, cite David's report) · next build. **Phase ✅ COMPLETE 2026-06-11.** Out of scope: Cowork sandbox proxy (Anthropic-side).

### Phase v11.3-03: Harness & hygiene [P2]
Focus: Three low-risk correctness fixes; no consumer-facing impact but they broke stress-run pre-flights / violate the error contract.
- **BUG-9:** `/test-login` missing from `proxy.ts` `publicPrefixes` → 307 to /login before code consumption (root cause code-confirmed, run 2 §BUG-9). Fix + regression test.
- **BUG-7:** `GET /api/auth/qr?code=<malformed-with-/>` → 500; must be 4xx (v11.2 error contract).
- **BUG-1** (run 1): orphaned `[role-*] tiny` rows in CRC `library_index`. **VERIFY FIRST:** whether `revoke_test_account`/`cleanup_all_test_data` cascade library uploads of revoked accounts (run 2 swept `library:0`); confirm coverage, then delete the two orphans.
Plans (split — complex, 3 subsystems): **01** (BUG-9 `/test-login`→`publicExactRoutes` + BUG-7 qr GET malformed-`code`→400; route harness/error-contract, autonomous) · **02** (BUG-1 — extend `sweep_orphan_test_data` to `library_index` [coverage gap: it covers setlists/templates only] + emulator test, then prod-delete the two orphans). Finding (Plan 02 input): `CASCADE_FIELDS` already cascades `library_index` by `uploadedBy`; orphans survive only when the owner user-record is absent, which the sweep doesn't reach for `library_index`.

### Phase v11.3-04: /perform performance [P2] — ✅ COMPLETE 3/3 (2026-06-10)
Focus: **BUG-2** — p75 LCP 2600 / FCP 3012–3247 / TTFB 1398–1545 ms on the highest-traffic route; **CLS regressed 0.15 → 0.2** between the two runs. **VERIFY FIRST:** cold-load vs steady-state composition; suspect chart-image reflow for the CLS regression. Healthy comparator: /setlists LCP 1.1s / CLS 0.02.
Plans: **01 verify ✅** (field-RUM slice probe + synthetic iPad capture → characterization; REFUTED chart-image reflow — regression is the `/perform` LISTING, not the viewer) · **02 CLS ✅** (reserve the authLoading-gated QR sign-in-card slot via `cachedUser` hint → lists don't shift) · **03 TTFB/FCP ✅** (Suspense-stream the listing; query relocated-verbatim → v11-04-01 + Cycle-12 preserved; stream-not-cache decision). Post-deploy UAT: slice-probe field re-run + synthetic CLS<0.1. Cold-start TTFB residual → Vercel infra follow-up.

### Phase v11.3-05: P3 polish [P3]
Focus:
- **BUG-6:** `manifest-brotherslazaroff.json` serves the HTML app shell (PWA install broken on broslaz). Check `proxy.ts` matcher excludes only `manifest.json`, not org-suffixed variants.
- **F-6:** cold landing fires `/api/auth/qr` POST → 429 then self-heals; `/api/web-vitals` also 429s. Rate-limit tuning or client backoff.
Plans: **01** 🚧 PLAN created (`v11.3-05-01-PLAN.md`; standard, 2 tasks, autonomous) — **Task 1 (BUG-6):** `proxy.ts` matcher token `manifest.json` → `manifest(?:-[a-z0-9-]+)?\.json` so `/manifest-brotherslazaroff.json` (emitted per-org via `layout.tsx`→`branding.ts`) is excluded from the proxy and serves the static JSON instead of the 307→/login shell; regression in `proxy-auth.test.ts`. **Task 2 (F-6):** new IP-keyed `telemetry` rate-limit tier (300/min; NAT-fleet rationale mirroring `chart` — ~6 iPads/one IP, QR-poll ~30/min/device + ≤5 web-vitals beacons ≈ 216/min cold peak) repointed onto `/api/auth/qr` (×3) + `/api/web-vitals`; `api`/`ai`/`chart` tiers unchanged (CRC byte-identical); regression in `rate-limit.test.ts`. **Server-side only → /ui-ux-pro-max NOT triggered; QRSignIn.tsx untouched (preserves v11.3-04-02 CLS slot + its existing 429 backoff).** F-6 fix also protects the v11.3-04 deferred RUM TTFB UAT (stops cold-cohort web-vitals beacons being 429-dropped).

Constraints (locked at /paul:milestone 2026-06-10):
1. **Oracle-bound** — a finding is a bug only if it contradicts a `docs/ACCESS-POLICY.md` **v0.3** cell. err-public prime directive holds (err toward letting someone see a chart; writes/admin stay gated).
2. **No local dev** — push to prod/Vercel; CRC + broslaz are BOTH live. **CRC byte-identical** where a phase touches shared surfaces.
3. **Regression coverage mandatory** — every fixed BUG gets a regression test (e2e or named probe). Phase 01 + 03 fixes re-verifiable by re-running the stress prompt's relevant cells; **each test cites the coverage-table cell it covers.**
4. **Do-not-regress** — authed transpose (Phase 01); don't double-punish anon AI-scan against F-6's 429s; CRC byte-identity (tenancy invariant 4).
5. **Quality floor (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build` before declaring any shared-lib/client phase deployable (bundle-boundary lesson); emulator-backed tests where rules/queries change; **/ui-ux-pro-max BLOCKING on any UI-touching phase.**
6. **Autonomy posture (carried from v11.0/v11.1/v11.2):** run autonomously — waive PAUL approval/continuation gates, auto-commit + push per phase to prod `master`, bake decisions into PLANs, deploys/backfills as AUTO tasks (single-owner = executor). **STOP only for:** product ambiguity, an unresolvable quality-gate failure, or a discovered cross-tenant LEAK / CRC lock-out.
7. **Scope walls (ratified triage):** D8 publish/notify redesign → v11.4 (do NOT pull in); BUG-3 (RUM) closed not-a-bug (D7); BUG-8 (member library) + browser Policy Q1 closed via policy (no code); F-4 dup setlist + Cowork sandbox proxy out of scope. D2 anon **recordings** playback stays the ⚠️ veto cell — BUG-5 is charts only; don't widen Phase 01 into recordings.

## Earlier Completed Milestones

**✅ v11.2 — MCP Stress-Test Fixes** (COMPLETE 2026-06-11 · tag `v11.2.0` · tip `f27ae7bc5f`; archived `.paul/milestones/v11.2.0-ROADMAP.md`)
Status: ✅ COMPLETE 5/5 · Phases: 5 of 5 (v11.2-01 ✅ · v11.2-02 ✅ · v11.2-03 ✅ · v11.2-04 ✅ · v11.2-05 ✅) · Source: Brothers Lazaroff MCP + Perform **stress-test report** (2026-06-09; BL tenant only, CRC untouched, all test data cleaned — tenant verified empty post-run). All 9 bugs fixed; CRC byte-identical throughout.
Focus: Close the 9 findings from the BL stress test. Headline is **BUG-1 (P0)** — `propose_setlist_changes` 404s on MCP-created (UUID-id) setlists, so the server-`instructions`-mandated **stage → surface confidence → confirm → commit** authoring policy is non-functional for every MCP-authored setlist. Plus a **verify-first cross-tenant publish-audience risk (BUG-9)**, agent-facing error-contract correctness (BUG-2/BUG-3), publish + test-data hygiene (BUG-4/BUG-5), and P3 polish (BUG-6 brand leak / BUG-7 chord-over-lyric renderer / BUG-8 timestamp serialization). Phase order follows the report's suggested fix order (P0 → verify → contract → P2 → P3).

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11.2-01 | propose/commit resolver fix — BUG-1 [P0] | 01-01 ✅ | ✅ Complete | 2026-06-09 |
| v11.2-02 | publish-audience org scoping — BUG-9 [P1 · VERIFY-FIRST] | 01-01 ✅ | ✅ Complete | 2026-06-09 |
| v11.2-03 | MCP error contract — BUG-2 + BUG-3 [P1/P2] | 01 (BUG-2) ✅ · 02 (BUG-3) ✅ | ✅ Complete | 2026-06-11 |
| v11.2-04 | publish + test-data hygiene — BUG-4 + BUG-5 [P2] | 01 (BUG-4) ✅ · 02 (BUG-5) ✅ | ✅ Complete | 2026-06-11 |
| v11.2-05 | P3 polish — BUG-6 + BUG-7 + BUG-8 [P3] | 01 (BUG-6+7) ✅ · 02 (BUG-8) ✅ | ✅ Complete | 2026-06-11 |

### Phase v11.2-01: propose/commit resolver fix [P0 — critical path]
Focus: `propose_setlist_changes` returns `404 setlist_not_found` for setlists created/cloned via the MCP (UUID ids minted by `create_setlist`/`clone_setlist`), even though `get_setlist`/`update_setlist`/`add_track_to_setlist`/`bulk_add_tracks`/`update_track`/`preview_publish`/`verify_setlist_charts`/`generate_gig_packet`/`clone_setlist`/`delete_setlist` all resolve the same id (reproduced twice, deterministic). This breaks the server-mandated stage→confirm→commit safety workflow for ALL MCP-authored setlists; `commit_staged_changes` is downstream and equally unreachable. Suspected cause: `propose_setlist_changes` (audit `commit_staged_changes` too) uses a divergent resolution path (a `where()` query / wrong subcollection / Firestore-auto-id assumption) instead of the shared `getSetlistById(docId)` resolver. Fix: point both tools at the shared resolver; grep for divergent setlist lookups and consolidate to ONE resolver so id-shape can never split tool behavior again. Integration test: `create_setlist` → `propose_setlist_changes` against the returned id → assert `ok && stageId` → `commit_staged_changes` → assert rows landed. Preserve the v11-06-02 org-scope not-found wall (`loadEditableSetlist` chokepoint).
**ROOT CAUSE (verified vs deployed origin/master 2026-06-09):** NOT id-shape (report's hypothesis wrong — UUIDs resolve fine via `.doc().get()`). `propose_setlist_changes` (index.ts:1331) + `commit_staged_changes` (index.ts:1352) are the ONLY by-id setlist write tools that don't pass `orgFrom(extra)`; propose's `loadEditableSetlist` org defaults to `crc` → the v11-02-03 cross-tenant wall 404s any BL setlist; commit reads the setlist with no org check at all (latent isolation gap). Fix = thread caller org into both + add a commit-time `rowOrg !== org` guard.
Plans: **01-01** ✅ LOOP COMPLETE (`v11.2-01-01-PLAN.md` + SUMMARY, 3 tasks). Threaded `orgFrom(extra)` into `proposeSetlistChanges`+`commitStagedChanges` (propose→`loadEditableSetlist(…,org)`; commit→new in-tx `rowOrg!==org` setlist_not_found wall, closing a latent isolation gap). tsc clean · emulator `mcp-w01-propose-commit` 20/20 (4 new org cases + 16 W-01 regression) · `next build` clean. CRC byte-identical (org defaults crc). LIVE RETEST pending Daniel BL-connector reconnect → UAT-PENDING.

### Phase v11.2-02: publish-audience org scoping [P1 — VERIFY FIRST, do not assume]
Focus: **Investigate before changing.** `preview_publish` on a Brothers Lazaroff setlist returned `audience.count:17` (`admin:2, band_leader:1, musician:14`) — which matches the **CRC** roster size. `publish_setlist` auto-derives recipients from "active admin/band_leader/musician accounts." If that recipient query is NOT filtered by `orgId`, a BL publish would notify CRC members (in-app + push + email + SMS-on-first-publish) — a cross-tenant leak (the autonomy directive's hard-STOP class). Could not confirm during the stress test (declined to actually publish — side-effectful blast to real people). Confirm whether `users`/role accounts carry `orgId` and whether the publish recipient query filters on the setlist's `orgId`; if not, add the filter. Test: publish (dryRun) a tenant-A setlist → assert no tenant-B-only recipients appear. NOTE: STATE deferred-issue records "users claim-based (no orgId field)" — verification must reconcile that (orgId may live in the Auth claim, not the user doc).
**VERIFIED 2026-06-09 (vs deployed origin/master) — BUG-9 is a REAL cross-tenant leak.** `resolveDefaultRecipients` (setlist-publish.ts:202-250) runs `users.where("role","in",[...]).get()` over the ENTIRE collection with NO org filter; neither `publishSetlist` nor `previewPublish` accepts a caller org (index.ts:1188/:1371 pass uid only); `publishSetlist` also loads the setlist with no org check. `users` DO carry `orgIds` (doc + claim, v11-05-02/v11.1-02-02; legacy CRC users absent → default crc). Fix pattern already exists at `roster.ts:229`: filter in-memory `rowOrgIds(orgIds).includes(setlistOrg)`. Plan threads `orgFrom(extra)` + filters recipients (default + uid-override) to the setlist's org + adds the caller-org wall.
Plans: **01-01** ✅ LOOP COMPLETE (`v11.2-02-01-PLAN.md` + SUMMARY, 3 tasks). `publishSetlist`/`previewPublish` now take caller `org` (index.ts:1188/:1371 → `orgFrom(extra)`); added a caller-org `setlist_not_found` wall (applies to dryRun); recipients (default + uid-override) filtered to the setlist's org via `rowOrgIds(...).includes(setlistOrg)` (the v11-05-02 roster pattern; legacy no-orgIds → crc; email-only overrides pass). tsc clean · emulator `mcp-publish-setlist` 25/25 (4 new + 21 regression) · `next build` clean. CRC byte-identical; no real publish triggered.

### Phase v11.2-03: MCP error contract [P1 + P2]
Focus: Two agent-facing error-contract defects. **BUG-2 (P1):** deterministic client errors returned as HTTP 500 (an agent treats 500 as transient/retryable → retry storms + masks real 5xx): `add_track_to_setlist` unknown `songId` → 500 `song_not_found` (want **404**); `reorder_setlist` incomplete/invalid `orderedTrackIds` → 500 `reorder_failed` (want **400**); `upload_chart` dedup name collision → 500 `upload_failed` (want **409**). Reserve 500 for genuinely unexpected exceptions; match the existing correct positive controls (`delete_chart` bonded → 409 `chart_in_use`, stale `lastSeenVersion` → 409 `stale_version`, not-found → 404). **BUG-3 (P2):** `bulk_add_tracks` returns **bare-string** per-row errors (`error:"Song ... not found"`) while single-row tools return `{code, machine_code, message}` — wrap bulk per-row errors in the same envelope so Claude Code can branch on `machine_code`. Add a response-contract test asserting status class per `machine_code`.
**SPLIT into 2 plans (verified vs deployed):** `richError` code = `ERROR_CODE_MAP[machine_code] ?? 500`; `song_not_found`/`reorder_failed` absent → 500; upload wrappers flatten `processChartUpload`'s discriminated `result.error` enum into blanket `upload_failed`→500. BUG-3 needs a `BulkAddResult.error` shape change (server-tracks-write.ts `bulkAddTracks`) with test fan-out — separable from BUG-2's status mapping.
Plans:
- **01** ✅ LOOP COMPLETE (`v11.2-03-01-PLAN.md` + SUMMARY, BUG-2). ERROR_CODE_MAP += song_not_found:404/reorder_failed:400; shared `uploadFailureEnvelope` maps `processChartUpload` code/status (dedup→409, fault→500) across all 4 upload tools (DEVIATION: reused existing `duplicate_detected_in_library`+`result.status` vs new codes). tsc clean · unit 12/12 · emulator mcp-chart-upload 55/55 · next build clean.
- **02** ✅ LOOP COMPLETE (`v11.2-03-02-PLAN.md` + SUMMARY, BUG-3). `BulkAddResult.error` string→`RichErrorBody {code,machine_code,message}` at 4 sites (3 pre-validation + 1 best-effort `addTrack` catch — the 4th surfaced by tsc, mapped to server_error:500). ERROR_CODE_MAP += title_required:400 (also corrects single add_track) + batch_rolled_back:409. Per-row codes: song_not_found(404)/title_required(400)/batch_rolled_back(409)/server_error(500). bulk_update_tracks per-row shape left as strings (out of scope). tsc clean · unit 12/12 · emulator mcp-setlist-write 78/78 · next build clean. CRC byte-identical.

**Phase v11.2-03 ✅ COMPLETE 2026-06-11** — both BUG-2 + BUG-3 shipped; MCP error contract now deterministic (correct HTTP-class codes) and uniform (single + bulk per-row errors share the RichErrorBody shape).

### Phase v11.2-04: publish + test-data hygiene [P2]
Focus: **BUG-4:** `preview_publish` is blind to `type:"song"` rows with no chart bond (`fileId/songId=null`) — they render blank in Perform yet preview returns `recommendation:"publish", flaggedBonds:0` (`verify_setlist_charts` already catches them as `unbonded`). Make `preview_publish` count unbonded song rows and emit `recommendation:"review_first"` / an `unbondedSongCount` warning, distinguishing intentionally chart-less rows (header/reading/prayer/transition/note). **BUG-5:** `isTest:true` setlists created under a real admin uid are (a) never swept by `cleanup_all_test_data` (it only cascades `test-*`-owned data via `mcpTestUsers` + Auth `test-*`) and (b) shown on the authed `(main)` dashboard (correctly hidden from `/perform`). Either extend `cleanup_all_test_data` to also sweep `setlists`/`library_index` where `isTest==true` independent of owner (same admin/band_leader gate) OR document the manual-delete requirement; and decide whether the `(main)` dashboard should reuse the `/perform` `isTest!=true` filter. (Self-inclusion regression-test rule applies — [[feedback_self_inclusion_test_fixtures]].)
Plans: 01 (BUG-4) ✅ · 02 (BUG-5) ✅

**Phase v11.2-04 ✅ COMPLETE 2026-06-11** — BUG-4: `preview_publish` flags unbonded `type:song` rows (`review_first`). BUG-5: `cleanup_all_test_data` gained an owner-independent `setlists where isTest==true` flag-sweep (full-sweep-mode only, prefix-isolation preserved) + the authed `(main)` dashboard now hides isTest setlists via a shared `isNonTestSetlist` predicate reused from `/perform`. **Scope correction:** the `library_index` flag-sweep in the original phase text was DROPPED — `isTest` is a Setlist-only field (charts/songs are owner-cascaded), so there is no flag to sweep on `library_index`. Gates: tsc clean · emulator mcp-test-tokens 28/28 · perf suite 23/23 · next build clean.

### Phase v11.2-05: P3 polish [P3]
Focus: **BUG-6:** authed `(main)` dashboard header renders "CRC MUSIC" on brotherslazaroff.live (`/perform` correctly shows "Brothers Lazaroff"). Source the `(main)` header brand from `congregation.shortName` (same source `/perform` uses); grep the "CRC MUSIC" literal. **NOTE:** v11.1-01 made DesktopHeader/MobileHeader wordmark+logo org-aware (SSR `x-org-id` → OrgLogo) — verify whether BUG-6 is a *different* hardcoded surface or a regression introduced by v11.1-05 branding before changing. **BUG-7:** Perform `text/plain` chord-over-lyric renderer fragments the lyric word (interleaves lyric fragments with chord tokens — "Hallelujah" → "Hall"/"eluj"/"ah"); fix the chord-positioning splitter at the `/perform/[fileId]` renderer + add a chord-line-over-lyric snapshot test (honors the scraper's "preserve monospaced alignment" contract). **BUG-8:** normalize ALL timestamps to ISO at the MCP serialization boundary — `add_track_to_setlist`/`update_track` return `updatedAt` as a raw Firestore `{_seconds,_nanoseconds}` while `lastModifiedAt`/`get_setlist` are ISO — via a single `serializeTimestamps()` pass on tool responses.
Plans: **01 (BUG-6 + BUG-7) — frontend renders, /ui-ux-pro-max gated** ✅ · **02 (BUG-8) — MCP timestamp serialization** ✅ (split by subsystem: kept the MCP-server fix out from behind a UI gate).

**Phase v11.2-05 ✅ COMPLETE 2026-06-11** — **BUG-6:** the `(main)` dashboard hero (+ OnboardingCard) host-resolve brand server-first (`coerceOrgId(x-org-id)`→`getOrgBranding`, mirroring the v11.1-01 nav fix) → broslaz shows the BL monogram + "BROTHERS LAZAROFF" instead of "CRC MUSIC"; CRC byte-identical. **BUG-7:** `TextScoreViewer` wrap-mode chunks grouped word-atomic (`groupChunksIntoWords`) so a lyric word never fragments across lines; fit mode unchanged. **BUG-8:** a single `serializeTimestamps()` pass in `jsonResult` normalizes every MCP tool response's timestamps to ISO (the live leak was `add_track_to_setlist`; `update_track` was already ISO). Gates: tsc · text-score-viewer 9/9 · serialize-timestamps 10/10 · next build clean. Commits 05-01 `06f2db3176`, 05-02/phase-05 `f27ae7bc5f`.

Constraints (locked at /paul:milestone 2026-06-09):
1. **No local dev** — push to prod/Vercel. CRC + broslaz are BOTH live tenants; consumer-visible regressions matter.
2. **CRC byte-identical** where a phase touches shared branding/serialization (esp. v11.2-05 BUG-6/BUG-8 and any envelope change in v11.2-03).
3. **Quality floor (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build` before declaring any phase touching shared lib/client modules deployable (bundle-boundary lesson); emulator-backed tests where Firestore rules/queries change (v11.2-02 recipient query, v11.2-04 cleanup); /ui-ux-pro-max BLOCKING on any UI-visible change (v11.2-05 BUG-6/BUG-7 render).
4. **err-public invariant** — holds WITHIN a tenant; the BUG-9 fix is a hard cross-tenant wall (notifications must never cross orgId), NOT a within-tenant gate.
5. **MCP isolation invariant (v11-06-02)** — preserved; BUG-1's resolver consolidation must keep the org-scope not-found wall (`loadEditableSetlist` chokepoint) intact.
6. **Autonomy posture (carried from v11.0/v11.1):** run autonomously — waive PAUL approval/continuation gates, auto-commit + push per phase to prod `master`, bake decisions into PLANs, deploys as AUTO tasks (single-owner = executor). **STOP only for:** product ambiguity, an unresolvable quality-gate failure, or — specifically for v11.2-02 — a CONFIRMED cross-tenant publish leak (surface findings + the proposed filter before any change that could blast real people).
7. **Source-of-record:** the stress-test report (BL tenant, 2026-06-09) is the phase spec; each bug carries a repro + fix directive there. The report's "What worked correctly" regression anchors must keep passing.

## Previous Milestone (✅ COMPLETE)

**✅ v11.1 — Brothers Lazaroff Post-Launch Fixes** (COMPLETE 2026-06-09 · tag `v11.1.0`)
Status: ✅ Complete · Phases: 4 of 4 (v11.1-01 ✅ · v11.1-02 ✅ · v11.1-03 ✅ · v11.1-04 ✅) · 5 plans · MCP authoring verified live. Archived: `.paul/milestones/v11.1-ROADMAP.md` + MILESTONES.md § v11.1.
Focus: Make the second tenant's *lived experience* correct (branding, vocab, library clutter) and give multi-org leaders a real authoring path. Four evidence-backed live-tenant issues surfaced after the brotherslazaroff.live launch — v11.0 proved server-side + MCP isolation (probe 19/19); v11.1 fixes the consumer-facing seams + the multi-org authoring workflow the isolation audit didn't cover.
**Tenancy model (locked `/paul:discuss-milestone` 2026-06-09):** consumers (musicians + members) are NOT per-org-gated — anyone can use either site, and the **landing-page host** determines the experience (branding/setlists/library); band leaders have explicit `orgIds` membership (CRC / broslaz / both) set via a NEW admin toggle, governing authoring. (v7.1 Production Hardening continues separately via the bongo `.coord/` cowork cadence — independent of the PAUL loop.)

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11.1-01 | Org-aware authed branding (nav wordmark + logo) [P0] | 01-01 ✅ | ✅ Complete | 2026-06-09 |
| v11.1-02 | Multi-org membership toggle + MCP authoring [P0] | 02-01 ✅ (authoring) · 02-02 ✅ (admin UI) | ✅ Complete | 2026-06-09 |
| v11.1-03 | Library generic-tab visibility (host-filter + All-sites; Shared deferred) [P1] | 03-01 ✅ | ✅ Complete | 2026-06-09 |
| v11.1-04 | broslaz liturgical vocab sweep [P1] | 04-01 ✅ | ✅ Complete | 2026-06-09 |

### Phase v11.1-01: Org-aware authed branding [P0]
Focus: On brotherslazaroff.live the authenticated top-nav still shows the "CRC Music" wordmark + CRC `/logo.jpg` despite the correct navy theme (public `/perform` wordmark was fixed in v11-04-02; the authed nav was never made org-aware). Make `src/components/nav/DesktopHeader.tsx` (`:106-107`) + `MobileHeader.tsx` (`:34-41`) resolve wordmark + logo from the host org (getOrgBranding / useOrg / congregation — the `config/congregation__brotherslazaroff` doc is already correct: name "Brothers Lazaroff", `logoUrl:""`). Decide the per-org logo asset story (broslaz `logoUrl` empty → text wordmark or a broslaz asset). CRC byte-identical. /ui-ux-pro-max BLOCKING.
**Logo decision (Daniel 2026-06-09):** empty `logoUrl` → circular **initials monogram** ("BL"), code/theme-only, auto-upgrades to `<img>` when a `logoUrl` is ever set. **✅ SHIPPED 2026-06-09:** added `logoUrl` to `getOrgBranding` (crc `/logo.jpg`, broslaz `""`); `(main)/layout.tsx` resolves host org from `x-org-id` → passes `serverOrgShortName`+`serverLogoUrl` through `AppNavigation` to both headers (flash-free SSR); new `OrgLogo` (img when logoUrl set, else navy `bg-brand`/`text-brand-foreground` "BL" monogram). Congregation store kept as live-update fallback. CRC byte-identical (1 invisible a11y micro-improvement: mobile alt "Logo"→"Central Reform Congregation logo"). Gates: tsc clean · suite 3332/0 · `next build` clean.
Plans: **01-01** ✅ LOOP COMPLETE (`v11.1-01-01-PLAN.md` + SUMMARY, 3 tasks).

### Phase v11.1-02: Multi-org membership + authoring [P0 — critical path]
Focus: Unblock multi-org authoring. (A) NEW admin UI toggle to set a band leader's org membership — CRC / broslaz / both — writing the `orgIds` claim (replaces hand-run scripts like `fix-david-orgids-claim`). (B) Resolve which org a "both" leader's **hostless** MCP-authored setlist lands in (the live bug: Daniel's setlist landed `orgId:'crc'` because `getPrimaryOrgForMinting`→`orgIds[0]` + MCP forbids a caller org selector per v11-06-02). Options at plan time: (a) org-switcher minting a per-org bearer; (b) MCP accepts an org selector **validated strictly against the caller's own `orgIds`** (scoped exception — single-org callers keep the v11-06-02 lock, no cross-`orgIds` selection); (c) interim second broslaz MCP connection. Preserve the v11-06-02 isolation invariant.
Plans: TBD (defined during /paul:plan)

### Phase v11.1-03: Library generic-tab visibility [P1]
Focus: The in-app generic Library tab shows BOTH tenants' charts — the pool is shared and the HTTP/SSR read paths were never org-scoped (only MCP was). **Display-only de-clutter, NOT a security wall** (only admins/leaders add/edit; err-public holds). Host-filter the unscoped reads — `src/app/api/library/list/route.ts`, `getServerLibrary()` + `getServerLibraryLean()` (`src/lib/server-library.ts`), recordings subscribe (`src/lib/recordings/recordings-client.ts`). Generic tab shows `orgId === host org` OR a NEW **Shared** flag (admin-set; legacy/unstamped default crc → drop off broslaz). Admin-only **"All sites" toggle** reveals the full pool for authoring. broslaz gets org-neutral tab labels ("Charts / Uploads / Audio"); CRC byte-identical ("CRC Charts / Shireinu"). /ui-ux-pro-max BLOCKING.
**✅ SHIPPED 2026-06-09 (1 plan).** Host-filter applied at the fetch/SSR layer (`getServerLibrary(orgId)` + `/api/library/list` default host-org filter via `rowOrg`), so the shared `useLibraryStore` propagates isolation to the Library tab + bind-picker + header search from one point. Admin-only **"All sites"** toggle (gated by `getServerUser().isAdmin`) reveals the full pool. Org-neutral tab labels for broslaz; CRC byte-identical. **DECISIONS (Daniel):** Shared flag DEFERRED (libraries disjoint today); **recordings-collection scoping DEFERRED** (separate per-song surface + `/api/recordings/upload` hardcodes orgId=crc → fix stamp first). Display-only; serving routes untouched (err-public). tsc clean · suite 3339/0 · next build clean.
Plans: **03-01** ✅ LOOP COMPLETE (`v11.1-03-01-PLAN.md` + SUMMARY, 3 tasks).

### Phase v11.1-04: broslaz liturgical vocab sweep [P1]
Focus: broslaz still shows synagogue vocab — "Plan Service" / "Plan Show", "Upcoming Services" (screenshot-confirmed); the v11-05-05 vocab pass missed these labels. Extend the org vocab layer (`label(org,key)` / vocab.ts) to cover the remaining liturgical strings for broslaz; audit for other remnants (dashboard section headers, creation flow). CRC byte-identical. May fold into v11.1-03's UI pass if planning prefers.
**✅ SHIPPED 2026-06-09 (1 plan).** Audit found "Plan Service" already vocab'd (v11-05-05); the live remnants were hardcoded dashboard headers + matrix title that bypassed `label()`. Added 3 vocab keys (`upcomingSection`/`createNewSetlistHeading`/`matrixTitle`, crc base byte-identical + broslaz "Upcoming Shows"/"Create New Set"/"Set Matrix") and routed `SetlistDashboard` (:134,:144) + `SetlistMatrixView` (:65) through `label(useOrg(),key)`. **DEFERRED:** SERVICE_TYPE_LABELS vocab-table refactor (gated-away for broslaz via `hidesLiturgicalFields`). tsc clean · suite 3339/0 · next build clean.
Plans: **04-01** ✅ LOOP COMPLETE (`v11.1-04-01-PLAN.md` + SUMMARY, 3 tasks).

Constraints (locked at /paul:discuss-milestone 2026-06-09):
1. **No local dev** — push to prod/Vercel; but broslaz IS a live tenant, so consumer-visible regressions matter.
2. **CRC byte-identical** across every phase (assert vocab/branding CRC bases unchanged — the v11-05 pattern).
3. **Quality floor (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build` before declaring any phase touching shared lib/client modules deployable (bundle-boundary lesson — tsc+vitest miss client/server import breaks); emulator-backed rules tests where rules change; /ui-ux-pro-max BLOCKING on UI phases (01, 03, 04).
4. **err-public invariant** — library filtering is display-only; never gate chart access/data from musicians/leaders or via direct link.
5. **MCP isolation invariant (v11-06-02)** — single-org callers cannot pass an org selector; the multi-org authoring exception validates strictly against the caller's own `orgIds`.
6. **Autonomy posture (carried forward from v11.0):** run autonomously — waive PAUL approval/continuation gates, auto-commit + push per phase to prod `master`, bake decisions into PLANs, deploys/backfills as AUTO tasks (single-owner = executor). STOP only for product ambiguity, an unresolvable quality-gate failure, or a discovered cross-tenant leak / CRC lock-out.

---

## Previous Milestone (archived — full record in `.paul/MILESTONES.md` § v11.0)

**✅ v11.0 — Brothers Lazaroff Multi-Tenant** (COMPLETE 2026-06-09)
Status: ✅ Complete · Phases: 6 of 6 (v11-01..06 ✅) — Brothers Lazaroff is LIVE + FULLY tenant-isolated (reads+writes+all v11-05 collections: templates/roster/assignments/congregation + in-app create orgId-stamp + band vocab); brotherslazaroff.live own branding/metadata + working sign-in. **v11-06 close-gate audit: GO** — rules-layer + MCP-escape + host-spoof all closed; live prod probe BL-isolated + CRC-intact; AUDIT.md sign-off at `.paul/phases/v11-06-isolation-audit/AUDIT.md`. Archived: `.paul/milestones/v11.0-ROADMAP.md` + MILESTONES.md § v11.0.

Turn the single-tenant CRC app into a multi-tenant platform whose first second tenant is **Brothers Lazaroff** — give David Lazaroff (CRC band_leader since 2026-05-15) his own org-scoped library + setlists, authored via Claude + MCP, viewed/printed on `brotherslazaroff.live`. Multi-tenant within the SAME app + Firebase (`crcmusiccharts`); CRC data backfilled to a default org, behavior-neutral. Trimmed to David's MCP-author → view/print-packet flow. App is at `10.1.0`; the multi-tenant architectural shift + new production domain justify the v11.0 bump. Decisions locked at `/paul:discuss-milestone` 2026-06-08; full detail in `.paul/MILESTONES.md` § v11.0.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v11-01 | Tenant foundation (orgId + rules + CRC backfill) | 4/4 ✅ | ✅ Complete | 2026-06-08 |
| v11-02 | MCP org-scoping (org-scoped auth + thread orgId through tools) | 4/4 ✅ | ✅ Complete | 2026-06-08 |
| v11-02b | Org-aware token minting (self-service tenant onboarding) | 1/1 ✅ | ✅ Complete | 2026-06-08 |
| v11-03 | brotherslazaroff.live domain + branding + vocab trim | 3/3 ✅ | ✅ Complete | 2026-06-08 |
| v11-04 | BL consumer surface (perform/print) + David onboarding + e2e UAT | 3/3 ✅ | ✅ Complete | 2026-06-09 |
| v11-05 | Cross-tenant collection scoping (templates/roster/congregation/personnel R+W) + CreationWizard vocab | 5/5 ✅ | ✅ Complete (SHIPPED + live-verified, `f3448a8395`) | 2026-06-09 |
| v11-06 | Cross-tenant isolation security audit (close gate) | 3/3 ✅ | ✅ Complete (AUDIT.md verdict GO; live prod probe) | 2026-06-09 |

### Phase v11-01: Tenant foundation
Focus: `orgId` on songs / library_index / setlists / tracks / recordings; tenant-resolution helper; backfill all existing CRC data with the default org (behavior-neutral); airtight Firestore rules + `@firebase/rules-unit-testing` emulator coverage. The spine — every later phase depends on it.
Plans (sequence corrected for safe migration — code/data must precede strict-rules deploy or CRC writes lock out):
- **v11-01-01** ✅ Org model + tenant registry + membership claims (`src/lib/org/`; optional orgId on types; orgIds claim). 3/3 ACs PASS.
- **v11-01-02** ✅ Write-path orgId stamping — all 5 server create sites stamp orgId (default crc); tracks inherit parent setlist's org. tsc clean; orgid-stamping emulator suite green.
- **v11-01-03** ✅ CRC backfill — stamped orgId="crc" on 2105 existing prod docs (setlists/tracks/songs/recordings/library_index) + seeded orgs/{crc,brotherslazaroff}; idempotent dry-run→--apply, verified wouldStamp:0 re-run.
- **v11-01-04** ✅ Org-scoped Firestore rules (write-isolation, reads unchanged/err-public) + 42 emulator rules tests (caught+fixed a CRC lock-out bug) + deployed `firebase deploy --only firestore:rules` to prod.

### Phase v11-02: MCP org-scoping
Focus: org-scoped MCP auth/bearer; resolve caller org per tool call; thread `orgId` through the library + setlist read/write MCP tools (~108 live); issue David's Brothers Lazaroff bearer. Largest surface in the milestone.
Decomposed into 4 vertical-slice plans (complex phase; autonomous milestone auto-proceeds plan→plan). **Design decision (baked in):** the caller's org is resolved from the **mcpTokens doc** (a bearer is org-pinned), not Auth custom claims — verifyBearer already reads the token doc, so zero extra reads; absent `orgId` field → default `crc` (mirrors v11-01).
- **v11-02-01** ✅ LOOP COMPLETE (2026-06-08) — Caller-org resolution foundation. `orgId` stamped at all 4 mcpTokens mint sites (createMcpToken / mint_admin_bearer [children inherit caller org] / admin-test-session / provisionTestAccount); `verifyBearer` returns resolved orgId (default crc); route plumbs it onto `AuthInfo.extra`; `orgFrom(extra)` seam (exported + unit-tested); prod mcpTokens backfill ran (117 stamped, idempotency verified). **Behavior-neutral.** tsc clean; auth 11/11 + org-context 4/4 + backfill-emulator 3/3; full suite 3272/0. Design: org from the token doc (not claims). SUMMARY in phase dir.
- **v11-02-02** ✅ LOOP COMPLETE (2026-06-08) — Org-scoped MCP READS over the 5 stamped collections (6 tools): list_setlists/search_library/list_library/search_chart_text filter to callerOrg; get_setlist/get_song → cross-tenant not-found wall; search_chart_text chords scope drops cross-tenant parents; SongRecord.orgId surfaced; bond-corrections alternatives scoped to the setlist's org. In-memory filter (no index churn; admin-SDK reads bypass rules so app-layer is the control); org param defaults crc (prod passes explicit orgFrom). emulator 7/7; full suite 3272/0. **Templates/roster/congregation/personnel DEFERRED** (not org-stamped — read+write both cross-tenant; follow-up). SUMMARY in phase dir.
- **v11-02-03** ✅ LOOP COMPLETE (2026-06-08) — Org-scope MCP WRITES: cross-tenant mutation denied via `loadEditableSetlist` chokepoint (8 setlist tools) + per-tool guards (delete/recompute/clone/clone-from-template/update_song/delete_chart); caller-org create-stamp on create/clone/template + `stampOrg` on the 3 chart-create tools; standard **not-found** envelope (no leaky cross_tenant_denied code). emulator 8/8; no regression. SUMMARY in phase dir.
- **v11-02-04** ✅ LOOP COMPLETE (2026-06-08, LAST in v11-02) — Issued David's `brotherslazaroff` bearer (orgId on the mcpTokens doc) + `orgIds:['brotherslazaroff']` claim by MERGE (role preserved) on his existing band_leader account; shipped feat(v11-02) `c7da31ac2a` to prod (Vercel READY); **live e2e 12/12** against www.centralreform.live/api/mcp (David reads/creates BL-only, cannot touch CRC, CRC unaffected). scripts/issue-bl-bearer.mjs + e2e-bl-tenant-probe.mjs + docs/onboarding-brotherslazaroff.md. SUMMARY in phase dir.

### Phase v11-02b: Org-aware token minting (self-service tenant onboarding)
Focus: close the gap Daniel surfaced 2026-06-08 — the self-service mint paths (`/api/mcp/tokens` + `/api/mcp/oauth/token`) both call `createMcpToken(uid, label)` with no org arg, so they hard-default the token's `orgId` to **crc**. A non-CRC member (e.g. David) who self-mints or runs Claude Desktop's OAuth flow would get a crc-stamped token and land in CRC's tenant. Fix: derive the token's org from the minting user's `orgIds` custom claim (default crc when absent) so tenant members onboard self-service via plain login — identical to how Daniel connects, no manual raw-token handoff. v11-02-04's manual bearer for David keeps working; this removes the workaround for future members.
**Decision (Daniel 2026-06-08):** Fix it now (small slice) — chosen over deferring to v11-04 or keeping the manual mint. Scope: an `orgFromClaim(uid)` resolver + thread into the 2 self-service mint sites + tests + deploy. (mint_admin_bearer already inherits caller org; test-token mint stays default crc.)
- **v11-02b-01** ✅ LOOP COMPLETE (2026-06-08) — `getPrimaryOrgForMinting(uid)` (reuses v11-01-01's getUserOrgIds; first-of, default crc) threaded into `/api/mcp/tokens` + `/api/mcp/oauth/token`; admin/test mints untouched. unit 9/9 + emulator 3/3 (claim→resolver→mint→doc→verifyBearer); tsc clean; Vercel prod build READY (feat(v11-02b) `2db15f36d9`); prod-verify getUserOrgIds(DavidUid)===["brotherslazaroff"]. David (+ future members) self-onboard via plain login → BL-scoped token, no raw-token handoff. SUMMARY in phase dir.

### Phase v11-03: Domain + branding ✅ Complete (2026-06-08)
Focus: host→tenant resolution on the shared deployment for `brotherslazaroff.live`; Brothers Lazaroff branding (band chrome, not synagogue); genericized vocab (gig / venue / set, not service / sanctuary / rabbi); trim synagogue-specific UI (service type, rabbi field). /ui-ux-pro-max BLOCKING.
Discussion: CONTEXT.md (taste calls locked — dark+photographic · brand pulled from brotherslazaroff.com [navy + live photos on dark canvas] · per-tenant conditional vocab/UI, CRC untouched). DNS handled by `docs/brotherslazaroff-domain-setup.md` (Vercel domain-add + Squarespace A/CNAME).
Plans (3 vertical — all ✅ LOOP COMPLETE 2026-06-08):
- **v11-03-01** ✅ Org-context foundation — Edge `resolveOrgIdByDomain(host)` → `x-org-id` header → `<html data-org>` + client `OrgProvider`/`useOrg` (defaults crc outside provider). No visual change.
- **v11-03-02** ✅ BL branding — scoped `[data-org="brotherslazaroff"]` navy dark CSS-var block (hue 252) + `forcedTheme=dark` + `getOrgBranding()` + org-aware login hero/wordmark. CRC indigo+amber untouched.
- **v11-03-03** ✅ Vocab + UI trim — `label(org,key)` + `hidesLiturgicalFields()`; SetlistMetaEditSheet hides service-type + rabbi for BL, band vocab. CRC unchanged. (CreationWizard/perform/cards vocab DEFERRED to v11-04 — depends on org-scoping congregation+templates.)

### Phase v11-04: BL consumer surface + onboarding ✅ Complete (2026-06-09)
Focus: perform-view + gig-packet print scoped to the BL org; display-card vocab via the static `label(org,key)` helper (no collection-scoping dependency); David's BL org membership + empty library seed; end-to-end UAT (David authors via MCP → views/prints a gig packet on brotherslazaroff.live). /ui-ux-pro-max BLOCKING. (CreationWizard vocab stays deferred to v11-05 — it depends on org-scoped congregation/templates data.)
Plans (3 vertical — all ✅ LOOP COMPLETE + SHIPPED + LIVE-VERIFIED 2026-06-08/09):
- **v11-04-01** ✅ Public web-read org scoping — `getAllSetlists` opt-in `org` filter + client `subscribeToAllSetlists` org arg + `/perform` made per-host dynamic (dropped shared path-keyed ISR) + `(orgId,date)` index + 5 regression tests. Live: BL /perform shows zero CRC setlists; CRC unchanged. (`feat(v11-04-01)` `c606992756`.) Also fixed BL Google sign-in (`auth/unauthorized-domain` → added BL hosts to Firebase authorizedDomains via scripts/add-auth-domains.mjs).
- **v11-04-02** ✅ Org-aware consumer branding/metadata — data-driven `branding.ts` metadata fields (CRC byte-identical) → root `generateMetadata()` + per-org manifest + org-aware `/perform` wordmark/aria-label + de-synagogued listing title (vocab `publicListingTitle`). Live: BL /perform tab title + "Brothers Lazaroff" wordmark; CRC byte-identical. (`feat(v11-04-02)` `f50060e387`.)
- **v11-04-03** ✅ Authed-dashboard read scoping — opt-in `org` on `getSetlistsPage`/`getUpcoming`/`getRecent`; both `getSetlistsPage` callers thread `x-org-id`; the 4 client `subscribeToAllSetlists` callers pass `useOrg()`. Live: BL /api/setlists/page `items:[]`, CRC unchanged. (`feat(v11-04-03)` `6b1ba7f189`.) DEFERRED→v11-05: in-app CreationWizard setlist-create orgId stamping. Authed-dashboard UX confirm → UAT-PENDING.

### Phase v11-05: Cross-tenant collection scoping + CreationWizard vocab
Focus: close the v11-02 / v11-03-03 / v11-04-03 deferrals — org-scope the still-cross-tenant collections (templates read/list, roster/musicians [`users`, `scheduling_assignments`, `musician_availability`], congregation, service-personnel) for READ + WRITE; the **in-app CreationWizard setlist-create orgId stamp** (v11-04-03 flagged: an in-app-created setlist currently carries no orgId → would be invisible in the org-scoped dashboard; MCP create already stamps); then de-synagogue the now-unblocked CreationWizard vocab. Data-isolation work, closer in nature to v11-02 (emulator-backed). Split out of v11-04 (Daniel 2026-06-08) so the BL consumer surface ships first.
Plans: TBD (defined during /paul:plan)

### Phase v11-06: Cross-tenant isolation security audit (close gate)
Focus: adversarial check for Firestore rules leakage, MCP org-scope escape, and host-spoof tenant confusion. Blocks milestone close (extends the project's end-of-milestone best-practice-audit constraint).
Plans: TBD (defined during /paul:plan)

Constraints (locked at /paul:discuss-milestone 2026-06-08):
1. Multi-tenant, single app, single Firebase (`crcmusiccharts`) — NOT a separate deploy/project.
2. BL gets a fully separate library + setlists partition; CRC data backfilled to a default org, behavior-neutral (no CRC regression).
3. Cross-tenant isolation is security-critical — airtight rules, emulator-backed; a mis-tagged backfill row or unscoped MCP tool is a data-leak class bug.
4. `err-public` holds WITHIN a tenant (never gate musicians from their own band's data); hard wall ACROSS tenants.
5. Trimmed scope — David's flow only (MCP author + perform-view + gig-packet print); synagogue features dropped/genericized for BL, not ported.
6. Dedicated domain `brotherslazaroff.live` (already owned) → host-based tenant, same deployment.
7. End-of-milestone best-practice audit BLOCKS close (Phase v11-06).
8. /ui-ux-pro-max BLOCKING for UI phases (v11-03, v11-04); emulator coverage for data-layer/rules phases; HFG discipline; Friday/Shabbat deploy cadence respected; MCP-first authoring pivot still holds.

---

## Previously Active — Hardening Campaign (runs via `.coord/`, not the PAUL loop)

**🚧 v7.1 — Production Hardening & MCP Authoring Surface** (ACTIVE via `.coord/`). PAUL-tracking label; `package.json` is at `10.1.0`.

Make the app bulletproof for band onboarding (6× 11" iPads, Perform mode) and complete the MCP authoring surface (Daniel's primary author flow). Executed via the cowork stress-test cycle cadence — autonomous run → multi-axis report → parallel fix wave → repeat — tracked in `.coord/`. **Cycles 1–12 landed; cycle-13 in flight.** Full detail: `.paul/MILESTONES.md` § v7.1 entry.

| Phase (cycle) | Focus | Status |
|---------------|-------|--------|
| MCP waves 1–6 + CF1/2/3 | MCP server buildout → 108 live tools | ✅ Landed |
| Cycles 1–5 | Broad bug/feature/security/usability sweeps + envelope hygiene + dedup + a11y | ✅ Landed |
| Cycles 6–7 | Bond hygiene + data integrity + catalog dual-read close + backfills | ✅ Landed |
| Cycles 8–10 | iPad-WebKit + usability-first reframe (offline, wake-lock, precache, tap targets) | ✅ Landed |
| bridge v10.x | studio-bridge releases + admin housekeeping tools | ✅ Landed |
| Cycle 11 | Musician-shadow / sanctuary-conditions stress (SSR prefetch, err-public relax) | ✅ Landed |
| Cycle 12 | Saturday-readiness hybrid PROMPT (SSR boundary, shell-cache SW) | ✅ Landed |
| Cycle 13 | 4-axis parallel cowork-stress: leader-broadcast · MCP-authoring · real-WebKit · bond-hygiene | 🚧 IN FLIGHT (Phase 2 design → Phase 3 Daniel-run → Phase 4 fix wave) |

**State sync at re-baseline:** master tip `467e788ed5` (local) / `ad16769505` (origin, +1) — local pull due. cwd parked on stale `fix/b1-error-envelope-sweep` (321 behind) — switch to master before work.

PENDING-UAT carry-forward: `.paul/UAT-PENDING.md`. Daniel verifies against the deployed build over the worship cycle; failures route to follow-up per the v51-04 pattern.

---

## ✅ v7.0 — Document-Driven Setlist Creation (COMPLETE 2026-05-14)

Archived snapshot: `.paul/milestones/v7.0-ROADMAP.md`. Detail + decisions: `.paul/MILESTONES.md` § v7.0. Closed at master HEAD `f3f86c41`.

Daniel feeds any service-outline document (the May 15th Shir Shabbat .docx is the canary) and the system produces a complete setlist with charts bound, recordings linked, and gaps surfaced via a structured form. Major-version bump justified by NEW data domain (recordings) + NEW production input modality (doc-driven creation) + NEW chart-rendering modality (image charts).

| Wave | Phase | Focus | Status |
|------|-------|-------|--------|
| 0 (foundation) | v70-01 | **Image-chart support** (PNG / JPEG / HEIC) — upload route ALLOWED_TYPES extended; chart viewer branches PDF→pdfjs vs image→`<img>`; print pipeline embeds images; AI chord detection + transposition DISABLED for image charts with explanation tooltip | ✅ COMPLETE 2026-05-14 — 2/2 plans LOOP CLOSED. v70-01-01 (upload+view+toolbar: heic-convert, ImageScoreViewer, transposer-disabled tooltip, 3-layer type detection). v70-01-02 (print embed: embedImageTrack 18pt-margin aspect-fit page, personal-route fileName/mimeType propagation, PrintModal banner removed, cacheVersion 2→3; enterprise-audited — try/catch around pdf-lib decode throws, graceful degradation, 25MB cap). next build ✓; print-pipeline 26/26 + print-modal 23/23; suite 1649/52 (zero new regressions); HFG 0/3 held. PENDING-UAT: AC-3/AC-4 + print human-verify (v51-04 pattern). Unblocks v70-05 May 15 canary. |
| EMERGENT (interrupt) | v60-13 | **Sync-engine resilience hotfix** (post-v6.0-close emergent) — Daniel UAT 2026-05-13 surfaced 5 P0/P1 issues clustering on sync-engine + auth-gate fragility. Wave 1: v60-13-01..05 (5 commits 26797e7→9f21b74) — incognito blank + 49-row stuck outbox queue both UAT-FIXED. Wave 2: v60-13-06 hydrator content-hash dedup (`f684563`) — auto-refresh-during-edit UAT-FIXED 2026-05-14. | ✅ Complete 2026-05-14 (UAT confirmed) |
| EMERGENT (interrupt) | v60-14 | **Mobile date picker reset hotfix** (post-v60-13 emergent) — Daniel UAT 2026-05-13: "setting a date on mobile keeps resetting to today". Discovery located root cause at `useCreationWizard.handleTemplateSelect` (NOT mobile-specific, NOT picker UI) — template-select shortcut unconditionally overwrote user's eventDate with `new Date()`. v60-14-01 (`8a5fc3b`) preserves user pick via `eventDate ?? new Date()` + guarded `setEventDate`. | ✅ Complete 2026-05-14 (PENDING-UAT carry-forward — v51-04 pattern) |
| 1 (foundation) | v70-02 | Recordings data model + Firestore rules + Storage paths — NEW `recordings/{id}` collection; foreign key `songId?`; `notes` field for attribution; Firebase Storage path; HFG-relevant (emulator coverage required) | ✅ COMPLETE 2026-05-14 — single-plan phase LOOP CLOSED. Recording type (songId? FK + notes) in models.ts; getRecordingStoragePath helper (recordings/{id}.{ext}); recordings/{id} rules block (mirrors songs/{id}) + composite index (songId+createdAt) deployed to production; emulator rules test 10/10. HFG 0/3 held. next build ✓; suite 1650/52. No UI/upload-route (v70-03/v70-06 scope). |
| 2 (parallel) | v70-03 | Per-track media affordances: (1) chart click-through opens chart in new tab via Storage URL; (2) recording-bind UI analogous to ChartBindPopover with inline `<audio>` playback | ✅ Complete 2026-05-14 — 2 plans LOOP CLOSED. v70-03-01 chart click-through (MobileRowCard chart indicator → `<a target="_blank">` to the existing /api/drive/file serving URL; stopPropagation gesture isolation). v70-03-02 recording-bind UI (RecordingBindPopover + RecordingCell on MobileRowCard; new /api/recordings/upload + /api/recordings/file/[id] routes + recordings-client.ts on the v70-02 model — no storage.rules change). Both re-spec'd mid-flow (original PLANs targeted SetlistGrid's dead TanStack table; MobileRowCard is the sole live path). next build ✓; live-path grid tests green; HFG 0/3. /ui-ux-pro-max satisfied. Human-verify → .paul/UAT-PENDING.md (2 entries). Tech debt flagged: dead SetlistGrid table block. |
| 2 (parallel) | v70-04 | Doc upload + text extraction — `mammoth` for .docx, pdfjs for .pdf, txt trivial | ✅ Complete 2026-05-14 — single-plan phase LOOP CLOSED. `extractDocumentText` lib (.docx→mammoth / .pdf→shared server-side pdfjs loader / .txt→utf-8; discriminated never-throws result) + `POST /api/setlists/import/extract-document` route (sibling of import/parse + import/execute). Foundation slice — NO UI / NO Gemini / NO persistence. `mammoth@^1.12.0` added; `getPdfjs` exported from pdf-chord-extractor.ts. next build ✓; extract-document 9/9 + pdf-chord-extractor 16/16; HFG 0/3. Architecture direction (revised from ROADMAP's "CreationWizard 4th option"): the eventual doc-import UI EXTENDS the existing ImporterModal, built in v70-05/v70-07. |
| 3 (sequential) | v70-05 | Gemini structured extraction — reuses chord-detection Gemini setup; prompt returns Zod-validated JSON `{ sections[], tracks[] }`; malformed extraction surfaces for human review; **May 15 canary depends on v70-01 image-chart support** | ✅ Complete 2026-05-14 — single-plan phase LOOP CLOSED. `extractSetlistStructure` lib (raw text → geminiFlash() → Zod-validated `{ sections[], tracks[] }`; discriminated never-throws result; malformed/empty/gemini_error carry `raw` model output for human review; optional fields `.nullish()`→normalized) + `POST /api/setlists/import/extract-structure` route (sibling of extract-document/parse/execute; 200/422/502 mapping). Backend slice — NO UI / NO resolution / NO persistence. No new deps. next build ✓; extract-structure 9/9 + setlist-import suite 18/18 (no regressions); HFG 0/3. Zero deviations. doc→text→structure chain complete; v70-06 consumes the `tracks` output. |
| 3 (sequential) | v70-06 | Resolve + missing-chart + recording-match — library fuzzy match with confidence scoring; missing-chart routes to existing `/api/library/upload`; recording matching against audio-mime `songs/*` entries (post-v60-11). **NOTE:** scoped propose-only (Daniel-confirmed 2026-05-14) — v70-06 is a pure compute pass returning annotated proposals; v70-07's commit step does all persistence (the "pre-creates recordings/* docs" wording is superseded — no orphaned-doc risk). | ✅ Complete 2026-05-14 — single-plan phase LOOP CLOSED. `resolveSetlistStructure` lib (annotates v70-05's `{ sections, tracks }` with libraryMatch{fileId,name,confidence} \| missingChart flag + recordingCandidates[]; mirrors import/parse's levenshtein/0.82 match; partitions library by mimeType pdf+image=chart / audio/*=recording; discriminated never-throws; PROPOSE-ONLY — zero Firestore writes) + `POST /api/setlists/import/resolve` route. next build ✓; setlist-import suite 26/26; no new deps; HFG N/A. doc→text→structure→resolve chain complete. Zero deviations. |
| 4 (commit) | v70-07 | Interview form + setlist preview + commit — structured form (NOT chat) for parser-unfillable fields; service date REQUIRED with auto-suggest; service type auto-inferred from doc keywords. **Split into 3 plans (Daniel-confirmed 2026-05-14):** 01 = server-callable `setlist-write.ts` module (createSetlistServerSide + updateSetlistServerSide; MCP coordination point) + import/execute refactor; 02 = interview form UI + ImporterModal "Document" option + preview; 03 = commit wiring + e2e. **NOTE:** ROADMAP's "commit via existing createSetlistService" superseded — createSetlistService is client-SDK-only; the server module is the write path. Recording binding DEFERRED. | ✅ COMPLETE 2026-05-14 — 3 plans, all LOOP CLOSED. v70-07-01 server-callable `setlist-write.ts` (createSetlistServerSide + updateSetlistServerSide; MCP coordination point; interim-committed + pushed) + import/execute refactor + emulator test. v70-07-02 ImporterModal "Upload Document" option + extract→structure→resolve client chain + `interview-defaults.ts` helpers + structured interview form + read-only grouped preview. v70-07-03 `commit.ts` commitDocumentSetlist (flatten resolved {sections,tracks} → interleaved headers + libraryMatch→bound chart → createSetlistServerSide) + `POST /api/setlists/import/commit-document` route + wired the preview "Create Setlist" button. next build ✓; emulator suite 56/56 (HFG 0/3 held); setlist-import 39/39; tsc clean. /ui-ux-pro-max BLOCKING satisfied (plans 02+03). 1 minor deviation (service-type inference keyword-only). Recording binding DEFERRED entirely. Bundled `feat(v70-07)` phase commit created. |
| 5 (audit + close) | v70-08 | **Best-practice audit + remediation** — 4-5 parallel scope-narrowed researcher agents + synthesizer (reuses v5.4 architectural-audit pattern). 5 dimensions: security / accessibility / performance / code quality + data integrity / UX consistency. P0+P1 close in-phase via follow-up plans; P2+P3 fold-forward. **Milestone close BLOCKED on this phase completing.** | ✅ COMPLETE 2026-05-14 — 4 plans, all LOOP CLOSED. v70-08-01 audit: 5 parallel dimension agents → v70-08-AUDIT.md (0 P0 · 9 P1 · 22 P2 · 15 P3). v70-08-02 import-route hardening: band_leader role gates on the 3 upstream doc-import routes, eventDate validation, real Zod schemas vs z.array(z.any()), MIME + 50-page caps, recordings/file __session-cookie auth. v70-08-03 ImporterModal accessibility + UX: keyboard-reachable dropzones, doc-aware processing copy, non-destructive interview back, bg-brand CTAs, "Lead"→"Vocal Lead", RecordingBindPopover a11y/loading polish; /ui-ux-pro-max invoked; +ImporterModal.a11y.test.tsx. v70-08-04 doc-import performance: getServerLibraryLean (.select()+60s TTL cache), resolve timeout + AbortController, commit-document maxDuration + atomic batch, server-only guards. next build ✓ across all 4 plans; grid 41-failure baseline held; 2 essential auto-fixes. Constraint 12 satisfied. Bundled feat(v70-08) phase commit covers plans 02+03+04. Fold-forward to v7.1: ImageScoreViewer a11y, dead SetlistGrid table block, Levenshtein dedup, 3-route chain collapse, touch-target sizing. |
| polish (Daniel-directed jump) | v70-09 | **Setlist metadata editor** — closes long-standing Issue 2 (no UX to edit a created setlist's name/date). Pencil icon button in SetlistGridTopBar → mobile-friendly Sheet to edit name / eventDate / service type (templateType) / rabbi; writes via existing v6.0 `applyEdit('update','setlists',…)`. Daniel pulled this forward 2026-05-14, ahead of v70-06, then back to roadmap sequence. /ui-ux-pro-max BLOCKING. | ✅ Complete 2026-05-14 — single-plan phase LOOP CLOSED. `SetlistMetaEditSheet.tsx` (Sheet form: name/eventDate/serviceType/rabbi; changed-fields-only `applyEdit` patch; eventDate as ISO string; non-destructive cancel) + pencil `onEditMeta` button in SetlistGridTopBar + SetlistGrid `useLiveQuery` on the setlist doc for a live header. NO engine touch / NO new deps / NO new API route. next build ✓; 10 new tests PASS; grid suite zero new regressions vs the 41-failure dead-table baseline. Zero deviations. UAT-PENDING entry appended. |

Constraints (12 locked at creation):
1. Recording storage = Firebase Storage (matches v1.6 chart pattern)
2. Doc formats v7.0 = .docx + .pdf + .txt only; image OCR DEFERRED to v7.1
3. Interview UX = structured form (NOT chat)
4. Recording attribution = `notes` field on recording doc (free-form string)
5. Recordings model = NEW `recordings/{id}` collection (NOT embedded array)
6. AI extraction = Gemini API; Zod schema validation; malformed surfaces for human review
7. Library resolution = fuzzy match with confidence scoring; low-confidence → interview
8. Missing-chart pipeline = reuses existing `/api/library/upload` from v60-09
9. Service date = REQUIRED interview field with filename auto-suggest
10. Service type = auto-inferred from doc keywords, user confirms
11. Image-chart support = PNG + JPEG + HEIC; AI chord detection + transposition disabled with tooltip
12. End-of-milestone best-practice audit BLOCKS milestone close

Additional rules:
- HFG counter must stay at 0/3 (every data-layer phase ships emulator coverage; no clause-(b) waivers)
- /ui-ux-pro-max BLOCKING for v70-01, v70-03, v70-04, v70-07 per SPECIAL-FLOWS.md; consults at v70-08 audit synthesis
- "Do it right" directive (Daniel 2026-05-13) — no time pressure; quality > speed
- Friday/Shabbat cadence respected (no risky deploys Thu PM → Sun)
- No engine touches (routes through existing v6.0 applyEdit fanout)
- Daniel-loop UAT discipline (codified v51-04) on every phase

Canary doc for v70-05: `C:\Users\dsbog\Downloads\May 15th Shir Shabbat .docx` (extracted shape captured in MILESTONE-CONTEXT.md before deletion at milestone open).

---

## Previously Active Milestone

**v6.0 — Tracks Single-Source-of-Truth** ✅ Complete 2026-05-13
Status: ✅ Closed via /paul:complete-milestone (5th consecutive PENDING-UAT marker per v51-04 codified pattern)
Stats: 12 phases LOOP COMPLETE (10 original + 2 emergent close-gates v60-11/v60-12) · 24 plans · 25 commits · 2 days (2026-05-12 → 2026-05-13) · HFG counter 0/3 held throughout · suite 1597 → 1636 (+44 tests)
Archive: `.paul/milestones/v6.0-ROADMAP.md` (snapshot at close); full milestone log: `.paul/MILESTONES.md § v6.0 entry`
Master HEAD at close: `04499a4` feat(v60-12-01)
PENDING-UAT carry-forwards (worship cycle Fri PM + Sat AM): v60-11 picker / v60-12 incognito-perform / v60-09 two-device / v60-10 iPad sticky AddBar / Issue 2 setlist-missing cascade diagnostic / v60-01..v60-08 accumulated smokes

<details>
<summary>v6.0 phase list (12 phases — click to expand)</summary>

| Wave | Phase | Focus | Status |
|------|-------|-------|--------|
| 1 (parallel) | v60-01 | SyncIndicator conflict click rewire + silent last-write-wins | ✅ LOOP COMPLETE — PENDING-UAT |
| 1 (parallel) | v60-02 | pagehide/visibilitychange blur — mid-edit text protection | ✅ LOOP COMPLETE — PENDING-UAT |
| 2 | v60-03 | Java JDK 21 install + emulator canary green; HFG 1/3 → 0/3 | ✅ LOOP COMPLETE |
| 3 (sequential) | v60-04 | Server-side reader migration via `getTracksForSetlist` | ✅ LOOP COMPLETE — PENDING-UAT |
| 3 (sequential) | v60-05 | Editor + perform-view reader migration | ✅ LOOP COMPLETE — PENDING-UAT |
| 3 (sequential) | v60-06 | Dashboard reader migration + 15-setlist backfill (8 plans) | ✅ LOOP COMPLETE — PENDING-UAT |
| 3 (sequential) | v60-07 | Embedded-array writer removal + `FieldValue.delete` strip (4 plans) | ✅ LOOP COMPLETE |
| 3 (sequential) | v60-08 | Migration cleanup (drop reader fallback + schema field + 22 consumer sites) | ✅ LOOP COMPLETE |
| 4 (parallel) | v60-09 | Cross-device library sync (`library_index ↔ songs/*` continuous) | ✅ LOOP COMPLETE — PENDING-UAT |
| 4 (parallel) | v60-10 | Mobile AddBar variant (coarse-pointer sticky-bottom + virtual-keyboard hide) | ✅ LOOP COMPLETE — PENDING-UAT |
| 5 (close-gate) | v60-11 | Shortcut-aware songs mirror + subscribe.ts self-heal (131 docs backfilled) | ✅ LOOP COMPLETE — PENDING-UAT |
| 6 (close-gate) | v60-12 | Public tracks visibility (firestore.rules opened + hook + emulator rules test) | ✅ LOOP COMPLETE + DEPLOYED |

</details>

Theme: *One source of truth, one read path, one write path — no more bandages on a half-migrated model, plus the orthogonal cleanups that have been waiting.*

Finishes the v50-05 tracks migration so every read and every write of "the live track list" routes through `tracks/{id}` only. Full closure details in `.paul/MILESTONES.md § v6.0` and the archive snapshot at `.paul/milestones/v6.0-ROADMAP.md`. Detail table preserved here truncated; refer to those for accomplishments + decisions + patterns established. Original waves:

<details>
<summary>v6.0 detailed phase table (archived — click to expand)</summary>

| Wave | Phase | Focus | Status |
|------|-------|-------|--------|
| 1 (parallel) | v60-01 | SyncIndicator conflict click rewire + silent last-write-wins-on-retry | ✅ LOOP COMPLETE — PENDING-UAT (2026-05-12, v60-01-01 single combined commit; Daniel browser-smoke against deployed commit per appended checklist closes AC-4) |
| 1 (parallel) | v60-02 | pagehide/visibilitychange blur — mid-edit text protection | ✅ LOOP COMPLETE — PENDING-UAT (2026-05-12, v60-02-01 single combined commit; ~75 LOC source + 13 new tests; Daniel browser-smoke against deployed commit closes AC-5; Wave 1 of v6.0 behaviorally complete) |
| 2 (Wave 3 UNBLOCKED) | v60-03 | Java JDK 21 install + v54-02-02 H-SL-7 emulator canary green; HFG counter resets to 0/3 | ✅ LOOP COMPLETE (2026-05-12, v60-03-01 single combined commit; +245 LOC test only; engine.ts UNTOUCHED in final tree; canary 3/3 GREEN; counter reset 1/3→0/3 backed by working-tree revert-and-fail-then-restore proof; v53-02 clause-(b) waiver RESOLVED; v5h3-01 postmortem Action #2 CLOSED) |
| 3 (sequential) | v60-04 | Server-side reader migration (publish / print / email / scheduling) via single `getTracksForSetlist` helper | ✅ LOOP COMPLETE — PENDING-UAT (2026-05-12, 3 plans: `f03dcb1` v60-04-01 helper + page.tsx + publish + emulator coverage / `1e1cdc4` v60-04-02 print/public + print/personal / `9f5cde3` v60-04-03 email-packets + resend-email + latent songs type fix; aggregate +39 LOC net production across 7 files; 3 emulator-backed tests; HFG counter 0/3 held throughout; Wave 3 server spine complete; v60-07 writer strip now safe to plan) |
| 3 (sequential) | v60-05 | Editor + perform-view reader migration | ✅ LOOP COMPLETE — PENDING-UAT (2026-05-12, 1-plan phase: client-tracks.ts helper + 7 unit tests + use-setlist-performance.ts refactor; +21 LOC net; editor side proved already Dexie-routed; HFG 0/3 held; /ui-ux-pro-max gate satisfied; 1 deferral: matrix/route.ts → v60-06) |
| 3 (sequential) | v60-06 | Dashboard reader migration + 15-setlist backfill (`migration_snapshots/{setlistId}` rollback collection) | ✅ LOOP COMPLETE (8 of 8 plans 2026-05-12 → 2026-05-13). Wave 3 reader-migration spine fully delivered: client reader inventory (Dexie-aware + Dexie bulk + Web-SDK direct-fetch) + server reader spine (all 6 server surfaces route through getTracksForSetlist) + dashboard denormalization (trackCount + songCount + fileIds) + historical backfill tool (scripts/backfill-tracks-v60.ts + 22-test fake-only suite). Production dry-run captured: 5 MIGRATE / 5 SKIP-HYDRATED / 5 SKIP-EMPTY / 0 errors. Aggregate: +263 LOC source + 49 hook + 205 test + 1041 LOC migration; HFG 0/3 held throughout. **v60-07 writer strip UNBLOCKED.** PENDING-UAT carry: Daniel runs `--apply` for v60-06-08 during a safe Mon–Wed window. |
| 3 (sequential) | v60-07 | Embedded-array writer removal + immediate `FieldValue.delete` strip | ✅ LOOP COMPLETE 2026-05-13 (4 of 4 plans closed; phase mandate fully met). **v60-07-01** mirrorTracksToTopLevel dual-write bridge decommissioned (use-add-to-setlist.ts refactored to engine-path applyEdit fanout + denorm-only parent update; +14 LOC). **v60-07-02** 4 create-style writers W1/W3/W4/W6 routed to shared `seedTopLevelTracks` closure helper (W5 inherits free; addDoc payloads carry trackCount + hydrated:true only; +61 LOC helper-attributable). **v60-07-03** W2 updateSetlist defensively strips caller `tracks`; updateSetlistWithVersion emits `tracks: deleteField()` inside the existing transaction when `remote.hydrated === true` — zero extra round-trips; audit-log collapsed to `'renamed' | 'updated'`; +24 LOC. **v60-07-04** W7 import/execute route refactored to Admin SDK batched seeding (parent doc + per-track batch); FieldValue.serverTimestamp() replaces ISO-string nowStr (Timestamp gap closed); +27 LOC. Aggregate: ZERO production code paths write embedded `tracks[]` anywhere; opportunistic strip-on-touch realized for client surface. Optional v60-07-05 follow-up (W8/W9/W10 opportunistic strip + W11 cascade-delete top-level tracks orphan cleanup) — polish, not phase mandate. **v60-08 cleanup unblocked.** Audit reference: RESEARCH/audit-writes.md. |
| 3 (sequential) | v60-08 | Migration cleanup (delete `mirrorTracksToTopLevel`, drop SSR ternary, drop converter `tracks` field) | ✅ LOOP COMPLETE 2026-05-13 (single-plan phase). v60-08-01 closes the v50-05 → v6.0 migration story: reader fallback dropped from server-tracks.ts + client-tracks.ts; `tracks` field dropped from both `setlistSchema` (Zod) AND the hand-defined `Setlist` interface; 22 consumer sites across 10 production files migrated to v60-06 denorms (trackCount/fileIds/songCount); `setlist-firebase` clone/duplicate/save-template paths now fetch source tracks via `fetchTracksForSetlistClient`; matrix/route.ts uses local `SetlistWithTracks` type. Backfill executed (`--apply`): 5 migrated / 5 skip-hydrated / 5 skip-empty / 0 errors. Production delta -80 LOC net; total -110 LOC across 26 files. Daniel-approved mid-APPLY scope expansion when consumer surface proved 22 sites vs plan's ≤2 estimate (spec-issue diagnostic). Suite 1612/52 — failure count matches v60-07 baseline exactly. tsc EXIT=0; next build Compiled successfully in 6.8s. HFG counter 0/3 held. /ui-ux-pro-max gate N/A (data-layer only). **Wave 3 (v60-04..v60-08) fully closed. v60-09 + v60-10 (Wave 4) UNBLOCKED.** |
| 4 (parallel after Wave 3) | v60-09 | Cross-device library sync (`library_index ↔ songs/*` continuous) | ✅ LOOP COMPLETE — PENDING-UAT (2026-05-13, v60-09-01 single-plan phase). New `subscribeSongsLibrary` snapshot listener (`src/lib/songs/subscribe.ts`) at SetlistGridHydrator mount replaces v53-02-01 one-shot `primeSongsLibrary`; first snapshot delivers initial population, subsequent snapshots keep Dexie live so rename/archive/upload mutations from another device propagate within ~1s. Write-side parity: rename + archive + upload routes mirror title/normalizedTitle/status to `songs/{fileId}` via Promise.allSettled (songs failure non-fatal — self-heals via next snapshot tick). ChartBindPopover + AddRowPlaceholder useLiveQuery filters `status !== 'archived'` at the Dexie query layer per /ui-ux-pro-max consult (smaller rendered list → faster cmdk filter on iPad; archived hidden from BOTH Library AND Recent groups). LocalSong gains `status?: 'active' \| 'archived'` type field; missing status reads as active for backward compat with v54-01-01 bootstrap docs (no migration required). ChartBindDialog per-open re-prime + REPRIME_MIN_INTERVAL_MS deleted — continuous listener supersedes throttled refresh. Sticky memory (recent[] + defaults) preserved through archive cycle (songs/{fileId} not deleted; status flag flip only). 1 auto-fix during APPLY: emulator test pivoted from firebase/firestore client SDK to firebase-admin SDK (jsdom lacks streaming APIs — SubscribeAdapter abstraction made it a single-file swap; production code path unchanged). Suite delta +3 (route mirror tests in rename.test.ts + archive.test.ts) + 5 new emulator round-trip cases (initial / modify / archive / delete / unsubscribe — 5/5 GREEN). tsc EXIT=0; next build ✓ Compiled successfully in 12.3s; vitest 1615/52 (failure count matches v60-08 baseline 1612/52 exactly). **HFG counter 0/3 held via real-Firestore emulator coverage — no clause-(b) waiver consumed.** /ui-ux-pro-max gate satisfied at Task 1 entry (3 verdicts documented in SUMMARY). LOC delta ~+170 LOC production (subscribe.ts new file ≈110 LOC dominates); AC-8 DRIFT approved-in-plan. **Parallel-session coordination:** v60-10 shipped concurrently in another Claude session; zero file overlap by boundary contract; sequential commits — v60-10 first (`6288c97`), v60-09 second after `git pull --rebase`. AC-3 two-device smoke (Mac↔iPad rename/archive/upload live propagation) carry-forward as PENDING-UAT per v51-04 codified pattern. Closes v54-03 fold-forward (cross-device library sync deferred since 2026-05-08). |
| 6 (milestone-close gate) | v60-12 | Public tracks visibility — Firestore rules `tracks/{trackId}` opened to `allow read: if true` (writes still band-leader/admin-gated); `use-setlist-performance.ts` hook mounts snapshot listener for unauthenticated users (was previously skipped due to stale comment claiming page "renders an error for public users"). Adds `@firebase/rules-unit-testing` dev dep + 8-scenario emulator-backed rules test (public read works / writes locked / member-only can't write / band-leader + admin still work). Closes UAT-class bug Daniel reported 2026-05-13: centralreform.live homepage shows upcoming setlist, "Perform" link works, but perform view renders "No tracks yet" for incognito visitors. | ✅ LOOP COMPLETE + DEPLOYED 2026-05-13 (v60-12-01 single-plan phase). Pre-APPLY architectural audit cleared 5 concerns. APPLY clean: rules +6 LOC audit comment + 1-line flip; hook +6 LOC comment + 2-LOC guard simplification; @firebase/rules-unit-testing@^5.0.1 dev dep; 8/8 emulator rules test scenarios GREEN; 1 contract-reversal in existing hook test (intentional, not a regression). Suite 1636/52 (52-failure baseline matches v60-11 exactly). tsc EXIT=0; next build ✓ Compiled in 11.5s. `firebase deploy --only firestore:rules --project crcmusiccharts` complete; rules compiled + released. **AC-4 PENDING-UAT** for Daniel-loop incognito perform smoke post-deploy (worship cycle). Data-layer + auth-rules only — /ui-ux-pro-max N/A. SPECIAL-FLOWS skill audit PASS. |
| 5 (milestone-close gate) | v60-11 | Shortcut-aware songs mirror (drop v54-01-01 MIME filter at songs/* mirror site; extend syncLibraryIndex to mirror library_index → songs/* with status filter only; one-off backfill of 134 historical missing shortcut docs) + subscribe.ts self-heal (recoverFromFirestoreShutdown) | ✅ LOOP COMPLETE 2026-05-13 — PENDING-UAT (v60-11-01 single-plan phase). Pre-APPLY architectural audit caught 5 spec issues (title strip, status clobber, batch pattern, scope-name, void prefix) — all patched into PLAN.md before code work. APPLY clean end-to-end: subscribe.ts +2 LOC self-heal + 2/2 unit tests; sync-engine.ts +57 LOC parallel songsBatch + 7/7 mirror parity tests (no MIME filter, no status writes, title verbatim, separate batch IDs prove parallel commit); scripts/backfill-shortcuts-songs.ts 234 LOC append-only + idempotent marker `system/v60-11-backfill`; scripts/diag-lechu-goldman.ts relocated to scripts/diag/. Suite 1636/52 (52-failure baseline matches v60-09 exactly; +21 passing incl. 9 new v60-11 tests). HFG counter held at 0/3 via emulator-adjacent coverage of both new code paths. tsc EXIT=0; next build ✓ Compiled successfully in 8.6s. /ui-ux-pro-max gate N/A (data-layer only). **AC-3 production --apply DONE 2026-05-13** (131 docs written; 134-gap closed: 131 written + 3 empty-name skipped; marker `system/v60-11-backfill` set; songs total 364 → 495; "Lechu Goldman" doc confirmed via diag spot-check). **AC-4 Daniel-loop picker UAT carry-forward** per v51-04 codified pattern. **Pushed @ 291ea95** — Vercel auto-deploy triggered. Issue 2 (setlist-missing cascade) remains OUT OF SCOPE pending Daniel clearing site data + reporting persistence. **v6.0 milestone-close gate cleared from code-readiness perspective.** |
| 4 (parallel after Wave 3) | v60-10 | Mobile AddBar variant (parallel-render v53-03 split-button + 5-tile popover for mobile breakpoints) | ✅ LOOP COMPLETE — PENDING-UAT (2026-05-13, v60-10-01 single-plan phase). Coarse-pointer sticky-bottom variant via CSS-driven `[@media(pointer:coarse)]:fixed bottom-0 left-0 right-0 z-40 bg-background pb-[env(safe-area-inset-bottom)] shadow-...` on AddBar outer wrapper (no first-paint flash on iPad — Daniel's primary surface). New `useVirtualKeyboardOpen()` hook (visualViewport.resize listener, 150px threshold, SSR + JSDOM guards) + Tailwind `hidden` (display:none) primitive composed via `hideForKeyboard = isCoarse && keyboardOpen` — removes bar from a11y tree when iPad keyboard pops. Desktop fine-pointer surfaces preserve v53-03 in-flow AddBar byte-for-byte. SetlistGrid.tsx unmodified — existing pb-32 (128px) on row-list container is the "measured equivalent" per plan's "or measured equivalent" authorization (DRIFT documented; adding literal pb-20 would have SHRUNK coarse spacer via Tailwind specificity). Suite delta +12 (5 AddBar variant + 7 hook); tsc EXIT=0; next build ✓ Compiled successfully in 15.0s; HFG counter 0/3 held; /ui-ux-pro-max consulted at Task 2 checkpoint:decision — locked Option A (fixed-bottom) over Option B (sticky-in-scroll-container — high SetlistGrid restructure risk) + Option C (FAB — abandons v53-03 split-button shape). AC-6 Daniel-loop iPad/iPhone/desktop browser-smoke PENDING-UAT carry-forward post-push per v51-04 codified pattern. Closes v53-03 deferred CONTEXT Q1 (third + last v5.4 fold-forward into v6.0 after v60-03 + v60-09). |

Constraint: No engine touches in v60-01/02/04 (server-only or orthogonal). Wave 2 BLOCKS Wave 3 engine phases. ≤30 LOC net per commit in v60-04. Each commit independently revertible. Browser-smoke mandatory before phase close. HFG counter at 1/3 → resets at v60-03. No preview branches. Friday/Shabbat cadence respected (no risky deploys Thu PM → Sun). Backfill scope = 15 most-recent setlists only.

</details>

---

## Earlier Milestones

**v5.3 — Editor UX Repair** *(RESCOPED 2026-05-02 — v5h3 hotfix inserted; closed 2026-05-02)*
Status: ✅ Complete (closed with PENDING-UAT marker per Daniel "push and finish the milestone")
Archived snapshot: `.paul/milestones/v5.3-ROADMAP.md`
Detailed accomplishments + decisions: `.paul/MILESTONES.md` § v5.3 entry
Pre-close-status (preserved below for reference):
Phases: 4 of 4 LOOP COMPLETE (v53-01 ✅ research + v5h3-01 ✅ save-loss recurrence hotfix + v53-02 ✅ chart-bind + v53-03 ✅ polymorphic Add menu — all PENDING-UAT in parallel; v53-04 ❌ COLLAPSED 2026-05-02 per Daniel decision — Track B's only remaining port-back candidate (chart-preview) died with chart-verify drop earlier same day; net zero remaining scope)
Theme: *"The spreadsheet bones stay; the affordances get fixed."* Targeted UX repair on the v50-05 spreadsheet editor — frictionless chart binding + chart-cell discoverability + polymorphic Add menu — informed by what the old `SetlistEditorV2` (amputated in v50-02) did well. NOT a scrap of the spreadsheet model.

**Rescope (2026-05-02, after v53-01 research):** Daniel iPad UAT surfaced a **save-loss recurrence** (same class as v5h-01, 2026-04-27). Synthesis recommended + Daniel approved: insert **v5h3 hotfix phase** BEFORE v53-02..04 (same precedent as v5.0-hotfix). Chart-verification peek DROPPED per Daniel ("don't worry about this. Fix the other pieces."). v53-04 likely collapses (Track B's only remaining port-back candidate was the chart-preview pattern, which dies with the chart-verify drop).

Origin: Daniel-loop UAT post-v5.2 surfaced editor regrets that v5.1 + v5.2 polish never addressed at the substrate level. Daniel: *"it needs to be super easy to bind a chart to a particular line… super easy to add a new track/chart/line/song/teaching whatever to the setlist. the old 'add' menu was MUCH better."* Three high-friction surfaces: (1) `ChartBindPopover.tsx` search reported broken on iPad/desktop — Track A confirmed sub-mode (c) (picker opens, typing produces NO results); cmdk value-format scoring (H1) + library hydration (H2) implicated; smallest-fix path is ~10 LOC; **NEW from UAT:** ChartCell off-screen on iPad ("scroll way to the right") added as a 4th surface for v53-02; (2) ~~chart-verification peek~~ — DROPPED per Daniel; (3) `AddRowPlaceholder.tsx` only inserts **song** rows but `TrackType` union has 6 types — the polymorphic Add menu from the old editor was ripped out in the v50-02 amputation; Track B found the deletion in commit `d8c0442` (`AddBar.tsx` 6-tile dropdown), RECOMMENDED to port to v53-03. Same v52-style **systemic, not bandaids** directive — recursive research front-loaded into Phase 1 so phases 2–4 execute against root-cause findings + ported-back patterns instead of guesses.

Constraint: Spreadsheet bones stay (no revert; new editor's TanStack/cmdk/shadcn substrate, sync engine v50-03, Dexie schema v50-04 sticky memory, perf-view dual-read v5h-01-03 all out of scope). Daniel-loop UAT discipline (codified v51-04) — every phase that touches data flow or UI gets Daniel UAT pass on real production before milestone close; UAT failures route to follow-up plans in same phase. /ui-ux-pro-max BLOCKING for every UI-touching phase per SPECIAL-FLOWS.md (v53-02 / v53-03 / v53-04); optional for v53-01 + v5h3-01 research/postmortem plans. Tablet-first (verify every fix on iPad in addition to desktop). UAT is the milestone-close gate, not its own phase (matches v5.2 precedent). v5.0 + v5.2 UAT closes still pending — v5.3 plans in parallel with band onboarding (does not block); v5h3 ships THROUGH band-onboarding window (save-loss must be fixed before band invitation).

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v53-01 | Recursive research (3 parallel tracks) | 1/1 | ✅ Complete | 2026-05-02 |
| **v5h3-01** | **Save-loss recurrence hotfix** (inserted 2026-05-02 via rescope) | 4/4 (research / instrumentation / H-SL-7 fix `36e9fa1` / postmortem + binding harness-fidelity gate) | ✅ LOOP COMPLETE 2026-05-02 — PENDING-UAT (Daniel weekly worship cycle) | 2026-05-02 |
| v53-02 | Chart binding picker fix + ChartCell discoverability *(chart-verify peek DROPPED per Daniel)* | 1/1 (cmdk fix + Recent section + library priming + sticky-right ChartCell at `bc754b4`) | ✅ LOOP COMPLETE 2026-05-02 — PENDING-UAT (Daniel weekly worship cycle) | 2026-05-02 |
| v53-03 | Polymorphic Add menu (port `AddBar.tsx` from commit d8c0442) | 1/1 (split-button + 5 colored tiles + Recent group + handleAddTrackOfType at `3a321c9`) | ✅ LOOP COMPLETE 2026-05-02 — PENDING-UAT (Daniel weekly worship cycle) | 2026-05-02 |
| ~~v53-04~~ | ~~Editor affordance pass~~ | ❌ COLLAPSED | 2026-05-02 — net zero remaining scope after chart-verify drop | - |

### Phase v53-01: Recursive research (3 parallel tracks) ✅ COMPLETE 2026-05-02

Outcome (2026-05-02): 3 parallel research tracks (Track A ChartBind diagnosis / Track B old-editor archaeology / Track C polymorphic Add + chart-peek option sets) + iPad UAT capture (NOT deferred) + RESEARCH-SYNTHESIS.md with rescope recommendation. Daniel selected RESCOPE at decision checkpoint. ~45min end-to-end. Zero source code modified (boundary clean).

Headline outcomes:
- ⚠️ **Save-loss recurrence surfaced via UAT** (NOT in original v53-01 scope) — same class as v5h-01 (2026-04-27); 6 hypotheses open; LOW confidence; needs production state capture in v5h3-01-01. **Daniel-loop UAT discipline (codified v51-04) WORKS** — caught the bug before any v5.3 code shipped.
- **ChartBind picker filter broken (sub-mode c confirmed):** picker opens, typing produces no results. cmdk value-format scoring (H1 confirmed) + library hydration timing (H2 partial) implicated. Smallest-fix path ~10 LOC; systemic-fix path ~80-120 LOC. AddRow no-suggestions shares root cause (identical useLiveQuery + cmdk value pattern) — fix bundle covers both surfaces.
- **NEW iPad finding: ChartCell off-screen** ("scroll way to the right"). Added to v53-02 scope as 4th surface. /ui-ux-pro-max consultation needed at v53-02 PLAN entry for column-reorder vs. row-side affordance.
- **Polymorphic Add menu found in git history:** commit `d8c0442` (v50-05-02 amputation) deleted `AddBar.tsx` — single "Add Item" button → 6-tile dropdown (Song / Section / Reading / Prayer / Transition / Note) with distinctive icon colors. Track B verdict: **RECOMMENDED** to port to v53-03. Track C Option A (grouped CommandList in current cmdk substrate) is the modern equivalent; Option B (split-button) more literally matches old-editor — Daniel decides at v53-03 PLAN time.
- **Anti-patterns guarded against:** Inline chart binding (Replace/Unlink) REJECTED — re-introduces v5h-01 fragility class. Dual-write to embedded `setlists/{id}.tracks[]` + top-level `tracks/{id}` REJECTED — same bug class. Optimistic-write state divergence (`use-setlist-logic.ts` 3-state-machine pattern) REJECTED.
- **Chart-verification peek DROPPED from v5.3 scope** per Daniel. Track C's option set shelved for future-milestone revival. v53-04 likely collapses (chart-preview port-back was its only remaining candidate).

Plans:
- v53-01-01 ✅ COMPLETE 2026-05-02 — 3 parallel research subagents + iPad UAT capture + synthesis with RESCOPE decision. SUMMARY at `.paul/phases/v53-01-recursive-research/v53-01-01-SUMMARY.md`.

Patterns established:
- Recursive research with HUMAN-ACTION UAT checkpoint can surface NEW high-severity findings outside original scope (save-loss recurrence here); synthesis MUST adapt and recommend rescope rather than force-fit.
- Old-editor archaeology format (Pattern \| Old SHA \| What-it-did-well \| Risk-if-ported \| Verdict) — directly portable to future amputation/rebuild research.
- One-root-cause-two-surfaces detection: if 2+ surfaces share substrate code, fix at substrate; do NOT split into per-surface plans (AddRow + ChartBind picker bundle here).

### ⚠️ Phase v5h3-01: Save-loss recurrence hotfix (NEW — inserted via rescope 2026-05-02)

Focus: Reproduce + diagnose + fix the save-loss recurrence Daniel surfaced during v53-01 UAT. Same playbook as v5h-01 (`.paul/postmortems/v5h-01-save-loss.md`).

Daniel's report: *"I made all sorts of changes to a setlist this morning and they didn't save when I just went back to it. This is so annoying. Some of them did, some didn't. Beyond irritating."* — same class as v5h-01 (2026-04-27); the v5.0-hotfix's E+F+B defense-in-depth was supposed to prevent this. Recurrence is evidence that either a new code path bypasses the protections OR auth-claim staleness is back OR the kitchen-sink harness (v50-07-04) fidelity gap that v5h-01-04 deferred has surfaced again.

6 hypotheses surfaced in `.paul/phases/v53-01-recursive-research/ipad-uat-capture.md`:
- H-SL-1: TextCell single-tap-to-edit (v52-02-02) blur/commit race
- H-SL-2: Sticky-memory propagation (v50-04 1s debounce) clobbers in-flight edits
- H-SL-3: `clearFailedOutboxRows` (v52-03) drops a pending row mid-FSM-transition
- H-SL-4: `config/defaults` write path (v52-05) shares engine pump capacity with track writes
- H-SL-5: Auth-claim staleness redux (v5h-01 §3 pattern)
- H-SL-6: Different bug entirely — new code path not yet traced

Recommended structure (3 plans, mirroring v5h-01):
- **v5h3-01-01 — Reproduce + diagnose** (research; autonomous=false; HUMAN-ACTION for Daniel to capture IndexedDB outbox + Safari Web Inspector console + Network tab from this morning's affected setlist + songs-table count for ChartBind H2 disambiguation. AddRow no-suggestions likely diagnosed in same investigation since it shares root cause with ChartBind picker.)
- **v5h3-01-02 — Fix** (execute; ~2-4h depending on diagnosis; defense-in-depth pattern from v5h-01-02 precedent if multi-cause).
- **v5h3-01-03 — Postmortem update** (execute; ~30min; autonomous=true). Extend `.paul/postmortems/v5h-01-save-loss.md` OR create new `v5h3-01-save-loss-recurrence.md`. Critically: identify why kitchen-sink harness (v50-07-04) didn't catch this — the named harness-fidelity gap from v5h-01 §5 (Firebase emulator + thin RTL editor↔perf-view test pair) has NOT been closed since v5h-01-04 deferred it. Recurrence is evidence the deferral was wrong; postmortem MUST escalate or close the gap.

Plans: TBD (defined during /paul:plan)
/ui-ux-pro-max gate: optional for v5h3-01-01 (research) + v5h3-01-03 (postmortem). Required for v5h3-01-02 only if fix surfaces UI (e.g., new error/recovery affordance).

Tracks:
- **Track A — ChartBind diagnosis.** Why search reported broken on iPad and desktop. Audit (1) cmdk `value={\`${song.title} ${song.id}\`}` format vs. CommandInput query — fuzzy-match collision likely; (2) `useLiveQuery(getDb().songs.toArray())` hydration timing in the bind context — empty/stale at first render?; (3) iPad-specific focus residue from v52-02 — is `suppressAutoFocus=false` actually firing for ChartBindPopover or is something downstream re-suppressing?; (4) library size + sort order — should recents / "from this setlist" / sticky-memory-bound songs surface ahead of full library? Output: ranked hypotheses + smallest-fix recommendation.
- **Track B — Old-editor archaeology.** Git-spelunk pre-v50-02 commit history (the amputation deleted ~3,000 LOC of editor surface). Identify what the old `SetlistEditorV2` Add menu + chart-binding flow did well that Daniel misses. Pattern-match against the NEW editor: which patterns can be ported back as additive enhancements without re-introducing old data-flow fragility? Explicit non-goal: revert. Goal: inventory of port-back-worthy patterns ranked by effort × user-impact.
- **Track C — Polymorphic Add design.** Trade-offs for one Add trigger covering 6 TrackTypes (`song | header | reading | prayer | transition | note`): grouped CommandList (shadcn `<CommandGroup heading>`) vs. split-button with type submenu vs. type-prefixed shortcuts (e.g. `/r` for reading). Default focus = most-used path (Library Song). Chart-verification interaction: row-side thumbnail vs. tap-to-peek modal vs. hover-card preview — and the iPad-specific path (no hover). Output: 2–3 implementable option sets with mockup descriptions for /ui-ux-pro-max consultation in v53-02 / v53-03.

Plans: TBD (defined during /paul:plan)
/ui-ux-pro-max gate: optional (research, no UI changes)

### Phase v53-02: Chart binding picker fix + ChartCell discoverability *(blocked behind v5h3-01)*

**Updated scope (chart-verify peek DROPPED per Daniel; ChartCell discoverability ADDED per UAT):**

Focus: Two surfaces — (1) ChartBind picker filter actually returns results when typing (Track A Smallest-Fix path: cmdk value format `\`${title} ${id}\`` → `${title}` at ChartBindPopover.tsx:123 + mirror in AddRowPlaceholder.tsx:138, ~10 LOC). (2) ChartCell discoverable on iPad without scrolling right past Notes column — column-reorder vs. sticky-right-column vs. row-side affordance (chart-icon at row gutter); /ui-ux-pro-max consultation at PLAN entry locks the choice. (3) OPTIONAL: if v5h3-01-01 production state reveals library hydration is the dominant cause AND Daniel still feels library friction after smallest-fix lands, add Track A Systemic-Fix path "Recent" section in a v53-02-02 follow-up plan (~80-120 LOC). AddRow no-suggestions fix is automatic byproduct of (1) — same substrate.

Done means: open ChartBind picker → instant focus + keyboard on iPad → type a few chars → matches surface immediately → tap to bind → ChartCell visible without horizontal scroll on iPad. Chart verification peek explicitly OUT OF SCOPE.

Plans: TBD (defined during /paul:plan after v5h3-01 closes)
/ui-ux-pro-max gate: BLOCKING

### Phase v53-03: Polymorphic Add menu *(blocked behind v5h3-01)*

Focus: Replace `AddRowPlaceholder.tsx` single-purpose Add (Library Song / free-text only) with polymorphic Add trigger covering all 6 `TrackType` values — Library Song / Free-text Song / Reading / Prayer / Transition / Section header / Note. Track C surfaced 3 option sets; Track B confirmed old-editor `AddBar.tsx` (commit `d8c0442`) had a 6-tile dropdown with distinctive icon colors that Daniel misses. Decision at v53-03 PLAN entry between Track C Option A (grouped CommandList in current cmdk substrate — strongest by Track C ranking) vs. Option B (split-button matching old-editor more literally — Daniel's "MUCH better" memory may favor this). /ui-ux-pro-max consultation drives.

**MANDATORY:** Touch-target compliance fix — current CommandItems use `py-1` (~16px), violates 44×44 floor. Bump to `min-h-[44px] [@media(pointer:coarse)]:py-2` per /ui-ux-pro-max rule.

Plans: TBD (defined during /paul:plan after v5h3-01 closes)
/ui-ux-pro-max gate: BLOCKING

### ~~Phase v53-04: Editor affordance pass~~ *(❌ COLLAPSED 2026-05-02 per Daniel decision)*

**Outcome:** Phase removed from milestone scope at v53-03 close. Track B's only port-back candidate beyond the polymorphic Add menu was the chart-preview pattern from `SongRow` collapsed-state file-name link — that died when Daniel dropped chart-verification entirely from v5.3 scope earlier same day. Net zero remaining scope; no plans drafted; no source code touched. Phase directory removed (`.paul/phases/v53-04-editor-affordance-pass/` was empty). v5.3 milestone shape: 4 implementation phases (v53-01 / v5h3-01 / v53-02 / v53-03), all LOOP COMPLETE, all PENDING-UAT.

### Milestone-close gate

UAT (Daniel runs real-production weekly worship cycle on iPad — Erev Shabbat + Shabbat morning) closes the milestone. Not its own phase. UAT failures route to follow-up plans in the affected phase per v51-04 rule. Once UAT passes: `/paul:complete-milestone v5.3` → then `/paul:audit-milestone v5.0` (or v5.2 if still pending) per the parent-milestone close path.

---

## Previously Active Milestone (Pending Band UAT)

**v5.2 — Band-Onboarding Hardening**
Status: ✅ ALL 5 PHASES SHIPPED 2026-04-30 (milestone-close UAT pending — band onboarding cycle)
Phases: 5 of 5 complete
Theme: *"Make iPad bulletproof + give setlists a real lifecycle, so we can invite the band."* Systemic fixes — iPad input/focus, sync-error UX, touch-affordance discoverability, setlist lifecycle, plus template-management as a real feature. Daniel explicitly requested **systemic fixes, not bandaids** — recursive research front-loaded into Phase 1 so phases 2–5 execute against root-cause findings instead of guesses.

Origin: 7 issues surfaced via Daniel-loop UAT post-v5.1 (codified discipline working as designed): (1) iPad red "Failed" SyncIndicator (desktop OK), (2) iPad text-input keyboard not popping, (3) iPad Chart picker search broken, (4) all-platforms kebab next to "Saved" red-lined / unclickable, (5) iPad setlists list kebab needs always-visible affordance, (6) save-as-default-template feature, (7) "Edit setlist" should be primary CTA over "Close setlist". Bugs 2+3 likely share root cause (v51-01 focus/keyboard rule leaking); 1+4 cluster around SyncIndicator failure-state UX; 5 is touch-affordance discoverability. Research-first phase v52-01 disambiguates before any code lands.

Constraint: Daniel-loop UAT discipline (codified v51-04) — every phase that touches data flow gets Daniel UAT pass on real production before milestone close. /ui-ux-pro-max BLOCKING for every UI-touching phase per SPECIAL-FLOWS.md. Tablet-first (verify every fix on iPad in addition to desktop). v5.0 UAT close still pending — v5.2 is the gate-clearer for band onboarding.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v52-01 | Recursive research (4 parallel tracks) | 1/1 | ✅ Complete | 2026-04-30 |
| v52-02 | iPad focus + cmdk system fix | 2/2 | ✅ Complete | 2026-04-30 |
| v52-03 | SyncIndicator failure UX overhaul | 1/1 | ✅ Complete | 2026-04-30 |
| v52-04 | Touch affordance + setlist lifecycle UX | 1/1 | ✅ Complete | 2026-04-30 |
| v52-05 | Default-template management | 1/1 | ✅ Complete | 2026-04-30 |

### Phase v52-01: Recursive research ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): 4 parallel research tracks (dan-researcher subagents) + 1 follow-up Issue 1 firming pass + RESEARCH-SYNTHESIS.md with 7-row root-cause confidence matrix. All 7 issues at HIGH confidence; 0 LOW; no round-2 research triggered. Daniel approved synthesis with 6 default OQ answers locked. Task 2 (HUMAN-ACTION iPad UAT capture) DEFERRED to per-phase post-deploy Daniel-loop UAT (codified discipline from v51-04). Wave 1 plans v52-02..v52-05 unblocked and parallel-eligible.

Key findings:
- **Issues 2+3 SHARE root cause** — TouchOrPopover unconditional `onOpenAutoFocus(preventDefault)` on `(pointer:coarse)` breaks Radix focus-trap on iOS Safari. Single ~30 LOC substrate fix in v52-02 via `suppressAutoFocus?: boolean` opt-in prop.
- **Issues 1+4 INDEPENDENT** despite same surface — Issue 1 is missing recovery affordance for terminal `failed` FSM state + per-device outbox divergence + auth-claim staleness compounding (v52-03 ~75-120 LOC: "Clear failed rows" + "Sign out and back in"); Issue 4 is hard-coded `disabled={!onOverflow}` kebab in SetlistGridTopBar.tsx:65 that never receives the prop (v52-03 removes it, ~10-15 LOC).
- **Issues 5+7 file-bundled** in SetlistCards.tsx — single v52-04 plan, ~10-15 LOC. 3 P0 hover-to-reveal findings (UpcomingSetlistCard kebab, SetlistCard kebab, CalendarDayCell Plan Service button) get `[@media(pointer:coarse)]:opacity-100`; "Edit Setlist" button promoted from variant=secondary to primary.
- **Issue 6 architecture: Option C** (system/templates pointer doc) — admin-only write, phased scope (Shabbat morning + Erev Shabbat first), editor kebab entry point, silent fallback on deleted pointer. v52-05 ~125 LOC + new API route.

Plans:
- v52-01-01 ✅ COMPLETE 2026-04-30 — 4 parallel research subagents + Issue 1 follow-up firming + synthesis. SUMMARY at `.paul/phases/v52-01-recursive-research/v52-01-01-SUMMARY.md`.

Sequencing: Wave 1 parallel-eligible — v52-02 / v52-03 / v52-04 / v52-05 can plan in parallel. If serial preferred: v52-02 first (highest user-impact, smallest scope).

Tracks:
- **Track A — iPad text-input focus regression** (Issues 2, 3). Hypotheses: v51-01 `onOpenAutoFocus(preventDefault)` leaking past auto-focus into manual-tap focus on text inputs; iOS WebKit pointer-event vs touch-event ordering with Radix Popover / cmdk; `(pointer:coarse)` media query bleed-through to non-picker inputs; cmdk CommandInput + iOS system-keyboard interaction quirks. Output: ONE shared substrate fix or N independent fixes — explicit decision, not assumed. Disambiguate Issue 3 sub-modes: (a) input doesn't focus, (b) focuses but typing doesn't filter, (c) filters but selection doesn't bind.
- **Track B — SyncIndicator state UX** (Issues 1, 4). Output: state diagram (idle / syncing / saved / pending / failed / conflict) + per-state kebab availability rationale + diagnosis of why iPad fails where desktop succeeds (auth-claim staleness redux? rules version? per-device outbox?) + cause of the kebab "red line" (disabled attr / z-index overlap with v51-h01 lastError pill / CSS regression).
- **Track C — Touch affordance discoverability sweep** (Issue 5 + audit). Every hover-to-reveal control in the app, not just setlists list. Output: audit table + always-show-on-`(pointer:coarse)` policy.
- **Track D — Template-management data model** (Issue 6). Trade-offs: implicit `templateType` + `findLastMatchingService` vs. explicit `templates/{type}` collection vs. per-setlist `is_default_template` flag. Migration impact on 24 hydrated + 5 unhydrated setlists. Permission model (admin-only vs. anyone-with-edit). Scope (just Shabbat morning + Erev Shabbat or all 11 service types).

Plans: TBD (defined during /paul:plan)
/ui-ux-pro-max gate: optional (research, no UI changes)

### Phase v52-02: iPad focus + cmdk system fix ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issues 2 + 3 cluster fully closed across 2 plans. **v52-02-01** (`61eae6c`) added `suppressAutoFocus?: boolean` opt-in prop to TouchOrPopover (default false); DropdownCell discrete-mode opts in to preserve v51-01 no-keyboard-on-open intent for Key/Type/AddRow/Bulk; searchable mode (Lead/ChartBind/Bulk-Lead/AddRow library lookup) drops suppression so cmdk CommandInput auto-focuses and iPad keyboard pops on Chart search open. **v52-02-02** (`f061c80`) added `useMediaQuery('(pointer:coarse)')` to TextCell with single-tap-to-edit gate inside button.onClick: coarse-pointer single tap calls `onFocus()` then `enterEditMode()` so input renders with autoFocus and iPad keyboard pops; desktop preserves keyboard-nav semantics (click-only-focuses, double-click + Enter + printable keystroke trigger edit mode). Read-only investigations confirmed MobileEditSheet (plain `<input>`/`<textarea>`) and CreationWizard (shadcn `<Input>` plain wrapper) are case (ii) — already work on iPad without TextCell pattern; no follow-up plan needed. Suite 1513 → 1518 (+5 across phase: 3 TouchOrPopover contract tests + 1 obsolete v51 test replaced + 3 new TextCell.test.tsx contract tests). /ui-ux-pro-max BLOCKING gate satisfied at v52-02-01 APPLY entry. Daniel UAT approved for both plans post-deploy.

Patterns established:
- Opt-in suppression for Radix Popover open-autofocus on touch — default trusts platform; only suppress when surface has no input to type into
- Cell-level coarse-tap-to-edit pattern: any future cell with button → input two-state pattern that needs touch single-tap-to-edit follows TextCell precedent

Plans:
- v52-02-01 ✅ COMPLETE 2026-04-30 — TouchOrPopover suppressAutoFocus opt-in. SUMMARY at `.paul/phases/v52-02-ipad-focus-cmdk-fix/v52-02-01-SUMMARY.md`.
- v52-02-02 ✅ COMPLETE 2026-04-30 — TextCell single-tap-to-edit on coarse pointer. SUMMARY at `.paul/phases/v52-02-ipad-focus-cmdk-fix/v52-02-02-SUMMARY.md`.

### Phase v52-03: SyncIndicator failure UX overhaul ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issues 1 + 4 cluster fully closed in 1 plan (single vertical-slice commit `e69e23a`). **Issue 4** (kebab "red line") — SetlistGridTopBar.tsx kebab + onOverflow prop + MoreVertical import all removed; SyncIndicator becomes the only trailing action. **Issue 1** (terminal `failed` FSM state with no recovery) — new `src/lib/sync/cleanup.ts` exports `clearFailedOutboxRows()` deleting only `status='failed'` rows; SyncIndicator wires it as the default `onRetryFailed` fallback so the failed-state action button is enabled in production by default; auth-staleness sign-out pairing surfaces an inline "Sign out and back in" button gated on `/permission|auth|denied|unauthenticated|unauthorized/i` regex. No engine FSM changes (failed stays terminal-on-EDIT_COMMITTED; recovery is "delete row from outbox, let pump re-derive"). Suite 1518 → 1528 (+10 cases, exceeds plan estimate). /ui-ux-pro-max BLOCKING gate satisfied at APPLY entry; drove zinc-300 (vs red-300) and mt-1.5 (vs mt-0.5) refinements. Daniel approved sight-unseen at HUMAN-VERIFY; real-iPad UAT deferred to standing Daniel-loop discipline.

Patterns established:
- Outbox cleanup primitives live in src/lib/sync/cleanup.ts (additive, write-only-to-Dexie, no engine coupling)
- Indicator default-handler fallback wires recovery affordances when parent doesn't pass explicit onRetryFailed (analogous to v50-06-02's useReconciliationModalOptional fallback for onResolveConflict)
- Inline error pill + neutral-toned recovery action below severity-colored description (red error pill + zinc sign-out link rather than red-on-red)

Plans:
- v52-03-01 ✅ COMPLETE 2026-04-30 — SyncIndicator failure-state recovery + remove dead kebab. SUMMARY at `.paul/phases/v52-03-sync-indicator-ux-overhaul/v52-03-01-SUMMARY.md`.

### Phase v52-04: Touch affordance + setlist lifecycle UX ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issues 5 + 7 cluster fully closed in 1 plan (single vertical-slice commit `814a50d`). **Issue 5 (3 P0 hover-reveals from Track C audit):** UpcomingSetlistCard kebab (SetlistCards.tsx:80), SetlistCard kebab (SetlistCards.tsx:208), and CalendarDayCell empty-day "Plan Service" placeholder (CalendarDayCell.tsx:104) all gain `[@media(pointer:coarse)]:opacity-100` modifier. iPad always-visible; desktop hover-reveal preserved. **Issue 7 (CTA hierarchy):** "Edit Setlist" / "Edit" buttons promoted from `variant="secondary"` (muted gray) + bg-muted overrides → `variant="brand"` (solid bg-brand). Clone buttons untouched (stay as tinted-brand secondary). Result: solid brand = Edit (primary); tinted brand = Clone (secondary). Color family unified, weight differentiated. Track C audit P1 findings (C-04 watermark, C-05 HeroCard arrow) deferred per audit recommendation. ~7 source LOC delta across 2 files. Suite 1528/1528 (pre-existing parallel-suite flake didn't surface). tsc + next build clean. /ui-ux-pro-max gate satisfied (carryover). Daniel approved sight-unseen at HUMAN-VERIFY; real-iPad UAT deferred to standing Daniel-loop discipline.

Patterns established:
- Always-visible on `(pointer:coarse)` for hover-reveal controls that are the sole path to critical actions (apply via `[@media(pointer:coarse)]:opacity-100` append; preserve desktop hover-reveal)
- Two-button CTA hierarchy in branded surfaces: primary uses solid `variant=brand`; secondary uses tinted `bg-brand/10` (or text-brand subtle) — color family unified, weight differentiated, no new hue for primary

Plans:
- v52-04-01 ✅ COMPLETE 2026-04-30 — Touch affordance + Edit CTA hierarchy. SUMMARY at `.paul/phases/v52-04-touch-affordance-setlist-lifecycle/v52-04-01-SUMMARY.md`.

### Phase v52-05: Default-template management ✅ COMPLETE 2026-04-30

Outcome (2026-04-30): Issue 6 closed in 1 plan (single vertical-slice commit `cf30d62` + Firebase rules deploy). Track D Option C admin-curated pointer doc shipped at `config/defaults` (codebase convention; NOT Track D's hypothetical `system/templates`). New service helpers (`getDefaultForServiceType` / `setDefaultForServiceType`) integrate into `findLastMatchingService` with pointer-preferred lookup and silent fallback on missing/dangling/repurposed pointers (OQ Q5 lock). UI: "Save as Default for {Shabbat Morning | Friday Night}" menu item in SetlistCards kebab (OQ Q4 superseded — v52-03 removed editor kebab; SetlistCards kebab is the natural surface). Phase 1 scope: shabbat_morning + friday_night only (OQ Q3); future expansion is additive. Rules-then-code deploy ordering enforced via in-task auto sequence (firebase deploy → git commit → git push) per v50-05 cutover lesson. Suite 1528 → 1536 (+8). tsc + next build clean. Daniel approved with explicit "Approved" at HUMAN-VERIFY (NOT sight-unseen — milestone-close phase).

Patterns established:
- Admin-curated pointer doc at `config/{name}` for cross-cutting curation (mirrors `config/featured` / `config/congregation` precedent)
- Service-helper pointer-first lookup with silent fallback to legacy query — graceful degradation, no telemetry on absence
- Two-method service-layer pattern for admin-curated pointers: `getXForY(key)` + `setXForY(key, value)`
- Phase-1 scope-gating in UI via const-set + `.includes()` — additive expansion to other enum values requires only set extension, no schema migration
- `vi.resetAllMocks()` (not `vi.clearAllMocks`) when tests sequence `mockResolvedValueOnce` queues across describes

Plans:
- v52-05-01 ✅ COMPLETE 2026-04-30 — Track D Option C pointer-doc + SetlistCards kebab item. SUMMARY at `.paul/phases/v52-05-default-template-management/v52-05-01-SUMMARY.md`.

## Next Milestone

v6.0 — Tracks Single-Source-of-Truth — scaffolding pending `/paul:milestone` invocation. 10 phases / 4 waves / 12 decisions locked in `.paul/MILESTONE-CONTEXT.md`. First commit target: Monday 2026-05-13 (v60-01 SyncIndicator conflict click rewire).

**Open carry-over from v5.0 + v5.2 + v5.3 + v5.4 (still pending UAT):** v5.0 has been pending UAT since 2026-04-27; v5.2 since 2026-04-30; v5.3 since 2026-05-02; v5.4 + the 8 P0 patches from 2026-05-12 ride the next worship cycle. Daniel-loop UAT discipline (codified v51-04) continues against deployed commits.

## Completed Milestones

<details>
<summary>v7.0 Document-Driven Setlist Creation — 2026-05-14 (9 phases LOOP COMPLETE / 16 plans; 0 P0 audit findings; constraint 12 satisfied; HFG 0/3 held)</summary>

Archived snapshot: `.paul/milestones/v7.0-ROADMAP.md`
Detailed accomplishments + decisions: `.paul/MILESTONES.md` § v7.0 entry
Master HEAD: `f3f86c41` (bundled feat(v70-08) phase commit) — 2 commits ahead of origin pending push.
Closed with PENDING-UAT marker per v51-04 codified pattern (6th consecutive: v5.3 → v5.4 → v6.0 → v7.0).

| Wave | Phase | Name | Plans | Outcome |
|------|-------|------|-------|---------|
| 0 (foundation) | v70-01 | Image-chart support (PNG/JPEG/HEIC) | 2/2 | ✅ Complete 2026-05-14 |
| 1 (foundation) | v70-02 | Recordings data model + Firestore rules | 1/1 | ✅ Complete 2026-05-14 |
| 2 (parallel) | v70-03 | Per-track media affordances (chart click-through + recording-bind UI) | 2/2 | ✅ Complete 2026-05-14 |
| 2 (parallel) | v70-04 | Doc upload + text extraction (mammoth/pdfjs/txt) | 1/1 | ✅ Complete 2026-05-14 |
| 3 (sequential) | v70-05 | Gemini structured extraction | 1/1 | ✅ Complete 2026-05-14 |
| 3 (sequential) | v70-06 | Resolve + missing-chart + recording-match | 1/1 | ✅ Complete 2026-05-14 |
| 4 (commit) | v70-07 | Interview form + setlist preview + commit | 3/3 | ✅ Complete 2026-05-14 |
| 5 (audit + close) | v70-08 | Best-practice audit + remediation | 4/4 | ✅ Complete 2026-05-14 |
| polish | v70-09 | Setlist metadata editor (out-of-sequence) | 1/1 | ✅ Complete 2026-05-14 |
| EMERGENT | v60-13 | Sync-engine resilience hotfix (post-v6.0 close) | — | ✅ Complete 2026-05-13 (rode the v7.0 window) |
| EMERGENT | v60-14 | Mobile date picker reset hotfix | — | ✅ Complete 2026-05-14 (rode the v7.0 window) |

</details>

<details>
<summary>v5.4 Hotfix + Harness Fidelity — 2026-05-12 (2 phases shipped + 1 partial / 4 plans + 8 P0 patches + 2 cleanups; deferrals fold-forward to v6.0)</summary>

Archived snapshot: `.paul/milestones/v5.4-ROADMAP.md`
Detailed accomplishments + decisions: `.paul/MILESTONES.md` § v5.4 entry
v6.0 plan (consumed deferrals): `.paul/MILESTONE-CONTEXT.md`
Closed with PENDING-UAT marker per v51-04 pattern (5th consecutive milestone). User halted band-aid patching 2026-05-12; architectural audit produced v6.0 design doc.

| Phase | Name | Plans | Outcome | Completed |
|-------|------|-------|---------|-----------|
| v54-01 | Picker bootstrap + thead hotfix (inaugural v5.4 phase) | 3/3 (`a693d23` bootstrap + thead repair / `6735f48` perform-view fileId fix-up / trackCount reconciler) | ✅ LOOP COMPLETE — PENDING-UAT | 2026-05-08 → 2026-05-09 |
| v54-02 | Harness Fidelity Gate remediation phase 1 (Firebase Local Emulator Suite + RTL test pair — BINDING per v5h3-01-04 postmortem) | 1/2 (Plan 01 emulator infra + build-info side-fix ✅ shipped; **Plan 02 H-SL-7 canary fold-forward to v6.0 as v60-03**) | 🟡 Partial — fold-forward | 2026-05-08 (Plan 01) |
| ~~v54-03~~ | Cross-device library staleness fix + library_index↔songs/* continuous sync | **Fold-forward to v6.0 as v60-09** | ⚪ Folded forward | - |
| ~~v54-??~~ | Mobile parallel-render AddBar variant | **Fold-forward to v6.0 as v60-10** | ⚪ Folded forward | - |
| (out-of-band) | 8 P0 sync/UX patches + 2 dead-code cleanups (2026-05-12) | 10 commits (`6cd2c4e` … `4ee6e70` + `146b40b` / `6b83ec4`) | ✅ shipped — PENDING-UAT | 2026-05-12 |

Closes deferred v50-07-02b sub-phase (songs/* bootstrap). HFG counter held at 1/3 carry-forward to v6.0 (resets at v60-03). Patterns established: bootstrap-script template (firebase-admin + MigrationFirestore + marker doc + snapshot collection), MIME-type filter at bootstrap edge, single-source invariant enforced at write paths, reconciler-pattern for derived-state fields stale on legacy docs, harness-phase split when local-prereqs block iteration, scope-narrowed parallel audit agents + synthesizer as antidote to band-aid drift, fold-forward labels on milestone reconciliation.

</details>

<details>
<summary>v5.3 Editor UX Repair (rescoped 2026-05-02 to insert v5h3 hotfix) — 2026-05-02 (4 phases / 7 plans / +69 tests within milestone)</summary>

Archived snapshot: `.paul/milestones/v5.3-ROADMAP.md`
Detailed accomplishments + decisions: `.paul/MILESTONES.md` § v5.3 entry
Closed with PENDING-UAT marker per Daniel "push and finish the milestone" — explicit override of v51-04-codified "UAT closes the milestone" rule.

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| v53-01 | Recursive research (3 parallel tracks) | 1/1 | 2026-05-02 |
| v5h3-01 | Save-loss recurrence hotfix (inserted via mid-milestone rescope) | 4/4 (research / instrumentation `1d8d94c` / H-SL-7 fix `36e9fa1` / postmortem + binding harness-fidelity gate) | 2026-05-02 |
| v53-02 | Chart binding picker fix + sticky-right ChartCell (chart-verify peek DROPPED per Daniel) | 1/1 (commit `bc754b4`) | 2026-05-02 |
| v53-03 | Polymorphic Add menu (split-button + 5 colored tiles, ported from `d8c0442` AddBar.tsx) | 1/1 (commit `3a321c9`) | 2026-05-02 |
| ~~v53-04~~ | ~~Editor affordance pass~~ | ❌ COLLAPSED (chart-preview port-back died with chart-verify drop; net zero scope) | 2026-05-02 |

</details>

<details>
<summary>v5.1 Editor UX Polish (Band-Onboarding Gate) — 2026-04-27 (4 phases / 4 plans)</summary>

Archived snapshot: `.paul/milestones/v5.1-ROADMAP.md`
Detailed accomplishments + decisions: `.paul/MILESTONES.md` § v5.1 entry

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| v51-01 | Picker rework (all 6 dropdown sites) | 1/1 | 2026-04-27 |
| v51-02 | Editor readability + visual hierarchy (desktop + tablet) | 1/1 | 2026-04-27 |
| v51-03 | Smart create-setlist wizard (date-aware via Hebcal) | 1/1 | 2026-04-27 |
| v51-04 | Vocal Lead rename + Daniel-loop UAT codification + print smoke | 1/1 | 2026-04-27 |

Done definition met: clean iPad flow + tighter editor + smart create-setlist wizard + Vocal Lead terminology + UAT discipline codified + gig-packet print smoke verified. Suite 1481 → 1513 (+32). Band-onboarding gate cleared.

</details>

## Older Completed Milestones

<details>
<summary>v5.0-hotfix Track-Edit Save-Loss Fix — 2026-04-27 (1 phase, 4 plans)</summary>

Archived at: `.paul/milestones/v5.0-hotfix-ROADMAP.md`
Postmortem: `.paul/postmortems/v5h-01-save-loss.md`

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| v5h-01 | Track-edit save-loss diagnosis + fix | 4 (01-01 reproduce+diagnose ✓ • 01-02 fix ✓ • 01-03 perf-view architectural refactor ✓ • 01-04 postmortem ✓) | 2026-04-27 |

</details>

### Phase v5h-01: Track-edit save-loss diagnosis + fix

Focus: Reproduce Daniel's flow in a kitchen-sink scenario (fresh setlist, no legacy tracks, edit key, simulate page-nav with cached pre-edit Firestore delivery via snapshot listener), capture production state with DevTools open (HUMAN-ACTION), pick fix shape from three candidates (A: writeback never fired → unconditional + verified; B: listener LWW underflow → guard against undefined local.updatedAt; C: serverTimestamp didn't resolve → switch to client-side Date.now()), ship fix with the regression test from 01-01 locking it, then postmortem the harness-fidelity gap.

Plans (planned per archived handoff `.paul/handoffs/archive/HANDOFF-2026-04-27-post-uat-v5h-and-v51.md`):
- **v5h-01-01 — Reproduce + diagnose** (research; autonomous=false; 1 HUMAN-ACTION checkpoint for production DevTools capture; 1 decision-checkpoint at end picking fix shape A/B/C). 3 tasks: (1) kitchen-sink reproduction harness in property-failures.test.ts; (2) HUMAN-ACTION production state capture in `.paul/postmortems/v50-07-save-loss-investigation.md`; (3) root-cause confirmation + fix-shape decision.
- **v5h-01-02 — Fix** (execute; ~2h; decision-checkpoint at start to confirm fix shape; regression test from 01-01 ships in this plan to lock the fix). After ship: push to prod, Daniel re-runs UAT scenario 1.
- **v5h-01-03 — Perf-view architectural refactor** (execute; ~6h with 3 failed iterations; final commit `92b1902`) — refactored `useSetlistPerformance` to read tracks from Dexie via `useLiveQuery` + mount snapshot-listener; embedded fallback retained ONLY for unhydrated legacy setlists; public-view short-circuit preserved. Daniel UAT 2026-04-27 confirmed instant editor→perf-view propagation. Replaced what was originally planned as the postmortem; 3 prior iterations (`f83d75d` reverted, `8971223` + `4aa6840` superseded) on Firestore subscription semantics all failed UAT before the architectural fix.
- **v5h-01-04 — Postmortem** (execute; ~30min; autonomous=true; docs only) — `.paul/postmortems/v5h-01-save-loss.md`: cutover-plan rules-audit gap proposal (gate to add to PAUL/CARL planning); kitchen-sink harness fidelity gaps named with remediation options (Firebase emulator + thin RTL editor↔perf-view test recommended); perf-view 4-iteration architectural-rethink lesson (`metadata.fromCache` is source not freshness; 2-3-strikes architectural-rethink rule); auth-claim staleness incident; Daniel-loop UAT cadence as v5.x norm; Issue 2 (iPad key-picker UI) routing rule.

Skills required: TBD — likely none (engine + harness work; same precedent as v50-06-01 + v50-07-04).

Sequencing post-close: Daniel re-runs UAT scenario 1 → if pass, advance to v5.1 (editor UX overhaul) → after v5.1 ships + Daniel re-confirms UAT smoke, run `/paul:audit-milestone` (or `/paul:plan-milestone-gaps`) to close v5.0.

## Active Milestone (Pending Close — Blocked on v5.0-hotfix)
**v5.0 — Bulletproof Editor (Local-First Rewrite)**
Status: 🟡 Pending UAT (all 7 phases shipped; close BLOCKED on v5.0-hotfix completing first, then v5.1 UX overhaul, then `/paul:audit-milestone`)
Phases: 7 of 7 complete
Theme: Rebuild the setlist editor on a local-first foundation, with sticky song memory and a spreadsheet-shaped UX, so saves are bulletproof by construction. Includes amputation of dead surfaces (AI chat, live-swap UI) up front.

Origin: Three compounding pain points surfaced post-gig — Rube Goldberg fragility, edits that don't save, and Sheets envy. Research (codebase blast radius + data-model split + Sheets-API feasibility + comparable-app survey) reframed the problem: the in-app editor concept is right; the *implementation* (optimistic-write + silent-fail save path, no song-level memory, dense non-spreadsheet-like UX) is what makes Sheets feel easier. Fix the editor at the foundation and the Sheets envy dissolves. Scope expanded post-discussion: amputate the unused AI chat assistant and the over-engineered live-swap UI surface (v3.0 + v4.0 redesigns) before rebuilding — replacement for "live swap" is just real-time setlist sync via the new sync engine.

Constraint: Band is **not** in production on this app right now (waiting for dependability), so a "broken-for-band" period during the rewrite is acceptable. No parallel-editor scaffolding, no feature flags, no always-green master required. Hard cutover is the strategy.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v50-01 | Architecture & design | 1/1 | ✅ Complete | 2026-04-26 |
| v50-02 | Dead-code amputation (chat + live-swap UI) | 1/1 | ✅ Complete | 2026-04-26 |
| v50-03 | Local-first sync engine | 1/1 | ✅ Complete | 2026-04-26 |
| v50-04 | Song catalog & sticky memory | 1/1 | ✅ Complete | 2026-04-26 |
| v50-05 | Spreadsheet editor UI (cutover) | 5/5 (01 build ✓ • 02 cutover ✓ • 03 multi-select+AlertDialog ✓ • 04 iPad+ContextMenu ✓ • 05 mobile+Undo+WCAG ✓) | ✅ Complete | 2026-04-26 |
| v50-06 | Concurrent-edit safety + offline + cross-tab | 3/3 (01 substrate ✓ • 02 modal ✓ • 03 cross-leader ✓) | ✅ Complete | 2026-04-26 |
| v50-07 | Migration, kitchen-sink, cutover | 5/5 (01 audit ✓ • 02 MARKER_PATH patch + liveState scrub ✓ • 03 lazy hydration + perf-view dual-read ✓ • 04 kitchen-sink fast-check ✓ • 05 Sentry + UAT plan + ship checklist ✓) | ✅ Complete | 2026-04-27 |

### Phase v50-01: Architecture & design

Focus: Sign-off doc — no code lands. Decisions to lock: local-first stack (Dexie + hand-rolled outbox vs. LiveStore vs. RxDB vs. TanStack Query Persister), spreadsheet editor stack (TanStack Table + custom cells vs. AG Grid community vs. hand-rolled), sync-engine state machine, song catalog schema with `defaults: { key, lead, bpm }` + rolling history, sticky-memory propagation rules, doc model in IDB (JSON blob vs. normalized rows; CRDT vs. last-writer-wins), migration script approach, UX mocks for spreadsheet editor, **amputation scope for v50-02**.
Plans: TBD (defined during /paul:plan)
Output: `.paul/phases/v50-01-architecture/ARCHITECTURE.md`

### Phase v50-02: Dead-code amputation (chat + live-swap UI)

Focus: Delete the AI chat assistant entirely (`ChatPanel.tsx` ~571 LOC + `chat-store.ts` + `/api/chat/*` + chat-prompt sanitization + chat tests + chat Firestore rules/data). Delete the live-swap UI surface entirely (`SwapPicker`, `SwapBottomSheet`, `SwapToast`, `SwapButton`, `/live/[id]` receiver, song-groups system + `liturgicalSlot` field, `canLiveSwap` permission + custom claim, related Firestore rules, swap-related Firestore-rule carve-outs, `swapTrack()` function callers). Verify zero `grep` hits for amputated symbols; full test suite green; `next build` passes. Performance view stays untouched (user: "good for now"); replacement for live swap is real-time setlist sync (lands in v50-03/v50-06, not built here). Estimated net deletion: ~3,000 LOC.
Plans: TBD

### Phase v50-03: Local-first sync engine ✓

Focus: IDB store + outbox queue + retry/dead-letter + truthful sync indicator (`Saving / Saved / Failed-with-retry / Queued`). Property-based tests for save reliability under random failure injection (network, auth, version-mismatch, force-quit). Built standalone — old editor unchanged, still on old write path until v50-05.

Outcome (2026-04-26): Dexie 4.4 + hand-rolled outbox + 6-state FSM + BroadcastChannel single-leader lock + fast-check no-data-loss harness. 39 new tests (1320/1320 total). Per-doc drain ordering invariant added (bug surfaced by the property harness itself: transient failure on row N could let row N+1 same-doc leapfrog on the server, violating LWW). Engine is fully standalone — zero imports from `src/components`, `src/hooks`, or `src/app`. Consumed by v50-05 (editor cutover) and v50-06 (concurrent-edit safety).
Plans:
- v50-03-01 ✓ (2026-04-26) — Dexie schema + atomic `applyEdit` + sync FSM + retry + cross-tab lock + property-based failure-injection harness. 3 tasks, 9 ACs, autonomous. Commits: `cb73dcc` (foundation) + `6cf34d7` (engine) + `0a94a9c` (property harness).

### Phase v50-04: Song catalog & sticky memory ✓

Focus: Promote `songs/{id}` to first-class with `defaults: { key, lead, bpm }` + rolling history. One-shot backfill script populates defaults from existing setlist data (most-recent occurrence wins). Add-song flow reads defaults; save-track flow writes back so edits travel with the song everywhere going forward. Persists until explicitly changed.

Outcome (2026-04-26): Dexie v→2 schema (additive `defaults` + `recent[]` cap 5 on songs; non-destructive v1→v2). Helper module `src/lib/songs/defaults.ts` exports `seedTrackFromSong` (read-through) + `propagateTrackEditToSong` (1s debounced, per-song independent timers, FIFO-cap-5, routes through `applyEdit('update','songs',...)` so the v50-03 sync engine carries it to Firestore). Migration script `scripts/migrate-v50.ts` with dry-run / apply / `--force` / `--rollback` / `--help`; abstract `MigrationFirestore` interface keeps tests admin-SDK-free; setlist-invariance sha256 hash check is the regression guard; per-song snapshots in `migrations/v50/snapshot/{songId}` enable rollback; `system/migrations/v50` marker enforces idempotency. Three atomic commits (`58d2725` + `d73e891` + `d13da61`); 25 new tests (3 schema + 9 helper + 13 migration); 1344/1345 total (1 pre-existing flake in cross-tab-lock unrelated, deferred to v50-06). Production migration apply itself deferred to v50-07 cutover. Zero changes to legacy editor surface; v50-05 imports the helpers from `@/lib/songs/defaults` and consumes directly.

Plans:
- v50-04-01 ✓ (2026-04-26) — Schema bump + helper module + migration script. 3 tasks, 7 ACs, autonomous. Commits: `58d2725` (Dexie v2) + `d73e891` (helpers) + `d13da61` (migration script).

### Phase v50-05: Spreadsheet editor UI (cutover)

Focus: Delete `use-setlist-logic.ts` (901 LOC), `setlist-flush.ts`, `setlist-draft.ts`, `SetlistEditorV2.tsx` + all editor modals, mutation API routes, broadcast-channel merge code (~8,400 LOC of editor surface). Build new app-native spreadsheet-shaped editor — tabular rows, click-cell inline editing, type-to-filter dropdowns on Key/Lead/Type, tab/enter navigation, drag-handle reorder, add-row at bottom auto-focuses. Wired to v50-03 sync engine + v50-04 song catalog. App is intentionally broken-for-band during this phase.

Multi-plan split (handoff guidance: "split into multiple plans if scope exceeds 3 tasks; vertical slices preferred"):
- **v50-05-01 ✓ (2026-04-26) — Build SetlistGrid (no cutover yet).** Booted SyncEngine + ProductionFirestoreAdapter into app shell via LazyClientComponents → next/dynamic ssr:false. Built SetlistGrid component tree end-to-end on TanStack Table v8 + dexie-react-hooks: read path (live query), 8 columns (drag/type/title/key/bpm/lead/notes/chart), cell editing (text + Radix Popover/cmdk dropdowns), drag-reorder via @dnd-kit, add-row from library with seedTrackFromSong + defaults, delete-row (Backspace + injectable confirm), continuous-add (Tab past last cell), sync indicator (6 FSM states + aria-live), empty state. 3 atomic commits (`96428b9` + `ef5c99d` + `f29c46c`); 29 new vitest cases; 1374/1374 total; tsc + next build clean. Legacy editor still serves the route. Implements §6.2/6.3/6.4/6.5/6.8/6.10. 3 tasks, 7 ACs.
- **v50-05-02 ✓ (2026-04-26) — Cutover landed.** Swapped `setlists/[id]/page.tsx` mount to `<SetlistGridHydrator>` (Option A: wrapper with initialServerData props; Hydrator primes Dexie idempotently via direct db.put inside one rw transaction — bypasses applyEdit since server data is authoritative). Wired `ChartCell` click → new `ChartBindPopover` (cmdk + library, modeled on AddRowPlaceholder's library half) → `applyEdit('update','tracks',{songId,title,...defaults})` with seedTrackFromSong defaults seeding. Deleted ~−6,300 LOC of legacy editor surface (use-setlist-logic 818 LOC + setlist-flush + setlist-draft + flush-schema + SetlistEditorV2 + 17 v2/ sub-components + their tests + /api/setlist/flush route + 2 orphan tests). Relocated SearchOverlay to `src/components/library/` (admin TemplateEditor non-editor consumer). Dropped orphaned matrix view feature. setlist-firebase.ts narrow was a NO-OP (StaleWriteError + updateSetlistWithVersion still consumed by useAddToSetlist). 4 atomic commits (`b8d8314` + `0584744` + `ba7e214` + `d8c0442`); 9 new vitest cases; 1315/1316 total (1 pre-existing cross-tab-lock flake → v50-06); tsc + next build clean. Net delta +14 / −6,306. Production smoke verification deferred to user. 3 tasks + 1 decision (Option A) + 1 human-verify (deferred). /ui-ux-pro-max invoked at APPLY start.
- **v50-05-03 ✓ (2026-04-26) — Multi-select / batch edit + AlertDialog swap-in.** §6.6 multi-select via Cmd/Shift-click on drag handle (anchor-aware extendRange + pruneTo for stale-row surgery) + sticky BatchActionBar (Type / Key / Lead / Delete; bulk applyEdit + per-songId propagation; selection preserved across bulk-set, cleared on bulk-delete). shadcn AlertDialog replaces window.confirm via `<DeleteConfirmProvider>` context wrapper at /setlists/[id]; SetlistGrid resolves confirmation via prop → context → window.confirm precedence. 3 tasks, 8 ACs, autonomous. Discovered + documented dnd-kit aria-pressed override pattern (place app-level ARIA AFTER `{...useSortable.attributes}` spread). 4 commits: `25b57ad` (PLAN) + `e26626c` (selection hook + drag-handle) + `ae0a8c3` (BatchActionBar) + `8acf7aa` (DeleteConfirmProvider). 1359/1360 vitest (+44 new cases); tsc + next build clean. /ui-ux-pro-max invoked at APPLY start.
- **v50-05-04 ✓ (2026-04-26) — iPad / pointer-coarse Sheet swap + right-click ContextMenu.** §6.7 implemented end-to-end. New `<TouchOrPopover>` wrapper (single integration point) picks Radix Popover (desktop) or Radix Sheet (touch) via `useMediaQuery('(pointer: coarse)')` — applied across 6 swap sites (DropdownCell covering KeyCell/LeadCell/TypeCell, AddRowPlaceholder, ChartBindPopover, BatchActionBar's BulkPopover). 44px-min touch targets via `[@media(pointer:coarse)]:` Tailwind classes (DropdownCell h-10→h-11, ChartCell h-10/w-10→h-11/w-11, AddRowPlaceholder h-11→h-12, drag column 44→52px, cell padding py-1→py-3 on coarse, ChartCell unbound contrast bumped on coarse). ChartBindPopover lifted to controllable open state (parent-controlled `open`+`onOpenChange` props with internal-state fallback) so SetlistGrid hoists `chartBindOpenRowId` and ContextMenu can open it programmatically. Radix ContextMenu wired into every SortableRow with 4 items (Edit row / Bind chart / Duplicate row / Delete row) + selection-aware action targeting: in-selection ≥ 2 → Delete routes to bulk via existing `handleBulkDelete` + "N rows selected" header + Edit/Bind/Duplicate disabled; out-of-selection → single-row Delete with quoted title. Duplicate row cascade-bumps existing orders ≥ newOrder via parallel `applyEdit('update')`, then `applyEdit('set')` for the clone (id + order replaced; songId / title / key / bpm / leadMusician / notes / type / setlistId carry through). Long-press for touch (500ms hold + 10px-squared movement threshold; touch-only branch — pointerType='mouse' skips entirely) re-emits a synthetic `contextmenu` MouseEvent on the `<tr>` (since @radix-ui/react-context-menu 2.2.16 has no controlled `open` prop). Global `window.matchMedia` stub via `vitest.config.ts setupFiles: ['./src/test-setup.ts']` (defaults `matches:false` = desktop branch). 4 commits: `a18736b` (chore PLAN) + `d4a9d96` (Task 1 TouchOrPopover + iPad swap + 44px) + `ded27dd` (Task 2 ContextMenu + long-press) + `35a055a` (Task 3 integration tests). 3 tasks, 8 ACs, autonomous. +17 new vitest cases (1377/1377 — cross-tab-lock pre-existing flake passed too); tsc + next build clean. `/ui-ux-pro-max` invoked at APPLY start.
- **v50-05-05 ✓ (2026-04-26) — Mobile stacked-card flow + Undo via zustand store + WCAG AA audit.** §6.11 mobile parallel render path keyed on `useMediaQuery('(max-width: 767px)')`: new `<MobileCardList>` renders `<ul>` of `<MobileRowCard>` cards (title + key + lead at rest, drag/select handle, chart-bound icon); tap card → `<MobileEditSheet>` (full-screen Radix Sheet with form fields for type/title/key/bpm/lead/notes + Move up/Move down/Bind chart/Delete row); long-press 500ms (touch only) → ContextMenu with selection-aware 4 items mirroring desktop. Mobile reorder via swap-orders applyEdit pair in the edit Sheet (drag-on-cards OUT for v1). SetlistGrid renders MobileCardList XOR table conditionally; BatchActionBar + AddRowPlaceholder shared across both render paths. Mobile-only top-level ChartBindPopover with sr-only anchor span (display:none breaks Radix anchoring; sheet positions to viewport bottom regardless on touch). Undo via plain zustand store (NOT zundo — temporal middleware's wrong granularity for per-cell-blur snapshots): new `src/lib/local/undo-store.ts` with manual pushEntry / popUndo / popRedo + per-key burst coalescing (UNDO_BURST_MS=500ms; first-prev wins, latest-new wins on same-key writes) + cap UNDO_MAX_ENTRIES=50; module-scoped pendingBursts Map outside zustand state. applyEdit augmented with `ApplyEditOptions` (`withoutUndo` + `undoKey`); reads prevDoc BEFORE transaction, pushes snapshot AFTER commit (failed writes leave no phantom entries). update ops route through pushEntryDebounced; set + delete push immediately. Composite-undo wiring for handleBulkSet / handleBulkDelete / handleContextDuplicate / handleDragEnd — each handler snapshots prevDocs first, fires applyEdit({withoutUndo:true}) cascade, reads newDocs, pushes ONE composite entry. Cmd-Z + Cmd-Shift-Z handler at SetlistGrid root with INPUT/TEXTAREA/SELECT/contenteditable skip per v4.2 P2-04 precedent; flushAllBursts before popUndo so in-flight cell edits land first; Cmd-Y supported as redo alias. WCAG AA audit (§6.13) via jest-axe + axe-core devDeps: 7 axe scan cases (rest grid, AddRowPlaceholder open, AlertDialog single, AlertDialog bulk, ChartBindPopover open, BatchActionBar mounted, ContextMenu open) + 1 keyboard Tab-order case; axeOpts disables 5 harness-context false-positive rules (region/landmark-one-main/page-has-heading-one + aria-required-children/parent for grid role); ZERO violations on first run — design system internalized correctly across all of v50-05. Manual Lighthouse on prod /setlists/[id] deferred to user smoke (deferred-smokes #7). 4 commits: `b23fae1` (chore PLAN) + `3e19bf0` (Task 1 mobile flow) + `2260a21` (Task 2 Undo + Cmd-Z) + `e2f1daa` (Task 3 a11y). 3 tasks, 8 ACs, autonomous. +33 new vitest cases (1410/1410 — cross-tab-lock pre-existing flake passed too); tsc + next build clean. New devDeps: jest-axe ^10.0.0 + @types/jest-axe ^3.5.9 + axe-core ^4.11.3. zundo NOT added (planned inline at PLAN-write, confirmed at apply-time — plain zustand was the right shape).

**Phase v50-05 outcome (2026-04-26):** Spreadsheet editor UI cutover end-to-end across 5 plans. Production /setlists/[id] serves desktop (TanStack Table v8 + cmdk dropdowns + dnd-kit reorder), iPad (Sheet swap on `(pointer: coarse)` + 44px touch targets + ContextMenu via right-click + 500ms long-press), and phone (parallel stacked-card render path + per-card edit Sheet + selection-aware long-press menu). Multi-select + bulk edit via BatchActionBar; window.confirm replaced by shadcn AlertDialog via DeleteConfirmProvider; song catalog + sticky memory wired via v50-04 helpers; sync engine (v50-03) carries every write to Firestore with LWW per-doc invariant + 6-state FSM + cross-tab single-leader lock; Cmd-Z undo with per-cell-blur burst coalescing + composite entries for multi-row actions; jest-axe ZERO violations across 7 mounted-and-interactive states. App intentionally broken-for-band during cutover per milestone constraint (band not in production). Net delivery across phase: ~+13,000 / −6,300 LOC; +159 vitest cases (1218 → 1410); zero production regressions; /ui-ux-pro-max invoked at every APPLY per SPECIAL-FLOWS.md mandate.

Deferred (out of v50-05 — sent to v50-06+):
- §6.9 reconciliation modal + expectedUpdatedAt tracking + cross-tab-lock flake fix → v50-06 (concurrent-edit safety phase)
- Cross-leader live-edit visibility (real-time setlist sync replacement for deleted live-swap UI) → v50-06
- Production migrate-v50.ts apply (split-brain: legacy embedded `setlists/{id}.tracks[]` + new top-level `tracks/{id}` docs) → v50-07
- Production smoke verification of v50-05-02 cutover → user backlog (deferred-smokes #4)

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of every v50-05 plan)

### Phase v50-06: Concurrent-edit safety + offline + cross-tab

Focus: "Remote changed — keep mine / take theirs" reconciliation banner via local-first IDB diff. Two-tab edit scenarios pass. Airplane-mode tests pass. Performance view audit: read-only on the new doc shape; verify that real-time setlist sync (= the v3.0 "live swap" replacement) works correctly when the leader edits during a service.

Plans (3-plan vertical-slice split per handoff guidance; revisable at PLAN time):
- **v50-06-01 ✓ (2026-04-26) — Substrate stabilization.** Cross-tab-lock test deflaked (30/30 deterministic; root cause = brittle "lower tabId wins" assertion fired on sequential tryAcquire — fix added deferred-delivery FakeChannelHub variant so the actual tie-break race is testable; 50-iter stress loops for both invariants; production cross-tab-lock.ts UNTOUCHED). FirestoreAdapter contract extended: `commitOutboxRow → Promise<CommitResult{updatedAt?}>`; ProductionFirestoreAdapter re-reads doc post-commit (one extra getDoc per write) to surface server timestamp; engine writes new updatedAt back to local row inside the SAME Dexie rw tx that deletes the outbox row (atomic, with `if(existing)` guard for mid-flight deletes; delete ops skip writeback). LocalTrack + LocalSong gained explicit `updatedAt?: number` (was hidden behind index sig). expectedUpdatedAt threaded through every track-update applyEdit call site: 7 cell-commit sites + handleDeleteRow + handleBindChart + handleBulkSet + handleBulkDelete + handleContextDuplicate cascade + handleDragEnd + 4 MobileCardList move ops + executeEntry undo/redo (reads LIVE updatedAt at undo-time, NOT snapshot-time, so undo races a remote write surface as VersionMismatch in v50-06-02). New 'two-writer race' describe block in property-failures harness: SharedRemote + TwoWriterAdapter + per-engine LocalDb + distinct lock channels → exactly one write succeeds, loser's outbox row in 'failed' status with localId addressable for resolveConflict('mine'|'theirs'), engine state 'conflict', loser's local row preserved. 4 commits: `9ca4943` (chore PLAN), `5736599` (Task 1 deflake), `0ce9bd2` (Task 2 substrate), `edfc339` (Task 3 race test) + close commit. Suite 1418/1418 (+8 from 1410); tsc + next build clean. 3 tasks, 6 ACs, autonomous, backend/test only — `/ui-ux-pro-max` NOT required for this plan.
- **v50-06-02 ✓ (2026-04-26) — Reconciliation modal (§6.9).** ReconciliationProvider mounted inside DeleteConfirmProvider at /setlists/[id] (both isNew + persisted branches); subscribes to engine 'conflict' state via `useSyncStatus` + reads `failed`-status outbox rows via `useLiveQuery`; auto-opens on conflict transition with user-dismissable Cancel/Esc semantics; SyncIndicator's "Conflict — review" action button re-opens dismissed modal via `useReconciliationModalOptional` (fail-soft hook mirroring `useDeleteConfirmOptional`). FirestoreAdapter interface extended with `readDoc(collection, docId) → RemoteDocSnapshot|null`; ProductionFirestoreAdapter implements via `getDoc` + `Timestamp.toMillis()`; `init.ts` tracks `adapterSingleton` alongside engine + exports `getSyncAdapter()` so the provider reads remote diffs without reaching into engine internals. Per-row card renders title from local Dexie tracks (title|name lookup) + per-field DIFF (informational; filtered by DIFF_HIDDEN_FIELDS = {id, setlistId, order, createdAt, updatedAt}; PRETTY_FIELD map for display) + per-row "Keep mine / Take theirs" radio defaulting to 'theirs' (safe default per §6.9 — user opts in to overwrite remote). "Resolve all and save" iterates `engine.resolveConflict(localId, choice, { newExpectedUpdatedAt })` sequentially with newExpectedUpdatedAt sourced from cached RemoteDocSnapshot when choice='mine'. Granularity decision: per-row UX, NOT per-field (matches substrate API; per-field would require new engine surface OR UI-side merge plumbing — deferred to v50-06-03+ if real-world conflict patterns demand granular merge). Property-failures harness extended with `setupTwoWriterRace` helper + 'mine' branch test (asserts post-resolve outbox empty + remote holds loser's payload + remote.updatedAt > winner's) + 'theirs' branch test (asserts remote unchanged + loser local row preserved at baseline) — 5/5 deterministic. ReconciliationProvider component test (~420 LOC, 11 cases) covers AC-1/2/3-mine/3-theirs/4-cancel/4-esc/sequential-iteration + 3 jest-axe scans (closed/1-conflict/3-conflict; reused v50-05-05 axeOpts) — ZERO violations on first run. Plain HTML radios over `@radix-ui/react-radio-group` (no new dep; native a11y semantics). Test-seam props (`adapter` + `onResolveConflict`) bypass init.ts singletons; `useSyncStatus` mocked at module scope. 4 commits: `0278e0f` (chore PLAN), `6c9662b` (Task 1 substrate + provider), `51a4298` (Task 2 property-failures branches), `43fefaf` (Task 3 component + jest-axe). 3 tasks, 7 ACs, autonomous: false (1 decision checkpoint + 1 human-verify deferred to deferred-smokes #8 per existing pattern). Suite 1431/1431 (+13 from 1418); tsc + next build clean. `/ui-ux-pro-max` invoked at APPLY entry per SPECIAL-FLOWS.md.
- **v50-06-03 ✓ (2026-04-26) — Cross-leader live-edit + airplane-mode + performance view audit.** Phase v50-06 closes 3/3. New `src/lib/sync/snapshot-listener.ts` (~180 LOC) exports `startSnapshotListener({ setlistId, db })` returning unsubscribe — subscribes to `setlists/{id}` + `tracks where setlistId == X` via firebase/firestore onSnapshot; writes deliveries directly into Dexie via `db.{setlists,tracks}.put` (NOT applyEdit — server-authoritative; mirrors SetlistGridHydrator's idempotent priming pattern). Two safety guards: (1) outbox-pending guard — any outbox row for the docId means a local edit is in flight, skip both put and delete; (2) LWW guard — only put if `remote.updatedAt > local.updatedAt`. Listener errors swallowed + warn-logged; never throws out of callbacks (engine drain remains source of truth). Mounted in SetlistGridHydrator post-hydration via `useEffect`; new `startSnapshotListener` prop test-seam. Test-seam SnapshotSubscriber interface (subscribeSetlist + subscribeTracks) lets unit tests inject hand-rolled fakes — production wires to firebase/firestore in a 30-line factory inside the same module. Property-failures harness extended with two new describe blocks: "passive listener closes the 'theirs' staleness gap" (SharedRemoteSubscriber re-emits SharedRemote tracks state via the test-seam; loser's local row matches remote after listener delivery; ZERO outbox rows created — engine drain remains the only path to 'conflict' state) + "sequential offline edits queue and drain in order" (OfflineToggleAdapter throws NetworkError while online=false; 5 sequential outbox rows queue offline; manual onlineListener harness drives FSM transition out of 'offline' on reconnect; per-doc drain ordering invariant from v50-03 validated end-to-end — adapter.writes carry keys F→G→A→B→C in order; final remote.tracks.t1.key === 'C'; engine state quiesces to 'idle'; 5/5 deterministic). Block B drops expectedUpdatedAt threading from PLAN AC-5 — single-writer offline sequential edits with threaded preconditions self-conflict on reconnect (rows 2..N's baseline=initial, server=ts1, → VersionMismatch); test isolates per-doc ordering invariant from that gap; documented + routed forward as additive plan if real-world airplane-mode patterns demand fixing. Performance-view audit landed Outcome 2: `useSetlistPerformance` reads legacy `setlists/{id}.tracks[]` embedded array via `useSafeFirestoreSync`; v50-05-01 writes top-level `tracks/{id}` collection; production data is split-brain; routed forward to v50-07 as explicit deliverable (not "nice-to-have"). 4 commits: `50f34b5` (chore PLAN), `21d0945` (Task 1 listener+tests), `19f38b9` (Task 2 harness), `1e1fe3c` (Task 3 hydrator mount + audit). 3 tasks, 7 ACs, autonomous=true. +11 new vitest cases (1442/1442 from 1431); tsc + next build clean. /ui-ux-pro-max optional for this plan — no UI surface modified (data-layer wiring + read-only audit + tests).

**Phase v50-06 outcome (2026-04-26):** Concurrent-edit safety + offline + cross-tab end-to-end across 3 plans. The bulletproof loop is now whole: substrate (v50-06-01: atomic writes; CommitResult{updatedAt?}; expectedUpdatedAt threading; cross-tab-lock determinism) + conflict UX (v50-06-02: ReconciliationProvider; per-row "Keep mine / Take theirs"; FirestoreAdapter.readDoc) + cross-leader visibility (v50-06-03: startSnapshotListener; passive 'theirs' rehydration; per-doc drain ordering under offline scenario). No silent paths remain in either the write OR the read direction. Net delivery across phase: ~+750 LOC; +27 vitest cases (1410 → 1442); zero new dependencies; zero engine API changes after v50-06-02. /ui-ux-pro-max invoked at v50-06-02 APPLY entry per SPECIAL-FLOWS.md mandate; optional in v50-06-03 per audit-driven scope.

Deferred (out of v50-06 — sent to v50-07):
- Performance-view bridge to top-level `tracks/{id}` collection (audit Outcome 2 routed forward as explicit deliverable).
- Production migrate-v50.ts apply (existing v50-04 deferral — must run before perf-view bridge ships, since it reshapes legacy `setlists/{id}.tracks[]` arrays into the top-level collection).
- Playwright kitchen-sink suite (random edits + airplane-mode toggles + force-quits + cross-tab edits = zero data loss across N runs).
- Sentry alarms on save-path failures.
- Manual UAT with Rabbi Daniel + one band member.
- Single-writer offline self-conflict gap (additive plan if real-world airplane-mode patterns demand fixing).

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of v50-06-02 only; optional in v50-06-01 and v50-06-03 — backend / data-layer / test concerns dominated those plans)

### Phase v50-07: Migration, kitchen-sink, cutover

Focus: Bring the v5.0 editor into contact with historical production data (24 legacy setlists, 650 embedded tracks). After v50-07-01 audit revealed the legacy shape diverges substantially from v5.0 expectations (no songId references; songs/* empty; liveState orphans on 10 setlists; pre-existing MARKER_PATH bug in migrate-v50.ts), user selected **Option C: Hybrid Lazy Hydration** — old setlists migrate on first edit-open via SetlistGridHydrator; perf-view dual-reads legacy + top-level. Then Playwright kitchen-sink (random edits + airplane-mode + force-quits + cross-tab; zero data loss across ≥100 runs), Sentry alarms on save-path failures, and manual UAT with Rabbi Daniel + band member. Ship to band.

Plans (running scope; revisable):
- **v50-07-01 ✓ (2026-04-27) — Production audit + dry-run report.** New `scripts/audit-v50.ts` (~340 LOC, read-only; no writes). Findings: 29 setlists, 24 with embedded tracks (650 total), 0 distinct songIds (legacy uses `id`/`fileId` not `songId`), `songs/*` empty (0), top-level `tracks/*` empty (0; v5.0 editor unused in prod), 10 setlists carry `liveState` orphan, chats/songGroups/config already clean. 🐛 Pre-existing bug: `migrate-v50.ts MARKER_PATH = 'system/migrations/v50'` is 3-segment collection (not doc); never surfaced because tests use a fake adapter. Recommendation block presented three scope shapes; user selected Option C. 2 commits + close commit. 3 tasks, 7 ACs, autonomous=false (1 HUMAN-VERIFY gate). Suite 1442/1442; tsc + next build clean.
- **v50-07-02 ✓ (2026-04-27) — MARKER_PATH patch + liveState scrub.** Patched migrate-v50.ts MARKER_PATH from `system/migrations/v50` → `system/v50Migration` (2-seg doc); 13 existing migrate-v50 tests still pass after fixture updates. New `scripts/scrub-livestate.ts` (~250 LOC, dry-run by default) reuses MigrationFirestore + FIELD_DELETE_SENTINEL; modes dry-run / apply / rollback / force / help; per-setlist snapshots to `migrations/livestate-scrub/snapshot/{setlistId}` (4-seg doc) before each FieldValue.delete; marker at `system/livestateScrub` for idempotency. 14 unit tests on in-memory FakeFirestore (mirrors migrate-v50.test.ts). Production scrub applied: 10 setlists' `liveState` removed; re-audit confirms liveState count = 0; setlist count unchanged at 29; embedded tracks unchanged at 650. 3 tasks, 7 ACs, autonomous=true. /ui-ux-pro-max NOT required (no UI surface). Suite 1456/1456 (+14); tsc + next build clean.
- **v50-07-03 ✓ (2026-04-27) — Lazy hydration in `SetlistGridHydrator` + perf-view dual-read.** `LocalSetlist.hydrated?: boolean` added (additive non-indexed schema bump). Hydrator gained a fire-once-per-mount lazy-hydration effect after Dexie priming, gated on `hydration === 'done' && !initialSetlist.hydrated && initialTracks.length > 0`: fans out `applyEdit({op:'set', collection:'tracks', doc:t}, {withoutUndo:true})` for every legacy embedded track via Promise.all, then `applyEdit({op:'update', collection:'setlists', docId, patch:{hydrated:true}, expectedUpdatedAt:initialSetlist.updatedAt}, {withoutUndo:true})` after fan-out succeeds. Errors warn-log via `@/lib/logger`; setlist stays unhydrated and retries on next mount. `applyEdit` exposed as a test-seam prop (parallels `startSnapshotListener`); `fanoutStartedRef` survives re-renders. `useSetlistPerformance` dual-reads via `onSnapshot(query(collection(db,'tracks'), where('setlistId','==',setlistId)))`: prefers top-level when length > 0 (sorted by `order` ascending), falls back to `setlistData?.tracks` so 24 not-yet-hydrated legacy setlists keep rendering. No external API or Firestore index changes (single-field setlistId; ≤650 docs total). Tests: SetlistGridHydrator +5 cases (lazy fan-out + skip-already-hydrated + skip-empty + fan-out-failure + fire-once-on-rerender); useSetlistPerformance +4 cases (fallback-empty + prefer-top-level-sorted + live-update + cleanup-unsubscribe); 2 pre-existing priming-only tests marked `hydrated:true` (semantically post-migration). 1 commit (`60de2ff`) covering all 3 tasks (cohesive vertical slice). 3 tasks, 7 ACs, autonomous=true. Suite 1465/1465 (+9 from 1456); tsc + next build clean. `/ui-ux-pro-max` invoked at APPLY entry per SPECIAL-FLOWS.md (brief load — data-correctness, no new pixels).
- **v50-07-04 ✓ (2026-04-27) — Kitchen-sink fast-check property + OfflineToggleAdapter lift.** Decision (Task 0): harness-only — Playwright spec skipped (the v50-06 harness already proves every bulletproof claim a Playwright spec would prove; v50-07-05 manual UAT against real production is the actual end-to-end gate; AC-4 marked N/A; ~200 LOC of mock-Firebase Playwright infra avoided). New `v50-07-04: kitchen-sink under random failure mix` describe in `src/lib/sync/__tests__/property-failures.test.ts`: KitchenSinkAdapter (SharedRemote + online toggle + expectedUpdatedAt precondition combining OfflineToggleAdapter + TwoWriterAdapter shapes), KSAction grammar (edit-set/update/delete + toggle-online + force-quit + cross-tab via direct SharedRemote mutation simulating "another tab pushed an edit" + lazy-hydrate mirroring SetlistGridHydrator's Promise.all fan-out + final update({hydrated:true}) + tick), runKitchenSink with 4 invariants (AC-9 no-data-loss + per-doc drain ordering + no orphaned 'sending' + lazy-hydration idempotency). fast-check property: 50 CI iterations / 10 local with 8s per-iteration safety timeout via Promise.race so runaway shapes shrink to a counterexample instead of timing out the entire test (downgraded to 50 CI iterations from PLAN's "≥100" — fits 22.5s test / 25.6s wall under the 60s budget; documented scope reduction). 2 deterministic regressions (lazy-hydration cascade idempotency across re-mounts; cross-tab edit + local update surfaces VersionMismatch as observable failed row). OfflineToggleAdapter lifted from inside the v50-06-03 describe to module scope (the only sensible reuse target — setupTwoWriterRace + SharedRemoteSubscriber too scenario-specific to lift); v50-06-03 still 10/10 against the lifted adapter. New `npm run test:kitchensink` script for ergonomic local re-runs. Mid-build deviation: clock.advance in the quiesce loop ran away under repeated VersionMismatch retry storms (fast-check shrunk a 4-op counterexample: lazy-hydrate s1+t1 + edit-delete tracks/t1 + edit-update setlists/s1 + edit-delete setlists/s1) — replaced clock.advance with bare pump() loop; failed/pending rows still observable in outbox satisfies AC-9 either way; pattern documented for future tests. 3 commits: `b296ab1` (PLAN), `47ae779` (Tasks 1+3; Task 2 skipped per Task 0), `7ea19a6` (STATE chore). 3 tasks + 1 decision checkpoint resolved (autonomous=false → harness-only); 6/7 ACs met (AC-4 N/A). Suite 1468/1468 (+3 from 1465); tsc + next build clean. /ui-ux-pro-max NOT required (test infra; same precedent as v50-06-01 + v50-07-02).
- **v50-07-05 ✓ (2026-04-27) — Sentry alarms + UAT plan + ship checklist (FINAL plan in v5.0).** New `src/lib/sync/sentry-capture.ts` helper exports `captureSyncFailure(err, context)` centralizing tag/level/extra across all v5.0 substrate captures: wraps @sentry/nextjs `Sentry.captureException` with try/catch (telemetry NEVER crashes engine if SDK uninitialized or transport-failed), tags string-coerced (Sentry indexer requires strings), undefined/null context fields dropped from tags (no "undefined" leak), level mapping (dead-letter + write-atomicity → 'error'; lazy-hydration + snapshot-listener → 'warning'). Wired at 6 silent-failure sites: SetlistGridHydrator lazy-hydration catch (after existing logger.warn; passes setlistId + trackCount; warning) + engine.ts dead-letter transition BEFORE existing dispatch('DRAIN_BUDGET_EXHAUSTED') (passes collection + docId + op + attempts; error) + 4 snapshot-listener swallow paths (setlist-apply / tracks-apply / setlist-subscribe / tracks-subscribe; warning; site tag flows through). Per-feature explicit non-capture: 'conflict' state (user-facing UX, reconciliation modal IS the response), per-attempt drain failures (only dead-letter — alert fatigue), payload contents (PII discipline — only stable identifiers reach Sentry). 6 unit tests prove tag/level/extra/no-throw/coercion/undefined-drop. UAT-PLAN.md ships at `.paul/phases/v50-07-migration-cutover/v50-07-05-UAT-PLAN.md`: 15-item Day-1 smoke checklist + 7 weekly-workflow scenarios (clone+tweak / add song / bind chart / transpose perf-view / mobile flow / historical legacy lazy-hydration / two-leader cross-tab race) each with setup/steps/expected/pass/if-fail + coverage map mapping scenarios to v50-XX phases + invariants + out-of-scope folding deferred-smokes #4 + #7. SHIP-CHECKLIST.md ships at `.paul/phases/v50-07-migration-cutover/v50-07-05-SHIP-CHECKLIST.md`: 8-step deploy verification + 1-page band onboarding doc (plain English; sync indicator states named in user terms not engine FSM names; "Move to public help system in v5.1" note at bottom) + first-week Sentry monitoring playbook (alert tag → meaning → severity → response table for all 4 features wired + placeholder for write-atomicity; recommended dashboard saved-view filter; rollback via git revert + push; explicit list of NOT-captured events). 3 tasks, 8 ACs, autonomous=true; zero deviations. 3 commits: `b2cbb16` (PLAN), `9987bc5` (Tasks 1+2+3 cohesive vertical slice), `bdd0e1b` (STATE). Suite 1474/1474 (+6 from 1468); tsc + next build clean. Pushed to origin master; Vercel auto-deploys. /ui-ux-pro-max NOT required (observability + docs; same precedent as v50-06-01 + v50-07-02 + v50-07-04). v5.0 milestone close gated on UAT execution post-plan (Rabbi Daniel + one band member over 1–2 weekly cycles), then `/paul:audit-milestone` closes v5.0.

**Phase v50-07 outcome (2026-04-27):** Migration + cutover end-to-end across 5 plans. Production audit (v50-07-01) → MARKER_PATH patch + liveState scrub (v50-07-02) → Option C Hybrid lazy hydration in SetlistGridHydrator + perf-view dual-read (v50-07-03) → kitchen-sink fast-check property at the harness layer (v50-07-04) → Sentry observability + UAT plan + ship checklist (v50-07-05). 24 legacy setlists primed for first-edit-open silent migration; 10 setlists' liveState scrubbed with rollback snapshots in place; bulletproof loop now both proven (harness) and observable (Sentry). Net delivery: ~+2,400 LOC (audit + scrub + lazy-hydration + perf-view dual-read + kitchen-sink + sentry-capture + 6 capture sites + 2 milestone-close docs); +52 vitest cases (1442 → 1474); zero engine FSM / adapter interface / Dexie schema / Firestore rules changes after v50-06-02. /ui-ux-pro-max NOT required for any v50-07 plan beyond v50-07-03 (the UI-data-bridge plan); v50-07-01 + 02 + 04 + 05 were script work / test infra / observability / docs.

Deferred (out of v50-07 — sent to v5.1 if real-world UAT surfaces them):
- Single-writer offline self-conflict gap (v50-06-03 Block B SUMMARY documents the test isolation; UAT scenario 5 mobile + flaky-wifi may surface real-world need)
- Public help system migration of the band onboarding doc (drafted in `.paul/`; should relocate when public help system exists)
- Legacy `setlists/{id}.tracks[]` array cleanup post-hydration (preserved as backup per v50-07-03 SCOPE LIMITS; cleanup is its own future plan if needed)
- songs/* + songId backfill on legacy tracks (carried from v50-07-03; sticky-memory benefits only kick in for new chart-binds via ChartBindPopover from now on)

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of v50-07-03 only; v50-07-01 + 02 + 04 + 05 are backend / scripts / test infra / observability / docs)

Skills required: /ui-ux-pro-max (BLOCKING for APPLY of v50-07-03 only; v50-07-01 + v50-07-02 are backend/script work)

## Previous Milestone
**v4.5 Unloseable Live-Ops**
Status: 🟡 Superseded by v5.0 (2 of 8 phases shipped; 6 cancelled)
Completed: Partial — 2026-04-20

Rationale: v4.5's pending phases (IDB draft journal, sync engine, conflict surface redesign, save observability UI, toolbar priority, deferred v4.4 polish) all targeted the save-path machinery that v5.0 deletes. Finishing them is wasted work. Two shipped phases (observability + library cache) remain on master and provide standalone value regardless of the editor rewrite.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| v45-01 | Save-path observability | 1/1 | ✅ Complete | 2026-04-20 |
| v45-02 | IndexedDB draft journal | - | ❌ Cancelled — superseded by v50-02 | - |
| v45-03 | Sync engine | - | ❌ Cancelled — superseded by v50-02 | - |
| v45-04 | Conflict surface redesign | - | ❌ Cancelled — superseded by v50-05 | - |
| v45-05 | Save observability UI | - | ❌ Cancelled — superseded by v50-02 | - |
| v45-06 | Performance toolbar priority system | - | ❌ Cancelled — out of scope for v5.0 | - |
| v45-07 | Library cache invalidation on upload | 1/1 | ✅ Complete | 2026-04-20 |
| v45-08 | Deferred v4.4 polish (reconciled) | - | ❌ Cancelled — orphaned | - |

### Phase v45-01: Save-path observability ✓

Focus: Logged every silent-return path in the save pipeline via v4.4 request-ID telemetry — `StaleWriteError`, keepalive flush non-2xx, `canEdit=false` early-return, token refresh failure. Each incident now leaves a server-side trace.

### Phase v45-07: Library cache invalidation on upload ✓

Focus: Upload completion broadcasts `library:invalidate` on BroadcastChannel. Library store, setlist picker, chat file search all subscribe and refetch on signal.

## Previous Milestone
**v4.4 Deferred Audit Sweep — Architectural Polish**
Status: ✅ Complete
Completed: 2026-04-15
Phases: 5 of 8 shipped (3 deferred to v4.5)
Archive: `.paul/milestones/v4.4-ROADMAP.md`

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 0 | Full-project audit (R1+R2, 186 findings) | done | ✅ Complete | 2026-04-15 |
| 1 | Data-layer atomicity — scheduling transactions | 1/1 | ✅ Complete | 2026-04-15 |
| 2 | Denormalization reconciliation — DL-010 | 1/1 | ✅ Complete | 2026-04-15 |
| 3 | Client async safety — AbortController sweep | 1/1 | ✅ Complete | 2026-04-15 |
| 4 | File-size refactor — 5 files >600 LOC | - | 🕓 Deferred to v4.5 | - |
| 5 | Observability — request IDs + SSE status | 1/1 | ✅ Complete | 2026-04-15 |
| 6 | Modal state hygiene — 4 modals with state-reset bugs | 1/1 | ✅ Complete | 2026-04-15 |
| 7 | Type-safety tail | - | 🕓 Deferred to v4.5 | - |
| 8 | Perf tail | - | 🕓 Deferred to v4.5 | - |

**Outcome:** All P0/P1 audit findings closed; all R2B "must fix before release" items closed; band-onboarding UX gate cleared.

## Earlier Milestone
**v4.3 Deep Audit Remediation**
Status: ✅ Complete
Completed: 2026-04-15
Phases: 10 (original 9 + Phase 10 auth deep-dive added mid-cycle)
Goal: Close the P0/P1 gaps surfaced by the v4.3 Phase 1 recursive audit (83 findings) + the role-claim-sync latent bug surfaced during 04-03 rollout before the band onboards.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Recursive Audit (bugs/security/UX/data/perf/dead-code) | 1/1 | ✅ Complete | 2026-04-14 |
| 2 | P0 Security Triage (S01 chat prompt injection, S03 drive-file auth) | 2/2 | ✅ Complete | 2026-04-14 |
| 3 | Bridge Credentials Design (S02 — CRIT-003) | 2/2 | ✅ Complete | 2026-04-14 |
| 4 | P0 Data Integrity (D01 orphan cascade, D02 .passthrough, D03 assign race) | 3/3 | ✅ Complete | 2026-04-14 |
| 5 | P0 Bugs + UX (B01 silent catches, B02 alert-store, U01 touch, U02 keyboard) | 4/4 | ✅ Complete | 2026-04-14 |
| 6 | P1 Security + Bugs (S04 QR role gate, S05 schema wontfix, S06 wontfix, B03 monitor race, B06 swapTrack guard; B04/B05 false positive on review) | 2/2 | ✅ Complete | 2026-04-15 |
| 7 | P1 Data sweep (D05 eventDate shape; D04 auto-indexed, false positive) | 1/1 | ✅ Complete | 2026-04-15 |
| 8 | Performance + Dead-Code Sweep (P01-P05, C01-C04) | 0/TBD | ⏭️ Deferred to v4.4 | - |
| 9 | Role-Claim Sync (latent auth bug surfaced during 04-03) | 2/2 | ✅ Complete | 2026-04-15 |
| 10 | Auth Deep-Dive Hardening (added mid-cycle) | 6/6 | ✅ Complete | 2026-04-15 |

### Phase 1: Recursive Audit ✓
Deliverable: `.paul/phases/v43-01-recursive-research/FINDINGS.md`
6 parallel deep-audit agents → 83 raw findings synthesized into 10 P0 + ~20 P1 + balance P2. Prioritized action list and phase split drafted.

### Phase 10 (added mid-cycle): Auth Deep-Dive Hardening
After a recurring `/setlists ↔ /login` regression surfaced the architectural fragility of the auth flow, ran a fresh 2-wave 4-agents-each recursive research pass (WAVE-1A/B/C/D + WAVE-2A/B/C/D) producing FINDINGS + FINDINGS-v2. Shipped 6 plans: 10-01 fail-fast env + initAdmin guards + bounce-cookie path, 10-02 cold-load race kill (router.refresh after cookie + cold-load mount refresh + login UX), 10-03 drift-repair module with 3× retry + `[drift]` telemetry, 10-04 restore Firestore isMember() gate on setlists, 10-05 Playwright smoke + CI job, 10-06 cross-tab sign-out via BroadcastChannel.

## Previous Milestone
**v4.2 UX Polish & Band Onboarding**
Status: ✅ Complete
Completed: 2026-04-14
Phases: 8

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Recursive Research (Bugs/Gaps/Failures) | 1/1 | 2026-04-13 |
| 1.1 | Concurrent-edit Safety | 1/1 | 2026-04-13 |
| 1.2 | Offline Truthiness | 1/1 | 2026-04-13 |
| 1.3 | Security Hardening | 1/1 | 2026-04-13 |
| 2 | Weekly Workflow Polish | 4/4 | 2026-04-13 |
| 3 | Stage UX for the Band | 4/4 | 2026-04-14 |
| 4 | Editor Ergonomics + Noise Cleanup | 6/6 + audit | 2026-04-14 |
| 5 | Navigation + Schedule Hygiene | 2/2 + audit | 2026-04-14 |

Focus: Deep app hardening pre-band-onboarding. Multi-wave audit → 53+ findings → 7 execution phases. Concurrent-edit safety via Firestore runTransaction + rev precondition. Offline truthiness via IndexedDB blob store (Cache-API pretense removed). Security hardening (storage.rules in VC, 10-char bridge setup-code, rate limits). Weekly-workflow polish (save-reliability flush route, single-step wizard, role-aware dashboard). Stage UX (per-track transposition display, amber cue-notes, IDB-backed offline indicator, SwapPicker keyboard/iOS polish, PDFOverlay ErrorBoundary). Editor cleanup (canEditSetlist helper, apiFetch timeout + PDFViewer abort, role-aware OnboardingCard, toast hygiene, Move-Up/Down buttons, triple-modal audit). Navigation hygiene (mobile Schedule tab, UnifiedCalendar cleanup, dead musician_availability indexes dropped, orphan /settings routes removed, SetlistDrawer + monitor-live audited-live).

## Previous Milestone
**v4.1 Kill Private Setlists (for real this time)**
Status: Complete
Completed: 2026-04-13
Phases: 1

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Kill Private Setlists | 1/1 | Complete | 2026-04-13 |

### Phase 1: Kill Private Setlists

Focus: Finished what v4.0 Phase 2 started. Removed `isPublic` from the type, schema, service signature, and every caller. One-shot Firestore migration stripped the field from 25 of 26 existing setlist docs (idempotent). Removed lingering UI affordances. Added a regression-guard test.

## Previous Milestone
**v4.0 Live Swap Redesign**
Status: Complete
Completed: 2026-04-04
Phases: 3

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Teardown Old Live System | 1/1 | Complete | 2026-04-04 |
| 2 | Remove Private Setlists | 1/1 | Complete | 2026-04-04 |
| 3 | Inline Swap + Toast | 1/1 | Complete | 2026-04-04 |

### Phase 1: Teardown Old Live System

Focus: Remove LeaderConsole, SwapButton, SwapBottomSheet, SwapToast, /live/[id] receiver page, liveState, presence tracking, canLiveSwap permission, song groups/liturgicalSlot system, admin Song Groups tab, canLiveSwap toggle in UserRow. Clean removal — no replacement yet.

### Phase 2: Remove Private Setlists

Focus: Eliminate the isPublic flag distinction. All setlists are public. Remove personal tab, ownership-gated restrictions. Any band leader or admin can edit any setlist. Simplify Firestore rules, UI, and data model.

### Phase 3: Inline Swap + Toast

Focus: Leader taps a song in the performance view → search picker appears pre-populated with fuzzy name matches from the library (e.g., Barechu variants). Leader picks replacement → Firestore tracks array updates → everyone's view updates in real-time. Toast notification shows all musicians what was swapped.
Skills required: /ui-ux-pro-max

## Previous Milestone
**v3.4 Fixes & Live Mode Activation**
Status: Complete
Completed: 2026-04-04
Phases: 3

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Mount LeaderConsole | 1/1 | Complete | 2026-04-04 |
| 2 | Setlist Permissions Fix | 1/1 | Complete | 2026-04-04 |
| 3 | Print Outline Fix | 0/0 | Complete | 2026-04-04 |

### Phase 1: Mount LeaderConsole

Focus: Wire up the orphaned LeaderConsole component into the performance page so leaders can start Live Mode, step through the service, and enable Live Swap. All v3.0 infrastructure (swap buttons, bottom sheet, toast, /live/[id] receiver, Firestore rules, API routes) is already built — just needs the entry point. Absorbed from v3.3.
Skills required: /ui-ux-pro-max

### Phase 2: Setlist Permissions Fix

Focus: Close and duplicate actions currently only work on setlists created by the current user. Fix so they work on any public setlist regardless of owner.

### Phase 3: Print Outline Fix

Focus: Non-song items (readings, prayers, liturgical elements) are currently excluded from the printed outline/cover page. Include them as line items in the printed order of service — no chart pages needed, just listed on the outline.
Note: Fully addressed in Phase 2 — no separate plan needed.

## Previous Milestone
**v3.3 Live Mode Activation** (absorbed into v3.4)
Status: Absorbed
Note: Scope merged into v3.4 Phase 1

## Previous Milestone
**v3.2 Mobile Admin & Responsive Fixes**
Status: Complete
Completed: 2026-03-31

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Mobile Admin Controls | 1/1 | Complete | 2026-03-31 |
| 2 | Touch Targets & Responsive Polish | 1/1 | Complete | 2026-03-31 |

## Previous Milestone
**v3.1 Post-v3.0 Bugsweep & Hardening**
Status: Complete
Completed: 2026-03-31

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Critical Security & Data Integrity | 2/2 | Complete | 2026-03-31 |
| 2 | Memory Leaks, Type Safety & Failing Tests | 1/1 | Complete | 2026-03-31 |
| 3 | Error Handling & v3.0 Hardening | 2/2 | Complete | 2026-03-31 |
| 4 | UX Safety & Confirmation Dialogs | 1/1 | Complete | 2026-03-31 |
| 5 | Test Coverage & Performance | 1/1 | Complete | 2026-03-31 |

### Phase 1: Critical Security & Data Integrity

Focus: P0 security vulnerabilities — unauthenticated session DELETE endpoint, timing attacks on cron auth (3 routes), scheduling race conditions (assign/unassign/respond), npm audit fix + Next.js upgrade, Firestore rules hardening (config/admins lockdown, missing collection rules, system collection).

### Phase 2: Memory Leaks, Type Safety & Failing Tests

Focus: Runtime stability — Firestore listener memory leaks (alert-store, congregation-store), add liveState to Setlist type, fix `useSafeFirestoreSync<any>` generics, eliminate production `as any` casts, fix 3 failing tests, fix ESLint errors in use-song-groups.ts.

### Phase 3: Error Handling & v3.0 Hardening

Focus: Silent failure elimination — incomplete newTrack in swap, stale tracks array race, missing null checks, swap error handling, onSnapshot error callbacks, empty catch blocks, console.error → logger migration.

### Phase 4: UX Safety & Confirmation Dialogs

Focus: Destructive action protection — SwipeToDelete confirmation, role change confirmation, template editor unsaved changes warning, scheduling-reminder maxDuration, notification error handling, auth-context async guard, pending detections cleanup.

### Phase 5: Test Coverage & Performance

Focus: Quality hardening — v3.0 test coverage (swap hooks, components, API routes), lazy-load PrintModal/jsPDF, code-split ChatPanel, ChatPanel error boundary.

## Previous Milestone
**v3.0 Live Setlist Sync**
Status: Complete
Completed: 2026-03-30

## Previous Milestone (prior)
**v2.6 Deprecation Cleanup, Tech Debt & Setlist UX**
Status: Complete
Completed: 2026-03-12

## Previous Milestone (prior)
**v2.5 Bugsweep & Test Coverage**
Status: Complete
Completed: 2026-03-12

## Completed Milestones

<details>
<summary>v2.5 Bugsweep & Test Coverage - 2026-03-12 (19 phases, 30 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Type Safety Fixes | 1/1 | 2026-03-11 |
| 2 | Silent Failure & Error Handling | 1/1 | 2026-03-11 |
| 3 | Test Infrastructure & Flaky Fix | 1/1 | 2026-03-11 |
| 4 | Data Layer Tests | 2/2 | 2026-03-11 |
| 5 | API Route Tests | 3/3 | 2026-03-11 |
| 6 | Hook Tests | 3/3 | 2026-03-11 |
| 6.1 | SW Removal & Firestore Recovery | 2/2 | 2026-03-11 |
| 7 | Remove Annotation Feature | 1/1 | 2026-03-11 |
| 8 | Performance UX Fixes | 1/1 | 2026-03-12 |
| 8.1 | Setlist Access Bug Fixes | 1/1 | 2026-03-11 |
| 9 | Print View & Sticky Keys | 1/1 | 2026-03-12 |
| 10 | Public Setlist Access | 1/1 | 2026-03-12 |
| 10.1 | Mobile Action Bar Redesign | 1/1 | 2026-03-12 |
| 11 | Component Tests | 2/2 | 2026-03-12 |
| 12 | AI & Integration Tests | 2/2 | 2026-03-12 |
| 13 | Tablet Performance UX | 1/1 | 2026-03-12 |
| 14 | Bug Fixes & Race Conditions | 1/1 | 2026-03-12 |
| 15 | Setlist-Only Print Option | 1/1 | 2026-03-12 |
| 16 | Design Token Cleanup & Accessibility | 1/1 | 2026-03-12 |
| 17 | iPad Safe Areas & Spacing | 1/1 | 2026-03-12 |
| 18 | Backend Hardening | 1/1 | 2026-03-12 |
| 19 | Final Audit & Clean Sweep | 1/1 | 2026-03-12 |

Archive: `.paul/milestones/v2.5-ROADMAP.md`

</details>

<details>
<summary>v2.0 Schedule & Workflow Fixes - 2026-03-11 (3 phases, 3 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Schedule Visibility Fix | 1/1 | 2026-03-11 |
| 2 | Gig Packet Modal Layout Fix | 1/1 | 2026-03-11 |
| 3 | Print PDF Layout Fixes | 1/1 | 2026-03-11 |

</details>

<details>
<summary>v1.9 Auth Stability & Deferred Cleanup - 2026-03-11 (5 phases, 4 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Auth & Routing Regression Audit | 1/1 | 2026-03-11 |
| 2 | Auth Flow Rebuild | 1/1 | 2026-03-11 |
| 3 | Avatar System Fix | 1/1 | 2026-03-11 |
| 4 | ~~Bridge Credentials Security~~ | 0 | Skipped |
| 5 | Deferred Cleanup Batch | 1/1 | 2026-03-11 |

</details>

<details>
<summary>v1.8 Mobile UX Overhaul - 2026-03-11 (3 phases, 3 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Mobile Navigation Redesign | 1/1 | 2026-03-11 |
| 2 | Setlist Mobile Responsive Layout | 1/1 | 2026-03-11 |
| 3 | Schedule Page Redesign | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.8-ROADMAP.md`

</details>


<details>
<summary>v1.7 Critical Bug Fixes - 2026-03-11 (5 phases, 5 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Mobile Sign-In Fix | 1/1 | 2026-03-11 |
| 2 | Quick Fixes (Avatar, Changelog) | 1/1 | 2026-03-11 |
| 3 | Print Pipeline & Gig Packet Overhaul | 1/1 | 2026-03-11 |
| 4 | Key Signature Position | 1/1 | 2026-03-11 |
| 5 | Monitor Buses Investigation | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.7-ROADMAP.md`

</details>

<details>
<summary>v1.6 Stability & Regression Audit - 2026-03-11 (4 phases, 4 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Auth & CSP Hardening | 1/1 | 2026-03-11 |
| 2 | Firebase-Only File Serving | 1/1 | 2026-03-11 |
| 3 | Performance View Overhaul | 1/1 | 2026-03-11 |
| 4 | Regression Sweep & Deferred Fixes | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.6-ROADMAP.md`

</details>


<details>
<summary>v1.5 Codebase & UI/UX Hardening - 2026-03-10 (6 phases, 11 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Critical Bug Fixes | 1/1 | 2026-03-10 |
| 2 | Security & API Consistency | 4/4 | 2026-03-10 |
| 3 | Architecture Cleanup | 3/3 | 2026-03-10 |
| 4 | Quality & Deps | 1/1 | 2026-03-10 |
| 5 | UI/UX Polish | 1/1 | 2026-03-10 |
| 6 | Performance & Monitoring | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>v1.4 Fixes & Library Management - 2026-03-10 (5 phases, 5 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Library Management | 1/1 | 2026-03-10 |
| 2 | Setlist & Editor Fixes | 1/1 | 2026-03-10 |
| 3 | Print Gig Packet Fixes | 1/1 | 2026-03-10 |
| 4 | PDF Health Scanner | 1/1 | 2026-03-10 |
| 5 | Backend Analysis & Bug Scan | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>v1.3.1 Regression Fixes - 2026-03-10 (1 phase, 1 plan)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Regression Fixes | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.3.1-ROADMAP.md`

</details>

<details>
<summary>v1.3 Bugsweep & Backend Hardening - 2026-03-10 (4 phases, 7 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Codebase Audit & Recommendations | 1/1 | 2026-03-10 |
| 2 | Critical Fixes (Security & Data Integrity) | 2/2 | 2026-03-10 |
| 3 | Backend Hardening (Error Handling & Consistency) | 2/2 | 2026-03-10 |
| 4 | Frontend Robustness (Hooks, Types, Cleanup) | 2/2 | 2026-03-10 |

Archive: `.paul/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>v1.2 Library, Manage & Monitor Overhaul - 2026-03-09 (9 phases, 10 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 23 | Library Archive & Health | 2 | 2026-03-09 |
| 24 | Manage Section Redesign | 1 | 2026-03-09 |
| 25 | Monitor Stability | 1 | 2026-03-09 |
| 26 | Monitor UX Redesign | 1 | 2026-03-09 |
| 27 | Monitor Connection Architecture Overhaul | 1 | 2026-03-09 |
| 28 | Monitor Tab & User List Cleanup | 1 | 2026-03-09 |
| 29 | Templates Section Relocation | 1 | 2026-03-09 |
| 30 | Tasks Route 404 Fix | 1 | 2026-03-09 |
| 31 | PDF Display Fix | 1 | 2026-03-09 |

</details>

<details>
<summary>v1.1 UI/UX Hardening - 2026-03-09 (11 phases, 19 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 12 | Touch & Accessibility Foundations | 2 | 2026-03-09 |
| 13 | Color Contrast & Typography Hierarchy | 2 | 2026-03-09 |
| 14 | Component Consistency | 3 | 2026-03-09 |
| 15 | Loading & Feedback States | 2 | 2026-03-09 |
| 16 | Responsive & Mobile Polish | 2 | 2026-03-09 |
| 17 | Schedule Overhaul | 2 | 2026-03-09 |
| 18 | Homepage & Library UX | 2 | 2026-03-09 |
| 19 | Setlist Search & Intelligence | 2 | 2026-03-09 |
| 20 | Performance Mode Overhaul | 2 | 2026-03-09 |
| 21 | Monitor Stability & Enhancements | 1 | 2026-03-09 |
| 22 | Milestone Gaps & Deferred Items | 1 | 2026-03-09 |

</details>

<details>
<summary>v1.0 Full Launch - 2026-03-08 (5 phases, 12 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 7 | QA & Bug Sweep | 2 | 2026-03-08 |
| 8 | Missing Features Audit | 3 | 2026-03-08 |
| 9 | UI/UX Polish & Usability | 2 | 2026-03-08 |
| 10 | Admin Console Redesign | 4 | 2026-03-08 |
| 11 | Launch Prep | 1 | 2026-03-08 |

</details>

<details>
<summary>v0.1 UI/UX Redesign - 2026-03-08 (6 phases, 12 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Design Foundation | 2 | 2026-03-08 |
| 2 | Navigation & Layout | 2 | 2026-03-08 |
| 3 | Dashboard & Home | 2 | 2026-03-08 |
| 4 | Setlist & Performance Views | 3 | 2026-03-08 |
| 5 | Library & Monitor Mix | 2 | 2026-03-08 |
| 6 | Polish & Accessibility | 1 | 2026-03-08 |

</details>

---
*Roadmap created: 2026-03-10*
*Last updated: 2026-04-27 (Milestone v5.1 Editor UX Polish created. 3 phases: v51-01 picker rework / v51-02 smart create-setlist wizard / v51-03 Vocal Lead rename + Daniel-loop UAT codification + gig-packet print smoke. Tablet-first; band-onboarding gate. /ui-ux-pro-max BLOCKING per SPECIAL-FLOWS.md for every phase. Synthesized from /paul:discuss-milestone session — Issue 2 iPad key-picker (Sheet+keyboard yuck across all 6 dropdown sites) + smart wizard for Erev Shabbat / Shabbat morning / holidays via Hebcal + sticky-memory verified through clone path + label-only rename of Lead → Vocal Lead. v5.0-hotfix archived at `.paul/milestones/v5.0-hotfix-ROADMAP.md` 2026-04-27. v5.0 milestone still 🟡 PENDING-UAT — close path is now: v5.1 ships → Daniel UAT → invite band → first-week smoke → `/paul:audit-milestone v5.0`.)*
