# Lane product-gap-robustness — coder-5 — Robustness & Trust gap research (READ-ONLY)

Daniel wants to know **what backend/infra pieces are MISSING** to make the product bulletproof
before onboarding the band. Your half: the non-functional backbone — **reliability, security,
dependability, resiliency.** (coder-6 owns the functional/feature half — don't overlap.)

**Lens: band-onboarding readiness.** The bar is "bulletproof + dependable for 6 shared iPads running
weekly Friday-evening / Shabbat-morning services, with one part-time maintainer." Judge missing
pieces against THAT, not abstract completeness.

**The #1 way to add value (and the #1 way to waste this lane): leverage the existing corpus.** This
project has run 9 cowork sweeps + many audits. Do NOT re-derive known findings. INGEST them first,
then find what's genuinely uncovered.

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-product-gap-robustness -b feat/product-gap-robustness a5d35f47f
cd ../sheet-music-app-product-gap-robustness
```
ACK; create `.coord/status/coder-5.md`. READ-ONLY — only write is your findings doc.

## §2 Ingest first (avoid re-deriving)
- `.paul/research/` — the cycle-1..9 reports + TRIAGE docs (prior multi-axis findings + POLISH backlog).
- `.paul/postmortems/` — esp. the save-loss recurrences (`v5h-01-save-loss`, `v5h3-01-*`) — a real
  resiliency theme.
- The deferred-issues + project facts in `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/`
  and the CLAUDE.md memory deferred list (CRIT-003, etc.).
- **The monitor audit (already done — SKIP the monitor subsystem; reference it as covered):**
  `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md`, `...lane2-app-mcp-FINDINGS.md`,
  `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/research/monitor-audit-SYNTHESIS.md`,
  and the just-shipped fixes (F1 rules, F2 bus-assign) + the CRIT-003 credential design.

## §3 Survey for GAPS (the whole app EXCEPT monitor)
Across reliability / security / dependability / resiliency, hunt for MISSING backend/infra pieces:
- **Data integrity & recovery:** atomic-write coverage (the upload-atomicity contract; the v60
  cascade-gap class we just cleaned), and the big one — **is there ANY backup/restore / disaster
  recovery for Firestore + Storage?** What happens if data is lost or corrupted during a service?
- **Observability / alerting:** does Daniel get a SIGNAL when something breaks mid-service (sync
  failure, function error, quota, AI-spend spike)? Or is failure silent until a user reports it?
- **Security posture (beyond monitor):** firestore.rules coverage across collections, auth edge
  cases, secrets handling, the admin rate-limit bypass, public-by-design surfaces vs accidental
  exposure, the bridge credential (cross-ref CRIT-003).
- **Resiliency / degraded modes:** iPad behavior mid-service on flaky WiFi / token-refresh / offline;
  the sync-engine race history (harness-vs-real-firestore gap); function cold-starts; retry/idempotency.
- **CI / test / supply-chain:** coverage holes that let regressions ship (the BR-19 muted-gate class),
  dependency risk.

## §4 Deliverable
`.paul/research/product-gap-robustness-FINDINGS.md`:
- **TL;DR** — the 3-5 most important MISSING pieces for band-readiness.
- **Prioritized gap-map** — each gap: axis · impact · rough effort · **NEW vs already-known-deferred**
  (cite the corpus doc if known). Severity-tagged.
- **Recommendations only** — no implementation. Flag anything needing the prod-PC / GCP console.
- FACTS vs INFERENCES.

## §5 Seam with coder-6 (product-gap-features)
You own non-functional robustness/security/infra. coder-6 owns functional features + UX completeness.
Boundary: "observability/alerting/backup" = you; "a missing user-facing capability" = coder-6;
security = you; UX-completeness = coder-6. Don't duplicate. Both skip monitor.

Docs-only commit → FF-push (base a5d35f47f) → master-tip → SHIP-NOTICE (`from coder-5`). Tier-0
research; supervisor synthesizes with coder-6.
