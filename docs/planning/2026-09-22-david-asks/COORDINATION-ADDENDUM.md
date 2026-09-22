# Coordination with the CRC book / Overlays revision

September 22, Astra integration review. Daniel supplied the existing David-asks handoff and asked that it be integrated into the wider work. The handoff remains the implementation assignment; this note clarifies coordination and acceptance. Preserve its four items, per-item releases, no musical recommendations, and explicit holds on uncertain duplicates and the You're My Heaven (Tonight) pair.

## Launch and ownership

Run in a separate Claude Code session, using the next free one of Daniel's maximum two simultaneous PowerShell handoffs. Do not interrupt the two Overlays discovery/layout assignments or start a third handoff. This packet owns sheet-music-app only. The current strategy task does not implement application code.

At review, `master` was at `7e7a2aec` and the David-asks handoff was already staged. Preserve it and all other local changes. Inspect status and fetch before synchronizing; use a fast-forward pull only when compatible with current work. Do not blindly reset, auto-stash, switch branches, or discard the staged handoff to satisfy “git pull.” Record the actual starting revision. No code or deployment was changed by this coordination review.

Read the original HANDOFF-CODE-2026-09-22-david-asks.md and the audit W3 return. If using subagents, retain the original Opus/Sonnet-only instruction, assign bounded ownership and avoid recursive delegation. Read current repo instructions rather than relying on the handoff's September 16 line numbers.

## How this contributes to the shared book

- Candidate chart previews let staff and musicians select the actual arrangement during service preparation.
- Tenant and collection scoping make both CRC and Brothers Lazaroff preparation dependable. Do not confuse permission to see a site with the default library shown on the current site.
- Reversible deduplication improves identity consistency across chart bindings and setlists.
- Performance overrides and deviation records add musician-origin evidence to the existing planned/performed model. Preserve source service, row, chart and available moment identities. Reuse existing moments/book-binding/reconciliation conventions before introducing a new identity or storage model.

This work must not wait for the source/reader structure migration or the Overlays visual redesign. Conversely, it must not modify those projects or implicitly push chart swaps onto the broadcast output. A different tune can use identical prayer text, different lyrics, or different segmentation; an arrangement swap is not sufficient authority to infer a new overlay. Document the integration data available for a later explicit bridge.

## Item-specific clarifications

### 1. Preview loading

Reuse the existing supported chart-byte and PDF rendering path, including grants/authentication and cached data. Preview failure must not lose the selection or block choosing a valid chart. Bound concurrent work and memory as well as lazy-loading visible candidates; verify disposal/cancellation during scrolling, rapid selection and closing. Test keyboard access alongside the required iPad interaction. Do not cache private chart bytes into a public/shared cache as a thumbnail shortcut.

### 2. Tenant/collection scope

Verify legacy missing-org behavior before choosing a query strategy. Firestore rules are not post-query filters, and a query for null must not be assumed to match absent fields. Use an evidenced query/migration path with tests for legacy CRC rows, normal members, administrators and host changes. A role of admin must not accidentally grant an unscoped default query or override another organization's membership requirements.

Clear/re-scope local state on organization or account change, and guard against an old listener/prime request arriving after the switch and repopulating the new tenant's store. Verify both dialog/popover and Add Songs paths. An explicit include-other-sites mode must have a deliberate authorized data path; simply widening a now-scoped Dexie cache is not enough.

### 3. Duplicates

DUPLICATES-REPORT-2026-09-22.md was absent at this review. Follow the original instruction: if it is still absent, proceed to item 4 and return to item 3 later. Do not recreate another agent's classification or act on a title-only guess.

Revalidate report identities, current bonds and duplicate evidence before the dry run and mutation. Preserve notes/order and create the original handoff's undo evidence. Similar titles or matching first pages do not establish equal full arrangements. Leave POSSIBLE groups and the explicitly reserved pair untouched. The W3 report records the You're My Heaven pair as byte-identical, but Daniel's canonical-row hold still applies.

### 4. Temporary swaps and history

Use the existing row identity; do not reorder, replace or rewrite the planned track collection for a temporary swap. Derive the current effective chart from plan plus valid override. Record enough planned/before/after information to replay repeated swaps, per-row undo and Reset to plan; reset must not erase the audit trail or leave reconciliation claiming an override remains active.

Make override/deviation changes consistent under retries and simultaneous operator requests; define stale-write handling and avoid duplicate events on reconnect. Test date-only event dates in America/Chicago without accidentally parsing them as UTC midnight. Missing or invalid dates need explicit behavior; do not silently create indefinitely active overrides. Preserve existing authored service order and robust fallback if override reads fail.

Reconciliation must distinguish a musician's actual chart choice from broadcast cue evidence and preserve both when they differ. A repeated overlay cue cannot negate a confirmed chart swap merely because the prayer's text stayed the same. Exercise this with fixture sequences, including A→B→C→plan and reset across multiple rows.

The promised live propagation differs for signed-in and signed-out iPads: signed-in follows within five seconds; signed-out sees the updated override after reload per the handoff. State that limitation accurately. Do not silently expand anonymous realtime access to solve it.

## Return and completion

Append the original per-item return with checks, deployed revision, both-tenant results, relevant browser evidence and remaining dependencies. Include the override/deviation schema, read path and reconciliation behavior for Astra to reuse in the future Overlays bridge. Missing dedupe report or canonical choice does not block the other three items, but the full four-item assignment is not complete until its outstanding work is explicitly accounted for.

Necessary hosted changes for this project are authorized by Daniel; no extra production permission checkpoint is introduced here. Source correctness, tenant isolation and recoverability remain acceptance checks. Do not notify or contact David, musicians or others as part of testing; the requested written operating instructions belong in the return for Daniel.
