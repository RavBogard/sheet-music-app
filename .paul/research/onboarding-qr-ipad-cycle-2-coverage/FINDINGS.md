# onboarding-qr-ipad-cycle-2-coverage — FINDINGS

**Lane:** `onboarding-qr-ipad-cycle-2-coverage` (Tier-0 spec/research; coder-4)
**Cut from:** `10f7f8183` (origin/master at lane start, 2026-05-25T16:50Z)
**Dispatched:** 2026-05-25T18:30Z by supervisor (`msg-onboarding-qr-ipad-cycle-2-coverage-001`)
**Closes:** ipad-sweep `FINDINGS.md` §Coverage gaps line 113 — *"`onboarding-qr-ipad` cycle-2 case … member-as-approver only partially covered … pending a follow-up assertion that member-as-approver is actually intended policy."*

---

## TL;DR

**Phase-1 verdict: UNINTENDED.** The `member` role in the QR-approve `allowedRoles` set is almost certainly a code/intent mismatch, not deliberate policy.

**Phase-2 action: SPEC LEFT UNCHANGED.** Per dispatch UNINTENDED branch, I document + cite + recommend a follow-up fix lane; I do **not** assert the current behavior as intent, and I do **not** write the fix.

**Phase-3 probe:** not run (no spec change → no probe gate needed).

**Recommended follow-up lane:** `onboarding-qr-member-role-gate-fix` (Tier-1) — drop `"member"` from `allowedRoles` in `src/app/api/auth/qr/route.ts:158`, flip the spec's C1 `member` assertion from `expect(200)` to `expect(403)`, regenerate prod probe. ~10-15 LOC.

---

## Phase 1 — Discovery

### 1.1 Where the role gate lives

`src/app/api/auth/qr/route.ts:151-167` (`PUT` handler):

```ts
// v4.3 P6-S04: QR approval is a session-mint operation. Gate it to
// members (musician/band_leader/admin) so pending accounts can't
// participate in device sign-in. Pending users have no business on
// a shared iPad yet.
const role = decoded.role as string | undefined
const allowedRoles = new Set(["member", "musician", "band_leader", "admin"])
if (!role || !allowedRoles.has(role)) {
    return NextResponse.json(
        { error: "Approval requires an approved member account" },
        { status: 403 },
    )
}
```

### 1.2 The code/comment mismatch

The comment **explicitly enumerates** `musician/band_leader/admin` — note the parenthetical: *"Gate it to members (musician/band_leader/admin) …"* The word "members" in the lead clause is being used in the **loose conversational sense** ("members of the band") and the parenthetical fixes the intent precisely.

The code, however, includes the **literal role string `"member"`** in the set. Per `src/lib/roles.ts:11`:

```
member (40):       Basic membership — no special music capabilities.
musician (60):     Performance + profile: view setlists, set transposition, PDF access.
```

`member` is a **non-band community member** with no music-side capabilities. Allowing role `"member"` to approve a sign-in to a shared band iPad is therefore a real widening of the security model — and the comment does not authorize that widening.

### 1.3 Genesis evidence

`git log --all -S 'allowedRoles' --diff-filter=AM -- src/app/api/auth/qr/route.ts` shows the file was born (genesis commit `f4f63199a`, 2026-05-23) with `["member", "musician", "band_leader", "admin"]` already in the set AND the parenthetical comment already saying `(musician/band_leader/admin)`. **The mismatch has been latent since inception** — no later widening commit, no design-doc/decision log entry that I can find authorizing `member` in the set.

That's consistent with the read that `member` was a typo / copy-paste-from-a-different-context oversight when the comment was written, not a deliberate policy decision.

### 1.4 Test corroboration

`e2e/onboarding-qr-ipad.spec.ts:381-410` (test "C1: musician + member approvers are accepted (member-allowed flagged in FINDINGS)") already documents the same suspicion. The test comment at L402-404 reads:

```ts
// CURRENT behavior: route.ts allowedRoles = {member,musician,band_leader,admin}.
// `member` passing is the finding (the code comment says the gate is
// for "members (musician/band_leader/admin)"). Asserted as-is.
```

So the original spec author **also** flagged this as the suspicious behavior, not as the intended one. The test asserts current behavior to surface drift, but the test name itself ("member-allowed flagged in FINDINGS") signals the assertion is provisional pending intent confirmation. The ipad-sweep coverage gap line 113 is asking for that confirmation.

### 1.5 Phase-1 verdict

**UNINTENDED.** The convergent evidence — author comment, role semantics in `roles.ts`, test author's own framing, no widening commit, no design-doc trail — points to `"member"` in the set being a latent code/intent mismatch, **not** a deliberate policy of admitting basic community members to a band-iPad sign-in gate.

⚠️ **Daniel ratification recommended before any fix lane fires.** The intent call is mine (per Phase-1 dispatch contract), but the fix flips a deployed security gate, so supervisor should bundle a one-question confirm to Daniel into the dispatch of the follow-up lane.

---

## Phase 2 — Spec update or FINDINGS

Per dispatch:

> If UNINTENDED (real bug): leave the spec unchanged; document the gap in FINDINGS with code citation; the fix is a separate lane (NOT in your scope).

**Action: SPEC UNCHANGED.** `e2e/onboarding-qr-ipad.spec.ts` is not edited in this lane. The existing C1 test continues to assert current production behavior (member PUT → 200). When the follow-up fix lane lands, C1's `member` iteration flips to `expect(403)` and the test name drops the "flagged in FINDINGS" suffix.

LOC delta in this lane: **0** in `src/`, **0** in `e2e/`, **+this FINDINGS.md** in `.paul/research/`.

---

## Phase 3 — Probe run

**Not run.** No spec change means there is nothing new to gate against prod. The existing C1 test (which already asserts current behavior) was last green in coder-3's ipad-sweep run; the audio-bond-prod-verify ship (`d65dd7d47`) and live-director-gesture ship are disjoint surfaces.

---

## Phase 4 — Recommended follow-up

### `onboarding-qr-member-role-gate-fix` (Tier-1, ~10-15 LOC)

**Scope:**
1. `src/app/api/auth/qr/route.ts:158` — drop `"member"` from the set: `new Set(["musician", "band_leader", "admin"])`.
2. `e2e/onboarding-qr-ipad.spec.ts:381-410` — flip the `member` iteration of C1 to `expect(403)`; drop the "flagged in FINDINGS" qualifier from the test name; tighten the in-test comment to say "musician approves; member is rejected (band-side only)".
3. Update the route comment to match: drop the loose "members" phrasing in the lead clause; just say `Gate it to musician/band_leader/admin`.

**Gates:**
- `tsc --noEmit` 0 errors.
- `next build --webpack` exit 0.
- Spec C1 probe-run vs prod after deploy passes both iterations (musician → 200, member → 403).
- Daniel ratification of intent before deploy (this changes a deployed gate; the route's behavior is observable to any community member with a phone).

**Out of scope (for the fix lane):**
- No other QR-flow surfaces (`QRSignIn.tsx`, `/qr/[code]/page.tsx` unchanged).
- No `pending` policy change — `pending` is already excluded; this lane only narrows from `member+musician+band_leader+admin` to `musician+band_leader+admin`.
- No role hierarchy change in `roles.ts` (`member` still exists; it just isn't allowed to approve a shared-device sign-in).

**Risk note:** if any in-the-wild `member`-role user has been using QR-approve to onboard onto an iPad, this lane breaks their flow. Mitigation: Daniel-verify via `list_musicians` / admin Firestore probe that the band's active `member`-role accounts (if any) all also carry `musician` or higher. Per `roles.ts` semantics, a band-side person should be `musician` minimum, so this should be a clean change — but worth one Firestore probe before the fix-lane fires.

---

## Out-of-scope honored

- ⛔ NO `src/` writes — Phase 2 UNINTENDED branch leaves the spec + route untouched.
- ⛔ NO `e2e/` writes — existing C1 already asserts current behavior; awaiting fix lane.
- ⛔ NO `playwright.config.ts` edits (sibling coder-2 may touch it for `ipad-pwa-fresh-install-spec`).
- ⛔ NO bridge / monitor / firestore.rules / vercel.json / transposer / `library_index` / sibling-lane surfaces.
- ⛔ NO MCP write tools used.

## Held claims

None. Tier-0 read-only + new research file only.

## LOC delta

| Path | Δ |
|------|---|
| `.paul/research/onboarding-qr-ipad-cycle-2-coverage/FINDINGS.md` | +new |
| `src/**` | 0 |
| `e2e/**` | 0 |
| `playwright.config.ts` | 0 |

Total: 1 new research file, ~150 lines of doc.

## Cross-reference

- ipad-sweep `FINDINGS.md` §Coverage gaps line 113 (gap closed by this doc + recommended fix lane).
- `src/app/api/auth/qr/route.ts:151-167` (the gate).
- `src/lib/roles.ts:11,25` (role semantics).
- `e2e/onboarding-qr-ipad.spec.ts:381-410` (C1 test asserting current behavior).
- Genesis commit `f4f63199a` (file inception with the mismatch baked in).
