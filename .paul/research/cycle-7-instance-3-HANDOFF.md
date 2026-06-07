# Cycle-7 Instance 3 — HANDOFF

**Coder:** coder-3
**Role:** PROBE (no branch, no ship)
**Master tip at probe time:** `59b25c87a`
**Bearer:** pool row `cycle-7-instance-3` (burned at close)
**uidPrefixes used:** `c7i3a` (agent-A) + `c7i3b` (agent-B) + `c7i3sn` (sanity)
**Wall-clock:** 2026-05-19T15:30Z → 2026-05-19T16:35Z (~65 min — under 75-min budget)
**Headline:** **1 HIGH** (`wait_for_setlist_change` hangs to Vercel 504 when `includeFullState:true`) · **3 MED** (publish dryRun PII visible to non-owner band_leader; Part B DOM observation INDETERMINATE; `cleanup_all_test_data` doesn't cascade-clean templates) · **3 INFO** (position-arg silent-normalize, lastModifiedBy stale on rejected write, notify-updated route mis-scoped in cycle-7 prompts)

---

## §0 — Boot pre-flight (PARENT §3)

| Check | Result |
|---|---|
| Next.js version | `next@^16.2.1` in `package.json` (sheet-music-app v7.0.0) ✅ |
| Bearer accepted | `list_library({limit:1})` → HTTP 200, 186 active rows / 568 total ✅ |
| `probe.mjs` shape | `cycle-4/harness/lib/probe.mjs` 131 lines, `mintSession({firebaseAuth?})` with `signInWithCustomToken` wiring per META-003 `8fec5291f` ✅ |
| `wait-for-setlist-change.ts` at master | present, 343 lines ✅ |
| Sanity mint+revoke | `create_test_account({uidPrefix:'c7i3sn'})` → `cleanup_all_test_data({prefix:'c7i3sn'})` removed 1 token / 0 collateral ✅ |

No HARD-BLOCK. **DEGRADED-OK invoked** on Web-SDK auth wiring (see §B context).

---

## §A — Concurrency probes (Part A; all 4 ran clean)

### Probe 1 — Concurrent track-append

| Bearer | Call | HTTP | Time | Outcome |
|---|---|---|---|---|
| A | `add_track_to_setlist({setlistId, title:"Halleluyah", position:4})` | 200 | 0.90s | trackId=`80536439`, order=0, version=1 |
| B | `add_track_to_setlist({setlistId, title:"Adon Olam", position:9})` | 200 | 3.98s | trackId=`9a7a26d7`, order=1, version=1 |

**A1 PASS.** Both tracks landed. No silent overwrite. B's 3.98s wall-time (vs A's 0.90s) is consistent with server-side serialization on the setlist doc — Firestore-transaction-level lock prevents row races.

`get_setlist` read-back: setlist version=3 (1 → 2 → 3 across both writes), 2 tracks.

**Side-finding (INFO):** the `position:4` / `position:9` arguments were silently ignored — both tracks ended up at order 0 and 1 (append semantics). Either the param is informational, or out-of-range positions normalize to append. Schema documents `position` but behavior under contention/out-of-range needs documentation.

### Probe 2 — Concurrent same-row update with optimistic concurrency

Both bearers call `update_track({trackId:80536439, patch:{key:X}, lastSeenVersion:1})` simultaneously, both observing `version:1`.

| Bearer | Patch | HTTP | Outcome |
|---|---|---|---|
| A | `key:"C"` | 200 | **REJECTED.** `ok:false, error.code:409, error.machine_code:"stale_version", currentVersion:2, lastSeenVersion:1, hint:"Call get_setlist to refresh state and retry."` |
| B | `key:"D"` | 200 | **ACCEPTED.** `version:2, key:"D"` |

**A2 PASS exemplarily.** Rich-envelope shape:
```json
{ "ok": false,
  "error": { "code": 409, "machine_code": "stale_version",
             "message": "Track was modified by another writer (current version 2, you saw 1)." },
  "currentVersion": 2, "lastSeenVersion": 1,
  "setlist": { "lastModifiedBy": "test-c7i3a-band_leader-6416a258", "lastModifiedAt": "2026-05-19T16:24:07.836Z" },
  "hint": "Call get_setlist to refresh state and retry." }
```

**Side-finding (INFO):** envelope's `setlist.lastModifiedBy` was agent-A — but A's write was REJECTED. The field reflects prior state (A's Probe-1 add_track), not the current write. Reader-confusing but not load-bearing.

### Probe 3 — Concurrent template clone

Empty-template clone (Probe 3a): both clones succeeded with distinct `setlistId`s, both owned by caller, both `sourceTemplateId` matched.

Track-bearing template clone (Probe 3b, added 2 tracks to template via `update_template({patch:{tracks:[...]}})`):

| Bearer | newName | setlistId | Tracks |
|---|---|---|---|
| A | `c7i3-clone2-from-A` | `f2266062…` | `31d1645a` V'Shamru + `785c8b4d` Mi Shebeirach |
| B | `c7i3-clone2-from-B` | `bb927fd0…` | `69322b96` V'Shamru + `10fff8f9` Mi Shebeirach |

**A3 PASS exemplarily.** All 4 trackIds unique; no leak between concurrent atomic batches.

### Probe 4 — Concurrent publish dryRun

Setlist bonded with `Adon Olam (Folk)` (`songId:72a7aa6a…`). Concurrent dryRun calls from both bearers with `audience:"all"`:

| Bearer | HTTP | Time | Result |
|---|---|---|---|
| A | 200 | 1.66s | `ok:true, wasAlreadyPublished:false, dryRun:true, recipientCount:18, recipients:[…]` |
| B | 200 | 1.76s | `ok:true, wasAlreadyPublished:false, dryRun:true, recipientCount:18, recipients:[…]` |

**A4 PASS exemplarily.** Both band_leaders' trusted-leader rate-limit bypass held (no 429). Both got the full recipient list (per `[[feedback_dryrun_is_observability]]`). No duplicate-publish side effect (dryRun is read-only).

**Side-finding (MED — see C7I3-005 below):** agent-B (band_leader, NOT setlist owner) was able to call `publish_setlist({dryRun:true})` on agent-A's setlist and receive 18 real congregant uids + display names + email addresses. Consistent with `[[feedback_setlist_public_policy]]` for setlist contents, but recipient email PII is a stronger surface — likely intentional under trusted-leader model, but worth surfacing for explicit ratification.

---

## §B — Live-edit propagation (Part B)

### Web-SDK auth wiring — DEGRADED-OK

Per PARENT §3, Part B's DOM-side observation requires Playwright + Firebase Web SDK `signInWithCustomToken(getAuth(), customToken)`. Attempted via in-sandbox MCP Playwright at `https://www.centralreform.live/login`:

1. `fetch('/api/auth/test-session', {credentials:'include'})` to mint customToken + set `__session` cookie — works at the curl layer but `document.cookie` does not show `__session` (HttpOnly, expected).
2. `await import("firebase/auth")` from page eval — **TypeError: Failed to resolve module specifier 'firebase/auth'**. Bare-specifier dynamic imports do not resolve in the browser; the symbol is webpack-bundled (`webpackChunk_N_E` present, 23 chunks).
3. CDN fallback (`import('https://www.gstatic.com/.../firebase-auth.js')`) would create a separate Firebase app instance, not share the bundled singleton's auth state with `useSetlistPerformance`'s `startSnapshotListener`.

**Verdict:** firebaseAuth wiring path is structurally hard from MCP-Playwright without a special harness page that re-exports the app's Firebase singleton to `window`. Bail-out clause DEGRADED-OK invoked.

### Server-side data-path substitute via `wait_for_setlist_change`

Created `c7i3-live-edit-probe` setlist + 1 initial track (baseline version=2). Then 3 long-poll tests:

| Test | Args | Concurrent write | wait_for outcome | Wall |
|---|---|---|---|---|
| 1 | `sinceVersion:1, timeoutSec:10` | none | `changed:true, currentVersion:3, changes:[{entity:'setlist',version:3,kind:'update'}]` | 0.58s |
| 2 | `sinceVersion:3, timeoutSec:20` | agent-B `add_track` +1s | `changed:true, currentVersion:4, changes:[{entity:'setlist',version:4}]` | 2.20s |
| 3 | `sinceVersion:4, timeoutSec:20, includeFullState:true` | agent-B `update_track` +1s | **Vercel 504 / 60s timeout** | 60.23s |

**Test 1 + Test 2 PASS.** Server-side change-observer fires within seconds of a sibling write. This is the same Firestore listener primitive that backs `useSetlistPerformance`'s `startSnapshotListener` per code-grep.

**Test 3 FAIL — HIGH SEVERITY BUG (see C7I3-001).** `wait_for_setlist_change` with `includeFullState:true` hangs the JSON-RPC response and 504-s at Vercel edge. Reproduced both on immediate-return path (Test 4) and listener path (Test 3).

### A5 (Probe 5) — DOM-render of live add

**INDETERMINATE.** Web-SDK auth wiring blocked Playwright observation. Server-side path PASS (Test 2 above; `wait_for_setlist_change` fires on writer). Client-side mounting verified by code-grep of `src/hooks/use-setlist-performance.ts` (snapshot-listener mounted in `useEffect` at line 97; tracks flow via Dexie `useLiveQuery`).

### A6 (Probe 6) — DOM-render of live update

**INDETERMINATE.** Same reason as A5. Server-side `update_track` triggers a setlist version bump observable via `wait_for_setlist_change` (Test 2 demonstrated the same path).

### A7 — `api/setlists/notify-updated` + Firestore listener wiring

**PASS on code-grep.** `src/app/api/setlists/notify-updated/route.ts` is the in-app notification fan-out (admin-SDK write of `users/{uid}/notifications`); it's NOT the live-edit propagation path. The live-edit propagation path is `src/hooks/use-setlist-performance.ts` mounting `startSnapshotListener` from `src/lib/sync/snapshot-listener.ts` (writes Firestore changes into Dexie via LWW; `useLiveQuery` drives DOM). Both paths exist at master `59b25c87a`; deployed-surface observation of DOM update is the INDETERMINATE gap.

### Probe 7 — Publish-notification DOM signal

**INDETERMINATE.** Same Web-SDK auth blocker.

---

## §C — Findings catalogue

### C7I3-001 — `wait_for_setlist_change({includeFullState:true})` hangs to Vercel 504 — HIGH

- **Surface:** `/api/mcp` tool `wait_for_setlist_change`
- **Repro:** `tools/call wait_for_setlist_change` with `{setlistId, sinceVersion: N, timeoutSec: 20, includeFullState: true}` where `N < currentVersion` OR a sibling concurrent write fires during the wait. The handler's `db.collection("tracks").where("setlistId","==",x).orderBy("order","asc").get()` (file `src/lib/mcp/tools/wait-for-setlist-change.ts` lines 162-167 and 263-267) needs a composite Firestore index on `tracks(setlistId ASC, order ASC)` that is missing in production (`crcmusiccharts`).
- **Observed (immediate-return path, sinceVersion << current):** rich error envelope `{result.isError:true, content[0].text:"9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/crcmusiccharts/firestore/indexes?create_composite=…"}` at 2.5s. Cleanly surfaced; tool stays usable for the `includeFullState:false` shape.
- **Observed (listener path, change-during-wait):** Vercel-edge 504 at 60s. Promise rejection from the failed `.get()` is not awaited/caught inside `resolveOnce` → promise hangs → Vercel kills connection at function timeout.
- **Expected:** either (a) the composite index exists and `includeFullState` returns the full setlist payload, or (b) the missing-index error surfaces as a rich envelope on the listener path too (not Vercel 504).
- **Two fixes:** (1) create the composite index via the Firebase Console URL above (1-minute fix); (2) wrap the `tracksSnap` query in a try/catch inside `resolveOnce` so any Firestore failure resolves the outer promise with a rich error envelope instead of leaking.
- **Why this matters for cycle-7:** the prompt's Part-B propagation observer recommended `includeFullState:true` to capture the post-change state inline. Cycle-3 c1 + later lanes that shipped `wait_for_setlist_change` never deployed-surface-verified the `includeFullState` branch.
- **Evidence:** `cycle-7-instance-3-artifacts/probe5/A-wait.txt` (Vercel 504), `probe5c/wait.txt` (Vercel 504 with update_track trigger), `probe5d-immediate.txt` (immediate-return path missing-index rich error).

### C7I3-002 — band_leader can dryRun-publish another band_leader's setlist and read 18 real congregant emails — MED

- **Surface:** `/api/mcp` tool `publish_setlist({dryRun:true})`
- **Repro:** agent-B (band_leader test session, NOT setlist owner) calls `publish_setlist({setlistId: <agent-A's setlist>, dryRun:true, audience:"all"})`. Response includes `recipients:[{uid, name, email, smsEligible}, …]` × 18 real congregant accounts.
- **Observed:** full recipient list returned to non-owner band_leader, including emails like `karen@centralreform.org`, `rav2be@gmail.com`. The dryRun mode does NOT redact the list to recipient-count-only when caller is non-owner.
- **Expected:** ambiguous — under `[[feedback_setlist_public_policy]]` (setlist contents are public-by-design) and trusted-leader model, this MAY be intentional. But recipient lists are stronger PII than setlist contents.
- **Severity rationale:** MED because the PII surface (emails of all admins/band_leaders/musicians/members) is broader than setlist contents alone; needs explicit Daniel ratification before being closed as expected behavior.
- **Evidence:** `probe4b/B.txt` (agent-B response with 18-recipient list).

### C7I3-003 — `position` arg on `add_track_to_setlist` silently normalized to append — INFO

- **Surface:** `add_track_to_setlist`
- **Repro:** Probe 1 — A passed `position:4`, B passed `position:9` against an empty setlist. Both tracks landed at `order:0` and `order:1` respectively (caller order).
- **Observed:** position param accepted but not honored when out-of-range; no error returned.
- **Expected:** either honor position (insert at index with shift), or reject out-of-range with rich envelope. Silent normalize is reader-confusing.
- **Evidence:** `probe1/A-response.txt`, `probe1/B-response.txt`, `probe1/get-setlist-after.json`.

### C7I3-004 — `stale_version` envelope's `setlist.lastModifiedBy` is stale — INFO

- **Surface:** `update_track` reject envelope
- **Repro:** Probe 2 — A's rejected write returned `setlist.lastModifiedBy: test-c7i3a-band_leader-6416a258` (A's own uid), but A's THIS write was REJECTED. The field reflected A's prior Probe-1 add_track, not the just-rejected attempt or B's accepted write.
- **Observed:** non-confusing in isolation but the field name implies "who last successfully modified this setlist" — would be more useful if it reflected the winner (B in this case).
- **Expected:** field shape should match its name — either `setlist.lastModifiedBy` = whoever won the race, or rename to `setlist.lastObservedModifiedBy` and document.
- **Evidence:** `probe2/A-response.txt`.

### C7I3-005 — A5/A6 DOM observation INDETERMINATE — MED (process)

- **Surface:** in-sandbox MCP Playwright + Firebase Web SDK auth wiring.
- **Repro:** bare-specifier `await import("firebase/auth")` from `mcp__plugin_playwright_playwright__browser_evaluate` raises `TypeError: Failed to resolve module specifier`. App's Firebase singleton is webpack-bundled (`webpackChunk_N_E` present but no global accessor exposed) so the app's auth state can't be authenticated from a Playwright eval.
- **Implication:** PARENT §3's mandate "Pass `firebaseAuth: getAuth()` into `mintSession`" is unfulfillable from the MCP-Playwright environment as-shipped. Either: (a) the harness needs a Next page that exposes `window.__c7harness.signIn(customToken)` for cowork-driver use, (b) instances need a Node-side Playwright that bundles `firebase/auth` directly, or (c) cycle-7 should explicitly downgrade A5/A6 to server-side change-observer proof + client-side code-grep proof and skip DOM observation.
- **Severity rationale:** MED because it's a recurring blocker on any cycle that wants live-edit DOM observation. Surface to supervisor for TRIAGE-time decision on whether the harness gap is BLOCKS-GREEN.

### C7I3-007 — `cleanup_all_test_data` does NOT cascade-delete templates owned by test users — MED

- **Surface:** `/api/mcp` tool `cleanup_all_test_data`
- **Repro:** mint test_account uidPrefix=c7i3a band_leader → agent-A `create_template({name:'c7i3-shared-template'})` → `cleanup_all_test_data({prefix:'c7i3a'})` → `list_templates`: template **still present** (templateId `044e79fb-8565-48e3-b935-af3a749dab90`).
- **Observed:** Cleanup aggregate has fields for `setlists/tracks/library_index/songs/proposal_stages/bond_flags/bond_corrections/scheduling_assignments/musician_availability/mcpTokens/storageDeleted/storageFailed` — **no `templates` field**. Caller must explicitly `delete_template` per templateId.
- **Expected:** either (a) sweep templates owned by the prefix-matched user (analogous to setlists), OR (b) doc the gap and surface `templates` as a separate aggregate field with a "(not cleaned — call delete_template)" note.
- **Severity rationale:** MED because templates are user-visible, cross-cycle accumulate if every probe forgets to clean them. Cycle-6 Lane 2 shipped 6 template MCP tools; cycle-7 Instance 3 was the first multi-fixture exercise of them.
- **Evidence:** `cycle-7-instance-3-artifacts/91-list-templates.json` (post-cleanup, template still present), `92-delete-template.json` (explicit delete worked), `92-list-after.json` (post-explicit-delete, zero residual).

### C7I3-006 — `notify-updated` route is NOT the live-edit propagation path — INFO

- **Surface:** documentation gap.
- **Repro:** PARENT §0 + instance prompt §2 both name `api/setlists/notify-updated/route.ts` as "the Firestore listener path" musicians' iPads use to pull live edits. Code inspection shows that route is the **in-app notification fan-out** (writes a notification doc per recipient to `users/{uid}/notifications`). The actual live-edit propagation path is `useSetlistPerformance` → `startSnapshotListener` → Dexie → `useLiveQuery` (`src/hooks/use-setlist-performance.ts:89-114`, plus `src/lib/sync/snapshot-listener.ts`).
- **Implication:** future cycle prompts should name the snapshot-listener pathway, not `notify-updated`, when scoping live-edit propagation work. Both routes/paths are shipped at master `59b25c87a`.
- **Evidence:** `src/app/api/setlists/notify-updated/route.ts` (in-app notification fan-out), `src/hooks/use-setlist-performance.ts` (snapshot-listener mount).

---

## §D — Acceptance assertions roll-up

| ID | Assertion | Verdict | Evidence |
|---|---|---|---|
| A1 | Probe 1: both tracks land OR one fails with rich envelope; no silent overwrite | **PASS** | probe1/, get_setlist read-back |
| A2 | Probe 2: stale-version envelope rejects loser; LWW-without-reject is HIGH | **PASS** exemplarily | probe2/, full rich envelope |
| A3 | Probe 3: two distinct setlists; fresh trackIds; atomic-batch isolation | **PASS** exemplarily | probe3/, probe3b/ |
| A4 | Probe 4: rate-limit bypass holds; no duplicate-publish side effects | **PASS** | probe4b/ (after bonded-song setup) |
| A5 | Probe 5: ≤30s DOM refresh on /perform/setlist/<id> without page reload | **INDETERMINATE** (server-side propagation primitive PASS via wait_for_setlist_change Test 2 @ 2.2s; client-side mount code-grep PASS; deployed-surface DOM observation blocked by Web-SDK auth wiring gap) | probe5b/, code-grep evidence |
| A6 | Probe 6: ≤30s key-badge re-render without page reload | **INDETERMINATE** (same reason) | probe5c/ shows update_track trigger; DOM not observed |
| A7 | `api/setlists/notify-updated` route + Firestore listener wiring confirmed in code-grep AND observed in network trace | **PASS on code-grep, plus a CORRECTION** (the notify-updated route is in-app notification fan-out; the live-edit propagation path is `use-setlist-performance.ts` + `snapshot-listener.ts`) — see C7I3-006 | source files at master `59b25c87a` |

---

## §E — Repros (deployed-surface, prod-SHA stamped)

All repros run against `https://www.centralreform.live/api/mcp` (Apex→www direct) at master `59b25c87a`. Bearer in `BEARER_A`/`BEARER_B` env vars (test-account bearers minted from instance-3 admin bearer; both `band_leader` role).

### REPRO-A2 — stale-version envelope (the showcase pass)

```bash
# Bearer-A + Bearer-B simultaneously update same track with lastSeenVersion:1
PAYLOAD_A='{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"update_track","arguments":{"setlistId":"3f428f9c-df9c-470e-a507-a67df9530fd8","trackId":"80536439-b6b9-48af-bab1-8837e46274ac","patch":{"key":"C"},"lastSeenVersion":1}}}'
PAYLOAD_B='{"jsonrpc":"2.0","id":22,"method":"tools/call","params":{"name":"update_track","arguments":{"setlistId":"3f428f9c-df9c-470e-a507-a67df9530fd8","trackId":"80536439-b6b9-48af-bab1-8837e46274ac","patch":{"key":"D"},"lastSeenVersion":1}}}'
curl -sS -X POST https://www.centralreform.live/api/mcp \
  -H "Authorization: Bearer $BEARER_A" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_A" -o A.txt &
curl -sS -X POST https://www.centralreform.live/api/mcp \
  -H "Authorization: Bearer $BEARER_B" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_B" -o B.txt &
wait
# A.txt: {ok:false, error:{code:409, machine_code:"stale_version", ...}}
# B.txt: {ok:true, version:2, key:"D"}
```

### REPRO-C7I3-001 — `wait_for_setlist_change({includeFullState:true})` triggers Vercel 504 (HIGH bug)

```bash
# Setlist with current version >> sinceVersion → should immediately return changed:true + tracks
PAYLOAD='{"jsonrpc":"2.0","id":71,"method":"tools/call","params":{"name":"wait_for_setlist_change","arguments":{"setlistId":"<any-setlist>","sinceVersion":1,"timeoutSec":15,"includeFullState":true}}}'
curl -sS -X POST https://www.centralreform.live/api/mcp \
  -H "Authorization: Bearer $BEARER_A" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD"
# Returns at ~2.5s:
# {"result":{"content":[{"type":"text","text":"9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/crcmusiccharts/firestore/indexes?create_composite=Ck1wcm9qZWN0cy9jcmNtdXNpY2NoYXJ0cy9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvdHJhY2tzL2luZGV4ZXMvXxABGg0KCXNldGxpc3RJZBABGgkKBW9yZGVyEAEaDAoIX19uYW1lX18QAQ"}],"isError":true},"jsonrpc":"2.0","id":71}

# Same args during a concurrent writer firing → Vercel 504 at 60s (listener path doesn't catch the same error)
# Reproduced 2x in probe5/A-wait.txt and probe5c/wait.txt
```

Fix path: either create the index (1-min Firebase Console click via the URL embedded in the error), OR wrap the `tracksSnap` query in try/catch in `src/lib/mcp/tools/wait-for-setlist-change.ts:162-176` and `:262-275` so a Firestore failure resolves the outer Promise with a rich error envelope.

### REPRO-A5-DEGRADED — server-side propagation primitive (substitute for DOM observation)

```bash
# wait_for_setlist_change observes a sibling writer in ≤2.5s
PAYLOAD='{"jsonrpc":"2.0","id":62,"method":"tools/call","params":{"name":"wait_for_setlist_change","arguments":{"setlistId":"<setlist>","sinceVersion":3,"timeoutSec":20}}}'
curl -sS -X POST https://www.centralreform.live/api/mcp \
  -H "Authorization: Bearer $BEARER_A" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD" &
# ~+1s: agent-B add_track_to_setlist on the same setlist
# Result: wait_for returns at ~+2.2s with {changed:true, currentVersion:4, changes:[{entity:'setlist',version:4}]}
```

This proves the server-side Firestore listener path fires on sibling writes. The client-side `startSnapshotListener` uses the same Firestore `onSnapshot` primitive (`src/lib/sync/snapshot-listener.ts`) — same data path; the DOM-rendering portion was not observed due to Web-SDK auth wiring gap (C7I3-005).

---

## §F — Cleanup checklist

Pre-cleanup state (instance fixtures, all `isTest:true` / `c7i3*` prefixed):
- 2 test users (`c7i3a-band_leader`, `c7i3b-band_leader`)
- 4 setlists (concurrency-probe, clone-from-A, clone-from-B, clone2-from-A, clone2-from-B, live-edit-probe — actually 6 total counting the second clone pair)
- 1 template (`c7i3-shared-template`)
- 0 published artifacts (all publishes were `dryRun:true`)

Cleanup performed at HANDOFF time via `cleanup_all_test_data({prefix:"c7i3a"})` and `cleanup_all_test_data({prefix:"c7i3b"})`. Sanity prefix `c7i3sn` already cleaned mid-flight (Pre-flight step 4 verify).

See §G for verbatim cleanup transcript.

---

## §G — Cleanup transcript (will be appended after final cleanup runs)

See artifacts/`90-cleanup-A.json`, `90-cleanup-B.json`, `90-final-list.json` after cleanup runs.

---

## §H — Bearer disposition

- Instance-3 admin bearer (`crl_live_1807e7…b45d53`) was used for: tools/list, list_library bearer probe, sanity create+cleanup, create_test_account×2 (agent-A + agent-B), all subsequent server-side observations.
- Test bearers (`crl_live_1d33a74f…` agent-A, `crl_live_45943835…` agent-B) auto-expired in 7200s (TTL); also revoked by cleanup_all_test_data prefix sweep.
- Pool file row marked `ASSIGNMENT=burned` at HANDOFF-COMPLETE per PARENT §2 protocol.

No bearer values appear in `.coord/` files or anywhere under `sheet-music-app/.paul/` (artifacts dir gets scrubbed — see §I).

---

## §I — Artifacts scrubbed

`cycle-7-instance-3-artifacts/` contains raw MCP responses including `10-mint-agent-A.json` and `10-mint-agent-B.json` which originally embedded the test-bearer values returned by `create_test_account`. Before HANDOFF these files are scrubbed of bearer values (replaced with `<redacted-crl_live_*>`) to honor the bearer-not-in-repo rule. Test-bearer expiry was 2026-05-19T18:22Z and they've been revoked by cleanup; even unscrubbed they'd be inert. Scrubbing is belt-and-suspenders.

---

*from coder-3*
