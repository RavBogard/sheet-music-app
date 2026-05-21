# Product-Gap: Robustness & Trust — FINDINGS (READ-ONLY research)

**Lane:** `product-gap-robustness` (coder-5) · **Base SHA:** `a5d35f47f` · **Date:** 2026-05-21
**Scope:** the NON-FUNCTIONAL backbone — reliability, security, dependability, resiliency.
**Seam:** coder-6 owns functional features + UX completeness. Monitor/IEM subsystem SKIPPED (freshly audited; only CRIT-003 referenced as a cross-cutting credential issue).
**Lens:** band-onboarding readiness — *bulletproof + dependable for 6 shared 11" iPads running weekly Friday-evening / Shabbat-morning services, with ONE part-time maintainer.*
**Method:** ingested the existing corpus first (postmortems, storage-recovery, orphan/bond audits, ipad-sweeps, crit-003, cycle TRIAGEs) then surveyed the app for uncovered gaps. Each finding tagged **NEW** vs **KNOWN** (with corpus cite) and **FACT** vs **INFERENCE**.

---

> **POST-SHIP VERIFICATION (2026-05-21T14:50Z, coder-5):** PGR-02 **RESOLVED / refuted.** Live prod-bundle probe (Playwright `browser_evaluate` against www.centralreform.live) read the Sentry v10.39.0 client off the carrier scope: `clientFound:true`, `dsnConfigured:true` (`o4510899611828224.ingest.us.sentry.io/4510899613532160`), `enabled:true`, `environment:"production"`, `release:c180fbd85…` (the *current* master tip — so the DSN is inlined into the latest deployed build, satisfying the build-time-inlining caveat). Daniel confirmed the env var is set; this proves it's actually active client-side. **PGR-02 downgraded CRIT → RESOLVED (client-confirmed).** Server-side init (`sentry.server.config.ts`, same DSN var, same build) is therefore almost-certainly on too, but is browser-unprobeable — *high-confidence inference, not directly confirmed.* This makes **PGR-01 (no backup-DR) the standalone #1.** Note: PGR-03 (alert queues with no reader), PGR-04 (no AI-spend guard), and the crons that call **no** `captureException` at all (scheduling-reminder, verify-chart-bond-health) remain valid regardless — but Sentry being live means the crons that *do* capture now genuinely surface.

## TL;DR — the 5 most important MISSING pieces for band-readiness

1. **There is NO functioning backup or disaster recovery for Firestore or Storage. (PGR-01, CRITICAL.)** A daily-backup cron exists *in code* but is (a) **not registered in `vercel.json`** so it never runs, (b) silently no-ops to a doc-*count* "logical backup" when `BACKUP_BUCKET` is unset, and (c) its admin trigger UI was deleted. Storage object versioning is disabled; soft-delete is 7 days. **If data is lost/corrupted mid-Shabbat, the recovery story is: there is none.** This is the headline gap. (Needs GCP/Vercel console to confirm `BACKUP_BUCKET` is truly unset.)

2. **Failure is silent by default — observability dead-ends.** (PGR-02 CRITICAL + PGR-03 HIGH.) Sentry is fully wired in code but **dormant unless `NEXT_PUBLIC_SENTRY_DSN` is set in Vercel** — and that var is undocumented (`.env.example`) and unvalidated (`src/env.mjs`), so it was plausibly never set. Every other alert path routes through either dormant Sentry **or** a Firestore queue **nobody reads** (`chart_bond_alerts`, `admin-consistency` warnings, backup staleness). A part-time maintainer who isn't staring at dashboards finds out a service is degraded **when a band member complains mid-service.** (One Vercel-console check on the DSN resolves the crux.)

3. **The data-loss class already MATERIALIZED and is unrecovered.** (PGR-05, HIGH.) 297 `library_index` rows point at Storage bytes that were never written; **30 are bonded to 51 tracks across 10 real, live setlists** (Shir Shabbat, Shavuot Yizkor, Bar Mitzvah, etc.). Recovery depends entirely on Daniel still holding the local originals. This is the concrete proof that "no backup" is not theoretical here.

4. **No AI-spend tracking, budget guard, or cost alert.** (PGR-04, HIGH.) Gemini enrichment discards `usageMetadata`; PDF *input* tokens are uncapped; the retry queue replays up to 3×. A retry-storm or a large-PDF batch runs up cost silently until the bill arrives. The "dollar report as a human gate" concept (`[[project_ai_cost_baseline]]`) has zero automated implementation.

5. **The studio-PC bridge holds the production master credential.** (PGR-06 / CRIT-003, HIGH, KNOWN-deferred.) `GET /api/bridge/setup-code` vends the *backend's own* full-admin Firebase service-account key in cleartext; it is never rotated or scoped. The studio PC sits physically in the building on a shared LAN — a copied key = full Auth takeover of the whole app.

> **Counterweight (so this isn't read as alarmist):** the **application layer** is already strong. Atomic upload guard intact, sync-engine save-loss races structurally fixed (not just hotfixed), cascades mostly closed, Firestore offline persistence ON, public read path makes the band's perform surface token-expiry-proof, deny-by-default Firestore rules, auth-by-default API wrapper, hashed MCP bearers with TTL+revocation, and an unusually mature CI (SHA-pinned actions, Dependabot, a real Firebase emulator gate, `next build` gated). **The gap is the INFRASTRUCTURE backbone — backup/DR, alerting-to-a-human, and cost/credential governance — not the code.** See "What's already solid" near the end.

---

## Prioritized gap-map

| ID | Gap | Axis | Sev | Effort | NEW / KNOWN | Console? |
|----|-----|------|-----|--------|-------------|----------|
| **PGR-01** | No functioning Firestore/Storage backup or restore | backup-DR | **CRIT** | M | KNOWN (docs/v4.1-analysis; never wired) | **YES** (GCP/Vercel) |
| ~~**PGR-02**~~ | ~~Sentry dormant unless undocumented `NEXT_PUBLIC_SENTRY_DSN` set~~ → **RESOLVED 2026-05-21** (live prod bundle has client + DSN, env=production, release=current tip; client-confirmed) | error-monitoring | ~~CRIT~~ **RESOLVED** | — | KNOWN-shipped (now verified live) | done |
| **PGR-03** | Alert signals are write-only / un-surfaced for a solo maintainer (`chart_bond_alerts`, admin-drift, backup staleness, all crons) | cron-alerting | **HIGH** | S–M | partly KNOWN-deferred | partial |
| **PGR-04** | No AI-spend tracking / budget guard / cost alert | ai-spend | **HIGH** | M | NEW (manual concept only) | baseline only |
| **PGR-05** | Materialized 297-orphan chart-byte loss; 30 bonded to 51 tracks across 10 live setlists | data-integrity | **HIGH** | L | KNOWN (storage-recovery-B) | recovery: YES |
| **PGR-06** | CRIT-003: bridge vends prod backend full-admin SA key, cleartext, unrotated | secrets/credential | **HIGH** | M→L | KNOWN-deferred (crit-003 DESIGN) | **YES** (GCP) |
| **PGR-07** | Cold-open setlist shows "0 songs" until Dexie listener delivers (>30s; stays empty if WiFi blips in-window) | offline/resiliency | **HIGH** | M | KNOWN (ipad-sweep; re-weighted up) | device |
| **PGR-08** | Shared-iPad IndexedDB outbox is evictable (no `storage.persist()`) → unsynced-edit loss | data-integrity/DR | **MED** | S | NEW | device |
| **PGR-09** | `recordings` collection in NO delete cascade → reverse-orphan bytes | cascade | **MED** | S | NEW | no |
| **PGR-10** | No automated recurring orphan-track GC (224 dangling ≈40% of `tracks`; sweep is manual) | cascade | **MED** | S–M | KNOWN-data / NEW-structural | run: YES |
| **PGR-11** | `perform/error.tsx` swallows the error (`_error` prop) → no Sentry capture from band's hot route | observability | **MED** | S | NEW | no |
| **PGR-12** | ESLint `--quiet` neuters `exhaustive-deps` (a `warn`) → stale-data bugs pass CI | ci-gates | **MED** | S | NEW | no |
| **PGR-13** | Wake Lock silently unsupported on iOS <16.4, no fallback → screen sleeps mid-song | offline/degraded | **MED** | S | NEW | device |
| **PGR-14** | Production logging is console-only; no drain/retention for post-incident triage | logging | **MED** | M | NEW | Vercel |
| **PGR-15** | `/api/health` is a liveness stub; no readiness/dependency checks or status surface | sync-health | LOW-MED | M | NEW | no |
| **PGR-16** | No `npm audit` gate + `legacy-peer-deps=true` + bleeding-edge pins | supply-chain | LOW-MED | S–M | NEW | no |
| **PGR-17** | web-vitals + correction-stats are pull-only; no threshold alerting | sync-health | MED-LOW | M | KNOWN-shipped / NEW-gap | no |
| **PGR-18** | Unit-test baseline drift (cycle-9: 66 stale fails, 20 skip/fail markers) → green-blindness risk | ci-gates | MED | M | KNOWN (cycle-9 TRIAGE) | **verify** |
| **PGR-19** | `/perform/setlist/[id]` per-request Admin-SDK SSR read → cold-start on first chart load | cold-start | LOW-MED | S–M | NEW | Vercel |
| **PGR-20** | `pure.js` admin-SDK debug script tracked at repo root | secrets-hygiene | LOW | S | NEW | no |
| **PGR-21** | calendar-feed `.ics` token (length-only) + QR 6-char client-suppliable code | exposure/auth | LOW | S | NEW | no |
| **PGR-22** | 8 crons (drive-sync q5min) have no service-window awareness | contention | LOW | S | NEW/contextual | no |

---

## Detailed findings

### Data integrity, backup & disaster recovery

**PGR-01 — No functioning Firestore/Storage backup or restore. [CRITICAL]**
The single highest-priority missing piece. *FACTS:* `vercel.json` lists 8 crons; `/api/cron/backup` is **not among them** (its own docstring says to add `{"path":"/api/cron/backup","schedule":"0 3 * * *"}` — never done). `src/app/api/cron/backup/route.ts:98,104-107,156-182` — with `BACKUP_BUCKET` unset it calls `logicalBackup()`, which only counts docs in `['setlists','users','tasks','songUsage']` and writes the counts to `config/backup` (zero data exported). `BACKUP_BUCKET` is `z.string().optional()` (`src/env.mjs:34`); `docs/DEPLOY-CHECKLIST.md:39` lists it optional. The `BackupCard.tsx` admin trigger referenced in older audit docs no longer exists (Glob returns no file). Storage versioning is **disabled** and soft-delete is 7 days (`storage-recovery-B-report.md`). *KNOWN-but-unfixed:* `docs/v4.1-analysis-and-plan.md:64,285` flagged "no backup strategy… configure when ~1000+ docs"; the corpus is now ~569 library_index + ~565 tracks + ~42 setlists + ~567 songs — past that threshold. `CODEBASE-ANALYSIS.md:279` *claims* "Firestore automatic ✅" which is **FALSE** (contradicted by config). *INFERENCE (strong):* the backup feature has likely never produced a real backup in prod. **Recommendation:** provision a GCS export bucket + scheduled Firestore export (managed export, or wire the existing cron into `vercel.json` with `BACKUP_BUCKET` set), enable Storage object versioning, and write a one-page restore runbook. **Needs GCP/Vercel console.**

**PGR-05 — Materialized chart-byte data loss (297 orphans), partly bonded to live setlists. [HIGH]**
*KNOWN, well-documented* (`storage-canonical-migration-PLAN.md`, `storage-recovery-B-report.md`, `orphan-recovery-manifest.md`). Root cause = pre-atomic-guard uploads; the atomic guard ([[feedback_upload_atomicity]]) fixed *new* uploads but cannot recover lost bytes. *FACT:* 30 of 297 orphans are bonded to 51 tracks across 10 real setlists; 0/297 recoverable from Storage soft-delete, Drive, git, or CDN. Heal-in-place tooling is BUILT (`finalize_chart_upload` `targetFileId` mode + `scripts/heal-orphans-from-local.ts`) but the heal-RUN is **GATED on Daniel** locating local originals. **Recommendation:** prioritize the operator heal-run for the 30 live-bonded orphans before onboarding; the rest are catalog cleanup. **Needs Daniel's local files.**

**PGR-08 — Shared-iPad IndexedDB outbox is evictable (no storage-persistence request). [MED]**
*NEW.* *FACT:* `navigator.storage.persist()` is **never called anywhere** (grep `\.persist(` → 0 hits in `src/`); `offline-manager.ts` (which measures `storage.estimate()`) is **dead code** — not imported by any file. *INFERENCE:* iOS WebKit evicts IndexedDB for non-persisted origins under storage pressure / after ~7 idle days; on 6 shared iPads with large cached PDFs this can silently drop the Dexie **outbox** (pending-but-unsynced edits) — a save-loss vector none of the postmortems addressed. **Recommendation:** call `navigator.storage.persist()` on boot; surface a low-storage banner using the existing (currently-dead) estimate helper. **Verifiable on any iPad.**

**PGR-09 — `recordings` collection is in NO delete cascade. [MED, escalating]**
*NEW (corpus predates recordings).* *FACT:* `recordings/{id}` + Storage objects are written by `src/app/api/recordings/upload/route.ts`; grep of the HTTP `setlist/delete` route and MCP `setlist-write.ts` for "recordings" → **no matches**. Deleting a setlist/track with bound recordings leaves orphaned recording docs + Storage bytes — the exact reverse-orphan class the upload atomic-guard exists to prevent. **Recommendation:** add a `recordings where setlistId/trackId ==` phase to both cascade paths.

**PGR-10 — No automated recurring orphan-track GC. [MED]**
*KNOWN data state* (`orphan-tracks-VERIFICATION.md`: 224/224 dangling tracks proven safe, ≈40% of `tracks`); *NEW structural framing.* *FACT:* `library-upload.ts:793-801` deliberately leaves dangling tracks for "the separate orphan-sweep"; that sweep (`scripts/sweep-orphan-tracks-deleted-setlists.mjs`) is a manual `--apply` script HELD for Daniel's green-light, **not a cron** — nothing prevents re-accumulation, which previously *falsely blocked legitimate chart deletes* (the C7I4-002 root cause). The per-setlist-delete cascade IS now fixed (`/api/setlist/delete` route.ts:113-128; MCP `setlist-write.ts:929`). **Recommendation:** promote the verified sweep to a periodic cron or fold into an existing cron's repair step. **Run needs admin creds.**

**Save-loss verdict (positive):** the major save-loss ROOT causes are **structurally closed, not symptomatically patched** — v5h-01 (missing `tracks`/`songs` rules → deployed), v5h3 phantom-VersionMismatch (`expectedUpdatedAt` threading fix at `engine.ts:282-309`, with an emulator regression canary), trackCount drift fixed at the single client→Firestore chokepoint. The **Harness Fidelity Gate** (Firebase emulator subset in CI, `ci.yml:64-91`) structurally enforces against the in-memory-adapter blind spot. Residual *watched* surfaces (TextCell tap-blur race, listener-bump-between-edit-and-commit) rely on Sentry instrumentation to catch recurrence — which loops back to PGR-02. The `cloneSetlist`/`createSetlist` direct-write paths bypass the engine outbox AND (per `v5.1-hotfix…md` §3b) have no Sentry capture — a save-failure there is invisible.

### Observability & alerting

**PGR-02 — Sentry dormant unless undocumented env var is set → silent failure is the default. [~~CRITICAL~~ → RESOLVED 2026-05-21, client-confirmed live; see Post-ship Verification banner at top.]**
*FACTS:* `sentry.client.config.ts:9-11` + `sentry.server.config.ts:7-9` gate `Sentry.init` on `NEXT_PUBLIC_SENTRY_DSN`; `next.config.ts:76-82` only wraps `withSentryConfig` when the DSN is set; `instrumentation.ts:11` skips server config without it. The var appears **nowhere** in `src/env.mjs` (lines 16-62) and **not** in `.env.example`. *INFERENCE:* undocumented + unvalidated ⇒ plausibly never set in prod. If so, every `captureException` (`error-reporting.ts`, sync `sentry-capture.ts`, `global-error.tsx`) silently falls back to `console.*` → ephemeral Vercel logs. **The single highest-leverage action: verify/set `NEXT_PUBLIC_SENTRY_DSN` in Vercel** (it's `NEXT_PUBLIC_`, so it needs a fresh BUILD, not just a redeploy — per [[feedback_probe_harness_prod_flag]]). This one fix unblocks PGR-02 and most of PGR-03. **Needs Vercel console.**

**PGR-03 — Alert signals are write-only / un-surfaced for a solo maintainer. [HIGH]**
The cross-cutting theme: almost every alerting story dead-ends at (a) dormant Sentry, or (b) a Firestore queue with no notifier. *FACTS:* the weekly `verify-chart-bond-health` cron (Thu 15:00 UTC, day before Friday services) writes `chart_bond_alerts/{id}` when bound charts are broken — and a repo-wide grep finds **no read consumer** anywhere in `src/` (cron's own comment: "No push wiring is shipped; the document is the contract", `verify-chart-bond-health/route.ts:23-26`). `admin-consistency/route.ts:71-77` only `console.warn`s drift, no auto-repair, no capture. The `logicalBackup` `config/backup.lastBackupAt` has no staleness alarm. Of 8 crons, several (`scheduling-reminder`, `verify-chart-bond-health`) have **no `captureException` at all** — only logger. **Recommendation:** wire `chart_bond_alerts` → existing push (`push-send.ts`) / email (Resend, already integrated) so the "your Friday setlist has broken charts" signal actually reaches Daniel; add a backup-staleness alarm. Contrast positive: import-failure / AI-review failures DO have a real UI at `/manage/library-review` (not silent, though pull-based).

**PGR-04 — No AI-spend tracking, budget guard, or cost alert. [HIGH]**
*NEW.* *FACTS:* `callGeminiForEnrichment` (`ai-enrichment.ts:492-537`) ignores `response.usageMetadata` — no tokens counted, no per-call cost, no cumulative doc, no ceiling. `MAX_OUTPUT_TOKENS=1024` caps output only; whole multi-page PDFs are sent as base64 `inlineData` (`ai-enrichment.ts:576-581`) so **input tokens are uncapped** and are the real cost driver. The retry queue replays up to 3× with backoff (every 30 min) — a retry-storm is invisible. `[[project_ai_cost_baseline]]` is a *manual* concept with no code. **Recommendation:** capture `usageMetadata` into a Firestore spend counter + a threshold alert; consider an input-size guard on PDF enrichment. **Baseline number needs GCP console; the code gap is confirmed.**

**PGR-11 — `perform/error.tsx` swallows the error → no telemetry from the band's hot route. [MED]**
*NEW.* *FACT:* `src/app/perform/error.tsx:7-12` destructures the prop as `_error`; Next.js passes `error`, so the object is never read and **never sent to Sentry**. A chart-render crash on a band iPad shows the friendly fallback (good UX) but the maintainer gets zero signal. `global-error.tsx` captures, but the per-route boundary catches first. **Recommendation:** rename to `error` + `captureException`.

**PGR-14 — Production logging is console-only; no drain/retention. [MED]**
*NEW.* *FACT:* `src/lib/logger.ts:48-66` delegates all methods to `console`; `log/info/debug` suppressed in prod (`isDev` gate at :24); only `warn`/`error` emit, to Vercel's short-retention stream. Nice `[req=<id>]` annotation (`:34-46`) but no drain. For a part-time maintainer triaging an incident days after a Friday service, the logs may be gone. **Recommendation:** add a Vercel log drain (Sentry/Logtail/etc.).

**PGR-15 — `/api/health` is a liveness-only stub. [LOW-MED]**
*NEW.* *FACT:* `health/route.ts:6-11` returns `{ok:true, uptime}` unconditionally — never checks Firestore reachability, Admin-SDK init, Gemini key, or cron freshness. An uptime monitor would report "healthy" while writes fail. **Recommendation:** a real readiness check / mini status surface (last backup, last drive-sync, open review-queue count, last bond-health run) doubles as the solo-maintainer's pre-Shabbat glance.

**PGR-17 — web-vitals + correction-stats are pull-only. [MED-LOW]**
*KNOWN-shipped, NEW gap.* Core Web Vitals from the iPads ARE collected (`web-vitals/route.ts` → `webVitalsObservations`, 90-day TTL; queryable via `web-vitals-summary` MCP). But entirely pull-based — Daniel must *ask* Claude. A Perform-mode perf regression on the iPads produces no alert. **Recommendation:** acceptable as a weekly-review ritual for a part-time maintainer; only add threshold alerting if cheap once Sentry (PGR-02) is live.

### Security posture (excluding monitor)

**PGR-06 — CRIT-003: bridge vends the prod backend's full-admin SA key. [HIGH, KNOWN-deferred]**
*KNOWN, fully analyzed* in `.paul/research/crit-003-bridge-credential-DESIGN.md`; deferred 2026-05-14, reopened by the 2026-05-21 monitor audit; confirmed still live structurally. *FACTS:* `GET /api/bridge/setup-code` (`setup-code/route.ts:143-163`) builds `{type:"service_account", private_key: FIREBASE_PRIVATE_KEY, client_email: FIREBASE_CLIENT_EMAIL,…}` — the exact identity the Next.js backend runs as (`firebase-admin.ts:18-21`). Redeem is single-use (transaction + 10-min TTL + rate-limited + audit-logged + emailed) and POST is `band_leader`-gated, but the vended key is the **production master**: copy it (or the on-disk `service-account-key.json` from the studio PC) → full Firestore RW + full Auth admin (mint a session as any admin → total takeover) + Storage. No rotation path. *Band lens:* the studio PC is physically in the building on a shared LAN. **Recommendation:** DESIGN doc Option (a) — a dedicated least-privilege SA (`roles/datastore.user`-scoped) vended by the setup-code route instead of the backend's own identity. Removes Auth-takeover from a key leak for ~M effort + one GCP-console session. **Needs GCP console.**

**PGR-20 — `pure.js` admin-SDK debug script tracked at repo root. [LOW]**
*NEW.* *FACT:* `git ls-files pure.js` → tracked; reads creds from `.env.local` at runtime (`pure.js:3`) — no hardcoded secret, but it's a Firebase-admin entry-point committed to the repo and normalizes "admin debug scripts at root." `service-account.json` is NOT tracked (verified). **Recommendation:** delete it.

**PGR-21 — calendar-feed `.ics` token + QR 6-char code. [LOW]**
*NEW, both near-by-design.* (a) `GET /api/scheduling/calendar-feed/[token]` is intentionally unauthenticated (the per-musician token IS the credential, standard for calendar subscriptions) but validates by **length ≥ 10 only** (`route.ts:24`), no entropy floor / rotation; leaks that musician's assignment dates/instruments/setlist names. (b) `POST /api/auth/qr` accepts a **client-supplied** 6-char code (`route.ts:50-52`); mitigated by 5-min TTL, rate-limit, member+ approval, consume-on-read, ~2B space. **Recommendation:** longer random calendar token + document rotation; drop client-supplied QR codes or raise to 8 chars. Both LOW for the band lens.

**Security — items checked and CONFIRMED SOLID (don't re-investigate):** every collection written in `src/**` (23 enumerated) has an explicit rule or is server-only-via-Admin-SDK with `if false` for clients; the 3 code-only collections (`print_jobs`, `chartImportQueue`, `driveWatchState`) correctly fall to the **deny-all fallback** (`firestore.rules:552`); **no `allow read/write: if true` write-open collection exists**. `createApiHandler` is **auth-by-default**; the only two `requireAuth:false` routes (`recordings/file`, `drive/file`) re-implement their own auth boundary or are the standing public-chart policy. MCP bearers: hashed-only, TTL-enforced, revocation + root-cascade honored, raw token never logged; `mint_admin_bearer` admin+root-only, depth-capped, 10/day. `test-session` admin-mint has a hard `^test-` uid gate on every branch. No committed secrets / SA JSON / `.env`. Cron/webhook use `timingSafeEqual` / Svix HMAC. Role-claim sync never accepts a client role / never downgrades.

**Security — dismissed per STANDING POLICY (checked, not flagged):** public chart bytes via `drive/file` + `hasBrowserFetchMetadata`; `setlists`/`tracks` `allow read: if true` + public `/perform/setlist/<id>` contents; admin/band_leader rate-limit bypass; `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1` + `__c7_auth_for_probes__`. (Also: a stale `mcp_test_tokens` *comment* in `test-tokens.ts:24,37` — shipped code uses `mcpTestUsers`; benign doc drift, not a hole.)

### Resiliency / degraded modes

**PGR-07 — Cold-open setlist shows "0 songs" until the Dexie listener delivers. [HIGH]**
*KNOWN* (`ipad-sweep-stress-FINDINGS.md` F1; `ipad-sweep-perform-FINDINGS.md` F-5) — **re-weighted UP to HIGH** against the band lens. *FACT:* the SSR-primed `initial.tracks` frame renders only while `dexieTracks === undefined`; once the live-query resolves to `[]` *before the listener delivers*, the empty result **replaces** the SSR rows (`src/hooks/use-setlist-performance.ts:150-153`). Corpus measured up to **>30s** to first row on prod (42-row landscape cold-open); if WiFi drops inside that window the list **stays empty** until reconnect. This is the one real "iPad blank mid-service" residual. **Recommendation:** keep SSR rows until a *non-empty* live frame arrives (treat empty-Dexie + non-empty-SSR as "still hydrating"). *Seam note: borderline UX, but it's degraded-mode resiliency behavior — flagging here; coder-6 may also see it from the UX side.* **Measure on a real iPad on shul WiFi.**

**PGR-13 — Wake Lock silently unsupported on iOS <16.4, no fallback. [MED]**
*NEW.* *FACT:* `use-wake-lock.ts:11-13` logs a warn and returns silently if the API is absent; iOS Safari gained Wake Lock in 16.4. On older iPads the screen sleeps mid-song with no UX fallback/hint. **Recommendation:** detect-and-nudge ("set this iPad's Auto-Lock to Never") when the API is missing. **Confirm the 6 units' actual iOS version (device check).**

**PGR-19 — `/perform/setlist/[id]` per-request Admin-SDK SSR read → cold-start. [LOW-MED]**
*NEW.* *FACT:* the perform page is an async Server Component doing a live Admin SDK read per request; it **degrades gracefully** (catch → `initialSetlist:null` → client takes over, `page.tsx:58-60`), so a cold/slow SSR doesn't blank the screen — it falls back to the client path (which then hits the PGR-07 window). `maxDuration` coverage is broad and sane elsewhere (gig-packet 120, OMR 300, crons 300, MCP 60). **Recommendation:** low priority; measure cold-start magnitude in Vercel.

**Token-refresh verdict (positive, PGR — no gap):** the band's perform surface is **expiry-proof** — `/perform/*` is a `publicPrefix` (`proxy.ts:77`, presence-only cookie check), and `setlists`/`tracks` are `allow read: if true`, so a musician **cannot** be bounced to /login or hit permission-denied from token/cookie expiry mid-service. The `__session` cookie is 14 days, auto-refreshed daily + on throttled visibilitychange (`auth-context.tsx:200-232`). The only token-refresh dependency is on the *writer* (band_leader) surface — Daniel/David, out of the band-blank lens.

### CI / test / supply-chain

**PGR-12 — ESLint `--quiet` neuters `exhaustive-deps`. [MED]**
*NEW.* *FACT:* `ci.yml:41` runs `eslint src/ --quiet --max-warnings 0`; `--quiet` drops all `warn`-level rules *before* the count, and `react-hooks/exhaustive-deps` is `warn` (`eslint.config.mjs:24`). A missing effect dependency — a classic source of **stale data on screen** (the iPad-staleness class) — passes CI silently. The `--max-warnings 0` looks strict but is neutered. **Recommendation:** drop `--quiet`, or promote `exhaustive-deps` to `error`.

**PGR-18 — Unit-test baseline drift → green-blindness risk. [MED, VERIFY]**
*KNOWN* (`cycle-9-test-baseline-TRIAGE.md`: 66 failing tests / 12 files, all triaged as stale-test not prod-regression; 20 `.skip`/`.fail` markers across 10 files confirmed by grep). The `unit-tests` CI job runs `vitest run` with no allowance — *if those 66 are still red at this SHA the whole gate is red*, training the team to ignore red CI (a BR-19-by-habituation trap). *INFERENCE:* couldn't run the suite here. **Recommendation:** confirm the cycle-9 cleanup landed before `a5d35f47f`; if `unit-tests` is currently red, that's the most dangerous CI state. **Verify on prod-PC / CI.**

**PGR-16 — No `npm audit` gate + `legacy-peer-deps` + bleeding-edge pins. [LOW-MED]**
*NEW.* *FACTS:* CI has lint/types/type-mirror/unit/emulator/build/e2e but **no `npm audit`/`audit-ci` step** (no `audit-ci.json`/`.nsprc`). Dependabot groups only `@types/*` + `@radix-ui/*`; the general npm ecosystem (firebase, next, react-pdf, openai…) gets ungrouped weekly bumps with **no vuln-severity gating**. `.npmrc` sets `legacy-peer-deps=true` → `npm ci` ignores peer-dep mismatches, so an incompatible transitive upgrade can install clean and break only at runtime on the iPads. Pins lean aggressive (`next ^16.2.1`, `react 19.2.3`, `react-pdf ^10.3.0`). Lockfile **is** committed (good). **Recommendation:** add a non-blocking-then-blocking `npm audit --omit=dev` (or `audit-ci`) gate.

**PGR-22 — Crons have no service-window awareness. [LOW]**
*NEW/contextual.* `drive-sync` runs every 5 min, `sync` hourly, both `maxDuration=300`, writing library_index/tracks. No "quiet during Friday/Shabbat service" gating — but band reads are public/local-cache and the engine guards LWW, so a mid-service cron write propagates via listener (could surface a row change), it doesn't blank the screen. Noted for completeness given the weekly cadence.

---

## What's already solid (so Daniel doesn't over-invest)

- **Application-layer data integrity:** atomic upload guard intact (read-verify + compensating-delete + `library_signals` broadcast); sync-engine save-loss races **structurally** fixed (`engine.ts:282-309`) with an emulator regression canary; per-setlist-delete cascades closed; trackCount fixed at the single chokepoint.
- **Resiliency basics:** Firestore offline persistence **ON** (`persistentLocalCache`, `firebase.ts:80`) with incognito fallback; service-worker/PWA fully removed (kills the old reload-loop class); established sessions survive WiFi drops (Dexie-local); redirect-loop escape hatch in proxy.
- **Token-refresh:** band perform surface is expiry-proof (public read path).
- **Security:** deny-by-default Firestore rules; auth-by-default API wrapper; hardened MCP bearer lifecycle (hash/TTL/revoke/cascade); no committed secrets; timing-safe cron/webhook auth.
- **CI maturity (unusual for a one-maintainer app):** SHA-pinned actions, Dependabot, a **blocking Firebase emulator gate** (the deliberate fix for the harness-fidelity gap), `next build` gated (covers the route-export footgun), e2e smoke incl. an `ipad-webkit` project; lockfile + firestore.rules + storage.rules tracked.
- **Error-tracking is well-BUILT** — `@sentry/nextjs`, central `error-reporting.ts`, sync-specific capture taxonomy with PII discipline, `global-error.tsx` boundary. The gap (PGR-02) is purely *activation*, not implementation.

---

## Actions requiring the prod-PC / Vercel / GCP console (hand to Daniel)

1. **PGR-02 — Confirm `NEXT_PUBLIC_SENTRY_DSN` in Vercel prod env.** This single check decides whether observability is "off by default" (config gap) or a false alarm. If absent: set it + **fresh build** (NEXT_PUBLIC is build-time inlined). *Highest leverage item in this report.*
2. **PGR-01 — Confirm `BACKUP_BUCKET` is unset + no GCS export bucket exists**, then provision backup (export bucket + scheduled export + Storage versioning + restore runbook).
3. **PGR-06 / CRIT-003 — Enumerate the backend SA's IAM roles** and create the scoped least-priv SA per the DESIGN doc.
4. **PGR-04 — Pull the current Gemini spend baseline** (last 7d/30d) for the `[[project_ai_cost_baseline]]` snapshot.
5. **PGR-05 — Locate local chart originals** to heal the 30 live-bonded orphans before onboarding.
6. **PGR-18 — Check current CI status at `a5d35f47f`** (is the unit-tests job green?).
7. **PGR-07 / PGR-13 — Real-iPad checks:** cold-open timing on shul WiFi; confirm the 6 units' iOS version vs the 16.4 Wake Lock floor.

---

## FACTS vs INFERENCES — summary discipline
Every file:line citation above is a verified FACT from the worktree at `a5d35f47f`. Items explicitly marked INFERENCE: PGR-01 "never produced a real backup" (strong, from config absence); PGR-02 "DSN never set in prod" (plausible, needs console); PGR-08 iOS eviction dropping the outbox (known WebKit behavior, not certain for these devices); PGR-18 current red/green of the unit gate (couldn't run the suite); PGR-13/PGR-19 device/cold-start magnitudes (need measurement). All console-dependent confirmations are itemized in the Daniel-action list above.

— coder-5, lane `product-gap-robustness`
