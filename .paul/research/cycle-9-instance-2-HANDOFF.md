# Cycle-9 Sweep — Instance 2 HANDOFF

**From:** cycle-9-instance-2
**Axis:** weekly authoring flow end-to-end (Daniel + David's real MCP path)
**uidPrefix:** c9i2
**Live prod SHA at start:** `db208948f687542c130235fa65224bf2640e1c0c` (ahead of PARENT's documented base `edb24a47c` — fix lanes have landed)
**Sweep duration:** roughly one cowork hour, MCP-only per Daniel's launch directive
**Bearer:** admin (Daniel's real uid `93Xn3DbS0bSNb8zmfzLyfOMX1A13`); pool row cannot be marked burned from a cowork mount (PARENT §2) — note in supervisor inbox

## Verdicts per sub-axis

| Sub-axis | Verdict | One-line |
|---|---|---|
| Clone last week + tweak | OK | clone_setlist + add/remove/swap/reorder all work; OC gates work; 31-track round-trip is faithful |
| Template starting points | NOT OK | 0 templates seeded (C7I1-001 still open) — band-onboarding blocker — but the round-trip mechanism is sound |
| publish_setlist | OK | refusal layer cake is clean; chart-health gate fires correctly; preview_publish unification (F-006) holds; dryRun is real observability |
| suggest_band | FIXED | C8I2-002's 500/FAILED_PRECONDITION is resolved; cycle-8-fixes confirmed landed |
| generate_gig_packet | OK | 388 KB / 14-page PDF; missing-charts appendix path works |
| Edge cases | MIXED | 0-track-claim setlists clone as 5-track (trackCount drift in prod), duplicate + very-long template names accepted with no validation |
| Ergonomics / "3-step weekly flow" | NEEDS WORK | 17 calls to execute the notional 3-step minimum; high friction in reorder + catalog-trust + swap-metadata + post-clone chart-health |

## Severity count

- HIGH: 2 (C9I2-001 search_library returns broken-chart rows; C9I2-004 zero seeded templates / C7I1-001)
- MED:  5 (C9I2-002 swap clobber, C9I2-003 sweep-ergonomics, C9I2-006 duplicate-Daniel, C9I2-007 trackCount drift, C9I2-E03 reorder friction)
- LOW:  7 (C9I2-005 templateType case, C9I2-009 copy-inconsistency, C9I2-010 .pdf in titles, C9I2-011 sort anomaly, C9I2-E01 dup template names, C9I2-E02 long template names, C9I2-E04 clone chart-health gap)
- INFO: 6 (C9I2-008 rabbiGuidance gap, C9I2-E05 gate-testing gap, plus 4 positive load-bearing entries C9I2-P01..P04)

(Total: 20 findings. Self-verified counts against the JSONL.)

## Load-bearing items

**Positives confirmed (don't break these):**
- C9I2-P01: clone + setlist→template→setlist round-trip preserves every field cleanly across 6 row types
- C9I2-P02: publish refusal envelope shape (machine_code + structured chartHealth + hint) — the agent-UX bar
- C9I2-P03: suggest_band is fixed; cycle-8-fixes lane confirmed landed at SHA db208948f
- C9I2-P04: generate_gig_packet + missing-charts appendix path

**Open BLOCKS-GREEN candidates (judgment for supervisor triage per PARENT §7):**
- C9I2-001 search_library returns broken-bond rows — could be argued BLOCKS-GREEN because it silently breaks the weekly authoring flow during band onboarding. I tagged HIGH; supervisor can promote/demote.
- C9I2-004 no templates seeded — onboarding blocker for a NEW band_leader without Daniel walking them through it. I tagged HIGH; this is the load-bearing C7I1-001 still-open item.

**Known-in-flight confirmations:**
- C9I2-007 trackCount drift — exists in prod; cycle-9 hardening B is the right lane
- C9I2-008 rabbi-aware ranking — fix needs rabbiProfiles seeded, not just suggest_band code

**No regressions-of-shipped-fix observed.** All cycle-8-fixes targets I touched (suggest_band, chart-bond cron implications via verify_setlist_charts) returned healthy.

## Findings table

| ID | Sev | Kind | Surface | One-line |
|---|---|---|---|---|
| C9I2-001 | HIGH | catalog-hygiene | search_library + add_track | Active-status library rows whose chart bytes are 404 |
| C9I2-002 | MED | ux-friction | swap_chart | Default syncMetadata:true clobbers hand-curated titles |
| C9I2-003 | MED | sweep-ergonomics | clone + cleanup + create_setlist name-heuristic | Admin-bearer sweeps escape prefix cleanup AND leak to /perform (cross-confirmed by C9I1-008) |
| C9I2-004 | HIGH | known-in-flight | list_templates | C7I1-001 still open — zero templates seeded |
| C9I2-005 | LOW | data-hygiene | templateType | snake_case in prod, kebab-case in docs |
| C9I2-006 | MED | auth-hygiene | users + publish + suggest_band | Two "Daniel Bogard" accounts in active pool |
| C9I2-007 | MED | known-in-flight | list_setlists trackCount | Drift in prod — concrete repro QQSsAK2XY4dc8k5sFXIa |
| C9I2-008 | INFO | data-completeness | suggest_band / rabbiProfiles | Rabbi metadata round-trips but ranking branch doesn't fire |
| C9I2-009 | LOW | copy-inconsistency | verify vs packet | Missing-chart reason text differs between tools |
| C9I2-010 | LOW | data-quality | track titles | Legacy rows have ".pdf" in title field |
| C9I2-011 | LOW | sort-anomaly | list_setlists recent_write | Feb 2026 setlist surfaces above May 20 setlist |
| C9I2-P01 | INFO | positive | clone + template round-trip | Round-trip is faithful |
| C9I2-P02 | INFO | positive | publish refusal | Layer-cake refusal envelope is clean |
| C9I2-P03 | INFO | positive | suggest_band | C8I2-002 confirmed fixed |
| C9I2-P04 | INFO | positive | gig packet | End-to-end packet + appendix path works |
| C9I2-E01 | LOW | missing-validation | create_template_from_setlist | Duplicate names accepted |
| C9I2-E02 | LOW | missing-validation | create_template_from_setlist | Very long names accepted |
| C9I2-E03 | MED | ergonomics | reorder_setlist | Bulk-only primitive; need move_track |
| C9I2-E04 | LOW | observability-gap | clone_setlist response | Inherited chart-health not surfaced |
| C9I2-E05 | INFO | observability-gap | gate testing | Cross-owner gate unreachable from admin bearer |

(Full JSON for each in `cycle-9-instance-2-findings.jsonl`.)

## Cleanup verification (REQUIRED — PARENT §6)

Every fixture I minted has been deleted; see
`cycle-9-instance-2-artifacts/08-cleanup-verification.md` for the per-fixture
proof table. Summary:

- 3 setlists deleted (`delete_setlist` returned `{ok:true, tracksDeleted:N}` for each — 31 + 31 + 5 tracks)
- 3 templates deleted (`delete_template` returned `{ok:true, deleted:true}` for each)
- `cleanup_all_test_data({prefix:"c9i2"})` returned `{removed:0, failures:[], aggregate:{}}` — confirming finding C9I2-003 that admin-owned fixtures aren't reachable via uid-prefix sweep
- Post-cleanup `list_setlists` + `list_templates` confirm no c9i2-* residue

Fixture IDs (for audit):
- setlist 69be5383-a5b0-4470-aa40-2995c1938616 ✓ deleted
- setlist 18d2cf2f-c558-47f3-b571-4ac5bedb5fec ✓ deleted
- setlist 655937c5-1e57-42e3-896f-ba25c2b0c4ba ✓ deleted
- template 2855c50e-81dd-428f-a090-84c765ce9960 ✓ deleted
- template ec67a643-baaf-4421-9bac-47c39f3deeb5 ✓ deleted
- template 57b8c045-8771-42f4-82b3-a63d11e354c3 ✓ deleted

No test-uid accounts minted (the admin-wired MCP connection couldn't use them
for tool calls — see C9I2-E05). No minted-bearer revocation needed.

## Bearer status

The wired admin bearer is Daniel's long-lived admin token; cowork mounts can't
reach the pool file to mark it burned (PARENT §2 reality). The bearer remains
valid until its own TTL or until the supervisor flips the pool row.

## Pointers for the next supervisor triage

- The TWO load-bearing items in this HANDOFF (C9I2-001, C9I2-004) are
  catalog/onboarding hygiene, not protocol bugs. They affect the band-onboarding
  axis (instance-1 territory) by making the weekly authoring flow produce
  silently-broken setlists. Worth cross-referencing with instance-1's
  findings.
- **C9I2-003 + C9I1-008 cross-instance:** instance-1 observed my fixture
  `c9i2-CLONE-emor-weekly-flow-test` (eventDate 2030-01-04, listing shows 0
  songs) on the public `/perform` DOM during their sweep. This confirms
  `clone_setlist` doesn't carry `isTest:true` and the writer's name-heuristic
  doesn't catch `c9iN-CLONE-` prefixes. My fixture has been deleted by id;
  the WRITER-SIDE gap remains. Worth a Tier-1 writer-side hotfix that
  stamps `isTest:true` on clones whose source was test OR whose name
  matches `c9iN-` / `test-` regardless of owner uid.
- C9I2-006 duplicate-Daniel accounts intersects with instance-5 (auth).
- C9I2-007 trackCount drift is already in flight (lane B); my finding
  is a CONCRETE prod repro fixture supervisor can use to test the fix
  post-deploy.
- Ergonomics narrative (C9I2-E03 + Probe 7 artifact) sketches a
  `start_weekly_setlist` composite tool that would deliver the "easy and
  intuitive" 3-step flow Daniel asks for; recommend that as a cycle-10
  scope candidate, not a cycle-9 fix.

## Artifacts

`cycle-9-instance-2-artifacts/`:
- 01-version-anchor.json
- 02-mcp-surface-check.md
- 03-probe1-clone-and-tweak.md
- 04-probe2-templates.md
- 05-probe3-publish.md
- 06-probe6-edges-plus-suggest-band-plus-packet.md
- 07-probe7-ergonomics-narrative.md
- 08-cleanup-verification.md
