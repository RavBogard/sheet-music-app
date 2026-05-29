# Cycle-13b — DESIGN-NOTES (agent-ergonomics methodology rationale)

> Companion to `PROMPT.md`. Why this methodology, how it grades the charter's anchor
> moments + bug-classes, one worked-example finding traced end-to-end, and an honest
> account of what this axis structurally MISSES (and which sibling axis covers it).

---

## 1. Why an agent-ergonomics axis at all

Every cowork cycle to date (1→12) has shadowed **the musician** — the person with an iPad
in Perform mode. That is the right primary user for the *consumer* surface. But it
structurally cannot see the bug that matters most for `[[user_mcp_is_primary_author_workflow]]`:
**the setlist the musician opens was authored by an LLM talking to the MCP server, and if
that authoring step went wrong, the data is already corrupt by the time any musician-shadow
probe begins.** A musician-shadow finding can only ever say "the chart is the wrong song" —
it cannot say *why*, because the "why" happened upstream, at a moment no musician-axis
observes: the moment the authoring agent called `swap_chart` with the wrong `newSongId`, or
committed a `confidence:'low'` proposal it should have re-searched, or set `eventDate` to a
`Z`-suffixed ISO.

This axis puts the probe at that upstream moment. The user being shadowed is **the authoring
agent itself**. Its confusion — "the description didn't tell me whether I had to act on this
flag before committing" — is the data. This is a genuinely new POV for the program; it is
the reason the charter calls axis B "the highest-value axis."

The cost asymmetry makes it high-value: an authoring bug is committed *once* and read by
*every* musician on *every* iPad for that whole service. Catch it at authorship and one fix
protects the whole band; catch it in Perform mode and you're already mid-incident.

## 2. Why "ergonomics," not "correctness"

The MCP tools are, by and large, *correct* — they have ~3,200 unit tests and a long bug-fix
history (the F-001/F-005/F-015 envelope-hygiene work, the W-01/W-04 propose-commit +
optimistic-concurrency work, the `force_required` REG-003 standardization). A pure
correctness audit would mostly come back green. The interesting failures are **ergonomic**:
the tool does the right thing *if you call it right*, but the surface (description + schema +
envelope) doesn't reliably steer a fresh agent to call it right. The canonical exemplar is
the eventDate `Z`-trap: `parse-event-date.ts` now handles a naive datetime correctly, AND it
preserves an explicit `Z` (because "the caller was explicit") — both behaviors are *correct*.
The bug is that a cold agent constructs `…Z` thinking it is "the ISO format," the schema
accepts it without a murmur, no description warns it, and the service silently lands at 5am.
That is an *ergonomic* failure of the surface, invisible to a correctness lens.

So the grading question is never "is the tool right?" — it is **"would a cold agent, reading
only what the surface shows it, call this tool right on the first pass?"**

## 3. How it grades the charter's 4 anchor moments

Authoring is **pre-A1**: it produces the setlist that A1 (musician setup-prep) consumes. The
methodology grades anchor moments via the **propagation arrow** on every finding card — each
authoring corruption is traced forward to the musician moment it eventually damages:

- **A1 (setup-prep)** — the primary landing point. A half-applied key edit, a mis-bond
  committed past a flag, an empty setlist from a misread `committed:false`, a 5am eventDate:
  all surface first as "the setlist is wrong when I open it to prep."
- **A2 (between-songs)** — the forward of any *per-track* corruption (wrong key, wrong bond)
  that the musician hits mid-service in their 6-second window.
- **A4 (sanctuary-edge / cross-musician)** — the forward of any *shared-state* authoring
  corruption: David's edit silently clobbering Daniel's (no `lastSeenVersion`), or a dual-write
  that leaves the leader's iPad and the website disagreeing.
- **A3 (mid-service change)** — explicitly **NOT** graded here; axis 13a owns the live
  leader→band broadcast. Authoring beats that touch A3 go to the §F parking lot.

The arrow is also the **triage-merge key**: a §C axis-B finding "agent committed a low-confidence
bond" and an axis-13a/13d finding "musician saw the wrong chart" are the *same incident* seen
from two ends — the arrow lets the supervisor dedupe them at roundup.

## 4. How it grades the 3 bug-classes (re-cast for authoring)

The charter's musician-side classes map cleanly onto authoring (PROMPT §2.4):

| Charter class | Authoring re-cast | Representative probe |
|---|---|---|
| Stickiness | **Write-durability** | dual-write parity (`applySongMetadata` — key in BOTH `songs.defaults` + `library_index`); `songCount`/`trackCount` denorm after clone/commit; `committed:boolean` honesty; eventDate wall-clock persistence |
| Fresh-tablet | **Cold-agent authoring** | a fresh Claude context with zero memorized gotchas — does the surface teach the convention, or rely on the agent "just knowing" it? |
| Auth-divergence | **Role-divergence** | David (band_leader) vs Daniel (admin) — is the `forbidden_role` refusal on an admin-only tool clear + actionable? |

The cold-agent class is the spine of the methodology: it converts every "warm agent just
knows X" into a testable claim ("does the surface teach X?"). The §D gotcha table is its
ledger.

## 5. Worked example — one finding, end to end

**Scenario.** A fresh Claude Desktop session (cold agent) is asked: *"Set up next Saturday's
B'nei Mitzvah — clone last week and put it on Saturday at 10am."* The agent clones (correctly),
then sets the date.

**The call.** Reading only the `update_setlist` description (`index.ts:838`) — which says
*"eventDate: New ISO event date"* — and the `eventDateSchema` (`index.ts:138`, a bare
`z.string().refine(Date.parse).optional()`), the agent constructs what it believes is "the
ISO format for Saturday 10am":
```js
update_setlist({ id: fixtureId, eventDate: "2026-05-30T10:00:00.000Z" })
```
The schema accepts it (it parses). The write succeeds. The response echoes
`eventDate: "2026-05-30T10:00:00.000Z"`. The agent reports success to Daniel: "Done — set for
Saturday 10am." **Nothing in the surface flagged anything.**

**The corruption.** `parse-event-date.ts` *preserves* the explicit `Z` (correctly — the
caller was explicit). So the stored instant is 10:00 **UTC** = **5:00am Chicago**. The iCal
feed (`X-WR-TIMEZONE:America/Chicago`) and the `get_setlist` reply both render 5:00am.

**The card.**
```
### F-C13B-001 — Cold agent sets the service to 5am by writing "the ISO format" (trailing Z)
- Authoring beat: eventDate
- Bug-class: cold-agent (× write-durability — the wrong value persisted durably)
- Author identity: both (any agent constructing an ISO timestamp)
- Agent context: cold
- Tool: update_setlist({id, eventDate}) (index.ts:835); eventDateSchema (index.ts:138)
- The agent's experience (first-person):
  > "I need 10am Saturday. The description says 'New ISO event date.' The most canonical ISO
  > string I know is '2026-05-30T10:00:00.000Z'. The schema accepted it; the write echoed it
  > back unchanged. I told Daniel it's set for 10am."
- The misleading surface: BOTH the `eventDate` description ("New ISO event date" — actively
  steers toward the Z form) AND `eventDateSchema` (accepts Z without warning). The correct
  convention (naive '2026-05-30T10:00' = Chicago wall-clock) lives ONLY in
  parse-event-date.ts source, which the agent never reads.
- Downstream musician impact → A1: the service card and every reminder say 5:00am for a
  10:00am service. Confusing at prep; not service-blocking, but erodes trust in the data.
- Severity: author-felt MEDIUM (silent, no error to recover from) × musician-felt MEDIUM
  (wrong time on the card) = MEDIUM-HIGH because it is SILENT and the fix already exists but
  isn't discoverable.
- Affordance fix: add to the eventDate description on update_setlist + clone newEventDate +
  clone_setlist_from_template newEventDate: "Pass a NAIVE local datetime ('2026-05-30T10:00',
  no Z) — it's interpreted as America/Chicago wall-clock. A trailing 'Z' pins UTC and will
  shift the displayed time (10:00Z = 5:00am Chicago)." OR have eventDateSchema .refine() warn
  (not reject, per err-public) on a Z-suffixed value carrying a time component.
```
This card is the template: it ties a cold-agent mis-call to a downstream anchor moment, names
the exact misleading surface element, and proposes an in-band fix using the established
convention vocabulary. Note it is a finding *even though the parse bug is fixed* — the axis
grades **discoverability**, and the warning is currently undiscoverable from the surface.

## 6. Honest weaknesses — what THIS axis structurally MISSES

- **It does not touch the iPad at all.** Anything that only manifests in WebKit render, offline
  cache, wake-lock, or tap-targets is invisible here. → **axis 13c** (WebKit re-verify) +
  the cycle-12 hybrid own that.
- **It does not probe live leader→band broadcast (A3).** If an authoring edit is made while a
  setlist is live on stands, the propagation-to-stands behavior is out of scope. → **axis 13a.**
- **It is single-threaded and cold-agent-simulated, not a true fresh model.** The running
  instance still *is* a capable model; it must *deliberately* suppress memorized conventions to
  simulate a cold agent. This is a judgment call and will under-report gotchas the instance
  can't help knowing. Mitigation: the §D gotcha table forces an explicit "does the surface
  teach this?" verdict per known convention, which is more honest than free-form recall.
- **It under-weights the in-app authoring UI.** Daniel authors via MCP, so that's the focus —
  but David or a future band_leader might use the browser UploadDialog/ScraperModal. Those
  surfaces are out of scope here (and largely deprecated per the Core Workflow note). → if the
  picker/upload UI needs love, **axis 13d** (chart-bind picker UX) is closer.
- **It cannot fully exercise the learning/self-heal loop.** `record_bond_correction` only
  biases ranking after a 3-pick threshold (`titleContextHints`); a single cowork run can't
  observe the threshold flip without seeding 3 corrections. The probe confirms the *call
  shape* and the row-mutation-is-separate semantic, not the end-to-end learning convergence.
- **Dedup/import probes are read-mostly.** `dedupe_library`/`import_chart_from_drive` real-runs
  mutate the shared library, not the throwaway clone — so the run grades their *dryRun*
  ergonomics + force-gate clarity, and avoids real library writes. End-to-end import durability
  is left to a Daniel-owned single-owner run (`[[feedback_single_owner_destructive_runs]]`).

These gaps are deliberate: axis B is deep on the authoring surface, narrow everywhere else
(AP-2 intentionally not broken). The 4-axis parallel design is what makes that narrowness
safe — each sibling covers what this one defers.
