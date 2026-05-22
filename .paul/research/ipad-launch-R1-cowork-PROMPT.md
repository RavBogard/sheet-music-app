# R1 — Cowork exploratory iPad-Perform UX pass — READY TO PASTE

> Paste into a Claude Cowork session. This is the **exploratory / judgment** half of
> R1 — a human-grade walkthrough of the iPad Perform experience that the deterministic
> Playwright suite (`ipad-launch-R1-claude-code-PROMPT.md`) can't fully judge (visual
> legibility, layout sanity, "would a musician on a stand be confused"). It runs inside
> the documented Cowork reality, not as a walk-away job.

## Cowork reality (bake these in — they are hard-won)
- A Cowork run is **~75 minutes single-thread**, NOT a 6–8h walk-away. Scope to ONE
  focused pass; don't plan exhaustive matrices.
- **CFC + chrome.debugger DOES NOT WORK.** The working harness is **in-sandbox Playwright**.
  Drive a `webkit` browser at **820×1180** from inside the sandbox.
- Auth: `cycle-4/harness/lib/probe.mjs` `mintSession({baseUrl, bearer, uid, firebaseAuth})`
  → test-session cookie + `customToken` → `signInWithCustomToken` on a Web SDK `Auth`
  instance = a real authenticated musician session. Test uids via MCP `create_test_account`
  with a per-instance `uidPrefix` (isolation — pass the SAME prefix to
  `cleanup_all_test_data`, or use `revoke_test_account` by uid).
- **READ-ONLY on the real setlists/charts.** Explore the real public setlists for visual
  judgment; do all WRITE/transpose-persist/bind exploration on your own `test-*` fixtures.
- No live monitor-desk writes during Fri-eve / Shabbat-morning services.

## The real launch setlists (public, view READ-ONLY at 820×1180 webkit)
- TONIGHT — "Kabbalat Shabbat — May 22, 2026": `/perform/setlist/226309e2-78b7-48af-aa21-6aaf606b4fbe`
- TOMORROW — "Shavuot Yizkor — May 23": `/perform/setlist/UnjLqKTtS4lNKQfMY6hB`

## What to explore (≈75 min, prioritized)
1. **Open both real setlists at 820×1180.** For each chart the band will actually pull up
   tonight/tomorrow: is the PDF **legible at the default zoom on an 11" screen** (not too
   small, not clipped)? Does it land fast (no long blank/spinner)? Screenshot anything
   cramped or low-contrast. This is the judgment the deterministic sweep cannot make.
2. **The reachability trap (known Finding A).** In tonight's setlist, the Barechu and
   Adonai Sifatai charts are bonded but typed `prayer`, so they DON'T open in Perform.
   Confirm the band-facing experience (a dimmed, un-tappable row) and note any other
   bonded-but-unreachable rows across both setlists.
3. **Transpose legibility (MusicXML/OSMD is the strategic format, but tonight/tomorrow are
   all PDF):** on a `test-*` fixture with a MusicXML chart, transpose up/down and judge that
   the re-rendered score is legible on iPad. On the real PDFs, confirm the transpose button
   correctly shows as unavailable (PDF is raster).
4. **Music-stand ergonomics:** next/prev between charts — is the active chart obvious? Are
   the toolbar tap targets comfortable for a musician mid-song? Try landscape (stands
   rotate). Metronome + zoom controls reachable without hunting?
5. **Offline nerves:** load a setlist, toggle the sandbox offline (abort http(s), keep
   blob: alive — NOT Playwright `setOffline`, which falsely breaks blob: under WebKit), and
   confirm a previously-opened chart still shows. This is the shul-wifi-drops scenario.
6. **First-load on a cold cache** (the band's iPads tonight): hard-reload a setlist and time
   to first readable chart.

## Output
A short findings list ranked by launch impact: anything that would confuse or block a
musician tonight/tomorrow first. For each: setlist + chart, what you saw, a screenshot,
and "blocker / polish / note". File launch-blockers to `.coord/inbox/supervisor.md`
immediately; the rest in the cowork HANDOFF. Keep it tight — signal over volume.
