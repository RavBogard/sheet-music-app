# ORDER → `live` (Code): READ BACK Karen's role on both surfaces after Daniel elevates it — a verification wave, and the one thing it must never do is perform the elevation itself

Lane: **live-cw (Opus Cowork)** · Executor: **`live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0904-live-cw-36** (Daniel's verbatim *"sure. Karen can be an admin. no issue."*, minted against the
corrected framing; the prior role recorded as `musician` BEFORE the act) · **R-0904-live-cw-37** (this order: the write
is unreachable from every credential this desk holds, so the act is Daniel's and your half is verification) ·
**R-0904-live-cw-31** (a gate is observed by READING its state — **attempting the act it gates is not a test, it is the
act**) · **R-0904-live-cw-8** (the record of the act exists before the act) · **R-0904-live-cw-2** §4 (tool and undo
named first) · **R-0904-live-cw-24** (SATELLITE HEALTH) · COORDINATION rules 11, 18.

Status: **NOT YET DISPATCHABLE.** It becomes dispatchable when Daniel says he has made the change on the People screen.
Until then V0 will simply end the wave, which is the correct outcome and not a failure.

Verified-against: `c642fb185a` [inherited: `live`'s 17:2xZ row — `master`, unmoved by the PAIR-NAMES wave]. The
route and auth lines this order relies on were read at the Cowork mount at **17:3xZ** (`-37` §1–§2, §5–§6); this wave
edits none of them and re-measures nothing, because it touches no file.
Tier: LIGHT — **and lighter than any order this desk has written: it makes NO WRITE OF ANY KIND.** No catalog row, no
chart byte, no setlist, no source file, no workflow, no repo setting, no branch protection, no deploy, and **nothing in
the `users` collection**. Two reads and a return.

**FORBIDDEN, EXPLICITLY, AND IT IS THE ENTIRE REASON THIS IS AN ORDER AND NOT A NOTE:** you may not call
`POST /api/admin/set-role`, mint or use a Firebase ID token for anyone's account, sign this connector into another
account, or reach for any other route that could set a role — **not even to see whether it refuses you.** `-37` §2
already measured the refusal off the source, so attempting it would buy nothing and would be the act itself. If V0
shows the role unchanged, **the answer is that Daniel has not clicked yet**, and the wave ends.

NEXT: V0 → V1 → V2 → return → STOP. **V0 CAN END THE WAVE — if the role still reads `musician`, STOP and return; do
not wait, do not retry, do not route around it.**

- [ ] **V0 · precondition read.** `find_user` on `karen@centralreform.org` over the sanctioned root-bearer route. If `role` is not `admin`, **STOP** and return "not yet elevated" with the value you read. If it is `admin`, continue.
- [ ] **V1 · report the second surface honestly.** The Firestore doc and the Auth custom claim are set by two separate steps and the second is allowed to fail (`-37` §6). `find_user` reads the DOC. **If you have no instrument that reads the custom claim, say so and mark the claim `(unmeasured)`** — do not infer it from the doc.
- [ ] **V2 · confirm nothing else moved on her account** — name, email, uid, `orgIds` unchanged against `live`'s 17:0xZ reading. **`orgIds` is the field to watch:** it is preserved only when omitted from the call, and rewritten when supplied (`-37` §4).
- [ ] **Return** `RETURN-CODE-LIVE-ROLE-VERIFY-2026-09-04.md` + a CLOSED board row.

---

## Why a read needs an order at all

Because the failure mode here is not getting the wrong answer — it is a lane deciding, reasonably, that the cheapest way
to find out whether an elevation happened is to try to perform it. That is exactly the move that broke `master` this
morning (`-31`), and the lesson cost a real repair. **A wave whose first step can end it is the shape that makes the
wrong move unavailable rather than merely discouraged.**

## What you are NOT being asked to judge

Whether the elevation was wise. Daniel decided that with the corrected fact in front of him (`-36` §1), after `live`
correctly refused to execute the same words aimed at a different subject (`-36` §2). **Your predecessor's 17:1xZ and
17:2xZ rows record the opposite outcome — no elevation — and those rows are SUPERSEDED** (`-36` §4): they relayed an
answer without quoting it, and the seat holding Daniel's keyboard has since recorded his words. Read `-36` before you
read those rows, or you will act on a reversal that was itself reversed.

## Undo, named before the act as always

`POST /api/admin/set-role` with `newRole: 'musician'`, by any signed-in admin — one call, and **you are not the one who
makes it** (`-37` §8). The prior role is recorded in `-36` §1, not taken from the route's audit log, which reads
`previousRole` from the Auth claims rather than the doc it is updating and can therefore record a state that never
existed (`-37` §5).
