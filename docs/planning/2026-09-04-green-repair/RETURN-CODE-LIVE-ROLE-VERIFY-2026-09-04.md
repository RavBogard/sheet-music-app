# RETURN → `live-cw` (from `live`, Code): ROLE-VERIFY

Order: `HANDOFF-CODE-LIVE-ROLE-VERIFY-2026-09-04.md` · Authority `R-0904-live-cw-36`, `-37`, `-31`, `-8`, `-2` §4,
`-24` · COORDINATION rules 11, 18.
Executed-at HEAD **`c642fb185a`**, unmoved. Read at **2026-09-04 18:0xZ–18:1xZ**.
Tier: **NO WRITE OF ANY KIND.** Nothing in `users`, no catalog row, no chart byte, no setlist, no source file, no
workflow, no repo setting, no branch protection, no deploy. **No index created** (one query wanted a composite index;
I dropped the sort rather than write config for a read). Reads and a return.

**Dispatched on Daniel's word at 18:0xZ — *"karen is admin"*.**

---

## V0 · PRECONDITION — **PASS.** The wave continues.

`find_user {email: "karen@centralreform.org"}` over the sanctioned root-bearer route:

```json
{ "uid": "6Ej2hgTrNTO74SiAB7RbSq35B5Q2", "displayName": "Karen Bogard",
  "email": "karen@centralreform.org", "role": "admin",
  "instrument": null, "instrumentLabel": null, "schedulingTier": "regular", "phone": null }
```

`role: "admin"`. The org now holds 7 admin rows: `daniel@`, `karen@`, `davidlazaroff@`, `brodskydrew@`,
`engineer.brodsky@`, and the two `test-admin-*` fixtures.

**I did not call `/api/admin/set-role`, mint or use anyone's Firebase ID token, sign this connector into another
account, or probe that route to watch it refuse.** `-37` §2 measured the refusal off the source; attempting it would
have bought nothing and would have been the act.

---

## V1 · THE SECOND SURFACE — **MEASURED, not `(unmeasured)`.** I had an instrument after all.

The order permitted me to mark the Auth custom claim `(unmeasured)` and forbade inferring it from the doc. Before
claiming the gap I checked whether the gap was real, and it was not: `auth_get_users` reads the Auth record directly.

```
customAttributes: {"role":"admin","orgIds":["crc","brotherslazaroff"]}
```

**So `claimsUpdated` was TRUE — the out-of-transaction claim write in `route.ts:69–84` succeeded.** The failure mode
`-37` §6 warned about (Firestore says `admin`, the token still says `musician`) **did not occur at the claim level.**

**But there is still a lag, and it is a different one — worth stating precisely because it will look identical to the
failure that did not happen.** The Auth record carries `lastRefreshAt: 2026-09-02T15:40:30Z`, which **predates the
18:04 change**. A custom claim reaches a session only through a fresh ID token. So:

- **MCP tools: already live for her.** They read `users/{uid}.role` (`mark-chart-status.ts:160` and the hygiene family).
- **Firestore rules and in-app UI: not until her token refreshes.** They read `request.auth.token.role`
  (`firestore.rules:20,26`). `auth-context.tsx:162–176` compares claim to profile and runs `repairDrift()` on
  mismatch, so **her next load of the app should self-heal it**; a sign-out/sign-in settles it immediately.

**If Karen reports "it says I'm an admin but the app won't let me", that is this, it is expected, and it is not a
failed write.**

---

## V2 · NOTHING ELSE MOVED — **PASS, and asserted from a measurement rather than from the route's contract.**

`find_user` does not return `orgIds`, and my 17:0xZ reading captured only uid / name / email / role — **so I had no
baseline for the one field the order told me to watch.** Rather than infer it from `route.ts:52`'s preserve-on-omit
semantics, I read the document **as it was before the write**, by point-in-time read at `2026-09-04T18:00:00Z`
(the change committed at `18:04:37.662Z`):

| field | before (18:00:00Z, PITR) | after (18:1xZ) | verdict |
|---|---|---|---|
| `role` | **`musician`** | **`admin`** | the ordered change |
| `orgIds` | `["crc","brotherslazaroff"]` | `["crc","brotherslazaroff"]` | **unchanged** |
| `displayName` | `Karen Bogard` | `Karen Bogard` | unchanged |
| `email` | `karen@centralreform.org` | same | unchanged |
| `uid` | `6Ej2hgTrNTO74SiAB7RbSq35B5Q2` | same | unchanged |
| `claimsUpdatedAt` | `2026-05-14T22:56:02Z` | `2026-09-04T18:04:37Z` | expected |

**Exactly two fields moved: `role` and `claimsUpdatedAt`.** `orgIds` is identical on both sides of the write —
Daniel touched the Role control only and left the membership control alone, which is the one field-level trap
`-37` §4 named. Her tenant membership (`crc` + `brotherslazaroff`) is intact, on the doc and in the claim.

**The prior role is now MEASURED, not merely recorded.** `-36` §1 wrote `musician` down in advance because the audit
log could not be trusted for it; the PITR read independently confirms `musician`. **Those two agree.**

---

## V3 (not ordered) · `-37` §5's predicted false record — **it did NOT fire, and the mechanism is still there**

`-37` §5 reported, without repairing, that `route.ts:61` takes `previousRole` from **Auth claims** rather than from
the `users` doc it is updating, and warned the log could therefore record a prior state that never existed. Since I
was already reading, I measured whether it actually happened:

```
auditLogs/1WJZ8zWW8maktBhDb0sq
  action: ROLE_CHANGE   targetUserId: 6Ej2hgTrNTO74SiAB7RbSq35B5Q2
  previousRole: "musician"   newRole: "admin"
  actorUid: 93Xn3DbS0bSNb8zmfzLyfOMX1A13   actorEmail: daniel@centralreform.org
  timestamp: 2026-09-04T18:04:37.662Z
```

**`previousRole: "musician"` — correct.** The predicted failure did not occur, because her claims *did* carry a role
(set 2026-05-14). **The defect is real in shape and simply did not bite this time**; it bites only when a target's
claims carry no `role`. `-37` §5 stands as written — it should not be downgraded on this evidence, because one
non-firing is not a fix.

**One thing I cannot settle, and will not guess at.** The only other entry for her is:

```
auditLogs/8BTYzBMt6EvS2871yf7H   previousRole: "pending"   newRole: "musician"
  timestamp: 2026-05-14T22:56:02.489Z   actor: daniel@centralreform.org
```

`previousRole: "pending"` there is **indistinguishable** between a genuine new-user state and exactly the defect `-37`
§5 describes. PITR reaches back 7 days at best, so May is unreadable and **no instrument I have can tell the two
apart.** Reported as undecidable rather than assumed either way.

**Also confirmed by this record: the actor was Daniel**, signed in as himself (`93Xn3DbS0bSNb8zmfzLyfOMX1A13`), at the
People screen — which is what `-37` §4 ruled the act had to be, and it is what happened.

---

## Undo, unchanged and still not mine

`POST /api/admin/set-role` with `newRole: 'musician'`, by any signed-in admin, at the People screen — **Role control
only, membership control untouched.** I am not the one who makes it (`-37` §8). The prior role is `musician`,
now doubly attested: recorded in advance at `-36` §1, and measured by PITR in V2.

---

## What `live-cw` should take from this

1. **V1 was answerable.** The order's `(unmeasured)` escape hatch was correct to offer and correct not to use — **an escape hatch is a permission, not an instruction.** `auth_get_users` reads the claim; `firestore_get_document` reads the doc; both are reads.
2. **A missing baseline can be recovered, not just confessed.** I had no `orgIds` baseline and the honest floor was "cannot assert". Firestore PITR turned that into a measurement of both sides of the write. **Worth adding to this desk's standing kit: within an hour, the prior state of any doc is readable.**
3. **`-37` §5's defect did not fire here — do not close it.** And her May entry is undecidable; say so rather than tidy it.
4. **The lag that remains is real and will be misread as a failure**: MCP access is live now, rules/UI access waits for her token to refresh. Expect one "it didn't work" and know the answer.
