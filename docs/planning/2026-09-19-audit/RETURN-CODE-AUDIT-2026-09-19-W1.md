# RETURN-CODE-AUDIT-2026-09-19-W1 — CentralReform.live (sheet-music-app)

Executor: Claude Code (Opus), one session, 2026-09-19 into 2026-09-20
Against: `c7a467010f` (master) — the commit that landed the audit documents
Wave: 1
Status: **ten of twelve items done. One done-but-unverified, one not started.**

---

## The two things the handoff said Daniel must see

**1. Which option I took for the Publish notification path — item (b).**

I kept the route and renamed it. `/api/setlist/publish` is now
`/api/setlist/notify-band`; the MCP tool `publish_setlist` is now `notify_band`.

The handoff offered two options and told me to check first. I checked, and the
other notify routes do **not** cover every channel:

| route | in-app | push | email | SMS |
|---|---|---|---|---|
| `publish` (now `notify-band`) | yes | **yes** | yes | **yes** |
| `resend-email` | no | no | yes | no |
| `email-packets` | no | no | yes | no |
| `notify-updated` | yes | no | no | no |

Web push and SMS are reached by that route and nothing else — neither
`resend-email` nor `email-packets` nor `notify-updated` even imports
`push-send` or `sms`. Deleting it would have removed two channels the band
actually receives on, and the way we would have found out is a musician not
getting a text before a service.

So: the stamp, the snapshot and the word "publish" are gone; the capability
stays under a name that says what it does. This is exactly the interpretation
the master plan pre-authorised ("keep the notification capability as its own
plainly named action") and it is now the code.

**2. The disagreement list from item (o).** Not applicable to Wave 1 — (o) is a
Wave 2 item and is STOP-blocked on your answer about the printed booklet.

---

## Two more things you should see

**There is no Publish button, and there has not been one for a while.**

The handoff asked me to remove it. I could not find it. `PublishDialog` had no
caller anywhere in the app — only its own test file rendered it. So the browser
has had no way to tell the band at all, and in practice that capability has been
MCP-only.

I renamed the component to `NotifyBandDialog` and rewrote its copy, so it is
correct and ready, but **it is still not rendered anywhere**. Wiring a button
into the setlist page is a user-visible product decision with no precedent to
follow, so I left it for you. Two options: wire it up, or delete the component
and accept that telling the band is something you do from Claude Desktop.

Related: the dialog's old copy said publishing would "make visible to all
members". That was never true — every setlist has been public the moment it
exists since the `publishedAt`-as-gate concept was killed on 2026-05-28. The new
copy says so plainly.

**`npm run build` does not work on this machine as-is.** `.env.local` has no
`NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN` or `_PROJECT_ID`, and `env.mjs`
requires those three everywhere, so the build dies collecting page data. It
passes end to end when they are supplied. Nothing to do with this wave's work —
it is a local-environment gap and worth five minutes so a plain `npm run build`
works here.

---

## The checklist

| item | verdict | note |
|---|---|---|
| (a) Firestore: gate `list`, keep `get` | **PASS** | both consumers moved server-side; emulator tests for both tenants |
| (b) Retire Publish | **PASS** | route kept and renamed — see above |
| (c) `today.json` freshness + visible failure | **PASS** | 15-min cron, read-back, alert, health age |
| (d) `build-bridge.yml` + bridge version | **PASS** | verified by a real local build |
| (e) `.env.example` regenerated | **PASS** | 19 undeclared variables now declared; coverage test |
| (f) Stray tracked files | **PASS** | 14 files + `outputs/` gone, gitignored |
| (g) Branches, worktrees, `main` | **PASS** | 85 branches → 5, 7 worktrees → 1 |
| (h) Documentation layout | **PASS** | 94 files into git; root is 5 `.md` |
| (h2) `CLAUDE.md` governance | **PASS** | one regime, banners gone |
| (i) Web vitals | **DONE, NOT VERIFIED** | fixes landed; cannot measure — see below |
| (j) Clear the AI review queue | **NOT STARTED** | blocked, see below |
| (k) `scripts/` layout | **PASS** | 79 loose → 13 |

### Shipped

```
56dbdc361b  web vitals: reserve the space, and stop shipping 574 KB to draw a 96px circle
9503f35fc4  scripts: three folders instead of 79 loose files (audit item k)
0e8f0bde95  bridge: the release workflow now builds the thing the bridge actually is
521d65243a  setlists: retire Publish, keep telling the band
5ed76d3cfd  today.json: emit every 15 minutes, read the file back, say so when it is stale
a57fea36cc  hygiene: stray files out, branches pruned, env declared, governance rewritten
```

Not yet pushed or deployed — see **Before this deploys** at the end.

---

## What is not done, and why

### (j) Clear the AI review queue — blocked on you

The tools for this live on the **CRC Music MCP connector**, which is installed
in this session but unauthenticated: the only calls available are
`authenticate` and `complete_authentication`. Authorising it needs you in a
browser. `list_review_queue`, `retry_enrichment`, `accept_enrichment`,
`reject_enrichment` and `dismiss_failure` are all behind that.

Nothing else about this item is hard — auto-apply is already ON at 0.90, and
the work is a dry run over 50-odd `salvage` rows frozen 2026-05-20..23, then a
decision per row. It is one short session once the connector is authorised.

### (i) Web vitals — fixed, not measured

The done-when is `get_web_vitals_summary` reporting both CLS figures under 0.1
and `/login` LCP under 2.5s on data collected after the deploy. That tool is on
the same unauthenticated connector, so I could not run it before and cannot run
it after. What I have is diagnosis, not measurement:

- **`/library`, CLS p75 1.0 — cause certain.** The skeleton drew ~90px cards;
  the virtualizer seeds real rows at 64px. Two constants written in two files
  that disagreed. They now live in one file both sides import, so they cannot
  drift again.
- **`/login`, LCP ~9s — cause as close to certain as inspection gets.**
  `public/logo.jpg` is **574 KB**, painted by a raw `<img>` into a 96×96 circle,
  with no dimensions and no priority, discovered only when the parser reached
  the tag. It is a `next/image` now — resized, re-encoded, preloaded.
- **`/setlists/[id]`, CLS 0.58 — likeliest reading.** While tracks loaded the
  grid rendered an empty list occupying nothing, then a whole service's worth
  of cards at once. It reserves the height first now, using the setlist doc's
  `trackCount` when it has arrived (the common case, and then nothing moves at
  all).

**Re-measure after the deploy before calling any of these closed.** If the
sample is thin, report the sample size rather than the number, as the handoff
says.

---

## Three places the audit's own facts were wrong

Worth recording so nobody re-derives them.

**Worktrees.** The audit said five of six worktrees were prunable and pointed at
paths that no longer exist. Against the live repo: all seven existed, nothing
was prunable. That reading came off a snapshot. I checked each one instead —
four fully merged, and the two that looked unmerged (`chart-live-pilot`,
`ci-cost`) are already in master by patch-id, which `git cherry` confirms. All
six removed safely; the conclusion held even though the premise did not.

**`git worktree remove` ate `node_modules`.** It followed the junction the
worktrees shared into the main repo's copy and emptied it. `npm ci` put it back.
If you remove a worktree in this tree, expect to reinstall.

**`preview_publish` is not separable from `publish_setlist`.** The handoff said
to delete the `publish_setlist` registration and keep `preview_publish`, but
preview is a thin wrapper that *calls* `publishSetlist({dryRun:true})` — keeping
one and deleting the other would have left a preview with nothing to trigger. I
renamed both (`notify_band`, `preview_notify_band`), which serves what both
lists were for: the capability stays, the word goes. Its `recommendation` field
now returns `"send"` rather than `"publish"` — I changed the value rather than
leave a tool description that lied about its own contract.

---

## How each item was verified

**(a)** New emulator suite `firestore-rules-get-vs-list.emulator.test.ts` runs
every case twice, once per tenant: signed out can `get` a setlist and a track by
id; signed out is denied a bare collection query on both, denied the exact
`where("setlistId","==",…)` query Perform used to run, and denied a query
narrowed by `orgId` (stated explicitly so nobody "fixes" the landing page by
adding an org filter and assuming that made it legal); signed in, both work
again. The old `firestore-rules-tracks` Scenario B asserted the anonymous query
**succeeds** — that was the hole, so it is inverted, with the reason written
where the next reader will find it.

Both consumers moved: `fetchTracksForSetlistClient` goes to a new public,
rate-limited `/api/setlists/{setlistId}/tracks` when signed out and falls back to
Firestore if that fails; `PublicSetlistListing` subscribes only when signed in
and otherwise renders the ISR page's server slice, which `/perform/page.tsx` has
always passed it. Row order is the author's throughout — `order`, then id, the
canonical R11-b sequence. That also fixed a latent bug: `client-tracks` was
sorting on `order` alone, so on the two setlists with duplicate `order` values it
could disagree with every other reader.

A signed-out browser check against the deployed site is **still owed** — it
cannot happen before the deploy. It is listed below.

**(c)** Twelve tests. The pure verdict logic, and the route driven with a stubbed
failing emit and a stubbed stale one, asserting the alert actually fires, stays
quiet on a repeat inside six hours, speaks up when the problem changes shape, and
survives a dead mail server without failing the run.

**(d)** Verified by running `npm ci` and `npm run dist` against the edited
config: produced `CentralReform-Bridge-Setup-10.0.7.exe`, its blockmap, and a
`latest.yml` naming that exact file. The old workflow packaged a `launcher.js`
that does not exist and never could have — every release since the Electron
rewrite would have failed. It also attached one file where `electron-updater`
needs three; without `latest.yml` on the release, an installed bridge never
learns there is an update.

**(e)** `src/__tests__/env-coverage.test.ts` fails on any new undeclared
`process.env` read in `src/`, and on any declared variable missing from
`.env.example`. The exemption list is short and every entry carries a reason.

**(k)** `npm run build` passes, `npm run check:types` passes, `ls scripts/*.*` is
13. Eight test files under `scripts/__tests__/` still imported their subjects by
the old relative path — missed on the first pass, caught by the unit suite,
fixed; all 14 script tests pass.

### Suite status

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 402 files passed, 6 skipped, 0 failed.
- `npm run test:emulator` — 1307 of 1308 at the point the last real failure was
  fixed. A later full run showed timeout-shaped failures (`Hook timed out`,
  `Timeout calling fetch`) while a production build was running on the same
  machine; the six files involved pass in isolation, 88 tests, and
  `vitest.emulator.config.ts`'s own header documents this contention ceiling.
  Re-run it on a quiet machine before deploying if you want a clean single number.
- `npm run build` — passes with the three Firebase public vars supplied.

---

## Before this deploys

1. **The signed-out browser check for (a).** Open `/perform` and one setlist's
   Perform view in a private window against the deployed site and confirm the
   list and the tracks render. The emulator proves the rules; only a browser
   proves the two server routes carry the load. This is the one thing in Wave 1
   that cannot be verified before a deploy, and (a) touches the band's surface.
2. **Re-measure the three web-vitals routes** once the connector is authorised.
3. Nothing here is pushed. `git push origin master` when you are ready; the
   09-14 ruling lets me deploy without asking, and I have held only because the
   signed-out check above wants a deployment to check against and the ordering
   is yours to choose.

## Wave 2 readiness

Wave 2 waits on shireishabbat's Wave 1 (the moments agreement check, the
published `dist-app` artifact) and on you for (o). Nothing in Wave 1 blocks it
from this side. (p), the MCP surface split, is the largest of them and is now
cheaper than it was: the tool surface is one file, and this wave already walked
most of it.
