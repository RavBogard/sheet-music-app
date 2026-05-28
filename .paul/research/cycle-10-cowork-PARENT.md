# Cycle-10 Cowork — PARENT spec (usability-first / iPad-centric sweep)

**Author:** coder-5 (lane `cycle-10-cowork-usability-ipad-reframe`, branch `feat/cycle-10-cowork-usability-ipad-reframe`, dispatched by supervisor `msg-cycle-10-usability-ipad-reframe-001`). Reframes the prior MCP-first cycle-10 design (`c38baf84ed`) per Daniel's 2026-05-28 directive.
**Date:** 2026-05-28 (reframe of the 2026-05-27 post-fix-verification design)
**Anchor SHA:** `6e043a4ce5` — `feat(perform): add logged-out sign-in card + cap public listing to 5 services` (coder-1's `perform-public-auth-and-cap`, which landed while this PROMPT was authored; supersedes the `3155fb2881` drop-lyric-search base it was cut from). Repo is un-shallowed (`is-shallow-repository:false`); `git show --stat` / `git log -- <path>` are honest. Every file/route/spec/tool/param reference verified against master via `git ls-tree` / `git cat-file -p` / direct worktree read per `[[feedback_cowork_prompt_verify_before_write]]` (most at `3155fb2881`; the `/perform` landing re-verified at `6e043a4ce5` after the auth+cap landing).
**Reads-once contract:** each cycle-10 instance + the auditor reads this PARENT once at boot. Per-instance prompts do NOT re-paste anything here.
**Predecessors:**
- Last full cowork = the **2026-05-26 two-surface run** (`.paul/research/cowork-stress-test-2026-05-26/PROMPT-mcp-stress-test.md` + `PROMPT-web-stress-test.md`). Reuse its report schema + uidPrefix discipline verbatim. The raw findings reports were triaged conversationally (not committed) — reconstruct the closed/open inventory from `.coord/audits/cowork-mcp-2026-05-26-VERIFY.md`, `.coord/QUEUE.md`, `.coord/shared/decisions.md` 2026-05-27 blocks, and the shipped fix commits.
- The cowork PROMPT/PARENT *shape* convention comes from `.paul/research/cycle-8-cowork-PARENT.md`.

> **★ REFRAME NOTICE (2026-05-28, Daniel directive via `msg-cycle-10-usability-ipad-reframe-001`).**
> The prior cycle-10 design was **MCP-post-fix-verification first, web/iPad deferred.** Daniel
> flipped it: _"this sweep should focus on **actual usability above all else**: how users are
> interacting with this, what the bugs are in actually using it, **iPad-centric most of all**
> (though we can test the MCP too if you want)."_ So **Instance 1 is now the real-usability iPad
> sweep**; the MCP post-fix regression content is preserved (good work) and demoted to the
> **spin-only-if-time Instance 2**. Daniel also **lifted the post-Saturday ship-freeze on the
> RUN** (sweep runs THIS week, pre-service) — but the run is **OBSERVE/REPORT-ONLY before
> Saturday**; any destabilizing fix it surfaces is triaged + HELD until post-service (§7).

> **Why "cycle-10", not "cycle-9".** The 2026-05-24 generation already owns the `cycle-9-*`
> namespace. This is the next generation = **cycle-10**. Everything here is namespaced
> `cycle-10-cowork-*`; instance HANDOFFs go to `cycle-10-cowork-instance-<N>-HANDOFF.md`.

---

## §0 — North star

**Usability above all else, iPad first.** The question is not "did the fixes land" — it's
**"how does this app actually feel to use, on the device the band will hold Saturday, and what
breaks or confuses a real user mid-service?"** The band runs the consumer surface on **6× standard
11" iPads (820×1180 WebKit)** per `[[project_band_ipad_hardware]]` — Perform mode must be
bulletproof there. So cycle-10's primary instance is a **judgement-heavy, iPad-centric usability
sweep** of the real consumer surface: the public `/perform` landing, Perform mode, chart bind +
transpose + annotate + zoom + metronome + wake-lock, MusicXML render+transpose, gig-packet print,
and the sign-in flows — graded on **real-user friction, tap-target failures, layout breakage, and
confusing affordances**, not just spec pass/fail.

**The verification model (critical — read `[[feedback_cowork_real_harness]]`):** a cowork instance
is **~75 min single-thread, NOT a 6-8h walk-away**, and **CFC (Claude-for-Chrome) + chrome.debugger
DOES NOT WORK**. The real iPad vehicle is the **in-sandbox Playwright stress harness at
`cycle-4/harness/`** — `npm run stress` drives the `ipad-webkit` (820×1180) + `ipad-webkit-landscape`
projects across 13 categories of *existing* iPad e2e specs and emits a cowork-shape REPORT (Lanes
A+B+C all landed). CFC does NOT replicate iPad viewport / offline / long-press / role-gate; the
harness does. So Instance 1 is a **hybrid**:

- **Deterministic iPad load** rides `npm run stress --projects=ipad-webkit,ipad-webkit-landscape`
  across the usability categories (A,B,C,D,E,H,J,K,L,S). The emitted REPORT is the spec-pass/fail
  + annotation layer.
- **Qualitative "does this actually feel usable" judgment** rides a cowork-Claude pass on the
  **PUBLIC `/perform` surface** (needs no auth → the cleanest target given META-003, below) plus
  the harness-documented coverage gaps the specs can't score: **Cat-G iPad touch-target
  ergonomics** and **Cat-N monitor UI**, plus the named verification targets in §4.

This is the layer the harness can't replace: a spec asserts a button is clickable; only a judgment
pass notices the button is a 28px tap target two thumb-widths from the screen edge, or that the
"upcoming" service is buried below three past ones, or that the transpose control's state is unclear
mid-song.

---

## §1 — Mission roster + instance-split recommendation

**Decision (Daniel `msg-cycle-10-usability-ipad-reframe-001`): Instance 1 = iPad-usability
(PRIMARY, ship now); Instance 2 = MCP post-fix verification (OPTIONAL secondary, "we can test the
MCP too if you want").**

| # | Instance | Surface | Vehicle | Bearer / auth | Wall-clock | Status |
|---|----------|---------|---------|---------------|-----------|--------|
| 1 | **Real-usability iPad sweep** | `/perform` public landing · Perform mode · MusicXML · gig-packet · sign-in | `npm run stress --projects=ipad-webkit[,-landscape]` for the deterministic load + cowork-Claude judgment pass on the PUBLIC surface | mostly **none** (public `/perform` needs no auth); authed paths via admin-test-session secret IF set (§2) | 75 min | **PRIMARY — `cycle-10-cowork-instance-1-PROMPT.md`** |
| 2 | **MCP post-fix verification + Cat-M** | `/api/mcp` | cowork-Claude over JSON-RPC + `npm run stress --surface=mcp` | `admin` root bearer (Daniel-pasted) | 75 min | **OPTIONAL — `cycle-10-cowork-instance-2-PROMPT.md`; spin only if time/appetite** |

**Why this split (flipped from the prior design):** Daniel's framing is usability-first, iPad-most-
of-all. The richest, highest-value cowork work is now the **judgment layer over the iPad consumer
surface** — the part neither the harness nor MCP probes can score. The MCP post-fix regression
content (the old Instance 1) is genuinely good and is preserved verbatim-in-substance as Instance 2,
but it is **secondary**: spin it only if Instance 1 finishes with time/appetite, or as a follow-up
session. The deterministic MCP-probe baseline (Cat-M) can also ride the operational
`npm run stress --surface=mcp` without a full cowork instance.

**Auth demand:** Instance 1 needs **no bearer for its core** (the public `/perform` surface is
unauthenticated by design — verified `src/app/perform/page.tsx` deliberately omits `cookies()` to
keep the static edge cache). Authed Perform paths (a specific `/perform/setlist/<id>` as a logged-in
band member) light up only if Daniel sets `MCP_ADMIN_TEST_SESSION_SECRET` (§2). Instance 2 needs 1
admin root bearer.

---

## §2 — Auth + sandbox policy

**The META-003 constraint (`[[feedback_cowork_real_harness]]`):** `/api/auth/test-session`
(`src/app/api/auth/test-session/route.ts`) mints a `test-*` Firebase **session cookie** but gives
**no Web-SDK auth state** — so client-side Firestore listeners (the data Perform mode subscribes to)
do NOT hydrate from a test-session cookie alone. **Design the iPad-usability probes around this:**

1. **Public `/perform` landing = the cleanest target.** It needs no auth at all (server component,
   no `cookies()`, edge-cached). Most of the usability judgment pass lives here + on the harness's
   own `mintSession` (real Web-SDK signin in `cycle-4/harness/lib/probe.mjs`, which the authed iPad
   specs use).
2. **Authed Perform (`/perform/setlist/<id>` as a real member)** — the harness specs that need auth
   read an admin bearer as `MCP_BEARER` and self-skip without it. For a cowork-Claude authed pass,
   the **admin-test-session escape hatch** (`src/app/api/auth/admin-test-session/route.ts`, coder-7
   `3919d6db2c`) can mint an authed admin session **IF Daniel sets `MCP_ADMIN_TEST_SESSION_SECRET`**
   in prod (verified gated at `route.ts:80`; returns 503 dormant when unset, env.mjs:72/118). If the
   secret is unset, the authed pass degrades to "harness-only" and the cowork judgment stays on the
   public surface — note this in the HANDOFF, do not block.

uidPrefix discipline per `[[feedback_sandbox_test_isolation]]` (for any test accounts Instance 1 or
2 mint):

| Instance | uidPrefix |
|----------|-----------|
| 1 | `c10i1` |
| 2 (if spun) | `c10i2` |

Lowercase, ≤6 chars. **★ The create-side param is `uidPrefix`; the cleanup-side param is `prefix`**
— same value, different name (verified `src/lib/mcp/tools/test-tokens.ts`). Every
`create_test_account({role, uidPrefix:"c10iN"})` is matched by `cleanup_all_test_data({prefix:"c10iN"})`.
**NEVER** call `cleanup_all_test_data` without a `prefix` (sweeps sibling sessions per
`[[feedback_self_inclusion_test_fixtures]]`). The harness role-gate probe uses uidPrefix `stress-c7`
and revokes by uid — do not collide. Do NOT copy any `crl_live_*` bearer or session secret into any
file under `sheet-music-app/` (tracks to git); redact as `***redacted***` in HANDOFFs.

---

## §3 — Harness reality (the iPad vehicle)

`cycle-4/harness/README.md` is the authoritative usage + category→spec map. Verified at
`3155fb2881`:

- **One command:** `npm run stress` → Playwright `ipad-webkit` (820×1180 WebKit) +
  `ipad-webkit-landscape` (1180×820) — the two projects are the default `--projects` value
  (`playwright.config.ts:37,44`). Flags: `--surface=web|mcp|both`, `--categories=A,B,…`,
  `--base-url=<url>` (default `https://www.centralreform.live`), `--bearer=<token>` (read as
  `MCP_BEARER`; authed specs self-skip without it), `--projects=p1,p2`, `--out=<dir>`,
  `--run-id=<id>`, `--fail-on=<severity>`, `--dry-run`. Report → `cycle-4/harness/out/REPORT-stress-<run-id>.md` (gitignored).
- **Category → spec map** (every spec confirmed present in `e2e/` at `3155fb2881`):

  | Letter | Category | Specs |
  |--------|----------|-------|
  | A | Cold-start performance | `perform-ipad.spec.ts` |
  | B | Perform mode + bonded-chart render | `perform-ipad-deep`, `perform-ipad-real-setlists`, `perform-flow`, `ipad-stuck-spinner-probe` |
  | C | Live Director gesture | `live-director-gesture.spec.ts` |
  | D | Library workflow + chart search | `library-ipad`, `library-review-flow` |
  | E | Setlist editing + chart-bind picker | `chart-bind-ipad`, `chart-bind-picker`, `gig-packet-print`, `f023-live-rename` |
  | F | Authoring (Scraper / UploadDialog) | `authoring-stress.spec.ts` |
  | H | Offline behavior | `perform-ipad-offline`, `r1-offline-decisive`, `perform-ipad-pwa-fresh-install` |
  | I | Role-gate matrix (3-of-4 roles) | `role-gate.spec.ts`, `role-gate-matrix.spec.ts` |
  | J | Accessibility (axe-core sweep) | `axe-stress.spec.ts` |
  | K | Onboarding (QR / fresh device) | `onboarding-qr-ipad.spec.ts` |
  | L | Large-setlist stress | `stress-ipad.spec.ts` |
  | S | Smoke (fast public sanity) | `smoke.spec.ts` |

- **FINDING-annotation model:** a failed/timed-out test → a finding; a passing test carrying a
  `testInfo.annotations.push({type:'FINDING',…})` → a finding; a clean pass counts toward "probes
  executed", not a finding; skipped = probe, not finding. Severity for a bare failure defaults to
  the category (B/C/H = HIGH, others = MED).
- **Documented coverage gaps (the cowork judgment layer owns these):** **Cat-G** iPad touch-target
  ergonomics audit (woven into B today; no dedicated spec) and **Cat-N** monitor-surface UI-shape
  (CFC/cowork only, no Playwright spec yet). These are where cowork-Claude eyes add what the harness
  can't.
- **Web-SDK auth** for any client-listener probing rides `mintSession` in `lib/probe.mjs`;
  `/api/auth/test-session` cookie alone does NOT hydrate the Web SDK (META-003, §2).

**Boot pre-flight for Instance 1 (HARD-BLOCK on failure → BLOCKER supervisor + stop):**
```
- npm run stress -- --dry-run   → confirm the spec plan resolves (the ipad-webkit projects + categories)
- GET https://www.centralreform.live/perform → 200, paints the PublicSetlistListing skeleton then a card list
- confirm cycle-4/harness/out/ is writable (the REPORT lands there)
```

---

## §4 — iPad-usability sweep matrix (the heart of Instance 1)

The deterministic specs ride the harness; the judgment layer + named verification targets ride the
cowork pass. **Findings are usability-graded** (see §6 severity): the bar is "would this confuse,
slow, or break a band member holding an iPad mid-service?"

| Area | Deployed surface (verified `3155fb2881`) | Harness category | Judgment-pass focus (cowork eyes) |
|------|------------------------------------------|------------------|-----------------------------------|
| Public `/perform` landing | `src/app/perform/page.tsx` → `PublicSetlistListing` (Suspense+skeleton, edge-cached, no `cookies()`); `src/components/performance/public-setlist-order.ts` `splitPublicSetlists` → upcoming (soonest-first) + past; **now `6e043a4ce5`: `QRSignIn` card for logged-out + `MAX_PUBLIC_SERVICES=5` cap, client-side `useAuth()` gate** | S (smoke), A (cold-start), K (QR) | Upcoming service obvious + above the fold? Logged-out Sign-In card (QR+Google) pinned top + scannable? ≤5 rows? Skeleton→content + card-reveal with NO CLS (`!authLoading` guard)? Tap target ≥44px? Empty-state legible? |
| Perform mode | `/perform/setlist/[id]/page.tsx` + `SetlistPerformClient.tsx`; `PerformanceToolbar.tsx` (TransposerMenu / MetronomeControl / Zoom / Printer / AI); annotate per `PDFOverlay.tsx:71`; `KeepAwakeToggle.tsx` + `use-wake-lock.ts` | B (perform+render), C (live-director gesture) | Chart loads first-tap (no stuck spinner — `ipad-stuck-spinner-probe`)? Transpose/zoom/metronome state legible mid-song? Annotation usable with a finger? Wake-lock toggle discoverable? Page-turn gesture reliable? |
| Chart bind picker | `chart-bind-ipad.spec.ts`, `chart-bind-picker.spec.ts` | E | Picker reachable + scannable on iPad; max-density text rows per `[[feedback_no_cover_art]]` (no cover art); bind confirmation clear |
| MusicXML render+transpose | `src/components/music/SmartScoreViewer.tsx`, `src/components/performance/resolveViewerKind.ts` (routes pdf/musicxml/audio/image/chordpro), `TransposerMenu` musicxml transpose | B | MusicXML renders + transposes legibly on iPad (the STRATEGIC format per `[[project_musicxml_goal]]`); key-change reflows cleanly; no PDF-only fallback masking a broken render |
| Gig-packet print | `src/app/api/setlist/print/{route.ts,public,personal,prepare}/route.ts`; `gig-packet-print.spec.ts` | E | Print output usable from iPad Safari; layout intact |
| Offline | `perform-ipad-offline`, `r1-offline-decisive`, `perform-ipad-pwa-fresh-install` | H | Open chart survives a wifi drop; not-yet-opened chart degrades gracefully (the 5/22 offline-gap class) |
| Sign-in flows | `src/components/auth/QRSignIn.tsx`, `/api/auth/qr/route.ts`, Google sign-in in `LoginClient.tsx`; `onboarding-qr-ipad.spec.ts` | K | QR scan-with-phone end-to-end on a touch device; Google sign-in completes; onboarding a fresh iPad is friction-free |
| a11y | `axe-stress.spec.ts` + `lib/runAxe.mjs` | J | 0 contrast/aria violations on Perform + landing (rides the harness; judgment pass notes anything axe can't see) |

**★ Named verification target — coder-1's `perform-public-auth-and-cap` lane
`[LANDED at 6e043a4ce5 — feat(perform): add logged-out sign-in card + cap public listing to 5 services]`:**
this lane is now LIVE on master (it landed while this PROMPT was being authored). Verified in
`src/components/performance/PublicSetlistListing.tsx`: `QRSignIn` import + a logged-out Sign-In card
(QR + Google) pinned to the top; `MAX_PUBLIC_SERVICES = 5` cap applied at the call site
(`upcoming.slice(0,5)` then past fills the remainder — upcoming-first preserved); auth via
`useAuth()` surfaced **client-side only** with an explicit CLS guard (card renders only after
`!authLoading`); `page.tsx` still avoids `cookies()`/`headers()` so the static edge cache is intact.
**This is a PRIMARY verification target — exercise it hard on iPad:**
- logged-out shows **QR + Sign-In** card pinned top; authed does **not** (just the listing);
- **≤5 rows total**, upcoming-first ordering preserved;
- **no CLS** — confirm the card does NOT flash-then-yank as auth resolves (the `!authLoading` guard);
- **edge cache intact** — the SSR skeleton still paints byte-identically for authed + unauth.
(Re-confirm the SHA at run time via `git log -1 origin/master`; if a later commit changed the cap or
card, note the delta.)

**Out of scope (do NOT probe):** F-002 lyric-search (feature dropped `3155fb2881`); `bridge/**`,
repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `error-envelopes.ts`; live X32 writes
(monitor UI Cat-N is **visual-shape only**, no fader pushes); admin-role priv-esc (3-of-4 matrix only).

---

## §5 — Cat-G + Cat-N (the gap-coverage rim)

The two harness-documented gaps are where the cowork judgment pass earns its keep:

- **Cat-G — iPad touch-target ergonomics.** No dedicated spec (woven into B). Cowork-Claude audits
  tap-target sizes (≥44×44px Apple HIG floor), thumb-reach zones (controls within reach of a
  two-handed iPad grip), spacing between adjacent controls (mis-tap risk), and gesture conflicts
  (page-turn vs annotation vs scroll). Report friction even where the spec passes.
- **Cat-N — monitor surface UI-shape.** CFC/cowork only. **Visual/affordance shape ONLY — no live
  X32 writes** (the desk is OFF unless Daniel confirms it's intentionally on per
  `[[project_mixer_feature]]`; monitors are **wedges**, not IEM, per `[[feedback_terminology]]`).
  Confirm the `/monitor` panel renders, fader strips + bus-assignment affordances are legible on
  iPad, and the bus5 master-mute survivor state is visually coherent. Validation-envelope layer only.

---

## §6 — Output shape

Instance 1 (and Instance 2 if spun) writes:
1. `.paul/research/cycle-10-cowork-instance-<N>-HANDOFF.md` — **lead with a usability scorecard
   table** (one row per §4 area: PASS / FRICTION / BROKEN / N-A), then findings. Severity-only tags;
   per-finding deployed-surface evidence (screenshot path / viewport / repro). **Finding ID prefix
   `C10I<N>-NNN`.**
2. `.paul/research/cycle-10-cowork-instance-<N>-findings.jsonl` — one finding/line.
3. `.paul/research/cycle-10-cowork-instance-<N>-artifacts/` — the `npm run stress` REPORT copy,
   iPad screenshots, sanitized transcript excerpts.
4. One ACK + one HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed
   `from cycle-10-cowork-instance-<N>` (NOT `coder-<N>` — these are standalone Daniel-launched cowork
   sessions). Cite findings count + load-bearing IDs + the usability verdict (clean / N-friction /
   N-broken).

**Severity calibration (usability-graded for Instance 1):**
- **BLOCKER** = unusable on iPad mid-service: chart won't open, white screen, setlist won't
  navigate, offline drop loses the open chart, sign-in dead-ends.
- **HIGH** = major friction a band member hits in normal use: tap-target miss/mis-tap, layout break
  at 820×1180, lost annotation, transpose state unclear enough to play the wrong key, MusicXML
  renders broken.
- **MED** = confusing affordance / discoverability gap / unclear state that slows but doesn't stop.
- **LOW** = polish (spacing, copy, minor contrast).
- **INFO** = observation / nice-to-have / harness-coverage note.

(Instance 2 keeps the MCP severity calibration in its own PROMPT — data-loss/role-bypass = BLOCKER, etc.)

---

## §7 — Standing rules + ship policy

Binding (disobedience → auditor BLOCK at TRIAGE):
1. **OBSERVE/REPORT-ONLY before Saturday.** Daniel lifted the post-service freeze on the RUN (sweep
   runs this week, pre-service) — but the run **produces a findings report; it does not ship fixes.**
   Any *destabilizing* fix it surfaces is triaged + **HELD until post-service.** **No risky ships
   land before the Sat 2026-05-30 B'nei Mitzvah.** A trivial, obviously-safe copy/contrast fix MAY
   ship with supervisor sign-off; anything touching Perform render / data / auth waits.
2. **No mutate prod** beyond `isTest:true` / `c10iN-`-prefixed fixtures cleaned up in HANDOFF.
   Neither instance calls `publish_setlist` to real recipients.
3. **No live X32 writes** (Cat-N is visual-shape only). No probe of `bridge/**`, repo-root `mcp/`,
   `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `error-envelopes.ts`.
4. **No worktree, no branch, no ship from the cowork instances.** They are probe/observe roles;
   output is the HANDOFF. (THIS lane — the PROMPT authoring — ships docs; the RUN does not.)
5. **Cleanup before HANDOFF.** Every `create_test_account`→`cleanup_all_test_data({prefix})`; every
   `upload_chart`→`delete_chart`; every fixture setlist→`delete_setlist({force:true})`; every minted
   child bearer→`revoke_minted_bearer`. Verify zero residual `c10iN-*` / `test-*` before
   HANDOFF-COMPLETE.
6. **Deployed-surface evidence mandatory** for every load-bearing finding (screenshot + viewport +
   repro for usability; envelope for MCP). Emulator/unit PASS does not close a finding.
7. **Stay in your lane.** Cross-area regression-sweep is the auditor's job.

---

## §8 — Dispatch gate (supervisor checklist before pasting the instance prompt)

1. Harness Lanes A+B+C landed ✓ (DONE); `npm run stress -- --dry-run` resolves the ipad-webkit plan.
2. Confirm the public `/perform` landing serves 200 at the dispatch SHA (the surface advances; e.g.
   coder-1's `perform-public-auth-and-cap` may land between now and the run — re-check the §4 named
   target and flip it from PENDING if so).
3. **Auth decision:** if an authed iPad pass is wanted, Daniel sets `MCP_ADMIN_TEST_SESSION_SECRET`
   in prod (else the pass stays on the public surface — fine). Source the admin bearer for the
   harness's authed specs via `node scripts/supervisor-prod-bearer.mjs`
   (`[[feedback_supervisor_bearer_persistence]]`).
4. Confirm the run is pre-service this week + the OBSERVE/REPORT-ONLY rule (§7.1) is in the dispatch.
5. Paste `cycle-10-cowork-instance-1-PROMPT.md` into one cowork tab; auditor reads this PARENT once.
6. **Decide Instance 2 (MCP)** only if Instance 1 finishes with time/appetite, or as a separate
   follow-up — it is optional per Daniel.

---

## §9 — Auditor handoff

Auditor reads this PARENT once, validates the instance HANDOFF(s) as they land, writes TRIAGE into
`.paul/research/cycle-10-cowork-TRIAGE.md`. Green-gating at TRIAGE, not discovery.

**Fixes-wave bar:** a cycle-10-fixes wave opens only if TRIAGE surfaces **≥1 BLOCKER** OR **≥3 HIGH
usability findings** on the iPad consumer surface. A clean scorecard + only MED/LOW/INFO = green, no
wave. **Any fix that opens MUST honor the §7.1 pre-service HOLD** — fixes queue; nothing risky ships
before Saturday's service.

---

*from coder-5*
