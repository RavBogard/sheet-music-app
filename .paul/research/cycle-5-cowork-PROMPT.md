# Cycle-5 cowork — SUPERSEDED (do not paste this file)

This monolith was the in-progress v2 draft before Daniel ratified the
4-way parallel split (2026-05-19). The cycle-5 sweep now ships as four
focused instance-specific prompts in this same directory:

- `cycle-5a-cowork-PROMPT.md` — Instance A: cycle-4 close-out + Web-SDK
  probes + mobile re-run (harness-heavy, ~115-145min)
- `cycle-5b-cowork-PROMPT.md` — Instance B: fresh unauth-website audit
  (~80-100min)
- `cycle-5c-cowork-PROMPT.md` — Instance C: David's band_leader weekly
  flow + Google Drive upload (~110-140min)
- `cycle-5d-cowork-PROMPT.md` — Instance D: wide-domain audit +
  optional carry-forward probes (~90-115min)

Each instance has its own:
- Bearer at §0 (4 distinct bearers — rotated 2026-05-19)
- Output dir under `sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-{A,B,C,D}/`
- Test-data prefix (`test-5A-`, `test-5B-`, `test-5C-`, `test-5D-`)
- Findings ID prefix (`C5A-NNN`, `C5B-NNN`, `C5C-NNN`, `C5D-NNN`)

Paste each into its own Claude Desktop session. Wall-clock when run in
parallel ≈ max instance ≈ ~140min.

Supervisor reconciles the four HANDOFFs after.
