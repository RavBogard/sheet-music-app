# UAT Test Plan — v5.0 Bulletproof Editor

**Purpose:** Validate that the v5.0 setlist editor is bulletproof, easy, and intuitive against real production before onboarding the band.
**Who runs this:** Rabbi Daniel + one band member, against `https://CentralReform.live`.
**When:** Over 1–2 weekly worship cycles after v50-07-05 ships.
**What to do with results:**
- Walk through the smoke checklist Day 1.
- Run scenarios 1–6 over the first week (one per session is fine).
- Scenario 7 (cross-leader) requires coordination — schedule once.
- For each fail, capture: the setlist ID, the time (so Sentry can be cross-referenced), a screenshot, and what you expected vs. what happened. Send to Daniel.

---

## Smoke Checklist (Day 1)

Run through this list in one sitting. Each item is yes/no. Stop and report on first ❌.

- [ ] Sign in at `https://CentralReform.live` — lands on the dashboard.
- [ ] `/setlists` lists the existing setlists; counts look right.
- [ ] Open any current-week setlist — `/setlists/[id]` loads in under 2 seconds.
- [ ] Bottom-right sync indicator shows **Saved** or **Idle** at rest (not stuck on **Saving**).
- [ ] Click a cell (Title, Key, Lead, BPM, Notes) and type — cell enters edit mode.
- [ ] Tab out / press Enter — sync indicator briefly flips to **Saving** then back to **Saved** within 2s.
- [ ] Hard-refresh (Cmd-R / Ctrl-R) — your edit persisted (Firestore commit landed).
- [ ] Open one of the 24 historical legacy setlists (anything from before 2026-04-26) — it renders within 2s with all its tracks.
- [ ] Make any tiny edit on that historical setlist (e.g., touch a Notes cell) — sync indicator behaves normally.
- [ ] Open the same historical setlist in a new tab — tracks still there; nothing duplicated.
- [ ] Drag a row by its left handle — order updates locally and persists after refresh.
- [ ] Cmd-Z / Ctrl-Z right after an edit — undo works for the most recent change.
- [ ] Open `/perform/setlist/[id]` for the same setlist — performance view renders the same tracks in the same order.
- [ ] Open the editor on phone (your iPhone) — stacked-card view appears (not the table); cards are tappable.
- [ ] (Daniel) Open the Sentry dashboard — confirm no fresh errors fired during this checklist.

If all 15 pass: ship Day 1 confidence is green. Proceed to scenarios.

---

## Scenario 1: Clone last week's setlist + tweak 2–3 songs

**This is the 90% weekly-workflow case.**

**Setup:** Last week's service setlist exists in production.

**Steps:**
1. From `/setlists`, select last week's setlist and use the clone action (existing flow — unchanged from v4.x).
2. Open the new clone in the editor.
3. Change the date / event name in the title area.
4. Replace 2–3 song titles with this week's variants (e.g., Adon Olam → Adon Olam Reggae).
5. Adjust the key on one track (e.g., G → A).
6. Adjust the lead musician on one track (e.g., Daniel → Randy).
7. Save (auto-saves on blur — no explicit save button).
8. Refresh the page.

**Expected:** Every edit persisted. Sync indicator stays at **Saved** between edits. No loading spinners hang. The page never goes blank.

**Pass:** All 7 edits land on refresh; no Sentry errors fired during the session.

**If fail:** Capture the setlist ID, which step failed, what the sync indicator showed at the failure moment.

---

## Scenario 2: Add a brand new song from the library

**Setup:** A song you haven't used recently exists in the library.

**Steps:**
1. Open any setlist in the editor.
2. Use the "Add row" placeholder at the bottom.
3. Type a fragment of the song title — the cmdk picker filters as you type.
4. Select the song.
5. Confirm the row appeared with the song's defaults filled in (key, lead, bpm pulled from the song's sticky memory if it has been used before, blank if first-time use).
6. Edit the lead and bpm to your preference.
7. Refresh.

**Expected:** Row appears immediately on selection. Defaults seed correctly. Edits persist on refresh. If the song had no prior history, the cells start blank but accept input.

**Pass:** Song appears, your edits stick.

**If fail:** Note whether the cmdk picker filtered correctly, whether defaults seeded at all, whether your manual edit persisted.

---

## Scenario 3: Bind a chart via ChartCell

**This exercises the v50-04 sticky-memory write-back path.**

**Setup:** A song row exists without a bound chart (the chart icon column shows the unbound state).

**Steps:**
1. Click the chart icon on the row.
2. The ChartBindPopover opens with the library cmdk picker.
3. Select a chart that matches the song.
4. Confirm the chart icon updates to "bound" state.
5. Refresh.
6. Add the SAME song to a different setlist (or use the next-week clone).
7. Confirm the binding from step 3 is now the song's default chart in the new row.

**Expected:** Chart binds in step 3–4. Refresh in step 5 preserves it. Step 7 shows the binding propagated to the song's defaults.

**Pass:** Step 7 shows propagation — the song now "remembers" the chart.

**If fail:** Confirm step 3–4 worked (one-time bind); step 7's propagation is the v50-04 sticky memory and a separate failure if step 3 worked.

---

## Scenario 4: Transpose for a specific musician profile (perf-view)

**Setup:** Open `/perform/setlist/[id]` while signed in with a musician profile that has a default transposition (e.g., Bb trumpet).

**Steps:**
1. Navigate through 2–3 songs in the perf view.
2. Confirm the displayed key on each track is shifted by your profile's transposition (or the per-track transposition if set).
3. Open the same setlist in the editor; change one track's key.
4. Switch back to the perf view tab — confirm it updated within a few seconds (live update).

**Expected:** Perf view always shows the right key for your profile. Editor change propagates to the perf view live (v50-06-03 cross-leader live-edit + v50-07-03 perf-view dual-read).

**Pass:** Live update happens within ~5 seconds without manual refresh.

**If fail:** Note whether the initial transposition was wrong (perf-view dual-read bug) OR the live update never landed (cross-leader sync bug).

---

## Scenario 5: Edit setlist on phone (mobile card flow)

**Setup:** Open `/setlists/[id]` on your phone (iPhone or Android, either works).

**Steps:**
1. Confirm the page renders as stacked cards, NOT the desktop table.
2. Tap a card — full-screen edit Sheet opens with form fields.
3. Edit the key field; tap Done / dismiss the Sheet.
4. Confirm the card updated.
5. Long-press a card (~500ms hold) — context menu appears with Edit / Bind chart / Duplicate / Delete.
6. Cancel the menu.
7. Pull down to refresh / hard refresh — your edit persisted.

**Expected:** Mobile-specific UI (cards, Sheet, long-press menu). No accidental clicks on the desktop table.

**Pass:** All 7 steps work on a phone screen with one thumb.

**If fail:** Capture which step (card-render / Sheet-open / save / long-press / context-menu).

---

## Scenario 6: Open a historical legacy setlist (lazy-hydration cascade)

**This exercises the v50-07-03 "open legacy → silently migrate" path.**

**Setup:** Identify one of the 24 setlists from before 2026-04-26 that you haven't opened in the v5.0 editor yet (the editor has only existed for ~24 hours of band-not-using-the-app time, so most legacy setlists qualify).

**Steps:**
1. Open `/setlists/[id]` for that legacy setlist.
2. Wait 5 seconds (the lazy-hydration cascade fans out applyEdit per legacy track silently in the background).
3. Refresh the page.
4. Open the same setlist in `/perform/setlist/[id]` — perf view renders the same tracks.
5. (Daniel) Run `npx tsx scripts/audit-v50.ts` — confirm `tracks/{id}` collection now has rows for this setlist (was 0 before the open).

**Expected:** Editor opens normally with all tracks. The cascade is invisible to the user. After step 5, top-level `tracks/*` collection has the migrated docs.

**Pass:** Step 5 audit confirms the migration landed. No Sentry errors fired (`feature:lazy-hydration` should be silent).

**If fail:** This is the most diagnostic-rich scenario. Capture the setlist ID; check Sentry for `feature:lazy-hydration` warnings; check the setlist's `hydrated` field in Firestore (should be `true` after a successful cascade).

---

## Scenario 7 (optional, requires 2 leaders): Two leaders edit the same setlist simultaneously

**Setup:** Daniel + one other band leader, both signed in, same setlist open in their respective editor tabs.

**Steps:**
1. Both leaders look at the same row in the setlist.
2. Daniel changes the key on row 3 (e.g., G → A); types it and tabs out.
3. The other leader, within ~2 seconds, changes the lead on the SAME row 3 (e.g., Daniel → Randy).
4. Both leaders watch their sync indicators.
5. The "loser" of the race sees the reconciliation modal pop up: "Remote changed — keep mine / take theirs", with row 3 highlighted, showing Daniel's key change AND the other leader's lead change side-by-side.
6. The loser picks "Take theirs" (the safe default) and clicks "Resolve all and save".
7. Both leaders refresh.

**Expected:** Both edits land if they're on different fields (key + lead). The reconciliation modal handles the conflict gracefully. No data is lost regardless of which choice is made.

**Pass:** After step 7, the row shows both edits (or whichever was resolved per choice).

**If fail:** Capture which leader was the "loser", what the modal showed (or didn't show), what the row state was after refresh.

---

## Coverage Map

| Scenario | Phase exercised | What it validates |
|---|---|---|
| Smoke | All v50 | Production health, basic editor function, perf-view, mobile, historical setlists |
| 1 (clone + tweak) | v50-03, v50-04, v50-05 | Sync engine + sticky memory + spreadsheet editor — the 90% weekly case |
| 2 (add song) | v50-04, v50-05 | Library cmdk picker + seedTrackFromSong defaults |
| 3 (bind chart) | v50-04, v50-05 | ChartBindPopover + sticky-memory write-back propagation |
| 4 (transpose perf-view) | v50-06-03, v50-07-03 | Cross-leader live-edit visibility + perf-view dual-read |
| 5 (mobile) | v50-05-04, v50-05-05 | iPad/phone parallel render path + long-press ContextMenu |
| 6 (lazy-hydration) | v50-07-03 | First-edit-open silent migration of legacy setlist; perf-view dual-read fallback → live |
| 7 (cross-leader) | v50-06-01, v50-06-02 | Two-writer race + reconciliation modal |

---

## What is NOT in scope for UAT

- **Cross-tab race UX details** (e.g., the exact text of the reconciliation modal under 5+ concurrent edits). The harness covers the invariant; UAT covers the user-visible flow.
- **Sentry alert dashboard configuration**. See `v50-07-05-SHIP-CHECKLIST.md` Section 3 for the alert taxonomy and recommended dashboard filters.
- **Performance under 100+ track setlists**. CRC's largest setlist is ~30 tracks; out of scope.
- **Single-writer offline self-conflict** (v50-06-03 Block B documented gap). If the band's actual airplane-mode patterns surface this, it becomes a v5.1 plan.
- **Deferred-smokes #4 (v50-05-02 cutover smoke) and #7 (v50-05-05 Lighthouse)** are folded into the smoke checklist above.

---

*v50-07-05 UAT plan — execute over 1–2 worship cycles after deploy*
