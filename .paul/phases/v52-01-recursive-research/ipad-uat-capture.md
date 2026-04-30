# iPad UAT Capture — DEFERRED

**Status:** Deferred to post-deploy Daniel-loop UAT (per v51-04-codified discipline)
**Reason:** Daniel unavailable for real-iPad capture during v52-01 research window; chose to proceed with code-read confidence rather than block research.
**Date:** 2026-04-30

---

## Decision

The original Task 2 of v52-01-01-PLAN.md called for real-iPad UAT capture (DevTools console, Network tab, IndexedDB outbox state, screenshots) before synthesis. Daniel signaled unavailability during APPLY execution.

**Path chosen:** Skip prophylactic UAT, proceed to synthesis with code-read confidence levels, defer real-device verification to each phase's post-deploy Daniel-loop UAT (the codified discipline from v51-04 PROJECT.md "UAT Discipline (data-flow fixes)" section).

**Justification:**
- 3 of 4 issues already lock at HIGH confidence from code-read alone (Issues 2, 3, 4).
- Issue 1's iPad-vs-desktop divergence diagnosis was firmed to HIGH via a follow-up code-read pass (see `track-b-sync-indicator-research.md` § "Follow-up: Issue 1 Confidence Firming").
- The Daniel-loop UAT discipline is codified for *every* data-flow fix — real-iPad verification will happen at v52-02..05 post-deploy regardless. We're not skipping iPad verification; we're moving it from prophylactic (front-loaded) to verifying (post-deploy).
- v5h-01 postmortem §2 ("3 ranked hypotheses all wrong") was the cautionary tale that motivated front-loading; in this case the hypotheses converged across tracks A and B with cross-confirmation, mitigating the wrong-hypothesis risk.

---

## What code-read CAN'T tell us (deferred to post-deploy UAT)

These observations require real-device confirmation; phases v52-02..05 must include explicit Daniel-loop UAT acceptance criteria covering them:

### Issue 1 (red "Failed" SyncIndicator on iPad)

- **Persistence:** Does the red persist across iPad refreshes, or does it flash transient and recover?
- **Save-or-loss:** When red "Failed" was visible, did Daniel's edits actually save to Firestore and only the indicator was wrong, or were edits truly lost?
- **Sign-out/in remediation:** Does signing out and back in on iPad clear the red? (Confirms whether auth-claim staleness is a co-factor vs. only the phantom-row blocking.)
- **Brand-new vs. since v5.0-hotfix:** When did the red first appear? Anchors a specific commit window if it correlates with a deploy.

→ **v52-03 acceptance criterion:** post-deploy Daniel iPad UAT must confirm "Clear failed rows" button + sign-out/in pairing brings the indicator back to green and unblocks edits.

### Issue 2 (text-input keyboard not popping on iPad)

- **Surface scope:** Track-name cell only? All grid cells? MobileEditSheet too? Wizard setlist-name field? — these distinguish "cmdk-only regression" from "all text inputs" and affect how confidently Track A's `suppressAutoFocus` opt-in fix covers everything.
- **Workaround validation:** With the proposed `suppressAutoFocus={false}` default, does the keyboard pop on the first tap (success) or only the second (partial fix)?

→ **v52-02 acceptance criterion:** post-deploy Daniel iPad UAT must verify keyboard pops on first tap on track-name cell, Notes cell, Vocal Lead cell, MobileEditSheet inputs, AND wizard setlist-name field — the full surface coverage.

### Issue 3 (Chart picker search broken on iPad)

- **Sub-mode:** (a) doesn't focus / (b) focuses but typing doesn't filter / (c) filters but tapping a result doesn't bind. Track A's shared-substrate hypothesis predicts (a); Daniel's "doesn't seem to work / search doesn't work" is ambiguous.
- **If sub-mode (b) or (c):** the v52-02 substrate fix doesn't fully cover Issue 3 and a follow-up plan in v52-02 phase is needed.

→ **v52-02 acceptance criterion:** post-deploy Daniel iPad UAT must explicitly disambiguate the sub-mode and verify the substrate fix covers it. If sub-mode (b) or (c), a follow-up plan in v52-02 lands a cmdk-specific fix.

### Issue 4 (kebab red line all platforms)

- **Tap behavior:** Does tapping the kebab on either platform produce ANY response (cursor change, console error, animation)?
- **State correlation:** Is the red-line treatment present in ALL sync states or only when state is `failed`/`conflict`?

Track B's code-read says the kebab is hard-disabled (`disabled={!onOverflow}`, never receives `onOverflow` prop), which predicts: **no tap response on either platform regardless of sync state**. This is a confident prediction; the fix is to remove the kebab or wire it properly. Real-iPad UAT just confirms the prediction.

→ **v52-03 acceptance criterion:** post-deploy Daniel UAT confirms kebab is removed (or properly enabled with overflow actions) on both desktop and iPad.

---

## What we're NOT giving up

Per the v51-04-codified Daniel-loop UAT discipline:
> "Every fix touching data flow (sync engine / Dexie schema or writes / snapshot-listener / lazy-hydration / perf-view rendering / editor cell-commit / Firestore rules) gets a Daniel UAT pass on real production before milestone close; UAT failures route to a new plan in same phase; only after UAT passes does `/paul:audit-milestone` run."

Each of v52-02 / v52-03 / v52-04 / v52-05 carries a Daniel-loop UAT acceptance criterion at its tail. Real-device verification happens 4×, just downstream rather than upstream of phase planning.

The synthesis (next task) embeds the deferred UAT items into per-phase recommendations as explicit acceptance criteria so they don't get lost.

---

## Resume signal

This deferral is recorded as a v52-01 deviation in STATE.md. Daniel's only commitment going forward: run the codified Daniel-loop UAT after each of v52-02 / v52-03 / v52-04 / v52-05 deploys to production. If any UAT surfaces a behavior contradicting the synthesis confidence, route to a new plan in that phase per v51-04's "UAT failures route to a new plan in same phase" rule.
