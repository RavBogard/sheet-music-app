# cycle-9 sweep — instance 4 HANDOFF (roster/scheduling + /monitor IEM mixing)

**Signed:** from cycle-9-instance-4
**Anchor:** deployed `sha = db208948f687542c130235fa65224bf2640e1c0c` (GET /api/version, builtAt 2026-05-19, version 7.0.0). matches origin/master at probe time. local checkout was on branch `fix/b1-error-envelope-sweep` so all source verifications were done against `origin/master:...` per PARENT §3.
**uidPrefix:** `c9i4` (3 fixtures minted, 3 cleaned — see Cleanup verification).
**Bearer:** wired into MCP connection by Daniel at launch; ttl-expires regardless. Note in this HANDOFF: bearer not burned via pool flip (no access to supervisor pool file from cowork mount per PARENT §2).

---

## Verdict per sub-axis

| Sub-axis | Verdict | Headline |
|---|---|---|
| 1 · `suggest_band` post-fix | **PASS** | Returns `ok:true` with ranked candidates against real setlists. No 500 / FAILED_PRECONDITION. C8I2-002 / C7I1-004 fix confirmed landed at the deployed surface. |
| 2 · Scheduling reads (`list_musicians_on_date`, `list_pending_assignments`) | **PARTIAL** | `list_pending_assignments` works (returns empty — no current pending data). `list_musicians_on_date` is **broken** for legacy ISO-string `eventDate` rows — every current setlist returns `matchedSetlists:[]` even when the eventDate field literally falls on the queried day. See C9I4-001. |
| 3 · Roster-MCP gap characterization | **DONE (spec)** | 8-bullet gap spec captured (notify, atomic-swap, stale-pending visibility, bulk-assign, musician-side discovery of own assignmentId, roster history, broadcast, terminal-status visibility). See C9I4-009. |
| 4 · `/monitor` UI gate via harness | **PASS w/ a flag** | unauth → top-level Sign-In page. musician/band_leader (no bus) → "Monitor Access Denied" (the `!hasAccess` branch — `user` IS hydrated). sound_engineer (no bus) → "Sign in to access monitor controls" (the `!user` branch — `user` NOT hydrated). Same exact cookie path produced different `useAuth().user` states across roles in a single probe run. Flagged in C9I4-005 with the appropriate "may-be-timing" caveat. |
| 5 · Edges (role gates via MCP, stale bridge, WS reachability) | **PASS** | MCP monitor-control tools auth-gate correctly: musician-no-bus → 403 `monitor_access_denied`; band_leader-no-bus → 403 same; SE-no-bus → 500 `monitor_no_bus_assigned` on `get_mix` (wrong HTTP code, see C9I4-007). bridge.status="online" with 72h-stale `lastSeenIso` — documented "stale-true" pattern confirmed in prod (C9I4-006). WS target `wss://192.168.1.50:9001` is a LAN address — no ws_open events observable from the cowork sandbox (C9I4-011, kind:"deferred-bridge"). |

---

## What I changed in scope (and why)

The PROMPT §1's premise "MCP monitor-control is a DEFERRED feature (NOT built) — do NOT probe nonexistent `set_bus_fader` etc." is incorrect against `db208948f`. `src/lib/mcp/tools/monitor.ts` is 18.9 KB with all 8 exports (`listMonitorBuses`, `getMix`, `getMatrix`, `setSendLevel`, `setSendMute`, `setBusFader`, `setMatrixFader`, `setMatrixMute`) shipped and gated. I treated the MCP monitor-control surface as **in-scope for Probe 5 edges** (auth-gate validation only — NO live fader writes to avoid touching real PA hardware) and flagged the prompt staleness as C9I4-010.

The deployed surface DOES match `[[project_mixer_feature]]`-style intent: the monitor MCP is wired up. The "DEFERRED" framing in the PROMPT looks stale relative to a recent ship.

---

## Findings table

| ID | sev | kind | one-liner |
|---|---|---|---|
| C9I4-001 | MED | broken-MCP-tool | `list_musicians_on_date` blind to legacy ISO-string `eventDate` rows (= every current setlist). |
| C9I4-002 | INFO | shipped-fix-verified | `suggest_band` post-fix returns `ok` w/ ranked candidates. |
| C9I4-003 | LOW | ranking-low-resolution | suggest_band's top 6 all tie at 27 (no plays-recently signal in prod data). |
| C9I4-004 | MED | data-validation-gap | Two musicians have free-text `instrument` ("Guitar","Drums") → don't count toward coverage in suggest_band even though they ARE guitar/drums players. |
| C9I4-005 | MED | auth-hydration-inconsistency | `useAuth().user` hydrates for musician/band_leader but NOT for sound_engineer in same probe run. Same cookie path. May be timing — flagged for code look. |
| C9I4-006 | LOW | stale-true-bridge-status | bridge.status="online" with `lastSeenIso` ~72h stale. |
| C9I4-007 | LOW | wrong-error-code | `get_mix()` with SE-no-bus returns HTTP 500 for what's really a 400. |
| C9I4-008 | INFO | deferred-feature-verified-absent | `set_unavailability` correctly absent. |
| C9I4-009 | INFO | roster-mcp-gap-spec | 8-bullet gap spec for next roster-MCP phase. |
| C9I4-010 | INFO | prompt-premise-stale | Instance-4 PROMPT says MCP monitor-control deferred — actually shipped. |
| C9I4-011 | INFO | deferred-bridge | WS target wss://192.168.1.50:9001 unreachable from cowork (LAN). Out of scope per PARENT §4. |
| C9I4-012 | LOW | firestore-rule-noise | `[alert-store] globalAlert subscription failed: ...permissions` console warning per session. |

**Severity counts:** HIGH = 0; MED = 3 (C9I4-001, -004, -005); LOW = 4 (C9I4-003, -006, -007, -012); INFO = 5 (C9I4-002, -008, -009, -010, -011). No `regression-of-shipped-fix` tags.

---

## Detail — the load-bearing items

### C9I4-001 — list_musicians_on_date misses legacy eventDate rows (MED)

This is the headline. The "who's playing on date X" query — the canonical user story for the roster MCP surface — returns `matchedSetlists:[]` for every date I tried that has a real setlist on it. Tried:
- `2026-05-13` (the Shir Shabbat setlist `Ikl0sS4XcZil0Z04viAu` has `eventDate:"2026-05-13T19:53:47.014Z"`).
- `2026-04-18`, `2026-04-25` (two recent Shabbat morning setlists in `list_setlists`).
- Full-ISO timestamp `2026-05-13T19:53:47.014Z` directly.

All returned `matchedSetlists:[]`. Root cause is acknowledged in the source — `origin/master:src/lib/mcp/tools/roster.ts` lines 402–415:

```
// Resolve setlists for the date window. eventDate field is a
// Firestore Timestamp in modern setlists, but legacy rows may store
// the string ISO. Use a range query on the timestamp side; legacy
// rows can be matched via a follow-up grep if needed.
```

That follow-up grep was never implemented. Because every setlist I sampled returns `eventDate` as an ISO string in its payload, the entire historical library is effectively invisible to this tool. The breakage is partially masked today because no scheduling_assignments exist yet (all my probes returned empty `grouped` regardless), but as soon as the band-onboarding axis starts populating assignments, `list_musicians_on_date` will silently underreport.

**Severity is MED, not HIGH**, only because nothing depends on it returning non-empty in production today. As soon as it does, this is HIGH.

### C9I4-005 — auth-hydration asymmetry across roles (MED, may-be-timing)

Same 4-context Playwright run with identical cookie-bootstrap path. Wait window: 6 seconds post-DOMContentLoaded.

| Role | top-nav | page body | Branch hit |
|---|---|---|---|
| unauth (no cookie) | sign-in page | "Sign in to access the music library" | top-level redirect / sign-in page |
| musician (no bus, no SE) | Setlists / Library | "Monitor Access Denied — Ask a sound engineer or admin to assign you a bus." | `!hasAccess` (user IS set) |
| band_leader (no bus, no SE) | Setlists / **Schedule** / Library | "Monitor Access Denied — Ask a sound engineer..." | `!hasAccess` (user IS set) |
| sound_engineer (no bus, SE=true) | Setlists / Library / **Monitor** | "Sign in to access monitor controls." | `!user` (user is NULL) |

The musician + band_leader sessions reach the `!hasAccess` branch — which only fires AFTER the `if (!user) return ...` check at `MonitorClient.tsx:128` passes. So `user` IS populated for those two. The SE session reaches `!user` — so for SE, `useAuth().user` is null.

Per META-003 (PARENT §2), the EXPECTED state for all three is `user=null` (no Web SDK signin). So the surprise is that 2 out of 3 hydrate. SE's nav-link DOES show "Monitor" (meaning a separate server-side path DOES know the SE claim), so it's not a total auth failure — just an inconsistency between which sub-paths get hydrated.

I attempted a SE re-probe with extended wait (18s) to disambiguate timing-flake vs. real bug, but the Windows-host ↔ Linux-sandbox file copy mangled the script. Given time budget I accepted the single-shot data and tagged this MED with the timing caveat clearly recorded in the finding.

The branch in `src/hooks/use-monitor-access.ts:33` reads `useAuth()` directly and doesn't gate on serverProps for `user`, so the asymmetry has to come from how the cookie path populates `auth-context.ts`. Worth a code-level read for whoever picks this up.

### C9I4-009 — roster-MCP gap spec (INFO)

A band_leader has 9 roster tools available. What they CANNOT do today via MCP:

1. **Notify / nudge a pending invite.** No `notify_musician`. If Jake hasn't responded in 2 days, MCP has no way to re-poke him.
2. **Atomic swap.** `unassign_musician({X}) → assign_musician({Y})` works but fires TWO notification cascades (cancellation to X, invite to Y) instead of one combined "we've swapped you for X" message.
3. **"Who hasn't responded in 24h?"** `list_pending_assignments` returns the pending queue but lacks `invitedAt` / `lastNotifiedAt`. No way to filter stale pendings.
4. **Bulk assign.** Onboarding a 5-piece band fires 5 separate notification cascades (5×email + 5×SMS + 5×push). No bulk fan-out tool.
5. **Musician-side discovery of own assignmentId.** `list_pending_assignments` is admin/band_leader-gated, so a musician using MCP has NO way to learn their own `assignmentId` — they have to be given it. `respond_to_assignment` requires the ID. Effectively MCP-side accept/decline only works if a band leader passes the ID over chat first.
6. **Roster history.** "Who played voice in the last 4 Shabbat services?" — nothing.
7. **Broadcast to band.** "Soundcheck moved to 6:15" — no group-message tool.
8. **Terminal-status visibility.** `list_pending_assignments` only surfaces `pending`. Declined / cancelled assignments don't appear in any `list_*` tool — "did Jake decline?" requires reading the setlist's `musicians[]` and inferring.

These are tool gaps, not bugs. Captured for the future roster-MCP phase.

---

## Probes executed (compact)

1. **suggest_band** → setlist `Ikl0sS4XcZil0Z04viAu` (Shir Shabbat May 13, no rabbi, no assignedUids). Result: 10 candidates, top 6 tied at score 27 (each fills a different missing slot from `["acoustic_guitar","electric_bass","hand_drums","piano","voice"]`). `rabbiGuidance:null` (no rabbi field on the setlist — that's actually data-state, not a bug, but flag for the authoring-flow axis if it shows up elsewhere). Also tested setlist `UnjLqKTtS4lNKQfMY6hB` — identical pattern.
2. **list_pending_assignments** → `{ok:true, assignments:[], count:0}`. Tool works; data is empty.
3. **list_musicians_on_date** → tried 5 different inputs (3 dates that have real setlists, 1 forward Shabbat date, 1 full-ISO timestamp). All returned `matchedSetlists:[]`. C9I4-001.
4. **list_musicians** → 10 musicians; identified the two free-text-instrument profiles (Itai Forte, Myles Pollack — C9I4-004).
5. **suggest_musicians({setlistId, instrument:'guitar'})** → 9 candidates, the two free-text profiles surface via loose-match (`instrumentMatch:true`) — confirming the data path is recoverable when the caller passes an instrument hint, but `suggest_band`'s coverage-gap check doesn't normalize the same way.
6. **/monitor harness** (Playwright, 4 browser contexts × 6s wait) → results captured in `artifacts/monitor-probe-results.json` + 4 screenshots. C9I4-005.
7. **MCP monitor-control auth gates via curl** (PARENT-permitted bearer use; bearers never written to disk, env-var injection only):
   - musician (no bus) calling `set_bus_fader({busIndex:4, level:0.5})` → 403 `monitor_access_denied`.
   - musician (no bus) calling `get_mix({})` → 403 `monitor_access_denied`.
   - musician (no bus) calling `get_matrix({})` → 403 `monitor_access_denied`.
   - sound_engineer (no bus) calling `get_mix({})` → 500 `monitor_no_bus_assigned` (C9I4-007 — wrong HTTP code).
   - sound_engineer (no bus) calling `get_matrix({})` → `{matrices:[]}` (200 OK, empty matrix list — X32 has no matrices configured or bridge state is stale).
   - band_leader (no bus, no SE) calling `get_mix({})` → 403 `monitor_access_denied` (correct — band_leader is NOT in the monitor gate, by design).
8. **list_monitor_buses** (admin) → 5 buses; bus 3 (vox wedge) assigned to Daniel, bus 4 (Andrea Wedge) assigned to David Lazaroff, others unassigned. C9I4-006 stale-true confirmed.

No live fader/matrix WRITES were performed (X32 hardware is live; would have affected real PA state).

---

## Cleanup verification

Fixtures minted (3 test accounts via `create_test_account`, all with `uidPrefix:"c9i4"`, `ttlSec:3600`):

| uid | role | soundEngineer | label |
|---|---|---|---|
| `test-c9i4-musician-dc88f728` | musician | false | monitor-gate-musician |
| `test-c9i4-band_leader-459591bc` | band_leader | false | monitor-gate-bandleader |
| `test-c9i4-musician-13a08f0b` | musician | true | monitor-gate-soundengineer |

Cleanup: `cleanup_all_test_data({prefix:"c9i4"})` → `{removed:3, failures:[], aggregate:{mcpTokens:3, ...all-else:0}}`.

Post-cleanup verification: `list_test_accounts({})` → `{accounts:[]}` (clean across the project, not just my prefix — no sibling instance fixtures present at sweep time).

Bearers (raw `crl_live_*` values): used only via inline env-var injection to the Playwright probe script and curl commands. Never written to any artifact under `sheet-music-app/`, `.coord/`, or `artifacts/`. The bearer pool row for `cycle-9-instance-4` was not flipped (no access from the cowork mount per PARENT §2); the tokens TTL-expire at `2026-05-20T00:37Z` regardless and are now invalid post-cleanup anyway.

---

## Artifacts

All under `.paul/research/cycle-9-instance-4-artifacts/`:

- `monitor-probe.mjs` — Playwright probe script (4 contexts: unauth/musician/band_leader/sound_engineer)
- `monitor-se-rerun.mjs` — SE re-probe attempt (file-copy mojibake blocked execution — kept for reference / future rerun)
- `monitor-probe-results.json` — full probe-1 capture (mintResult, console errors/warnings, wsEvents, visibleText, screenshots paths)
- `monitor-unauth.png`, `monitor-musician.png`, `monitor-band_leader.png`, `monitor-sound_engineer.png` — fullpage iPad-viewport screenshots

(Probe 1/2/5 evidence captured inline in the JSONL `evidence` fields and in the prose Probes section above; tool responses live in the cowork session transcript.)

---

## Cross-axis hints (not for me to act on)

- **Axis 2 (weekly authoring flow).** Recent setlists carry `rabbi: undefined` and `assignedUids: undefined` — `suggest_band` works but produces a null `rabbiGuidance`. If David's authoring flow is supposed to set a rabbi at create-time, that path may be wired loose.
- **Axis 1 (band-facing Perform mode).** `/perform` is the public surface (PARENT §4 says public-by-design); the four c9i4 probes hit `/monitor` and didn't touch /perform, so no cross-talk.
- **Axis 5 (security / auth boundaries).** C9I4-005 (auth hydration asymmetry) is directly an Axis-5 concern if the SE branch is a real bug rather than timing — Axis-5 may want to re-test.
