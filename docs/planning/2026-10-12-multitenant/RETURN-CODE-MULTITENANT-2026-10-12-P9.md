# Return — multi-tenant phase 9: Proof

Order: `HANDOFF-CODE-MULTITENANT-2026-10-12.md` §Phase 9. Gate: every item passes in
production. That is "done" (mission, Proof). This is the last phase of the campaign.

## The checklist

| Item | Result |
| --- | --- |
| **N-tenant probe** generalised from the BL one, registry-driven, every ordered pair | **PASS** — `scripts/dev/e2e-tenant-probe.mjs`, **208 assertions, 0 failures** against production across 4 tenants and all 12 ordered pairs |
| **Throwaway tenant end to end**, address attached automatically, a real sign-in lands in it alone | **PASS** — `p9probe` created through `create_tenant`, live at `p9probe-crl.vercel.app` in ~75 s, a brand-new account signing in there landed `pending` in `p9probe` and nowhere else |
| **Platform-MCP isolation** | **PASS** — a tenant bearer is refused at `/api/platform/mcp` (403); a platform bearer is refused at `/api/mcp` and `/api/ops/mcp` (401); the throwaway tenant's connection saw no CRC data |
| **Adversarial rules pass by a separate Opus subagent**, given the rules but not my tests | **PASS** — see §Adversarial pass |
| **Delete the throwaway tenant**, every piece confirmed gone | **PASS** — see §Teardown |

## What the probe is, and why it was rebuilt rather than extended

`scripts/dev/e2e-bl-tenant-probe.mjs` knew two tenants by name, addressed both at CRC's
host, and borrowed David's real account for the Brothers Lazaroff side. None of that
survives a platform that adds tenants. Worse, borrowing a real multi-tenant account means a
pass cannot distinguish *the seam holds* from *that person is a member of both* — the old
probe said so itself, in a comment excusing a roster overlap.

`scripts/dev/e2e-tenant-probe.mjs` reads the tenants from the registry over the platform MCP
surface, addresses each at its own host, and runs on throwaway identities that own nothing
until the probe creates something. It runs **every ordered pair**, not every unordered one:
"B cannot see A" and "A cannot see B" are different claims and a seam can leak one way.

Per tenant, at its own address: it lists and creates setlists, and its congregation identity
is its own by the registry's name. Per ordered pair (A, B), with B's credentials at B's
address: B cannot get, rename or delete A's setlist by id; A's setlist is unchanged
afterwards; B's setlists, templates and contacts share no id with A's; B's roster holds only
B's members; B's congregation is not A's; B cannot open a chart A owns privately; and an A
person cannot mint a connector token at B's address while they can at their own. Then the
browser-SDK leg signs each persona in for real and goes at the other tenants' documents and
chart bytes through the **deployed** Firestore and Storage rules.

Two things the probe had to be taught, because the first version got them wrong and said so
loudly:

- **Musicians are people.** Most of Brothers Lazaroff is also on CRC's roster, so an
  overlapping uid is not a leak. The claim that matters is that every name on a roster is a
  member of *that* tenant, checked against the platform's membership list rather than the
  roster vouching for itself.
- **A shared collection is meant to cross.** Nava's `nava` collection is shared with CRC by
  ruling. The probe now picks a chart the owner holds privately, so the sharing feature is
  not mistaken for the hole it is designed to be.

Identities come from `scripts/dev/mint-throwaway-bearer.ts`, which replaces
`scripts/mint-throwaway-bl-bearer.mjs`. It mints a persona through the tenant's **own
address** (`POST /api/auth/admin-test-session`), so which tenant the persona lands in is
decided by the address — a mint that comes back stamped with the wrong tenant is itself a
finding, and the script refuses it. The persona is a tenant **admin**: for an isolation
probe that is the right adversary, because if the strongest role inside A cannot touch B, no
weaker one can.

Both superseded scripts were deleted. Leaving a probe in the tree that borrows a real
person's account is a hazard, not a fallback.

## Finding: any signed-in person could list any tenant's setlists

**This is the phase's security finding, and it was live in production.** The N-tenant
probe's deployed-rules leg caught it on the first run: a Nava Tehila member, signed in to a
browser, could query CRC's setlists and get them.

`firestore.rules` had `allow list: if signedIn()` on `/setlists/{setlistId}`. That line is
older than multi-tenancy. R-0919-audit-2 (September) split `read` into `get` and `list` so a
signed-*out* caller could not enumerate the collection, and wrote that cross-tenant
separation was "a separate concern, enforced on writes". Phase 2 then moved every other
tenant-owned collection's `list` to the strict `listOrg()` helper — and left this one alone.
It was the only tenant-blind list left in the file.

Nothing in the app ever noticed, because all four client queries on `setlists` already
filter by `orgId`. The hole was only reachable by someone writing a query by hand — which is
exactly what the probe did.

Fixed, with the lowest bar that still means *you have standing in this tenant*:

```
allow list: if signedIn() && atLeast(listOrg(), 'pe');
```

`'pe'` (pending), not `'me'`, on purpose. Daniel's standing rule is to err public rather than
risk gating a musician out, and a pending member keeps exactly the access they had. A single
`get` stays public, so an anonymous Perform link still opens the setlist it names — that
path is a service-block if it breaks, and it is untouched.

Deployed to production (`firebase deploy --only firestore:rules`), and the probe's
deployed-rules leg is green on the live rules.

**What changes for a CRC or BL user: nothing they can see.** The evidence, not an assurance:

- All four client queries (`TemplatesSection`, `MobileTabBar`, `use-upcoming-prep`,
  `scheduling-firebase`) already pass `where('orgId','==',org)`.
- `p2-must-work.emulator.test.ts` runs the real app queries (S6, S8, S9) for every persona in
  both tenants; all still pass.
- The only query that now fails is the bare, unfiltered `collection('setlists').get()`,
  which no client issues and which is the hole itself.
- A claimless legacy token loses that bare query too. It could already read no songs, create
  no setlists and see no config; every surface that lists setlists sits behind a role gate it
  does not pass. Opening one setlist by id still works for it.

Three existing tests asserted the old behaviour and were pinning the defect in place —
`firestore-rules-get-vs-list` even asserted that one query returns *every tenant's* rows
(`snap.size === ORGS.length`). All three were rewritten to the new contract with the reason
in a comment, rather than the fix being bent to fit them. Six new cases went into
`firestore-rules-orgscope.emulator.test.ts`.

## Fix carried over from phase 8: the drive-sync cron never saw a registry tenant

`/api/cron/drive-sync` called `tenantsWithFeature("driveInbox")` at the top of its handler
and `initAdmin()` sixteen lines later. `getFirestore()` threw on the missing default app,
`cronTenantIds`'s catch logged `[cron-tenants] orgs read failed; running the code tenants
only`, and every run quietly covered CRC and Brothers Lazaroff alone. A tenant created
through the registry could never have been Drive-synced.

It cost nothing so far because the only registry tenant has `driveInbox` off, which is why a
whole phase passed without it mattering. Fixed in `cronTenantIds` rather than in the one
route that happened to expose it, so every per-tenant cron gets it, with four tests
(`src/lib/org/__tests__/cron-tenants-init.test.ts`) including one that reproduces the exact
init-order failure.

## Adversarial pass

A separate Opus subagent was given `firestore.rules`, `storage.rules`, the P2 design and the
persona model, and explicitly told **not** to read any existing rules test or the probe — the
point being to re-derive the attack surface from the rules text rather than inherit the
assumptions the existing suites encode. It wrote its own 131-case suite at
`src/test/rules/p9-adversarial.emulator.test.ts` and ran it on the emulator.

It came back with **19 failing assertions — every one a cross-tenant success.** Each was
checked against the rules by hand before anything was changed; two of its claims turned out
to be arguing with a standing ruling rather than finding a hole, and are recorded as such
below.

### Fixed

**Tracks were completely tenant-blind, which defeated the setlists fix.**
`allow list: if signedIn()` on `/tracks/{trackId}` — so any signed-in person of any tenant,
down to a pending member or a claimless legacy token, could read every track row of every
tenant in one unfiltered query: titles, keys, notes, chart bonds, liturgyRef. The setlist
*document* is a name and a date; the rows **are** the setlist. Scoping the setlists list
while this stood open would have been theatre.

Fixing it needed more than a rule, because neither client query carried an orgId filter and a
security rule cannot see a `setlistId` filter — only an orgId one. So:
`fetchTracksForSetlistClient` and `fetchMomentFileIds` now scope by tenant (the setlist's own
when the caller passed the setlist, else the site's, from `<html data-org>`); three composite
indexes were added; and the cross-tenant Perform link that P2 kept working on purpose now
falls through to the public per-setlist endpoint, which can answer for *one* setlist where a
rule could only answer for the whole collection. A single track by id stays public
(R-0919-audit-2).

**Tonight's overrides were readable from any tenant.**
`setlists/{id}/performance/overrides` was `signedIn()` alone — the only subcollection under
setlists with no tenant check, while `history`, `emailEvents` and `performedDeviations` all
had one. It carries the live swap state during a service. It already required a signed-in
caller, so it was never serving the anonymous Perform link; it was serving every *other*
tenant's users.

**Templates: the read path trusted the stored field, the write path trusted the document id.**
For a row whose id has no `<tenant>__` prefix — exactly the pre-P2 bare-key shape — the two
disagreed, and a CRC band_leader could delete, or overwrite and re-stamp to CRC, another
tenant's template they were not allowed to read. Writes now ask the same question reads do.

**An unstamped row could be deleted on a guess.** `docOrg()` defaults a missing `orgId` to
crc. Reading that way is the err-public side of the trade and keeps a legacy row openable;
destroying one on that guess is not. `songs`, `recordings`, `contacts` and `setlistTemplates`
now take their delete rule from the stored field with no default. Production carries **no
unstamped rows at all** — checked across tracks (2,149), setlists (110), songs (1,177),
templates (3), library_index (1,123) and recordings — so this refuses nothing that exists.

**Storage treated an empty `orgId` as crc.** A missing one still does, deliberately: objects
older than the stamping have no metadata and refusing them would take charts away from the
people they belong to. But an `orgId` that is present and empty is the shape a `?? ''` bug
produces, and Firestore already refused that same value while Storage accepted it. Now it is
no tenant, which nobody is a member of.

**The uid was interpolated into a regex.** `memberships` `get` built its pattern as
`'^[a-z0-9-]+__' + request.auth.uid + '$'`, so a uid of `.*` would have matched every
membership document in the project. Firebase Auth does not mint such uids, so this was not
reachable — but anything that signs a custom token with a caller-influenced uid would have
made it real. It splits the id now instead of pattern-matching user data.

**`library_signals/latest` leaked across tenants.** A single global document, readable by
every signed-in person, carrying the last fileId touched in *any* tenant and the uid that
touched it. The listeners only ever look at `at`, so the payload bought nothing. All seven
writers now write `{at, op}` and nothing else. (Per-tenant signal documents would be better
still; that is a change to seven writers and a hook, not to a security rule.)

### Recorded, not changed

- **A single track by id is readable signed-out.** The subagent called this a finding; it is
  R-0919-audit-2, deliberately. An anonymous `/perform` link carries a setlist id, and a
  musician who cannot open the chart they are playing is a service-block. What that ruling
  granted was the `get`, never the enumeration — which is now closed.
- **An unstamped row reads as crc.** The standing rule is to err public rather than risk
  gating a musician out. Reads keep the default; deletes no longer do.
- **`collections`: a pending member may `get` a shared collection but not `list` it.** A real
  inconsistency. The err-public rule says the fix for one of these is to widen the narrow
  side, not narrow the wide one, and `seenOrgs()` excluding pending is load-bearing
  elsewhere. Left as it is, written down here.

After the fixes the subagent's own suite passes **131 of 131** against the amended rules,
with the three recorded cases rewritten to assert the decided behaviour and the reason — the
attacks are still there, the expectations moved.

### What it covered and found nothing in

Unfiltered-list probes against twenty tenant-scoped collections and the same lists filtered to
a foreign tenant; `visibleToOrgs` array-contains spoofing; cross-tenant create with a forged
`orgId` stamp; cross-tenant update and delete; track re-parenting onto a foreign setlist;
`config` document-id tenant spoofing; mixer reach from a non-CRC admin; legacy and claimless
tokens against both Firestore and Storage; self-service `users` escalation; the server-only
collections; Storage cross-tenant reads, writes, overwrites and reverse-direction
`visibleTo`; and the deny-all fallback for unlisted collections and subcollections.

## Teardown

<!--TEARDOWN-->

## Gates

<!--GATES-->

## Decisions logged

<!--DECISIONS-->

## Needs Daniel

<!--NEEDS-->
