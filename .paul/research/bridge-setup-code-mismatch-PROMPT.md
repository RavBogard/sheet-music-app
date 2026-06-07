# Lane: bridge-setup-code-mismatch (coder-1) — Tier 0 INVESTIGATE → propose fix

## Context (LIVE INCIDENT, 2026-05-21)
The studio bridge went down during the v10.0.0 self-update. **CORRECTED DIAGNOSIS:** the
`service-account-key.json` is STILL PRESENT in a directory (Daniel confirmed), but the
running v10.0.0 bridge still shows its setup screen → it is NOT reading the key. The bridge
reads creds from `service-account-key.json` in **its own exe dir** (`bridge/src/main.ts:367-369`),
so the likely cause is an **install-path mismatch** (v10.0.0 installed to a new folder; the
JSON sits in the OLD folder → new `exeDir` ≠ JSON location). **TWO bugs to investigate:**
**(1) credential discovery** — does the build read the key only from `exeDir`? Should it
also check a stable userData/AppData path that survives reinstalls? This is what made a
routine update wipe the bridge's ability to find its creds. **(2)** the setup-code length
mismatch below. Interim fix in progress: copy the JSON into the NEW exe folder + restart.

Re-crediting via the **setup-code flow is also BROKEN**:
- App `POST /api/bridge/setup-code` generates a **10-char alphanumeric** code
  (`CODE_LENGTH = 10`, charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — `route.ts:20-29`).
- The **bridge setup UI only accepts ~6 chars** → the valid code can't be entered → setup
  fails.

**Interim workaround in use (confirm it works):** drop the saved JSON as
`service-account-key.json` into the bridge install folder + restart — bypasses the broken
UI. Daniel is restoring the bridge this way now, so this bug is **NOT urgent** once the
bridge is back up.

## Investigate (root-cause; READ-ONLY first)
1. **Bridge setup input** — `bridge/ui/index.html` (+ any setup JS): find the input's
   `maxlength` / `pattern` / `type`. Is it `maxlength="6"` / numeric-only? That's the bug.
2. **Submit path** — `bridge/src/main.ts` `submit-setup-code` IPC (~line 400): confirm it
   doesn't itself truncate (it uppercases/trims + hits `${appUrl}/api/bridge/setup-code?code=`).
3. **Drift history** — `git log` on `route.ts` `CODE_LENGTH` vs `bridge/ui/index.html`:
   when did app codes become 10-char alphanumeric, and was the bridge UI ever updated to
   match (or did it keep an old 6-digit-numeric assumption)? Check other setup fields
   (appUrl) for similar drift.

## Propose (do NOT ship a bridge release without explicit go)
- Minimal fix: bridge setup input accepts the 10-char alphanumeric code (maxlength=10,
  drop numeric-only/pattern). **This is `bridge/**` → it needs a NEW build + GH release
  (v10.0.1) to reach the studio — the same release path that just caused an outage, so
  coordinate; the JSON-drop workaround makes it non-urgent.**
- Deliverable: `.paul/research/bridge-setup-code-mismatch-FINDINGS.md` — root cause + exact
  input limit + fix diff sketch + any other drifted setup fields + a note on whether the
  next bridge release should also fix the auto-update SmartScreen/relaunch stall that broke
  this update (so the next release installs cleanly).

## Hard rules
INVESTIGATE first (read-only). Propose the fix; do NOT build/publish a bridge release
without explicit supervisor + Daniel go (release is heavy + just caused an outage).
`bridge/**` authorized for the eventual fix. Tier-0 investigation; docs-only output.
SHIP-NOTICE/findings to supervisor.
