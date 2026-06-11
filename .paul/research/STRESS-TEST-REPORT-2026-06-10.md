# STRESS-TEST REPORT — Full-system permission/tenancy/UX audit (2026-06-10)

Independent adversarial session. Judged against `docs/ACCESS-POLICY.md` (v0.2, ratified
2026-06-10). Did not inherit STATE.md's claims about what is fixed.

> **ENVIRONMENT BLOCKER — read this first.** The **Claude-in-Chrome extension was not
> connected** for the entire session (3 connect attempts, `list_connected_browsers` → `[]`).
> Per the safety rules I did **not** substitute `curl`/bash/`fetch` against the live hosts.
> Consequence: **every browser-rendered surface went untested** — anon UI cold loads, Perform
> mode, cross-tenant deep links *in the browser*, library/`/manage`/`/admin` UI gating, the QR
> flow, write-control visibility, all three viewports, and the entire Pass B UI-friction walk.
> What I *could* test — the MCP/data layer — I tested hard, and it is clean. See `## INCOMPLETE`
> for the precise list a successor session must pick up once Chrome is connected.

---

## 1. Summary

- **Severity counts:** P0 **0** · P1 **0** · P2 **2** · P3 **1** · Policy questions **3**.
  (Counts cover the *testable* MCP/data layer only — UI layer is untested, not "passed".)
- **Worst finding:** BUG-1 (P2) — two `[role-*] tiny` test-artifact rows are live in the CRC
  library index and surface in `search_library` default results; no current test account owns
  them, so a prior stress test's account-revoke did not cascade-sweep its `library_index` rows.
- **Strongest positive:** the tenancy/permission **core holds at the MCP layer** — cross-org
  read wall (both directions), write-lands-in-author-org (inv 2), publish-audience org scoping
  (inv 3 / old BUG-9), and the v11.2 error contract (structured `machine_code`, 404 semantics,
  ISO timestamps) all behaved exactly to policy. BUG-1's propose→commit on a UUID-id setlist works.
- **Overall worthiness verdict: 7/10 (PROVISIONAL — MCP layer only).** The authoring/data
  substrate is trustworthy and the org walls are real; the consumer-facing worthiness (the part
  the band actually touches on Friday night) could not be exercised this session.
- **Cleanup: CLEANUP VERIFIED** — all 4 test accounts revoked, both probe setlists deleted,
  monitor bus 1 returned to empty; bus 5 (Daniel) byte-identical to pre-test snapshot.

---

## 2. Findings

Severity key: P0 data-loss/security/tenancy · P1 core flow broken · P2 degraded · P3 polish.
No fixes prescribed.

### BUG-1 (P2) — Orphaned test-artifact rows live in CRC library index
- **Persona/tenant/surface:** Musician+ (library viewers) · CRC · MCP `search_library` (and,
  pending verification, the in-app `/library` catalog).
- **Repro:**
  1. CRC bearer → `search_library({query:"", limit:8})`.
  2. Observe the first two rows: `"[role-band_leader] tiny"` (`upload-0d872e08-…`) and
     `"[role-musician] tiny"` (`upload-cef9ddf9-…`), both `orgId:"crc"`, `status:"active"`.
  3. `list_test_accounts({includeExpired:true})` at session start returned **only my 4 freshly
     minted accounts** — nothing owns these rows.
- **Expected:** Invariant 5 — "Test data (`isTest`) never appears on consumer surfaces." A
  musician browsing the CRC library should not see `[role-*]`-named scaffolding rows.
- **Actual:** Two clearly test-named rows persist in the active library index, returned by the
  default (non-`includeNonCharts`, non-`includeOrphaned`) `search_library` query.
- **Evidence:** `search_library` transcript, this session (CRC bearer).
- **VERIFY FIRST:** (a) Do these two rows carry `isTest:true`? `search_library` output does not
  expose the flag — read the raw `library_index` docs. (b) Do they actually render in the in-app
  `/library` catalog, or does the catalog hide them by a filter `search_library` doesn't apply?
  (c) Confirm root cause: does `revoke_test_account`/`cleanup_all_test_data` cascade
  `library_index` rows whose **uploader** was a since-revoked test account? (The v11.2 BUG-5
  sweep targeted owner-real `isTest` *setlists*; library uploads may be a separate gap.)

### BUG-2 (P2) — `/perform` cold-load performance below the band's 7-minutes-before-service bar
- **Persona/tenant/surface:** All consumers · both tenants (shared RUM) · `/perform`.
- **Repro:** `get_web_vitals_summary({sinceDays:7})` (admin) → route `/perform`.
- **Expected:** Pass B treats >2 s perceived load as friction; Core Web Vitals "good" thresholds
  are LCP ≤ 2.5 s, FCP ≤ 1.8 s, CLS ≤ 0.1, TTFB ≤ 0.8 s.
- **Actual (p75, field RUM, n≈280 on `/perform`):** **LCP 2600 ms** (over), **FCP 3247 ms**
  (poor), **TTFB 1545 ms** (poor), **CLS 0.15** (needs-improvement, layout shift on the band's
  primary surface), INP 56 ms (good). `/perform` is both the highest-traffic and the slowest route.
- **Evidence:** `get_web_vitals_summary` transcript (identical on both bearers).
- **VERIFY FIRST:** whether the p75 is dominated by cold first-loads / large first chart render
  vs. steady-state; and whether CLS 0.15 is the chart image reflowing after fonts/controls mount.
  Note this is field data, not a synthetic run — a browser-connected session should confirm the
  perceived feel on the iPad viewport.

### BUG-3 (P3) — Web-vitals RUM sink is not tenant-partitioned
- **Persona/tenant/surface:** Admin diagnostic · `get_web_vitals_summary`.
- **Repro:** Call `get_web_vitals_summary` on the CRC bearer and the broslaz bearer.
- **Expected:** ambiguous — policy does not cover admin diagnostics, so this is **not** an
  invariant breach (logged P3 for visibility, also raised as Policy Question 1).
- **Actual:** Both bearers return **byte-identical** output (same `sampleCount:921`, same five
  routes, same p75s). The RUM sink appears global, not scoped by `orgId`, so a broslaz-pinned
  admin sees CRC traffic mixed in and vice-versa.
- **Evidence:** two `get_web_vitals_summary` transcripts, diffed.
- **VERIFY FIRST:** is the global sink intentional (single ops dashboard) or should `surface`
  rows carry `orgId`? No consumer impact either way.

---

## 3. Policy questions (for Daniel, not Claude Code)

1. **Web-vitals tenancy:** Should the admin RUM projection (`get_web_vitals_summary`) be
   org-scoped, or is a single cross-tenant ops view intended? (See BUG-3.) The policy matrix has
   no cell for admin diagnostics.
2. **Publish-audience for host-derived consumers:** musicians are *not* org-gated for reads
   (host determines experience), yet `preview_publish` on the broslaz setlist counted **0
   musicians** while CRC counted 14. So the *notify* audience is org-roster-scoped even though
   *read* access is host-scoped. That looks correct against invariant 3, but it means a CRC
   musician who performs on broslaz via a host deep link receives **no** broslaz publish
   notification. Confirm that's the intended split (read = host, notify = org roster).
3. **D2 recordings (the ⚠️ pending cell):** still encoded ✅-implied. Untested this session
   (needs browser). Daniel's copyright-comfort veto remains open — flagging that it is still
   unverified against live anon playback.

---

## 4. UX friction journal (Pass B)

Pass B is a browser/iPad walk; with Chrome down, only the field-RUM-derived item below is
evidenced. The rest are in `## INCOMPLETE`.

| # | Item | Rating | Evidence |
|---|---|---|---|
| F-1 | `/perform` cold load exceeds the 2 s perceived bar (p75 LCP 2.6 s, FCP 3.2 s, TTFB 1.5 s) on the band's primary surface | **Annoying** | `get_web_vitals_summary` (BUG-2) |
| F-2 | `/perform` p75 CLS 0.15 — visible layout shift as the chart/controls settle | **Annoying** | same |
| F-3 | `/` (landing) p75 LCP 1.97 s, INP 128 ms — acceptable but the slowest interaction latency of the measured routes | **Minor** | same |

For contrast, `/setlists` and `/perform/setlist/[id]` are healthy (LCP ≈1.1–1.4 s, CLS ≤0.02).
The friction is concentrated on the single-chart `/perform` surface.

---

## 5. Coverage table

Legend: ✅ OK · 🐛 BUG-n · ⏭ untested (+why). "via MCP" = verified at the data/tool layer, not
the rendered UI.

### Read surfaces

| Cell | CRC | broslaz | Notes |
|---|---|---|---|
| Landing / branding (per host) | ⏭ Chrome down | ⏭ Chrome down | BUG-6-leak retest (STATE) needs browser |
| Setlist list (host org) | ✅ via MCP (`list_setlists` org-scoped) | ✅ via MCP | inv 1 holds at data layer; UI list ⏭ |
| Setlist detail + Perform | ⏭ Chrome down | ⏭ Chrome down | data readable via `get_setlist` ✅ |
| Chart deep link `/perform/[fileId]` | ⏭ Chrome down | ⏭ Chrome down | D2 anon render unverified |
| Recordings / audio (D2 ⚠️) | ⏭ Chrome down | ⏭ Chrome down | copyright-veto cell still open |
| Other-tenant chart via deep link (D3) | ⏭ browser | ⏭ browser | MCP cross-org read is *walled* (404) — see note |
| Library browse (host org) | ✅ via MCP scoped; 🐛 BUG-1 (orphan rows) | ✅ via MCP scoped | role-gate render ⏭ |
| Schedule view (public) | ⏭ Chrome down | ⏭ Chrome down | — |

> **D3 nuance:** the matrix expects *browser* deep links to open across tenants (scoping applies
> to lists, not direct URLs). I could not test the browser path. At the **MCP** layer the opposite
> is correct and expected: a CRC-pinned bearer 404s on a broslaz setlist id and vice-versa
> (authoring context is org-pinned). These are two different surfaces; the browser D3 cell is ⏭.

### Write & control surfaces

| Cell | Result | Notes |
|---|---|---|
| Create/edit/publish setlist — Leader (this org) | ✅ via MCP | create + propose→commit + reorder all succeed; lands `orgId` correctly (inv 2) |
| Write lands in author's org (inv 2) | ✅ | CRC bearer→`orgId:crc`; broslaz bearer→`orgId:brotherslazaroff` |
| Cross-org authoring wall (Leader other-org / inv 2) | ✅ via MCP | broslaz id via CRC bearer → structured 404, no write |
| Publish audience org-scoped (inv 3 / old BUG-9) | ✅ via MCP | broslaz preview = 3 recipients (0 musicians), **not** the old leaked 17; CRC = 17 |
| Monitor: assign bus (D6, privileged) | ✅ via MCP | `assign_monitor_bus` bus 1 → exclusive; `unassign` clears |
| Monitor: musician sees only own bus (D6) | ⏭ render | bus assignment data exclusive & correct; the *rendered* own-bus-only gate needs the musician bearer / `/monitor` UI |
| Monitor: unassigned musician sees no faders (D6) | ⏭ render | needs browser/bearer |
| Anon never sees write controls (inv 6) | ⏭ Chrome down | — |
| `/manage` gating (admin-only) | ⏭ Chrome down | — |
| `/admin` gating (admin-only) | ⏭ Chrome down | — |

### MCP error contract (v11.2 regression checks) — all ✅

| Check | Result | Evidence |
|---|---|---|
| `get_setlist` bad id | ✅ `{code:404, machine_code:"setlist_not_found", message, hint}` | transcript |
| `get_setlist` cross-org id (both directions) | ✅ structured 404 (org wall) | transcript |
| `propose_setlist_changes` bad id | ✅ structured 404 | transcript |
| `propose_setlist_changes` cross-org id | ✅ structured 404 (no write) | transcript |
| Deterministic client errors as 404 not 500 (BUG-2 v11.2) | ✅ | all above are 404 |
| ISO timestamps at MCP boundary (BUG-8 v11.2) | ✅ | stage `createdAt`/`ttlExpiresAt`, setlist `lastModifiedAt`/`date`/`updatedAt` all ISO-8601 Z |
| BUG-1 v11.2 (propose→commit on UUID-id setlist) | ✅ | staged 3, committed 3, `setlistVersion` 1→2 |

### QR flow (D5) — ⏭ entirely untested
`/qr/[code]`, `/api/auth/qr`, single-use/expiry, role-fidelity — all require the browser/HTTP
surface that was unavailable. Carry forward.

---

## INCOMPLETE — untested cells for the successor session (Chrome required)

Connect the Claude-in-Chrome extension, then run, on iPad landscape (1180×820) primary +
iPhone (390×844) + desktop (1440×900) spot checks:

1. **Pass A step 1 (Anon, both hosts):** landing/branding, setlist list, setlist detail, Perform
   mode, chart deep link `/perform/[fileId]`, a recording (D2), library URL (expect redirect/deny,
   D4), schedule (expect visible), `/manage` + `/admin` (expect deny), write controls invisible
   (inv 6). Capture console + network on every cold load.
2. **Pass A step 2 (cross-tenant deep links, D3):** open a broslaz chart/setlist URL from CRC
   context and as anon (expect opens); confirm UI lists stay host-scoped (inv 1) + no CRC-brand
   leak on broslaz authed header (STATE BUG-6 retest).
3. **Pass A step 3–5:** the test accounts are created `disabled:true` in Auth, so **UI login is
   blocked** — these personas (test-member library-hidden D4; test-musician full-read + no buses;
   test-musician-bus own-bus-only render D6) need either a non-disabled login path or
   bearer-injected `fetch` from the page console. Decide the mechanism, then test the *rendered*
   gates (the data-layer gates are already ✅ above).
4. **Pass A step 7 (QR, D5):** `/qr/[code]` + `/api/auth/qr` single-use/expiry/role fidelity.
5. **Pass B (all):** cold→find tonight's setlist→open→page/transpose→next song; play recording
   while viewing a chart; devtools-offline degradation; leader create→add 3→reorder→delete *in
   the UI*. Journal friction. (MCP equivalents of the leader-authoring path are already ✅.)

---

## 6. Cleanup ledger + confirmation

**Artifacts created this session (all `isTest`/test-namespaced):**

| Artifact | ID | Created on | Disposition |
|---|---|---|---|
| Test account — member | `test-stress0610-member-2478b63f` | CRC bearer | revoked (cleanup sweep) |
| Test account — musician (no bus) | `test-stress0610-musician-ede968ed` | CRC bearer | revoked (cleanup sweep) |
| Test account — musician (with bus) | `test-stress0610-musician-6038e57f` | CRC bearer | bus unassigned, then revoked |
| Test account — band_leader (crc) | `test-stress0610-band_leader-3de14fde` | CRC bearer | revoked (cleanup sweep) |
| Monitor bus 1 assignment | bus 1 ← `…musician-6038e57f` | CRC | unassigned (bus back to empty) |
| Setlist (inv-2 probe + BUG-1 commit + reorder) | `40661ae0-08d5-47e8-b833-d2fec7a7c5e7` (`orgId:crc`, isTest) | CRC bearer | deleted (3 tracks cascaded) |
| Setlist (inv-2 probe) | `ec479301-a6ee-4cb8-a9fa-d8afcbb81cb1` (`orgId:brotherslazaroff`, isTest) | broslaz bearer | deleted |
| Proposal stage (BUG-1) | `87d02f40-dcc3-4840-ac69-a1dc86b7129d` | CRC | one-shot, consumed by commit |

**Cleanup actions run:** `unassign_monitor_bus(1, …6038e57f)` → ok; `delete_setlist(40661ae0…)`
→ ok (3 tracks); `delete_setlist(ec479301…)` → ok; `cleanup_all_test_data({prefix:"stress0610"})`
→ `removed:4, mcpTokens:4, failures:[]`.

**Verification:** `list_test_accounts({includeExpired:true})` → `{accounts:[]}`.
`list_monitor_buses` → bus 1 `assignedTo:[]`, bus 5 still only Daniel (unchanged from pre-test
snapshot). Both probe setlist ids no longer resolve.

> ## CLEANUP VERIFIED
> No stress-test artifact remains. The only state I touched outside my own artifacts was the
> two `preview_publish` dry-runs (read-only, no writes/notifications) and read-only reads.
> **Pre-existing item NOT mine and left in place:** the two `[role-*] tiny` CRC library rows
> (BUG-1) — these predate this session; I did not create or delete them.

---

## Method notes / safety adherence

- **`publish_setlist` never called.** Only `preview_publish` (read-only dry-run) used. ✅
- **Monitor mix: no faders/mutes/matrix levels moved.** Bus assignment/unassignment only
  (no-notification, reversible). ✅ Bridge snapshot was stale (`stateStale:true`, last seen
  2026-06-06) — irrelevant since I touched no levels.
- **No destructive admin tools** except on artifacts I created (my test accounts + probe setlists). ✅
- **Web-fetch restriction honored:** with Chrome down I did not fall back to curl/bash/`fetch`
  against the live hosts. ✅
- All created data was `isTest:true` / `test-`-namespaced and logged above. ✅
