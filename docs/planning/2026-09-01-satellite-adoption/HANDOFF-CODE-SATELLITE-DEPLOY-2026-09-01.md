# HANDOFF → Code: one satellite deploy before Rosh Hashanah — ship the pagemap correction that is already committed

Executor: Code (satellite-deploy lane) — a session on the HOST; all git and all verification host-side (rule 8 addendum)
Status: **DISPATCHABLE**
Decide-by: **deployed and verified by ~Sept 9** (Rosh Hashanah begins sundown Sept 11)
Authority: Daniel, vision sitting 2026-09-01 (board row 20:2xZ) · R-0901-vision-4 · R-0831-live-pagemap-1.
This is SHIPPING already-committed work, not development — R-0901-cont-1 §3's quiet posture stands; nothing new is built.
No ruling ids spent by the executor.

**Assume no prior context.** Read: `~/shireishabbat/COORDINATION.md` (v1.1), `sheet-music-app/CLAUDE.md`,
`sheet-music-app/docs/DEPLOY-CHECKLIST.md`. Open a family row on `~/shireishabbat/STATUS.md` first;
claim your paths; check the tail. Commits, if any, carry `Lane: satellite-deploy (Code)`.

## Why (measured 2026-09-01 by the vision sitting; re-measure, don't inherit blindly)

- The LIVE MCP `list_books` serves `shirei-tshuvah` at **248 pages**. `master`'s committed
  `src/data/books/registry.json` says **184, tier `feed`** (regenerated from the PRINTED press
  build per the 08-31 commit; crc-friday 48 and crc-saturday 102 already match live).
- The registry is a **static import** (`src/lib/books/registry` → `src/data/books/registry.json`),
  bundled at build time. So the live surface is running a build that predates the fix. The likely
  cause: the fix commits were never pushed — the audit found local `master` ahead of
  `origin/master`. **Verify this yourself host-side** (`git log origin/master..master --oneline`).
- Vercel production tracks `master` (project `sheet-music-app`, team ravbogards-projects; the
  `…-git-master-…` deployment alias exists). A push to `origin/master` is the deploy.

## D1 — preflight

1. Host-side: confirm the working tree is clean and what `origin/master..master` contains — expect
   the pagemap regeneration, the 08-31 wave if unpushed, and the adoption lane's four commits.
   Anything unexpected in that range: STOP, list it in the return, wait for Daniel.
2. `npm test` (vitest) green locally. If the suite needs the Firebase emulator for meaningful
   coverage, `npm run test:emulator`; use judgment, state what you ran.
3. DEPLOY-CHECKLIST: this deploy introduces **no new server secrets** (registry JSON + docs + the
   MCP instructions string). Confirm by eye that nothing in the push range touches `src/env.mjs`
   or reads a new env var; if it does, follow the checklist's secret-first ordering.
4. Timing: deploy in a quiet window — never Friday evening, Shabbat morning, or a holiday service
   window. Today's fine.

## D2 — deploy

`git push origin master`. Watch the Vercel build; production must reach **READY with a
`githubCommitSha` matching the pushed HEAD** (the webapp repo's discipline applies here too — a
deploy you did not verify is a deploy you do not have).

## D3 — verify against the live surface, not the tree

1. `list_books` (live MCP) now returns `shirei-tshuvah` with the page count and tier that the
   DEPLOYED commit's `src/data/books/registry.json` states (184/`feed` as of this writing —
   read the deployed commit, don't trust this file); crc-friday 48 and crc-saturday 102 unchanged.
2. `lookup_book_page` sanity: one lookup in `shirei-tshuvah` and one in `crc-saturday` resolve.
3. centralreform.live loads; a Perform-mode setlist page renders (read-only check, no data edits).
4. **The number-space check, because the page space just shrank 248→184:** scan existing setlists
   whose book is `shirei-tshuvah` (list_setlists/get_setlist, read-only) for liturgyRef page
   numbers above the deployed page count. Fix nothing; list every hit in the return
   **FOR DANIEL** — those rows were authored against the stale space and are his to re-call.
5. If any of 1–3 fails: **Vercel instant rollback to the prior production deployment**, then stop
   and return. Do not iterate fixes on production before Rosh Hashanah.

## D4 — return

`HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-<date>.md` beside this order: the push range, the deployment
id/sha, each verification with its measured value, any 248-space setlist hits, and a CLOSED row on
the family board. **FOR DANIEL** in the return: confirmation the machzor reads right on an actual
iPad is worth sixty seconds of your hands before the 11th.
