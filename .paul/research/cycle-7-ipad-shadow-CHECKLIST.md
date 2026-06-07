# Cycle-7 iPad shadow — Daniel's Friday-evening walk

**Pillar:** non-cowork. This runs in parallel with the 5 cowork instances; output lands separately.

**Goal:** validate the 3 real-iPad failure modes synthetic cowork structurally cannot reach (per Agent A J1 + J5 + J6 + Agent B §8). Wall-clock ~30–45 min over Friday evening service window.

---

## §1 — Pre-service prep (Tuesday or Wednesday)

1. **Mint a fresh band_leader bearer** at `/settings/mcp` for the publish step. Label: `c7-ipad-shadow-publish`. Don't burn it — keep for §3.
2. **Pick a real upcoming setlist** that David or you would normally publish for the next Friday/Shabbat service. Note the `setlistId`.
3. **Identify a target iPad mini** that has the app installed and hasn't been used in ≥4 days (mimics "musician opens iPad cold Friday evening" reality). Confirm:
   - App icon present on home screen.
   - Last open date ≥ 4 days ago (verify via Settings → iPad usage if possible).
   - Has been signed in at least once in the last 60 days.
4. **Confirm shul wi-fi connectivity** plan: target is "real congested shul wi-fi", NOT home wi-fi. If you're testing earlier in the week from home, note that — wi-fi is the J1 weakest-link variable.

---

## §2 — Publish + push (Tuesday afternoon or Wednesday)

1. From Claude Desktop, issue: `publish_setlist({setlistId, dryRun:true})` first — confirm recipient derivation looks right (per `[[feedback_dryrun_is_observability]]`). Note: `recipients` array.
2. Then real publish: `publish_setlist({setlistId})`. Note timestamp.
3. Walk to a different room, **do NOT touch the target iPad**.
4. Within ~2 minutes, the target iPad should fire an APNS push notification.
5. **DO NOT tap the push.** Leave it on lock screen. The point is to test the ≥60h delay-then-tap path.

**Record in HANDOFF:**

- Publish timestamp (UTC).
- Push receipt timestamp (from iPad notification center if visible).
- Push delivered: yes / no / delayed.

---

## §3 — Friday-evening cold-launch (J1 — highest-priority assertion)

Target: 5:30pm Friday at shul, or earliest you can arrive. Wi-fi on. App backgrounded ≥4 days.

**Stopwatch start when you pick up the iPad.**

1. **Wake iPad → tap the push notification** that's been sitting in notification center (from §2).
2. **Stopwatch checkpoint 1:** time-to-app-launch. Expected ≤ 3s.
3. **Stopwatch checkpoint 2:** time-to-`/perform/setlist/<id>` route resolution. Expected ≤ 5s.
4. **Stopwatch checkpoint 3:** auth check. Did the app re-prompt for login? Expected: NO re-login if last sign-in was within 60d (per `[[project_file_storage]]` token-refresh path at `api/auth/refresh-session/route.ts`).
5. **Stopwatch checkpoint 4:** time-to-first-chord. Tap track 1; PDF renders; chord visible. Expected ≤ 5s total.

**Visual + tactile checks while you're there:**

- **PerformanceToolbar position.** Visible ABOVE the iPad bottom gesture-bar at portrait AND landscape orientation? (Cycle-6 POLISH C6B-012 unlocked pinch-zoom; gesture-bar overlap is unproven.)
- **Transpose button responsiveness.** Tap C → D. Chart re-renders? Any flash / FOUC?
- **Annotation persistence.** Open a chart you've previously annotated (last week or earlier). Are annotations there? Or did they disappear with the cold launch?
- **PDF chunk download stall.** If wi-fi is congested, did the chart fully load or did it stall at 50%? Record.

**Record in HANDOFF:**

- All 4 stopwatch checkpoints (or fail-mode at the step where it broke).
- Toolbar gesture-bar conflict: yes / no / partial.
- Annotation persistence: yes / no / partial.
- Wi-fi behavior: clean load / stall-then-resume / dropout.

---

## §4 — Mid-service edit propagation (J6 — load-bearing for live-edit value-prop)

You can run this DURING service if Randy gives the nod. Otherwise do a controlled test:

1. From your phone or laptop, open Claude Desktop. Issue: `update_setlist_track({setlistId, trackId:X, key:'D'})` — change a key on a track currently visible on the iPad.
2. **DO NOT manually refresh the iPad.** Watch for the key badge to update.
3. **Time-to-update on the iPad.** Expected ≤ 30s per Instance 3's A5 assertion.
4. If no update arrives, manually refresh — does the change appear? (Confirms write landed; just propagation broke.)

**Mental-model correction (Lane 4 sub-task E, per Instance 3 HANDOFF):** the propagation primitive observed by the iPad is the `useSetlistPerformance` Dexie-backed Firestore snapshot listener — `onSnapshot` over `setlists/{id}` + `tracks where setlistId==X`. Optional server-relay reinforcement: `wait_for_setlist_change` (MCP-side long-poll). `api/setlists/notify-updated` is the in-app **notification fanout** endpoint (toast/badge to other authenticated viewers), NOT the live-edit listener path itself. If the propagation breaks, the diagnostic order is: (1) is the iPad's `onSnapshot` connected? (2) did the write land in Firestore? (3) did the iPad's WebChannel transport stall (incognito storage-restricted fallback)?

**Record in HANDOFF:**

- Update propagation time (or "did not propagate in 60s").
- Whether manual refresh was required.
- Any rendering glitch during the update (flash, scroll-jump, lost place).

---

## §5 — HANDOFF + close-loop

Write `.paul/research/cycle-7-ipad-shadow-HANDOFF.md`. Structure:

- §1 Pre-service prep results.
- §2 Publish + push receipt timing.
- §3 Cold-launch stopwatch + tactile observations.
- §4 Live-edit propagation result.
- §5 **Top 3 user-pain moments encountered**, prose. If everything Just Worked, say so — that's the load-bearing signal.

Also: photos welcome (toolbar position, annotation state, chart-render artifacts). Drop into `.paul/research/cycle-7-ipad-shadow-artifacts/`.

**This pillar is independent of the 5 cowork instances.** Supervisor folds its results into the cycle-7 TRIAGE alongside instance HANDOFFs. No bearer to burn; just revoke `c7-ipad-shadow-publish` post-walk via `/settings/mcp`.

---

*from supervisor*
