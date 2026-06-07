# Probe 3 — publish_setlist + preview_publish + chart-health gate

## Observability comparison: publish(dryRun) vs preview_publish

`publish_setlist({setlistId, dryRun:true})` returned:
- `recipientCount: 17` + full `recipients[]` (uid/name/email/smsEligible)
- `delivery: {inApp:{sent:0,failed:0}, push:0/0, email:0/0, sms:0/0}` — confirmed no fanout
- `snapshot[]` of 15 song-type rows only (15 ≡ bondedCount; section headers/prayers/transitions/readings/notes stripped — published snapshot is song-row only by design)
- `chartHealth` with full unhealthy[] list (4 missing)
- `version: 8` post-call

`preview_publish({setlistId})` returned:
- Same `chartHealth` (F-006 unification holds)
- `audience: {count:17, breakdown:{admin:3, band_leader:1, musician:13, member:0}}` — higher-level role count
- `snapshotDiff: {addedTracks:[15…], removedTracks:[], modifiedTracks:[]}` — since `wasAlreadyPublished:false`, everything is "added"
- `flaggedBonds: 0`
- `recommendation: "hard_block"` — the agent-decision signal

Both shapes are useful. preview_publish is the agent-decision endpoint;
publish_setlist(dryRun) is the raw observability + recipient introspection
endpoint.

## Refusal layer cake (load-bearing positive)

Sequence confirmed by direct probes:

1. **Chart-health gate fires first** — `publish_setlist({recipients:[{uid:self}]})`
   (no dryRun, no force) → `{ok:false, machine_code:"publish_refused_unhealthy_charts", chartHealth, hint}`. Clean envelope, lists every unhealthy chart by title + reason.
2. **`force:true` bypasses chart-health gate** — the next layer fires.
3. **Publisher-self filter** — `{recipients:[{uid:self}], force:true, dryRun:true}`
   → `{ok:false, machine_code:"no_valid_recipients", suppliedCount:1, hint}`.
   Confirms publisher's own uid is stripped from the recipient list (even at dryRun),
   and the writer refuses rather than silently emitting a 0-recipient publish.

Both refusals include a `hint` field tailored to remediation. **This is the
right shape.**

## Recipient-list observation (worth flagging)

The 17 derived recipients include:
- "Daniel Bogard" (qIcEDdpHa5gr3cQVcGduPWyTxvQ2, dsbogard@gmail.com) — this is a SECOND Daniel Bogard account distinct from the setlist owner (93Xn3DbS0bSNb8zmfzLyfOMX1A13). The wired bearer's self-filter removes the OWNER uid but the second uid stays in the recipient list. **Probably a duplicate-account hygiene issue** (intersects with axis 5 — auth/multi-role).
- "Communications CRC" (communications@centralreform.org) — a non-musician shared inbox getting band publish notifications. Not necessarily a bug (might be intentional for the dev/comms team) but worth confirming this is desired.
- 1 musician marked `smsEligible: true` (Becky Nelson-Zoole) — only one SMS-opted-in user in the entire band fanout pool. On first publish she'd be SMS'd; re-publish skips SMS per docs.

## Gates I could NOT exercise from this MCP bearer

- **Cross-owner gate** (non-admin band_leader trying to publish someone else's setlist) — requires a non-admin bearer; this MCP connection is wired to admin only. **Sweep ergonomics gap** — see Probe 7 ergonomics narrative.
- **Test-owner gate** — same problem; would need a `test-c9i2-band_leader` bearer to make MCP calls.

## Findings

### POSITIVE — publish refusal layer cake is clean
machine_codes + structured hint payloads + tailored remediation strings on
both the chart-health and recipient-validity refusals. The shape matches what
agents need to chat-confirm with the user.

### MED — duplicate Daniel Bogard accounts in active recipient pool (C9I2-006)
Two distinct uids (93Xn3DbS0… and qIcEDdpHa5…) both labelled "Daniel Bogard"
appear in the active band-recipient set. The wired-bearer self-filter only
removes one of them. Suggest auditing for and merging duplicate auth records.
Probably intersects with instance-5 (auth) axis.

### INFO — "Communications CRC" in band fanout
A communications@centralreform.org shared inbox is in the band recipient set.
Confirm with Daniel whether this is intentional or a stray.

### LOW — published snapshot strips structural rows
The persisted `publishedSnapshot[]` contains only the 15 song-type rows with
bonds; headers/prayers/transitions/readings/notes are dropped. /perform
presumably hydrates from the live setlist (so the band still sees structure
during the service), but if the published-snapshot is ever the source of
truth for a downstream display, the band will see a flat song list without
service context. Confirm /perform hydration behavior with instance 1.
