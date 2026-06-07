# Cycle-6-fixes wave — triage + lane scoping (LAST MAJOR WAVE)

**Anchor SHA:** `3e640a905` (master tip at triage time)
**Source cowork:** cycle-6 4-way wave 2026-05-19 — Instance B (15 findings), Instance C (13 findings), Instance D (12 findings), Instance A original (aborted), Instance A-headline (blocked, 6 tool-shape findings).
**Total BLOCKS-GREEN:** 15 user-visible + 12 supervisor-prompt-process gaps = effective scope.
**Discipline:** Daniel-ratified 2026-05-19T~19:30Z verification-discipline package (3 decisions in decisions.md). Every lane's SHIP-NOTICE MUST paste each finding's repro into `## Repros` section. Auditor executes those repros at the deployed surface before ACCEPT.
**Commitment:** this is the last major cowork-fix wave per prior Daniel ratification 2026-05-19. After cycle-6-fixes ships, project enters maintenance mode (single-lane trailing work for POLISH backlog).

---

## Lane structure

6 lanes proposed, dispatched in 2 waves to respect sequencing:
- **Wave A (must land first):** Lane 0 (tooling unblock), Lane 1 (gig-packet — the user-felt-now-bug), Lane 4 (security carry-forward).
- **Wave B (can parallel after Wave A):** Lane 2 (template MCP), Lane 3 (XSS+CSP), Lane 5 (unauth-edge).

Wave A first because:
- Lane 0 unblocks future cowork dispatches (currently impossible to run parallel-safe).
- Lane 1's gig-packet bug is actively hurting David every Friday.
- Lane 4's `npm audit` 1C+24H is security carry-forward — should be triaged before more code lands on top.

Wave B in parallel because: independent surfaces, no shared files, can dispatch 3-way once Wave A SHIP-NOTICEs ACCEPT.

---

## Lane 0 — MCP test-tooling schema additions (unblocks future cowork)

**Scope:** the 12 deploy-vs-claim gaps cycle-6 dispatch surfaced. Ship the schema/tools cowork prompts assumed existed.

**Touch lane:**
- `src/lib/mcp/tools/test-tokens.ts` — add `uidPrefix` (z.string optional, 1-8 chars) to `create_test_account` inputSchema; thread through `generateRawToken`/uid construction to produce `test-<uidPrefix>-<role>-<8hex>` format. Add `prefix` (z.string optional) to `cleanup_all_test_data` inputSchema; thread through cleanup walker to filter by uid-startsWith.
- `src/lib/mcp/tools/service-personnel.ts` (NEW) — ship `list_service_personnel({setlistId})` returning `{matched_setlists, grouped_assignments, distinct_vocal_leads}` per C5C-014 spec. (Auditor msg-007 ACCEPTed C5C-014 ship; cycle-6 confirmed tool absent from production — investigate whether it never deployed or was reverted.)
- `src/lib/mcp/tools/dump-collection-size.ts` (NEW) — ship `dump_collection_size({collectionName})` returning `{docCount, estimatedBytes, oldestTimestamp, newestTimestamp}` per C5D-013 spec. (Same as above — auditor msg-007 ACCEPTed; production absent.)
- **Decide:** ship `cycle-4/harness/scripts/` to main repo OR update `[[feedback_cowork_real_harness]]` memory + future cowork prompts to reflect "scripts live only in auditor-validation worktree." Default recommendation: ship to main repo (auditor-validation is supervisor-private, fragile for cowork sandboxes).
- `src/lib/mcp/__tests__/test-tokens.test.ts` — regression tests for uidPrefix + prefix discipline. Include `[[feedback_self_inclusion_test_fixtures]]` self-inclusion test.

**Repros (paste into SHIP-NOTICE):**

```
### REPRO-L0-uidPrefix
preconditions: production MCP, admin bearer
steps: tools/call create_test_account {role:'musician', uidPrefix:'6ZZ'}
expected: response uid matches /^test-6ZZ-musician-[0-9a-f]{8}$/
observed_pre_fix: response uid matches /^test-musician-[0-9a-f]{8}$/ (no uidPrefix segment)

### REPRO-L0-cleanup-prefix
preconditions: production MCP, admin bearer, two test users minted with different prefixes (test-6ZZA-, test-6ZZB-)
steps: tools/call cleanup_all_test_data {prefix:'test-6ZZA'}
expected: only test-6ZZA-* users deleted; test-6ZZB-* survives
observed_pre_fix: schema rejects prefix param OR walker nukes both

### REPRO-L0-list-service-personnel
preconditions: production MCP, admin bearer, known setlistId with ≥1 assigned musician
steps: tools/call list_service_personnel {setlistId:<id>}
expected: response shape {matched_setlists:[...], grouped_assignments:[...], distinct_vocal_leads:[...]}
observed_pre_fix: tool not found / -32601 error

### REPRO-L0-dump-collection-size
preconditions: production MCP, admin bearer
steps: tools/call dump_collection_size {collectionName:'library_index'}
expected: response shape {docCount:<n>, estimatedBytes:<n>, oldestTimestamp:<iso>, newestTimestamp:<iso>}
observed_pre_fix: tool not found / -32601 error

### REPRO-L0-harness-scripts
preconditions: fresh clone of master tip
steps: ls sheet-music-app/cycle-4/harness/scripts/
expected: probe-batch.mjs + aggregate.py + install-harness.sh + runAxe.mjs all present
observed_pre_fix: dir doesn't exist (only sheet-music-app/cycle-4/harness/lib/ ships)
```

**Effort:** medium. ~3-5 src files, plus regression tests. No UI.

**Findings closed:** META gaps from cycle-6 cowork (12 prompt-shape gaps).

---

## Lane 1 — Gig-packet shortcut-merge fix + suggest_band index (THE user-felt regression)

**Scope:** close C6C-008 (C5C-006 regression: Lechu Goldman.pdf silently dropped from gig-packets when bonded chart is a Drive shortcut). Plus deploy missing Firestore composite index for `suggest_band` (C6C-009 returns 500).

**Touch lane:**
- `src/lib/gig-packet/generate.ts` (or wherever gig-packet generation lives — find via grep `generate_gig_packet`). The `missingCharts[]` shortcut-path drop is the bug. Resolve shortcut targets server-side BEFORE mimeType check; merge target's PDF bytes into packet PDF inline at the track's setlist-order position.
- `src/lib/mcp/tools/setlist-publish.ts` or whichever tool maps to `generate_gig_packet` — confirm error envelope is rich if resolution fails (per REG-001/002 contract).
- `firestore.indexes.json` — add composite index on `scheduling_assignments(status, assignedAt, __name__)` per C6C-009. Then `firebase deploy --only firestore:indexes --project crcmusiccharts` per `[[feedback_firebase_cli]]` (auto task, not human-action).
- Regression test: emulator test that imports a Drive-shortcut fileId, bonds to a track, generates packet, asserts shortcut content present in PDF.

**Repros (paste into SHIP-NOTICE):**

```
### REPRO-L1-gig-packet-shortcut-merge (C6C-008 / C5C-006)
preconditions: production MCP + admin bearer; existing library chart bonded to a Drive shortcut fileId (cycle-6 used Lechu Goldman fileId 1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj)
steps:
  1. tools/call create_setlist {name:'6fixes-l1-probe', eventDate:'2026-05-25', isTest:true}
  2. tools/call add_track_to_setlist {setlistId:<id>, songId:<lechu-song-uuid>, title:'Lechu N\'Ran\'Nah'}
  3. tools/call generate_gig_packet {setlistId:<id>}
expected: response includes downloadable PDF URL; PDF contains Lechu chart pages merged inline at track position; missingCharts is empty
observed_pre_fix: response includes Lechu fileId in missingCharts[] with error "Unsupported content type: application/vnd.google-apps.shortcut"; PDF omits Lechu pages entirely

### REPRO-L1-suggest-band (C6C-009)
preconditions: production MCP + admin bearer; a setlist with at least one rabbi-led service tagged
steps: tools/call suggest_band {setlistId:<id>}
expected: response shape {suggestions:[{musicianId, role, confidence, ...}], notes:[...]}
observed_pre_fix: HTTP 500; envelope hints Firestore composite index missing on scheduling_assignments(status + assignedAt + __name__)
```

**Effort:** medium-high. Gig-packet PDF merging is non-trivial. Index push is 5min.

**Findings closed:** C6C-008, C6C-009.

---

## Lane 2 — Template MCP CRUD pack (criterion 8 of green rubric)

**Scope:** ship the 6 template MCP tools so David's mental-model workflow ("what does Randy's typical Shabbat morning look like — make me one for next week") has a Claude-callable path.

**Touch lane:**
- `src/lib/mcp/tools/templates.ts` (NEW) — single file housing all 6 tools:
  - `list_templates({})` → array of `{id, name, description, slotCount}`
  - `get_template({templateId})` → full template doc with slots[]
  - `create_template({name, description, slots[]})` → templateId
  - `update_template({templateId, patch})` — optimistic-concurrency via etag/version
  - `delete_template({templateId})` — soft-delete
  - `clone_setlist_from_template({templateId, eventDate, name?, isTest?})` — creates new setlist with slots materialized as tracks (unresolved slots become `type:'song'` rows with `notes` echoing the slot's `queries[]` per Instance C recommendation §2 bullet 2)
- band_leader-gated via existing trusted-leader gate.
- Persistence layer already exists at `src/lib/template-firebase.ts` + 16 hardcoded liturgical templates at `src/lib/liturgical-templates.ts`. Wrapper layer only.
- Register tools in MCP server's tool registry (whichever route file handles tool list).
- Regression test: list → get → create → update → clone → delete round-trip.

**Repros (paste into SHIP-NOTICE):**

```
### REPRO-L2-list-templates (C6C-001)
preconditions: production MCP + admin or band_leader bearer
steps: tools/call list_templates {}
expected: array of {id, name, description, slotCount}; includes at least the 16 hardcoded liturgical templates
observed_pre_fix: tool not found / -32601

### REPRO-L2-get-template (C6C-002)
preconditions: a templateId from list_templates response
steps: tools/call get_template {templateId:<id>}
expected: full template doc with slots[]
observed_pre_fix: tool not found / -32601

### REPRO-L2-create-template (C6C-003)
preconditions: production MCP + band_leader bearer
steps: tools/call create_template {name:'6fixes-l2-probe', description:'test', slots:[{position:1, query:'lechu'}]}
expected: response {templateId, name, description, slots}
observed_pre_fix: tool not found / -32601

### REPRO-L2-update-template (C6C-004)
preconditions: a templateId from create_template
steps: tools/call update_template {templateId:<id>, patch:{description:'updated'}}
expected: response with updated description; etag/version bumped
observed_pre_fix: tool not found / -32601

### REPRO-L2-delete-template (C6C-005)
preconditions: a templateId from create_template
steps: tools/call delete_template {templateId:<id>}
expected: response {ok:true}; subsequent get_template returns 404 or soft-delete marker
observed_pre_fix: tool not found / -32601

### REPRO-L2-clone-setlist-from-template (C6C-006 — biggest payoff)
preconditions: a templateId, an eventDate
steps: tools/call clone_setlist_from_template {templateId:<id>, eventDate:'2026-05-25', isTest:true, name:'6fixes-l2-clone-probe'}
expected: response {setlistId, tracksCreated:<n>}; new setlist has tracks materialized from template slots
observed_pre_fix: tool not found / -32601
```

**Effort:** medium. Single new file. Persistence already exists.

**Findings closed:** C6C-001 through C6C-006.

---

## Lane 3 — XSS hardening + CSP unsafe-* removal (security carry-forward)

**Scope:** close C5D-001 (TextScoreViewer XSS — cycle-5 finding never fixed; Instance D confirmed STILL-APPLIES as C6D-005). Plus C5D-003 (CSP nonce + remove unsafe-inline/unsafe-eval at edge).

**Touch lane:**
- `src/components/score/TextScoreViewer.tsx` (or wherever TextScoreViewer lives — grep) — DOMPurify-sanitize text-score content OR force plain-text render with explicit escaping. Verify `<script>` payload renders as text.
- `next.config.ts` or middleware — confirm CSP nonce + strict-dynamic emitted; remove `unsafe-inline` and `unsafe-eval` from `default-src`/`script-src`.
- Regression test: render a text-score with `<script>alert(1)</script>`; assert escaped in DOM.

**Repros (paste into SHIP-NOTICE):**

```
### REPRO-L3-textscore-xss (C5D-001 / C6D-005)
preconditions: production /perform/setlist/<id> with a track bound to a text-score chart whose content contains <script>alert('xss-probe')</script>
steps: open the setlist in a browser, navigate to the affected track
expected: payload renders as text; no JS alert fires; no console XSS-eval errors
observed_pre_fix: alert fires OR payload-as-HTML injects into DOM

### REPRO-L3-csp-nonce (C5D-003)
preconditions: production /perform
steps: curl -I https://www.centralreform.live/perform
expected: Content-Security-Policy header has nonce-<value> + strict-dynamic; NO unsafe-inline, NO unsafe-eval in default-src or script-src
observed_pre_fix: CSP header includes unsafe-inline and/or unsafe-eval
```

**Effort:** medium. Touches a security-sensitive surface — test thoroughly.

**Findings closed:** C5D-001/C6D-005, C5D-003.

---

## Lane 4 — npm audit pass (security carry-forward)

**Scope:** close C5D-004 (npm audit 1C+24H — still applies per Instance D as C6D-001).

**Touch lane:**
- `cd sheet-music-app && npm audit fix --dry-run` first to scope auto-resolvable subset.
- For the ~16 `@opentelemetry/*` packages cascading from a single root advisory: bump the root + verify the family transitively resolves.
- `axios`, `follow-redirects`, `fast-xml-parser`, `next`, `firebase-admin` — the high-impact set. Each may require a careful bump (next framework bump is non-trivial — coordinate with `vercel:next-upgrade` skill if used).
- Run full emulator + unit suite after each bump cluster.
- `package-lock.json` will churn significantly. Expected.

**Repros (paste into SHIP-NOTICE):**

```
### REPRO-L4-npm-audit (C5D-004 / C6D-001)
preconditions: fresh clone of master tip, npm install completed
steps: cd sheet-music-app && npm audit --production --json | jq '.metadata.vulnerabilities'
expected: {critical:0, high:0, moderate:<=2, low:<=8}
observed_pre_fix: {critical:1, high:24, moderate:4, low:8}
```

**Effort:** medium — depends on how many bumps require code changes. Could be small if `npm audit fix --dry-run` resolves most via transitive bumps; could be medium if next/firebase-admin majors are required.

**Findings closed:** C5D-004 / C6D-001.

---

## Lane 5 — Unauth-edge: bundle + SSR + accessibility (4 BLOCKS-GREEN bundle)

**Scope:** close C6B-001 (`/accessibility` route 404), C6B-002 (login legal-nav missing accessibility link — C5B-009 incomplete), C6B-009 (unauth `/perform` no SSR), C6B-010 (unauth `/login` bundle 2.5× over target).

**Touch lane:**
- `src/app/accessibility/page.tsx` (NEW) — actual route + page content. Even a stub with the accessibility statement is fine.
- `src/components/nav/LegalNav.tsx` or wherever login legal-nav renders — add the Accessibility link. Then also surface this nav on `/privacy`, `/terms`, `/sms-consent`, `/changelog`, `/accessibility` per C6B-003 (POLISH but cheap to bundle here).
- `src/app/(unauth)/perform/page.tsx` or wherever — convert to server component; SSR'd `<nav>` + sign-in CTA + skeleton content before JS boots. Pattern from cycle-3.5 P2-013 `/login` SSR ship at `6c3f0a043` (Daniel knows this pattern).
- `src/app/(unauth)/login/page.tsx` — bundle audit. 1248KB → 500KB target. Cycle-3.5 Lane 6 trimmed this once already; investigate what regressed. Likely an eager-imported firebase module or similar.

**Repros (paste into SHIP-NOTICE):**

```
### REPRO-L5-accessibility-route (C6B-001)
preconditions: production
steps: curl -sI https://www.centralreform.live/accessibility
expected: HTTP 200 with content
observed_pre_fix: 307 → /login OR 404

### REPRO-L5-login-legal-nav (C6B-002)
preconditions: production /login unauth
steps: load /login in a browser; inspect legal-nav element
expected: nav includes Privacy / Terms / SMS Consent / Changelog / Accessibility links
observed_pre_fix: nav present but Accessibility link absent

### REPRO-L5-perform-ssr (C6B-009)
preconditions: production /perform unauth
steps: curl https://www.centralreform.live/perform | grep -E '<nav|<main|Sign.?[Ii]n'
expected: SSR'd HTML contains <nav>, <main>, and a Sign In CTA
observed_pre_fix: HTML is JS-only skeleton; no <nav>, no <main>, no CTA before JS boots

### REPRO-L5-login-bundle (C6B-010)
preconditions: production /login unauth
steps: load /login with browser network panel; sum the JS chunks served pre-interactive
expected: total JS < 500 KB
observed_pre_fix: total ~1248 KB
```

**Effort:** medium. 4 distinct surfaces but each is small-medium.

**Findings closed:** C6B-001, C6B-002, C6B-009, C6B-010. Bonus: C6B-003 (POLISH) if legal-nav rolled out across all legal pages.

---

## Coord housekeeping (this wave)

- **Bearer rotation:** 5 burned bearers from cycle-6 dispatch need revoke via `/settings/mcp`. Daniel-action.
- **Memory updates (post-wave, auditor handles):**
  - `[[feedback_sandbox_test_isolation]]` — currently claims uidPrefix as standing rule; after Lane 0 ships, claim becomes deployed-fact. Update to remove proposal-shape disclaimer.
  - `[[feedback_cowork_real_harness]]` addendum — remove the `a42fd8a47` claim (SHA not on master); update with the lane-0-resolution (whichever path taken: ship scripts/ to main repo OR document auditor-validation-only).
  - NEW `[[feedback_cowork_prompt_verify_before_write]]` — already saved this session; remains canonical.
- **agents.md cleanup:** archive completed cycle-5-fixes rows after cycle-6-fixes ships clean. Cycle-5-fixes rows at lines 42-46 can move to `.coord/archive/2026-05-19/`.

---

## Dispatch order recommendation

**Step 1 — Wave A dispatch (3 parallel lanes):**
- Lane 0 (MCP test-tooling unblock) — coder-1
- Lane 1 (gig-packet + suggest_band) — coder-2
- Lane 4 (npm audit) — coder-4

**Step 2 — Auditor ACCEPT under new protocol.**
Auditor receives Wave A SHIP-NOTICEs (each with `## Repros` section). Executes pasted repros against deployed. Binary verdict per Decision 1.

**Step 3 — Wave B dispatch (3 parallel lanes) after Wave A ACCEPTs:**
- Lane 2 (template MCP CRUD) — coder-2 or coder-3
- Lane 3 (XSS + CSP) — coder-3 or coder-5
- Lane 5 (unauth-edge bundle) — coder-1 or coder-6

**Step 4 — Final cycle-6-fixes ACCEPT closes the wave.** Green-rubric checkmark:
- Criterion 1 (behavioral) — Wave B lanes close
- Criterion 2 (zero BLOCKS-GREEN) — final count goes to 0
- Criterion 3 (regression baseline) — emulator stays green
- Criterion 4 (telemetry) — Instance B verdict was PASS-trending on what it could measure; no action needed
- Criterion 5 (AI cost) — Instance D verdict PASS-trending; Daniel verifies Cloud Console at green-decl
- Criterion 6 (DB clean) — Instance D verdict PASS-trending on orphan + dedup
- Criterion 7 (deps) — Lane 4 closes
- Criterion 8 (David flow) — Lane 1 + Lane 2 close; David shadow shadow ~1 week post-ship per prior ratification

**Step 5 — Daniel briefs David.** David shadows on the actual weekly flow. Report lands ~1 week post-ship. Retroactive green-status adjustment hook stays open.

Then: project enters maintenance mode per "last major wave" commitment. POLISH backlog (17 items) drains via single-lane trailing work.

---

## POLISH backlog (deferred to maintenance mode, NOT in cycle-6-fixes scope)

For record: 17 POLISH findings across cycle-6 cowork that don't gate green. Sample (not exhaustive):
- C6B-003: legal-nav not on all legal pages (rolled into Lane 5 if room)
- C6B-004: sitemap.xml uses apex (causes +1 redirect per crawl)
- C6B-005: robots.txt conflicting Allow:/ + Disallow:/
- C6B-006: API 405 empty body
- C6B-011: HSTS inconsistent apex vs www
- C6B-012: viewport maximum-scale=5
- C6B-013: static legal pages cache-control: private/no-cache/no-store
- C6B-014: apex first-hop lacks security headers
- C6C-007: trackCount drift on UnjLqKTtS4lNKQfMY6hB
- C6C-010: list_musicians_on_date naming/shape drift
- C6C-011: list_library 'main' enum obsolete
- C6C-012: /manage/library-review route missing (memory drift)
- C6D-002: major-version dep drift (5 deps)
- C6D-004: folder-vs-deleted Drive envelope disambiguation
- C6D-006: zero correction signals (verify or fix)
- C6D-007: list_library vs dedupe_library off-by-one duplicate count
- C5B-002: Daniel-action apex→www Vercel domain config

Plus C5C-010 + C5C-011 (list_setlists sort + publishedAt) — recommended bundled into Lane 2 by Instance C since they touch the same UX context. Decision goes to Daniel.

---

## Green-decl path

When cycle-6-fixes ships clean + auditor ACCEPTs all 6 lanes under new behavior-probe discipline:

1. Supervisor declares green-state via decisions.md entry.
2. Daniel reviews Cloud Console for AI cost intuitive-sense check (criterion 5 gate).
3. Daniel briefs David; David's actual report ~1 week later closes criterion 8 retroactively.
4. POLISH backlog drains via trailing single-lane work.
5. Project = maintenance mode. No more major waves unless CRITICAL emerges.

Go signal: Daniel ratifies this TRIAGE, supervisor scopes Wave A bootstrap prompts for coder-1 / coder-2 / coder-4, Daniel pastes when ready.
