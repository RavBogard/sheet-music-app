# Cycle-9 Sweep TRIAGE

**Composed:** 2026-05-20 (supervisor, after all 5 HANDOFFs landed)
**Anchor SHA probed:** `db208948f` (= cycle-8-fixes Lane 1 tip: chart-bond cron
registered + suggest_band index DESC + bond-ratio denominator). cycle-9
hardening A (test baseline) + B (trackCount producer) were NOT yet in master at
probe time.
**Instances:** 5 of 5 (band-UI · authoring · library · roster/monitor · security)
**Totals:** ~62 findings — **4 HIGH · 13 MED · 17 LOW · 28 INFO/positive**

---

## §0 — Green-gate verdict

**cycle-8-fixes CONFIRMED at deployed surface** — independent of the coders:
- `suggest_band` returns ranked candidates, no 500/FAILED_PRECONDITION (i2 C9I2-P03, i4 C9I4-002).
- chart-bond denominator + cron landed (i2 publish chart-health gate clean).
- **0 regression-of-shipped-fix across all 5 instances.** Instance-1's
  "regression-of-shipped-fix" tags are POSITIVE pass-verifications (C7I2-002
  affordances, no-cover-art, transpose-disable, zoom persistence, isLeader gating
  all hold).

**Soft-re-entry bar (PARENT §7: ≥3 BLOCKS-GREEN OR any regression): MET — narrowly, on quality not regression.** Two genuine NEW code-fix blockers (C9I2-001, C9I5-001) + one onboarding blocker resolved by seeding (C9I2-004) + a meaningful MED cluster. A **small, focused cycle-9-fixes wave is justified** — but most of the volume is POLISH/cycle-10, and the headline trackCount HIGH is already covered by hardening B.

---

## §1 — BLOCKS-GREEN (fix candidates)

### C9I5-001 — `dedupe_library` has NO role gate  `[HIGH · security]`
Musician + member can call `dedupe_library({dryRun:false})` and mark
`library_index` rows `duplicate` + mirror into `songs/{id}`. Every other admin
hygiene tool gates correctly — this is a singular omission. **This is the one I'd
treat as must-fix before onboarding real multi-role users.** Single-file fix:
guard at `src/lib/mcp/tools/index.ts` registration + handler
`src/lib/mcp/tools/library.ts:688` with the standard role guard. Evidence:
i5 `artifacts/04-dedupe-library-HIGH-evidence.md`.

### C9I2-001 — `search_library` / `add_track` surface broken-bond rows  `[HIGH · catalog]`
Active-status `library_index` rows whose chart bytes 404 are returned by search
and bindable via `add_track` — silently produces broken setlists during the
weekly authoring flow. Affects band-onboarding (a new leader binds a "found"
chart that won't render). Fix: filter/flag dead-byte rows in search + add_track,
or a heal pass. Converges with C9I3-002 (shortcut rebond).

### C9I2-004 — 0 templates seeded (C7I1-001 still open)  `[HIGH · DANIEL-ACTION, not a fix]`
A new band_leader has no template starting points ("Randy Shabbat morning" etc.).
**Resolved by seeding via MCP (~5 min), NOT a code lane.** See §3.

---

## §2 — MED cluster (fix candidates — bundle-worthy)

**Catalog hygiene** (converges with C9I2-001):
- **C9I3-002 MED** — `reconcile_library` still misclassifies 2 `google-apps.shortcut` rows as `transient` (no progress since C8I2-005). Needs `needsRebond` bucket or auto-resolve via cycle-6 shortcut helper.
- **C9I3-003 MED (NEW)** — phonetic-bucketing splits BOTH search AND dedup. Users can upload near-phonetic Hebrew duplicates without `force:true` and strict 0.85 dedup never compares them. Escalates the C7I1-012 search-only deferral (dedup-side is worse: creates dupes vs misses one).
- **C9I3-004 MED** — `library_index.storageUrl` writes `.txt/.png/.jpg` suffixes that don't exist at the real Storage path → 404 for consumers reading storageUrl directly.
- **C9I3-005 MED** — upload reverse-orphan window: HEIC/MuseScore `originals/{fileId}` blob not rolled back on Firestore-commit failure (atomic guard only deletes `realStoragePath`).

**MCP gate/envelope hygiene** (converges with C9I5-001):
- **C9I5-002 MED** — `list_minted_bearers` audit view shows cascade-dead children as `status:'active'` (C8I1-001 still open; verifyBearer DOES reject them on use, so cosmetic-but-misleading).
- **C9I5-003 LOW / C8I2-006** — 4 test-tokens tools emit bare `forbidden` vs standard `forbidden_role`. Standardize.
- **C9I4-007 LOW** — `get_mix()` SE-no-bus returns HTTP 500 for what's really a 400.

**Roster correctness:**
- **C9I4-001 MED (HIGH-latent)** — `list_musicians_on_date` blind to legacy ISO-string `eventDate` (= every current setlist) → "who's playing on date X" returns empty. Masked today (no assignments yet); becomes HIGH the moment the band populates assignments. The follow-up grep noted in `roster.ts:402-415` was never implemented.
- **C9I4-004 MED** — free-text `instrument` values ("Guitar"/"Drums") don't count toward `suggest_band` coverage even though those musicians play them; `suggest_musicians` loose-matches but `suggest_band` doesn't normalize.
- **C9I4-005 MED (investigate-first)** — auth-hydration asymmetry: `useAuth().user` hydrates for musician/band_leader but is null for sound_engineer on the same cookie path. May be timing; needs a code read (`use-monitor-access.ts:33` / auth-context). Possible real auth bug → Axis-5 relevance.

**Authoring friction (fix-tier):**
- **C9I2-002 MED** — `swap_chart` default `syncMetadata:true` clobbers hand-curated titles.
- **C9I2-003 MED** — admin-owned fixtures escape `uidPrefix` cleanup (cross-confirmed by C9I1-008 leak into public `/perform`). See convergence §6.2.
- **C9I2-006 MED** — two "Daniel Bogard" accounts in active pool (DANIEL-ACTION, see §3).

---

## §3 — Daniel-action (data/ops, not code lanes)

- **Seed prod templates** (C9I2-004 / C7I1-001) — ~5 min via MCP. Recommended: "Randy Shabbat morning", "B'nai Mitzvah service", "Shir Shabbat", "Friday evening Erev Shabbat". Highest band-onboarding ROI.
- **Dedupe the two "Daniel Bogard" user accounts** (C9I2-006) — pick the canonical uid; intersects auth.
- **Seed `rabbiProfiles`** (C9I2-008) — so `suggest_band`'s rabbi-aware ranking branch fires (currently `rabbiGuidance:null`).
- Carry-overs: rotate Root A; `git checkout master` in canonical checkout; apex→www (C5B-002); revoke burned bearers.

---

## §4 — Known-in-flight (already owned by hardening lanes — do NOT re-assign)

- **trackCount drift** — C9I1-005 + C9I2-007 + C9I3-001 (3/15 both directions). Owned by **hardening B** (coder-3); its path audit (SetlistGrid `applyEdit` + `commitOutboxRow` recompute) covers both over- and under-count. **Regression fixtures for B to verify against:** `QQSsAK2XY4dc8k5sFXIa` (Confirmation 0→5), `5zLP8DidKQ2lLMKci2xI` (Religious School 8→0), `s2nWyd63mWjQj3LAJ8zg` (Shir Shabbat Mar27 21→0). → relay to coder-3.
- **Unit-test baseline** — owned by **hardening A** (coder-2). Sweep didn't touch it.

---

## §5 — POLISH / cycle-10 (defer; not fixes)

- Ergonomics: `start_weekly_setlist` composite + `move_track` single primitive (C9I2-E03, Probe-7 narrative) — the "easy & intuitive 3-step weekly flow" Daniel wants. **cycle-10 feature scope, not a fix.**
- Roster-MCP gap spec (C9I4-009, 8 bullets: notify/atomic-swap/stale-pending/bulk-assign/musician-self-discovery/history/broadcast/terminal-status) — future roster-MCP phase.
- LOW data-display: C9I1-001 double-em-dash, C9I2-010 ".pdf" in titles, C9I2-011 sort anomaly, C9I2-005 templateType case, C9I1-006/007 direct-link/middle-click, C9I3-006 mimeType backstop xml/text, C9I4-003 ranking ties, C9I4-006 stale-true bridge, C9I4-012 alert-store console noise.

---

## §6 — Cross-instance convergences

1. **trackCount drift** (C9I1-005 + C9I2-007 + C9I3-001) → §4, hardening B + fixtures.
2. **Writer-side `isTest` gap** (C9I1-008 + C9I2-003 + i5 note) — `clone_setlist` + admin-owned fixtures don't carry `isTest:true`, so they (a) escape `cleanup_all_test_data` uidPrefix sweep AND (b) leak into the PUBLIC `/perform` listing. **Real hygiene bug**, distinct from trackCount. Tier-1 writer-side hotfix: stamp `isTest:true` on clones whose source was test OR whose name matches `c9iN-`/`test-`. Fix candidate.
3. **Catalog hygiene** (C9I2-001 + C9I3-002 + C9I3-003 + C9I3-004) → §1/§2 catalog cluster.
4. **MCP gate/envelope** (C9I5-001 + C9I5-002 + C9I5-003 + C9I4-007) → §1/§2 gate cluster.

---

## §7 — Recommended cycle-9-fixes lane shape

Tight, security-first, non-overlapping with hardening A/B. Suggest **2 lanes**:

**Lane F1 — MCP gate/envelope hygiene + writer isTest (security-leaning)**
- C9I5-001 dedupe_library role gate (priority — the one true security gap)
- C9I5-003/C8I2-006 machine_code standardize + C9I4-007 wrong HTTP code
- C9I5-002/C8I1-001 cascade-dead audit-view status
- Convergence §6.2 writer-side `isTest` stamp on clones/test-named setlists
- Files: `src/lib/mcp/tools/{library,index,mint-admin-bearer,clone-setlist,setlist-write}.ts`, roster monitor error code. Disjoint from hardening B's track-mutation atomicity? **CONTENTION RISK on `setlist-write.ts`/`clone-setlist.ts` with hardening B** — sequence F1 AFTER B lands, or coordinate via claims.

**Lane F2 — catalog + roster correctness**
- C9I2-001 broken-bond rows in search/add_track + C9I3-002 shortcut needsRebond + C9I3-004 storageUrl divergence + C9I3-005 reverse-orphan window
- C9I4-001 list_musicians_on_date ISO-eventDate + C9I4-004 instrument normalization
- Files: `library.ts`, `reconcile`, `library-upload.ts`, `roster.ts`. Disjoint from F1 + B.

**Investigate-first (not a lane yet):** C9I4-005 auth-hydration asymmetry — needs a code read before scoping; could be timing (no fix) or a real auth bug (HIGH). Spawn a quick investigation before committing it to a lane.

**Defer:** C9I3-003 phonetic (Daniel decision — escalated from C7I1-012 search-only deferral; now affects dedup); C9I2-002 swap-clobber (UX default change — wants Daniel's call).

---

## §8 — Memory / protocol updates surfaced

- **`[[project_mixer_feature]]` is STALE** — C9I4-010: MCP monitor-control is NOT deferred; `src/lib/mcp/tools/monitor.ts` (18.9KB, 8 tools: listMonitorBuses/getMix/getMatrix/setSendLevel/setSendMute/setBusFader/setMatrixFader/setMatrixMute) is SHIPPED + gated at `db208948f`. Update memory; the instance-4 prompt premise was wrong.
- **`[[project_orphan_baseline]]` is STALE** — C9I3-009/C8I2: orphan baseline is now 0 (was 24). Update.
- **Harness limitation (LOAD-BEARING for next sweep)** — C9I1-009: cowork `resize_window` does NOT constrain viewport; in-sandbox Playwright is NOT preinstalled. iPad-Mini layout claims this cycle are source-inspection extrapolations, NOT measured at 768px. Next band-UI sweep needs `npm install playwright` + chromium OR a DevTools-Protocol mobile-emulate harness. Bake into the cycle-9 band-UI re-probe and `[[feedback_cowork_real_harness]]`.
- **C9I5-005 / mint quota** — 10/day/uid is exhausted by 5 instances + 3 coder lanes sharing Daniel's uid (confirmed: hit 10/10 this cycle). Rich 429 confirmed (closes C8I1-002 prod-probe gap). Future multi-instance cycles: stagger across the 00:00Z reset OR Daniel hands UI-minted roots (bypass the programmatic cap).
