# C8I1 §3 — publish gates (Gate 1 + Gate 2 + override-filter) transcripts

All probes against `https://www.centralreform.live/api/mcp` at prod SHA `edb24a47c10ef…` between 2026-05-19T22:37Z–22:41Z. Lane 1 design references: `cycle-7-fixes-lane-1-PROMPT.md` §65-69 + master/`1438cbef2` commit message + `src/lib/test-isolation.ts` + `src/lib/mcp/tools/setlist-publish.ts` (gates at lines ~370 + ~382, override-filter at line ~573 in edb24a47c's git tree).

**META observation worth flagging to supervisor:** Daniel's LOCAL working tree at `C:\Users\dsbog\CentralReform.live\sheet-music-app\` is OUT OF SYNC with `origin/master` `edb24a47c`. `src/lib/test-isolation.ts` is MISSING from disk, and `src/lib/mcp/tools/setlist-publish.ts` on disk is 727 lines vs 840 in git. This caused me to spend ~10 min believing the gates had regressed when in fact they ship and fire at prod. A `git status` / `git checkout .` from the daniel-machine working dir would resync; OR a `git pull --ff-only` if the local tree never advanced past the orphan-commit reset. Recommend supervisor relay to Daniel.

---

## §3.1 — Gate 1 (`test_owner_cannot_publish_to_real_humans`)

**Setup:** test-owner setlist `61198f36-3608-4aa8-86d5-faf25f72b422` (`ownerId:"test-c8i1-band_leader-9a2fde23"`, `isTest:true`, 3 tracks incl. 1 bonded song).

### §3.1a dryRun call from test-owner — observability returns 18 real recipients **BY DESIGN**

```
POST /api/mcp  publish_setlist({setlistId:"61198f36-…", dryRun:true}) via band_leader test bearer
→ {ok:true, recipientCount:18, recipients:[18 real human PII entries: Samantha rav2be@gmail.com, Karen Bogard karen@centralreform.org, Michael Koppelman michael@centralreform.org, Blake Mickens blake.mickens614@gmail.com, ben reece benjamminreece@gmail.com, Daniel Bogard daniel@centralreform.org, Itai Forte itai@forte.co.il, Drew Brodsky brodskydrew@gmail.com, David Lazaroff davidlazaroff@gmail.com, Communications CRC communications@centralreform.org, Andrew Warshauer andrewwarshauer@gmail.com, Bryn Sentnor brynsentnor@gmail.com, Myles Pollack myles.pollack@gmail.com, Shira Berkowitz shiraberk@gmail.com, Jake Weisman jakeweismanmusic@gmail.com, Daniel Bogard dsbogard@gmail.com, Becky Nelson-Zoole becky@centralreform.org, Drew Brodsky engineer.brodsky@gmail.com], delivery:{all-zeros}, snapshot:[1 song row], chartHealth:{bondedCount:1, okCount:1, unhealthy:[]}}
```

**This is the documented `[[feedback_dryrun_is_observability]]` behavior** — Lane 1 commit message: "BEFORE-recipient-resolution refusal gates on real-publish (dryRun unaffected — per `[[feedback_dryrun_is_observability]]`)". The C7I3-002 finding was downgraded at TRIAGE to "dryRun is observability, not a real-fanout leak", per the same convention. NOT a finding.

### §3.1b real-publish from test-owner — **GATE 1 FIRES** ✅

```
POST /api/mcp  publish_setlist({setlistId:"61198f36-…", dryRun:false, recipients:[{uid:"c8i1-fake-poison", email:"c8i1-fake@example.test"}]}) via band_leader test bearer
→ {ok:false, error:{code:403, machine_code:"test_owner_cannot_publish_to_real_humans", message:"Refusing to publish a test-owned setlist to real humans. The setlist owner uid is a test-shape uid (test-*, c<N>i<N>-*, cf<N>-*); fan-out would route to production band members."}, setlistId:"61198f36-…", ownerId:"test-c8i1-band_leader-9a2fde23", hint:"Use dryRun:true to inspect would-be recipients without sending. To actually publish, the setlist must be owned by a real (non-test) uid."}
```

Rich envelope; `errorCode:403`; setlistId + ownerId echoed; hint present. Zero fan-out. **PASS.**

(The poisoned `recipients` override also matches `c\d+i\d+-` so Lane 1's defense-in-depth filter would drop it; safe even if Gate 1 had missed.)

---

## §3.2 — Gate 2 (`cross_owner_publish_forbidden`)

### §3.2a dryRun call from test caller on real-owner setlist — observability returns 18 real recipients **BY DESIGN**

```
POST /api/mcp  publish_setlist({setlistId:"NWPBba50fltX6pNcyOVK" (Daniel-owned), dryRun:true}) via band_leader test bearer
→ {ok:true, recipientCount:18, recipients:[same 18 real humans as §3.1a]}
```

Identical to §3.1a — dryRun is observability for test callers per design.

### §3.2b real-publish from test caller on real-owner setlist — **GATE 2 FIRES** ✅

```
POST /api/mcp  publish_setlist({setlistId:"NWPBba50fltX6pNcyOVK", dryRun:false, recipients:[{uid:"c8i1-fake-poison", email:"c8i1-fake@example.test"}]}) via band_leader test bearer
→ {ok:false, error:{code:403, machine_code:"cross_owner_publish_forbidden", message:"Test-bearer callers may NOT real-publish a setlist owned by a real (non-test) uid. dryRun is permitted (observability)."}, setlistId:"NWPBba50fltX6pNcyOVK", callerUid:"test-c8i1-band_leader-9a2fde23", ownerId:"93Xn3DbS0bSNb8zmfzLyfOMX1A13", hint:"Pass dryRun:true to inspect recipients, or use a real (non-test) bearer to actually publish on behalf of the owner."}
```

Rich envelope; callerUid + ownerId echoed; hint present. Zero fan-out. **PASS.**

---

## §3.3 — Override-recipients defense-in-depth filter — **PASS** ✅

Admin caller (minted-child bearer `OpLJHUoSMRaLwDFsACOj` with uid-inherited admin via root `by9YfvDgDI0WqZo1IDIc`), real-owner setlist (`NWPBba50fltX6pNcyOVK`), override recipients = `[{uid:"test-c8i1-musician-0c83e8f9", email:"c8i1-filter-probe@example.test"}]`. With `force:true` to bypass chart-health (1 shortcut-unresolved row on this setlist).

```
POST /api/mcp  publish_setlist({setlistId:"NWPBba50fltX6pNcyOVK", dryRun:false, force:true, recipients:[{uid:"test-c8i1-musician-0c83e8f9", email:"c8i1-filter-probe@example.test"}]}) via admin minted-child bearer
→ {ok:false, error:{code:400, machine_code:"no_valid_recipients", message:"None of the supplied recipients resolved to a deliverable target (no email, and no uid that exists as a user doc)."}, setlistId, suppliedCount:1, resolvedCount:0, hint:"Verify the uids via list_users (or omit `recipients` to auto-derive from the band audience)."}
```

`suppliedCount:1, resolvedCount:0` — the single test-uid recipient was filtered out by Lane 1's `recipients = recipients.filter((r) => !isTestUid(r.uid))` defense-in-depth at setlist-publish.ts line ~573. Email field dropped along with the entry (filter is by recipient row, not field). Dispatch guard then refused with `no_valid_recipients` rather than silently sending to no-one. **No real-world side-effect; filter works.**

(Side observation: this probe also surfaces a real chart-health condition on `NWPBba50fltX6pNcyOVK` — "Lechu Goldman.pdf" has `shortcut_unresolved` status. Not a c8i1 finding; pre-existing chart bond condition. The chart-health envelope itself is rich + actionable per F-006.)

---

## §3 verdict

| Gate | dryRun behavior | real-publish behavior | Verdict |
|---|---|---|---|
| Gate 1 (test owner) | observability (returns audience) | `test_owner_cannot_publish_to_real_humans` 403 | **PASS** |
| Gate 2 (cross-owner) | observability (returns audience) | `cross_owner_publish_forbidden` 403 | **PASS** |
| Override-filter (defense-in-depth) | — | test-uid entries dropped → `no_valid_recipients` 400 | **PASS** |

**No HIGH/MED findings on the publish surface at deployed SHA `edb24a47c`.** C7I1-008 + C7I3-002 audience-leak class confirmed CLOSED at prod. C7I3-002 dryRun-PII behavior is the documented `[[feedback_dryrun_is_observability]]` design (downgraded at cycle-7 TRIAGE).

One META note re Daniel's local working-tree drift (above) for the supervisor to relay.
