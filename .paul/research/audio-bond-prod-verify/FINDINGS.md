# audio-bond-prod-verify — FINDINGS

**Lane:** `audio-bond-prod-verify` (Tier-0 spec extension; closes ipad-sweep §Coverage gaps "No AUDIO verdict surfaced…")
**Branch:** `feat/audio-bond-prod-verify` cut from `896342a2a` (origin/master at fire time)
**Worktree:** `sheet-music-app-audio-bond-verify/`
**Ran:** 2026-05-24T23:55Z
**Source of truth:** supervisor dispatch `msg-audio-bond-prod-verify-001` 2026-05-24T22:45Z + own ipad-sweep `FINDINGS.md §Coverage gaps` (the first item).

---

## Verdict — PATH A by spirit, NO-CODE-CHANGE in practice

**The coverage gap is closed by `1e39b7b61` (coder-2 audio-viewer-blob-url-fix, LANDED 2026-05-24).**
- Prod has a publicly bonded audio row (Yizkor "Adon Olam" mp3) that's ALREADY in the default `R1_SETLISTS` of both `e2e/perform-ipad-real-setlists.spec.ts` AND `e2e/ipad-stuck-spinner-probe.spec.ts` → Path A is feasible.
- Re-running coder-5's probe spec at `e2e/ipad-stuck-spinner-probe.spec.ts` against prod confirms the post-fix `<audio src="/api/drive/file/…">` mount (network URL, NOT blob:) with `audioCount: 1`, ttfrMs 37, no 25-s stuck-spinner timeout. Verify-gate from the dispatch (`audioCount: 1` + `audioElementSrc` matching `/api/drive/file/12JfLCHy…`) is MET.
- **No `src/` change required.** No `e2e/` spec change required either — both specs were already widened to classify `audio[src*="/api/drive/file/"]` as a valid render signature during the audio-viewer-blob-url-fix lane (`renderSig` widening + RENDER_ERROR "Audio file not found" addition).

The dispatch's Path A criterion ("probe spec re-run on prod confirms AUDIO verdict (not stuck-spinner)") is satisfied with one nomenclature wrinkle (see §Verdict-name nuance below): the probe surfaces a `RENDERED` verdict whose `audioElementSrc` and `audioCount` carry the audio-bond evidence. The pre-fix `FAILED — no render signature, audio-bond, or error within 25s (stuck spinner?)` outcome does NOT reproduce.

---

## Phase 1 — discovery (was the audio bond actually on prod?)

`mcp__claude_ai_CRC_Music__*` was token-expired this session, so discovery used the public `/perform/setlist/<id>` surface (no auth required per the chart-access policy comment at `e2e/perform-ipad-real-setlists.spec.ts:10-15`).

`curl https://www.centralreform.live/perform/setlist/UnjLqKTtS4lNKQfMY6hB` returned 71,777 bytes with the SSR-embedded track list. Extracting `fileName` fields:

```
 1  Fiddley Tune.pdf
 2  Modeh ani - Klepper.pdf
 3  Ma tovu_Hinei ma tov - trad.pdf
 4  Psukei d_zimrah.pdf
 5  Ahava raba.pdf
 6  Shema (major).pdf
 7  Mi chamocha (6-8).pdf
 8  Adonai sfatai (trad).pdf
 9  Oseh shalom - Nava tehila.pdf
10  Mi shebeirach.pdf
11  Eitz chayim - Weisenberg.pdf
12  Eli, Eli (A Walk to Caesarea)
13  Adon Olam.mp3   ←  fileId 12JfLCHytM5q59btBQ05sz-V_SurQmUoT
```

→ The audio bond `12JfLCHytM5q59btBQ05sz-V_SurQmUoT` is the LAST row (13/13) of the public Shavuot Yizkor setlist `UnjLqKTtS4lNKQfMY6hB`, exactly as the DEFAULT_TARGETS comment claims ("13 bonded; 12 PDF + 1 audio Adon Olam.mp3"). This contradicts the ipad-sweep `FINDINGS.md` cell-line that read "the actual prod target setlists … don't include the Yizkor 'Adon Olam' mp3" — that note was the cycle's snapshot of what the pre-fix sweep CLASSIFIED into the AUDIO verdict bucket (i.e. zero AUDIO verdicts), not what was actually bonded.

Side note: direct `curl /api/drive/file/12JfLCHy…` returns `401 unauthenticated — Bearer token (or in-app browser fetch metadata) required for chart bytes.` This is correct policy: bytes require an authenticated in-app browser request. The Playwright run satisfies that because WebKit's `Sec-Fetch-Site: same-origin` plus the page's own session cookies pass the bearer-or-in-app gate.

**Path decision:** Path A (verify-gate run) — the audio bond is present in the default target; no fixture seed required.

---

## Phase 2 — Path A verify run

Command:
```bash
PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
  npx playwright test e2e/ipad-stuck-spinner-probe.spec.ts \
  --project=ipad-webkit --workers=1 --retries=0 --reporter=list
```

Full output: [`probe-run-001.log`](probe-run-001.log) (20 lines: per-step `[SAMPLE]` JSON + final `[PROBE-SUMMARY]`).

**Result: 1 passed (19.1 s). 12 steps walked. 12 RENDERED, 0 AUDIO, 0 FAILED. consoleErrors: [].**

The load-bearing sample (the audio bond row):

```json
{
  "step": 12,
  "label": "shavuot-yizkor-5-23",
  "counterText": "Song 13 of 13",
  "fileId": "12JfLCHytM5q59btBQ05sz-V_SurQmUoT",
  "verdict": "RENDERED",
  "detail": "",
  "ttfrMs": 37,
  "canvasCount": 0,
  "svgCount": 23,
  "imgCount": 2,
  "audioCount": 1,
  "documentExists": false,
  "audioElementSrc": "/api/drive/file/12JfLCHytM5q59btBQ05sz-V_SurQmUoT",
  "overlayHtmlHead": "<div><div><p>Adon Olam</p><audio src=\"/api/drive/file/12JfLCHytM5q59btBQ05sz-V_SurQmUoT\" controls=\"\" preload=\"metadata\"></audio></div>…",
  "spinnerCount": 0,
  "consoleErrorsCum": 0,
  "inFlightChartFetches": 0,
  "elapsedMs": 15931
}
```

Verify-gate dispatch comparison:

| Dispatch criterion                                                              | Observed                                                                  | PASS? |
|---------------------------------------------------------------------------------|---------------------------------------------------------------------------|-------|
| Audio-bonded chart renders via `<audio src="/api/drive/file/<id>">` (NOT blob:) | `<audio src="/api/drive/file/12JfLCHy…" controls preload="metadata">`     | ✅    |
| Probe step-12 `audioCount: 1`                                                   | `audioCount: 1`                                                           | ✅    |
| Probe step-12 `audioElementSrc` matches `/api/drive/file/12JfLCHy…`             | `/api/drive/file/12JfLCHytM5q59btBQ05sz-V_SurQmUoT`                       | ✅    |
| No 25-s stuck-spinner timeout                                                   | `ttfrMs: 37`, `spinnerCount: 0`, no FAILED                                 | ✅    |

Step-12 screenshots: [`probe-step12-RENDERED.png`](probe-step12-RENDERED.png) + [`probe-step12-final-RENDERED.png`](probe-step12-final-RENDERED.png) — both capture the AudioViewer mounted with the network URL, no spinner, no error text.

---

## Verdict-name nuance (NOT a defect)

The dispatch said "expect AUDIO verdict" but the probe reported `verdict: "RENDERED"` at step 12. This is because `classifyCurrent()` uses `Promise.race()` between four selectors, and `audio[src*="/api/drive/file/"]` is part of the `renderSig` group (mirroring the renderSig widening shipped in `1e39b7b61` per its own dispatch). When that selector resolves first — which it does for a healthy audio row — the verdict is set to `RENDERED`, never advancing to the `AUDIO_BOND` text-selector path (which was the original "AUDIO" verdict source for the graceful-bond diagnostic text).

This is the intended behavior post-fix:
- Pre-`1e39b7b61`: an audio-bonded row landed in `AudioViewer`'s `status='error'` branch with the offline blob-URL race; nothing in `renderSig` matched; classifier timed out at 25 s → FAILED.
- Post-`1e39b7b61`: the AudioViewer defaults to the network URL with `<audio src="/api/drive/file/<id>">`, which `renderSig` now matches; classifier resolves on the first race winner → RENDERED.
- The `AUDIO` verdict path remains for the explicit "bonded to an audio file" diagnostic message (graceful-bond text seen on rows that PDFViewer mis-routes). On a healthy AudioViewer mount that text doesn't appear; `RENDERED` is correct.

The dispatch's UNDERLYING intent ("audio bonds don't stuck-spin, they render with the right URL") is met. The verdict-name `AUDIO` is now reserved for a strictly worse failure mode (graceful-bond fallback), which we WANT to surface separately. So this nomenclature shift is a feature, not a regression.

---

## Coverage gaps (residual, non-blocking)

1. **chartRows count discrepancy in the probe.** The probe logged `chartRows=9` even though the setlist has 13 bonded rows. The setlist-page locator `[role="button"]` filtered by `key-badge` testid only matched 9 — likely because the audio row and a few non-song / clipped header rows don't carry the badge. The 13-row walk still completed via the overlay's Next button, so this doesn't affect the verify-gate. But the parent F-2 spec (`perform-ipad-real-setlists`) does an `expect(rowCount).toBeGreaterThan(0)` only — it would NOT fail loudly if the chartRows count drops from 9 to 0. Worth a follow-up tightening (out of this lane's scope).
2. **`AUDIO` verdict-bucket is now empty by design.** The probe-summary shows `audio: 0` because the renderSig path wins the race. If any future maintainer reads the summary as "no audio bonds in this setlist," that's wrong — they should read `audioCount > 0` on per-step samples instead. A docstring tweak in either spec would prevent that misreading. Out of this lane's scope (Tier-0 minimal).
3. **PWA fresh-install spec gap** (separately surfaced as `ipad-sweep` §Coverage gaps item #2) remains open.
4. **Landscape iPad project gap** (`ipad-webkit-landscape`) remains open.
5. **`onboarding-qr-ipad` cycle-2 partial coverage** remains open.

---

## Files touched

- **NEW** `.paul/research/audio-bond-prod-verify/FINDINGS.md` (this file)
- **NEW** `.paul/research/audio-bond-prod-verify/probe-run-001.log` (verbatim probe stdout)
- **NEW** `.paul/research/audio-bond-prod-verify/probe-step12-RENDERED.png` (step-12 screenshot)
- **NEW** `.paul/research/audio-bond-prod-verify/probe-step12-final-RENDERED.png` (step-12 final screenshot)
- **`src/`** → **0 touched**
- **`e2e/`** → **0 touched**

Total LOC change: 0 functional / ~180 research lines. Inside the Tier-0 ~30-50 functional LOC budget by way of the no-functional-change finding.

---

## Out of scope (honored)

- ⛔ AudioViewer / TextScoreViewer / PDFOverlay / src/components/music behavior unchanged.
- ⛔ No new audio chart upload via MCP — verified existing bond only.
- ⛔ No Firestore mutations beyond using the public, no-auth `/perform/setlist/<id>` surface for discovery.
- ⛔ No `playwright.config` edits / no new spec files / no `R1_SETLISTS` env-override scaffolding (existing default already includes the bonded setlist).
- ⛔ `[[project_smart_transposer_is_key_transcriber]]` zone untouched.
- ⛔ Bridge / monitor / firestore.rules / vercel.json / env unchanged.

---

## Gates

- ✅ FINDINGS.md identifies path taken (Path A by spirit; no code change required) + verdict (gap closed by prior ship `1e39b7b61`).
- ✅ Probe spec re-run on prod confirms `audioCount: 1` + `audioElementSrc` match + no stuck-spinner.
- ✅ Per-spec log committed to `.paul/research/audio-bond-prod-verify/probe-run-001.log`.
- ✅ Screenshots captured at step 12 (the audio bond row).
- N/A `tsc --noEmit` 0 errors — no `.ts` edit (gate scoped "if spec was modified").
- N/A `next build --webpack` exit 0 — no `src/` edit (gate scoped to runtime-surface changes).
- N/A Full vitest zero-regressions vs `896342a2a` — no unit-test surface touched.

---

## Tier-0 routing + post-ship

- SHIP-NOTICE → `inbox/supervisor.md` (Tier-0 implicit ACCEPT per dispatch routing).
- Worktree teardown awaits supervisor sweep per `[[feedback_worktree_teardown_timing]]`.
- `agents.md` row + `.coord/status/coder-1.md` updated on push.
- `master-tip.md` NOT updated (no master push; research-only lane has no commit to land on master).

---

_End — coder-1 audio-bond-prod-verify._
