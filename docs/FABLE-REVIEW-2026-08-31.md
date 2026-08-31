# Fable Review — centralreform.live (2026-08-31)

First full Fable pass over the project. Three delegated deep-dives (2× Opus, 1× Sonnet) covered: (1) the iPad keep-alive path, (2) the monitor-mix subsystem end-to-end, (3) overall repo/architecture health. This document is the synthesis plus the material findings. Verified personally: the root-cause bug in `use-wake-lock.ts` (read the source directly).

---

## Part 1 — The iPad keep-alive problem

### Root cause (verified in source)

`src/hooks/use-wake-lock.ts` lines 165–172:

```ts
useEffect(() => {
    return () => {
        shouldLockRef.current = false   // ← the bug
        if (wakeLock) { wakeLock.release()... }
    }
}, [wakeLock])
```

React runs an effect's **cleanup whenever its deps change**, not only on unmount. The moment a lock is acquired, `setWakeLock(lock)` changes the dep, the previous render's cleanup fires, and `shouldLockRef.current` is reset to `false`. The `visibilitychange` re-acquire handler (line 191) gates on that ref — so it is **always false in production**. The documented behavior ("tap once at the start of service, the hook re-acquires automatically after lock screen / app switch") has never worked. This exactly matches "lost after switching away." `IMPLEMENTATION-STATUS.md` row 5 marks this ✅ Complete; it isn't. The unit test only asserts the listener is *registered*, never that re-acquire fires — which is how it shipped.

### Platform facts (2026, researched with citations)

- The Screen Wake Lock API was **broken in Home-Screen ("installed") web apps on iPadOS 16.4 → 18.3.x** — `request()` resolves, the sentinel reports held, and the screen sleeps anyway. **Fixed in iPadOS 18.4** (WebKit bug 254545; confirmed by Apple's Jen Simmons). So on any fleet iPad below 18.4, the toggle genuinely lies, and no JS can fix it.
- iPadOS 18 dropped iPad 6th gen, iPad Pro 10.5", and iPad Pro 12.9" (2nd gen). Those models can **never** hold a wake lock from a Home-Screen app — run those in a pinned Safari tab instead, or rely purely on Auto-Lock = Never.
- The W3C spec does **not** require a user gesture for `wakeLock.request()`. The repo's foundational premise (tap-to-arm required on iOS) is unsupported by spec or current docs — the 2026-05-23 Yizkor failure was more likely the standalone bug + a mount-time call while hidden. The whole per-service tap ritual likely rests on a misdiagnosis. (Caveat: re-acquire after backgrounding has failed in the wild on iPad — treat re-acquire as best-effort and verify.)
- The wake lock is **advisory-only** per spec. Low Power Mode forces Auto-Lock to 30s (greyed out) and licenses the OS to drop locks. iOS 26 aggressively terminates backgrounded pages (~10–15 min) and reloads them fresh.
- MDM **cannot** enforce Auto-Lock = Never: the Passcode payload's `maxInactivity` has no "Never," and pushing any such payload *removes* "Never" from the device menu. The only MDM-level auto-lock kill lives inside Single App Mode — ruled out since you want Mixing Station and a browser available.

### The layered fix (defense in depth)

**Layer 0 — device config. This is the only real guarantee; do it this week.**
1. Every iPad: Settings → Display & Brightness → **Auto-Lock: Never**. Re-verify after each OS update.
2. **Low Power Mode off**, iPads on power during services; optionally a Shortcuts automation "on charge → LPM off."
3. Update the fleet to **≥ iPadOS 18.4** (ideally current 26.x). Inventory for the three capped models; those get the Safari-tab treatment.
4. Do **not** enroll a passcode/`maxInactivity` MDM payload. Light supervision via Apple Configurator / Apple Business (free) is fine for app installs and lost-mode, just never that payload.
5. Guided Access (with its own Display Auto-Lock setting) is optional belt-and-braces per service; it adds a ritual, so treat as opt-in, not the plan.

**Layer 1 — app changes, ranked:**
- **A (critical, ~20 min):** Split the `[wakeLock]` cleanup in `use-wake-lock.ts` into an unmount-only (`[]` deps) cleanup using a `sentinelRef`. Add a test that backgrounds/foregrounds and asserts a second `request()`.
- **B (critical, ~30 min):** Persist keep-awake intent in `localStorage`; on mount attempt `acquireLock()`, and on failure register a one-shot `pointerdown` retry. Survives reload, eviction, and the "Reload to resume" toast path.
- **C (high, ~1 h):** Auto-arm on mount of any `/perform/**` surface (no gesture needed per spec) + re-ensure on every `pointerdown`. **Eliminates the per-service tap ritual entirely.** Keep the toggle as an override.
- **D (high, ~1–2 h):** Repurpose the unused `PerformanceStatusStrip.tsx` into a banner shown **only when the lock is NOT held** (tap-to-arm), plus a 30s heartbeat re-checking `sentinel.released`, plus an explicit warning when standalone && iPadOS < 18.4.
- **E (~20 min):** `/perform/[fileId]/page.tsx` renders `PDFOverlay` with no `wakeLock` prop — the single-chart route has no keep-alive at all. Thread it through.
- **F (medium):** Hoist to one `KeepAwakeProvider` in `perform/layout.tsx` (today two independent hook instances don't share state).
- **G (medium, ~2–3 h):** Fleet telemetry cloned from the existing web-vitals pattern: beacon `{deviceLabel, isLocked, lastError, displayMode, uaVersion}` on arm/release/visibility + every 60s → API route → Firestore → a `get_keepalive_status` MCP tool. Then you can ask Claude "are all the iPads holding the lock?" before candle-lighting.
- **H (low, flagged):** Silent-video (NoSleep-style) fallback only where wake lock is unsupported/failing — least reliable layer given the iOS 26.0.1 standalone media regression; device config is better.

Fixes A + B alone plausibly explain and resolve the entire reported symptom set; Layer 0 makes it bulletproof regardless of what Safari does.

---

## Part 2 — Monitor-mix subsystem (the killer feature)

### What it actually is
Transport is **Firestore-only**: iPad fader → throttled command doc (`monitor-live/commands/pending`) → bridge `onSnapshot` → OSC/UDP → X32 → query-back → full-state doc (~10KB, up to 10 writes/s) → iPads. Audible latency ≈ 80–350ms, visual confirm ≈ 250–650ms — never actually measured. `docs/BRIDGE-v2.1.0-UPGRADE.md` and the bridge ADR describe a **deleted WSS transport** and bridge v2.x (actual: 10.0.7) — the runbooks would mislead anyone (including future agents) during an incident. External console moves do echo to iPads correctly (~130–400ms). The subsystem is unusually well-hardened overall (~20 visible incident-driven defect classes fixed); the remaining gaps are seams between good parts.

### Ranked risks
1. **R1 — Bridge crash leaves up to 90s of dead air while everything shows green (Critical).** A relaunched bridge can't take the single-writer lease for up to 90s; in STANDBY it writes no commands and no state, yet `isBridgeOnline()` stays true for 120s off stale `lastSeen`. No OS-level watchdog. *Fix: same-host lease steal + shorter TTL + standby heartbeat (~2h); Task Scheduler watchdog in the installer (~1 day).*
2. **R2 — Rejections are invisible (Critical UX).** The bridge writes classified acks (applied/rejected/timeout + reason) but `firestore.rules` has **no rule for `monitor-live/commands/acks`** → deny-all → clients can't read them. Unauthorized, standby, superseded, expired all look identical: 2s spinner, silent revert. *Fix: ack read rule + subscribe + surface reason (~4h).*
3. **R3 — One ~10KB hot state doc at 10 writes/s fanned to every listener (High, structural).** Way past Firestore's ~1 write/s/doc guidance; degradation shows up as faders "reverting" on a healthy desk. *Fix: split per-bus docs (~3–5 days); adaptive throttle stopgap (~2h).*
4. **R4 — The release value can be dropped (High, most-felt).** `handlePointerUp` re-schedules a rAF; if the popover closes or iOS backgrounds in that frame, the final fader position never sends — the classic "I set it and it snapped back." *Fix: commit synchronously on pointer-up (~30 min).*
5. **R7 — A Firestore stall disables faders on a healthy desk** (`x32Connected` folds transport freshness into mixer health → `pointer-events-none`). Decouple.
6. **R8 — Nothing tells you before a service.** Detection is pull-only; 11 cron routes + push/email infra exist and are unused for this. *Fix: a bridge-watch cron that pushes "bridge offline / stale" to you — highest value per hour of anything in this review.*
7. Also: fabricated-zero states shown confidently (R5), multi-bus assignment half-works (`getUserBus` returns first bus only, R6), single in-memory authz check + 30s revocation lag, zero monitor E2E specs among 31, no LAN fallback.

**Suggested order (~12h of work):** bridge-watch alerting → synchronous fader commit → lease steal → ack read path → stop disabling faders on staleness → surface unconfirmed values → banner the obsolete bridge docs. Then: watchdog, per-bus state docs, latency telemetry into the web-vitals sink.

---

## Part 3 — Project health (holistic)

**Verdict: solid core, top-heavy admin plane, four overlapping state layers, and repo sprawl that mostly hurts future agents, not prod.**

Ranked issues:
1. **Vercel cron plan risk** — 11 crons, some at 5–30 min cadence; verify the plan tier actually runs them or jobs stop silently. (Interacts with the R8 alerting fix.)
2. **`src/lib/mcp/tools/index.ts` is 3,579 lines** (MCP surface totals ~64k lines — bigger than the consumer app). Highest-blast-radius file in the repo; finish splitting into the domain files that already exist beside it.
3. **Four overlapping client state layers** — Zustand (8+ stores), Dexie (36 files), one stray `idb` file (`library-cache.ts`), 43 files with raw `onSnapshot`, React Query in 7. This is the likeliest source of stale-UI bugs. Cheap first step: drop `idb`; write a one-pager on which layer new features use.
4. **Two Gemini SDKs in prod concurrently** (`@google/genai` + legacy `@google/generative-ai`); migrate the transposer, drop the legacy one.
5. **Test-auth bypass routes** are unusually well-gated but are standing targets — rotate the secret on a schedule; add a test that no prod path trusts `admin_test`.
6. **Stale load-bearing docs**: README says Next 15 + a PWA/Workbox feature removed in May 2026; CHANGELOG stalls at v3.1.0 (app is v11.7.0); bridge docs describe a deleted transport. For an agent-developed project, stale docs are actively dangerous — agents read them.
7. **Repo hygiene**: delete (and gitignore) `bridge/release/` (~1.2GB unpacked Electron build), `*.log`, `test-results/`, stray screenshots; archive the ~29 root planning `.md` files to `docs/archive/YYYY/`; prune the ~15 sibling worktrees (`.STALE-BAK` first) and make worktree removal part of closing a feature.
8. **Dependency consolidation**: `radix-ui` meta-package + 13 individual `@radix-ui/*`; four PDF libraries; `saxon-js` + `xslt3`. One afternoon.
9. **Worktree git-identity hook is opt-in** — bake `core.hooksPath` into the worktree setup script.
10. **`.claude/CLAUDE.md` carries no actual conventions** (stub + injected rules) — worth fixing given how much of this project is agent-built.

**Preserve:** `firestore.rules` is genuinely mature (org-scoped, closed field sets, incident-annotated); `env.mjs` documents failure modes; the Playwright suite is incident-driven; the monitor subsystem's hardening history is exemplary.

---

## Priority roadmap

**Week 1 — make services safe:**
1. Device config on the whole fleet (Auto-Lock Never, LPM off, ≥18.4, model inventory).
2. Wake-lock fixes A + B + E (~1.5h of code).
3. Bridge-watch cron + push alert (R8) and the synchronous fader commit (R4).

**Weeks 2–3 — make it bulletproof:**
4. Auto-arm + banner + provider (C, D, F) — kill the tap ritual.
5. Lease steal + ack surface + fader-disable decoupling (R1a, R2, R7).
6. Keep-alive fleet telemetry (G) so lock state is checkable pre-service.

**Month — structural:**
7. Per-bus state docs (R3), bridge watchdog, one monitor E2E spec, latency telemetry.
8. Repo cleanup sweep + docs refresh (README, CHANGELOG policy, banner obsolete bridge docs, real CLAUDE.md).
9. MCP tools split; state-layer one-pager; dependency consolidation.

Full agent detail for the monitor-mix audit is preserved in `REPORT-monitor-mix.md` (449 lines) alongside this file's sources; the keep-alive and health agents' complete findings are folded into Parts 1 and 3 above.
