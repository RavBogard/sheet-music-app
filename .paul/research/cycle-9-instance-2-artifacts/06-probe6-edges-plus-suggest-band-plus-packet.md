# Probes 5 + 6 + 8 — suggest_band, edges, gig packet

## Probe 5 — suggest_band fix verification (C8I2-002)

`suggest_band({setlistId:"69be5383-…clone"})` → `{ok:true, rabbiGuidance:null, coverageGap:[acoustic_guitar, electric_bass, hand_drums, piano, voice], suggestions:[10 entries…]}`. **FIX CONFIRMED** — was 500/FAILED_PRECONDITION (C8I2-002), now returns ranked Vocal-Lead/instrument suggestions cleanly. Tag: known-in-flight, confirmed-fixed.

Second pass after `update_setlist({rabbi:"Randy Fleisher"})`: rabbi metadata landed (round-trip via update_setlist returned `rabbi:"Randy Fleisher"`), but `suggest_band` still returned `rabbiGuidance:null` and an identical ranking. Either (a) `config/congregation.scheduling.rabbiProfiles[]` doesn't contain an entry keyed for "Randy Fleisher", or (b) Randy's profile is keyed by uid not name. **INFO finding (C9I2-008)** — verify rabbiProfiles config so the rabbi-aware branch actually fires for the real rabbis.

### Sub-observations from suggest_band output
- `coverageGap` includes `piano` but no piano-keyed musician appears in the top-10 suggestions. The band roster apparently has no piano player. Roster gap — flag to instance 4 (rosters axis).
- Two "Daniel Bogard" uids (93Xn3… and qIcEDdpHa5…) BOTH appear as acoustic_guitar candidates at score 27 — the duplicate account (C9I2-006) inflates `acoustic_guitar` candidates and would lead Daniel to "double-book" himself if blindly accepting top-N suggestions. Suggests dedupe should run on `email` or display-name before ranking, or the duplicate auth doc should be merged.
- `instrumentKey` is inconsistent — some entries use snake_case keys ("acoustic_guitar", "voice", "hand_drums") which map to instrumentLabel; others use raw words ("Guitar", "Drums") with `instrumentLabel: null`. Catalog hygiene gap in the musicians collection.
- `phone` field is included for any musician who has one set — admin/band_leader only by tool gate, so within PII boundary, but worth confirming the scope is intended.

## Probe 8 — generate_gig_packet

`generate_gig_packet({setlistId:"69be5383-…clone"})` →
`{ok:true, sizeBytes:388471, pageCount:14, trackCount:31, bondedCount:15, appendedCount:11, missingCharts:[4 entries]}`.

**Load-bearing POSITIVE.** End-to-end packet generation works including the
missing-charts appendix path. Signed Storage URL (10min expiry) with full
RSA-SHA256 X-Goog-Signature. Title carries setlist name + " — Gig Packet".

**MINOR copy inconsistency (C9I2-009):** `verify_setlist_charts` describes
broken bonds as `"Not in Storage; Drive 404: File not found:"`, while
`generate_gig_packet.missingCharts[].reason` says `"Chart bytes not found
in Storage or Drive (orphan library entry)"`. Same condition, different
phrasing — harmonize the operator-facing strings.

## Probe 6 — Edge cases

### Clone a "0-track" setlist → C9I2-007 trackCount drift confirmed in prod
Source: `QQSsAK2XY4dc8k5sFXIa` "Confirmation Shabbat", which `list_setlists`
reports as `trackCount: 0`. `clone_setlist(source)` returned a clone with
`trackCount: 5`. `get_setlist(clone)` confirmed 5 real song-type rows
(Shalom alechem, Hinei Mah Tov, Barchu Friedman, Mi chamocha Moshav, Shalom
Rav Klepper-Freelander).

**This is the drift cycle-9 hardening lane B is actively fixing.** Specific
repro path observed: the source setlist exists with 5 hydrated tracks, but
the listing surface's cached `trackCount` says 0. The listing is stale; the
hydrated read is fresh. Tag `kind: "known-in-flight"` confirming the bug
exists with a NEW concrete repro fixture (`QQSsAK2XY4dc8k5sFXIa`).

Implications for the weekly authoring flow:
- A band_leader scanning `list_setlists` may think "Confirmation Shabbat" is
  empty (so they'd avoid cloning it as a starter or assume it's discard-able).
- Same logic applies to "Shabbat Morning — March 28" (0RC4b6CpvnPbz09ue07q,
  also `trackCount:0` in listing) and "Shabbat Morning — March 21"
  (29EqdMESd6QjhfokL2Bu) — at least 3 candidate stale listings in current prod.
- Cycle-9 hardening lane B is presumably wiring `recompute_setlist_track_count`
  into the right writers; confirm post-fix listing returns 5 for this id.

The 5-track Confirmation Shabbat clone also surfaces a side-finding: 1 of
the 5 source bonds points to UUID `d22779d6-…-Shalom-Rav-Klepper-Freelander`
— the SAME broken songId I encountered in Probe 1. Catalog hygiene gap is
broader than just my synthetic adds (C9I2-001).

Additional side-data-quality observation: the 5 cloned tracks have titles
that include their `.pdf` extension (e.g., `"Shalom alechem (Goldfarb).pdf"`,
`"Mi chamocha (Moshav).pdf"`). This is presumably from an older importer
that didn't strip the extension before populating the title field. Band
will see ugly trailing `.pdf` in performance display. **LOW (C9I2-010).**

### Template name collision → no uniqueness check (C8I1-004 confirmed)
Created two templates back-to-back with identical name
`c9i2-template-shabbat-morning-roundtrip`. Both succeeded with different
templateIds (`2855c50e-…` and `ec67a643-…`). `list_templates` then surfaces
two identically-named entries — confusing UX for the agent picking a starter.
Recommend either (a) reject duplicate names, or (b) auto-disambiguate with
a numeric suffix.

### Long template name → no length validation (C8I1-005 confirmed)
Created template with a 300+ char name (a "c9i2-VERY-LONG-template-name-" prefix
followed by ~270 'a' chars). `create_template_from_setlist` accepted it with
no truncation, returning `templateId:"57b8c045-…"`. Display widgets that
assume a sane name length will overflow / break layout. Recommend enforcing
a max name length at the writer (e.g., 80 or 120 chars to match the
create_test_account `label` cap).

### "David-as-band_leader" path
Not directly testable from this MCP bearer (admin-wired). The publish probe's
recipient list confirms 1 band_leader account exists in the audience derivation
(presumably David Lazaroff, HTks9a8YRiVCQ5lVipUJcBsWjnB3). To verify gate
asymmetry between admin and David's band_leader bearer, a non-admin MCP
connection is needed. **Sweep-ergonomics gap, see Probe 7.**

## Probe 4 — Band-receives fanout (MCP-side observability)

Covered in Probe 3's publish-dryRun envelope:
- `delivery: {inApp:0/0, push:0/0, email:0/0, sms:0/0}` confirms 4 channels modelled.
- Recipient resolution derives from `role IN (admin, band_leader, musician)` per `audience:'band'`.
- `smsEligible: true` flag per recipient — only 1 of 17 opted in. First-publish-only SMS per docs.
- `version` field bumps post-publish (was 7 pre-call, observed 8 in dryRun response).
- `wasAlreadyPublished:false` distinguishes first-publish (SMS attempts) from re-publish (SMS skipped).
- `snapshotDiff` from preview_publish gives the agent a clean added/removed/modified set vs. last published — exactly the right "what changed since the band last saw this" signal.

**No bugs surfaced** in this read — the MCP-side fanout signal looks healthy
and sufficient for agent UX. The actual band-side rendering of the publish
notification (in-app banner, push, email subject formatting) is instance-1
territory.

## Fixtures created during Probes 5 + 6 + 8 (extending the inventory)
- setlist `655937c5-1e57-42e3-896f-ba25c2b0c4ba` — c9i2-CLONE-zerotrack-confirmation-shabbat (5 tracks)
- template `ec67a643-baaf-4421-9bac-47c39f3deeb5` — duplicate-name template (collision fixture)
- template `57b8c045-8771-42f4-82b3-a63d11e354c3` — very-long-name template (length fixture)
- generated gig-packet PDF at `gs://crcmusiccharts.firebasestorage.app/gig-packets/69be5383-…/1779234217427-116cee92.pdf` — leave for normal Storage TTL (signed URL expired in 10min anyway).
