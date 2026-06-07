# FINDINGS — bus5-uid-orphan-cleanup
**Lane:** bus5-uid-orphan-cleanup | **Coder:** coder-1 | **Date:** 2026-05-27
**Scope:** Characterize + propose only — NO writes issued.

---

## 1. Identity Verdict

| uid | email | role | lastLoginAt | lastRefreshAt | verdict |
|-----|-------|------|-------------|---------------|---------|
| `93Xn3DbS0bSNb8zmfzLyfOMX1A13` | daniel@centralreform.org | admin | ~2026-05-26 (yesterday) | 2026-05-27T07:26Z (today) | **SURVIVOR** |
| `qIcEDdpHa5gr3cQVcGduPWyTxvQ2` | dsbogard@gmail.com | musician | ~2026-05-14 | 2026-05-20T13:42Z | **ORPHAN** |

**Survivor confidence: HIGH.** `93Xn3...` (centralreform.org) has the admin role and was refreshed today at 07:26Z. `qIcEDdpHa5gr3cQVcGduPWyTxvQ2` (dsbogard@gmail.com) has a `musician` role — clearly the pre-merge personal Google account that got denormed onto bus 5 during the account-merge transition.

---

## 2. Downstream Row Enumeration — Exhaustive

### 2a. config/monitor.busAssignments.5 — **AFFECTED**
Bus 5 ("rabbi wedge") `busAssignments` array contains TWO entries:
```json
[
  { "userId": "93Xn3DbS0bSNb8zmfzLyfOMX1A13", "userName": "Daniel Bogard" },  // SURVIVOR
  { "userId": "qIcEDdpHa5gr3cQVcGduPWyTxvQ2", "userName": "Daniel Bogard" }   // ORPHAN — remove
]
```
Buses 1–4 have null assignments (no entries). Only bus 5 is affected.

### 2b. monitor-live/state — NOT affected
The live state doc indexes mix data by bus index, not uid. The "rabbi wedge" (bus index 5) has a real send mix (32 channels, fader=0.7615) stored at the array position. **No uid field in state.buses[].** Removing the orphan from busAssignments will not touch or lose any mix data.

### 2c. musicians collection — NOT affected
Query `musicians where userId == qIcEDdpHa5gr3cQVcGduPWyTxvQ2` → **0 documents**.

### 2d. setlists collection — NOT affected
Query `setlists where ownerId == qIcEDdpHa5gr3cQVcGduPWyTxvQ2` → **0 documents**.

### 2e. Firebase Auth — NOT a task here
The orphan Auth account (`dsbogard@gmail.com`) still EXISTS with role=musician. This lane does NOT propose deleting or modifying the Auth account — only removing the bus 5 denorm. Daniel may want to separately decide whether to disable/delete the Gmail Auth account post-cleanup.

---

## 3. Proposed Fix

**Single write target:** `config/monitor.busAssignments.5` — filter the array to keep only the survivor entry.

**Proposed MCP call (for Daniel to confirm, NOT yet issued):**
```
unassign_musician({
  busIndex: 5,
  userId: "qIcEDdpHa5gr3cQVcGduPWyTxvQ2"
})
```

Or equivalently, a direct Firestore array-remove of the orphan map. The bridge routes by bus index, so removing the second entry has no audio effect — it only cleans up the per-uid query surface.

**Risk: MINIMAL.** The mix state (fader + 32 channel sends) lives in `monitor-live/state.buses[4]` indexed by position, not uid. The survivor uid (`93Xn3...`) remains as the sole assignment on bus 5, which is correct.

---

## 4. Summary

| Surface | Orphan uid present? | Action needed |
|---------|---------------------|---------------|
| `config/monitor.busAssignments.5` | YES (2nd array entry) | Remove orphan entry |
| `monitor-live/state` | NO (bus-indexed, no uid) | None |
| `musicians` collection | NO | None |
| `setlists` collection | NO | None |
| Firebase Auth account | YES (exists, musician role) | Optional — out of this lane's scope |

**Conclusion:** The orphan is `qIcEDdpHa5gr3cQVcGduPWyTxvQ2` (dsbogard@gmail.com). The only required data fix is removing it from `config/monitor.busAssignments.5`. One write, zero data-loss risk. Awaiting Daniel confirmation before any write is issued.

---

## 5. EXECUTED — 2026-05-27T21:11Z (coder-1)

**Status:** DONE. Daniel confirmed survivor (`93Xn3D…`, daniel@centralreform.org) + deleted the orphan Auth account (`dsbogard@gmail.com`) entirely. Per msg-bus5-APPROVED-execute-002, the orphan was still denormed on `config/monitor.busAssignments.5` (Auth deletion does not auto-clean the array entry), so the write was still required.

**Write issued:** field-path-scoped update of `config/monitor.busAssignments.5` → `[{userId:"93Xn3DbS0bSNb8zmfzLyfOMX1A13", userName:"Daniel Bogard"}]` (orphan `qIcEDdpHa5gr3cQVcGduPWyTxvQ2` filtered out). Mirrors `unassignMonitorBus`'s `FieldPath("busAssignments","5")` write semantics (`computeBusAssignmentRemove` → array minus orphan); buses 1–4 left null/untouched. No live monitor/bridge OSC command issued (mixer snapshot ~stale per dispatch caveat).

**Pre-write state (verified):** bus 5 = 2 entries [survivor, orphan], both "Daniel Bogard". Buses 1–4 null.
**Post-write state (independent re-read):** bus 5 = 1 entry [survivor only]. Buses 1–4 still null. `monitorBuses`, `bridge`, all other config fields preserved.

**Verdict:** orphan denorm removed; `list_monitor_buses` bus 5 now resolves to a single "Daniel Bogard". Zero data-loss (mix state in `monitor-live/state.buses[]` is bus-index-keyed, untouched). Lane complete — no code/git change (Firestore data fix only).
