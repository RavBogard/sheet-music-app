# Cycle-6-fixes Lane 5 — Unauth-edge: accessibility route + legal-nav link (refined scope)

> **Coder lane prompt** — not a cowork instance prompt. Small focused
> code lane. Single commit preferred.
>
> **Wave A repair scope** (replaces original Wave A dispatch — Lane 0 + Lane 4
> were dead-on-arrival per pre-flight 2026-05-19T20:25Z). Wave A becomes
> Lane 1 (coder-2 gig-packet) + Lane 2 (coder-1 template MCP) + Lane 5
> (this lane, coder-3 unauth-edge refined).
>
> **Scope was trimmed from the triage's 4-finding lane** (C6B-001 + C6B-002 +
> C6B-009 + C6B-010) to 2 verified-real findings (C6B-001 + C6B-002). The
> other two were dropped on pre-flight:
> - C6B-009 `/perform` SSR — pre-flight 2026-05-19T20:30Z: live `curl
>   https://www.centralreform.live/perform` returns SSR'd `<main
>   id="main-content">` + `<h1>` content. Already shipped. DROPPED.
> - C6B-010 `/login` bundle 1248KB → 500KB — needs `next build` to
>   measure; LoginClient imports look clean (`useAuth` is the only
>   firebase touchpoint, indirectly). Low confidence the regression
>   still exists. DROPPED for this lane; revisit as POLISH if needed
>   post-green.

---

## §0 — Identity, branch, scope

**Lane:** `cycle6-fixes-lane-5-unauth-edge`
**Branch:** `feat/cycle6-fixes-5-unauth-edge` (cut from current `origin/master` at lane start)
**Output:** single-commit narrow lane preferred; master push when SHIP-NOTICE acceptable.

**No bearer needed.** Validation is unit tests + production `curl` after deploy.

**Scope:** close C6B-001 (`/accessibility` route 404) + C6B-002 (legal-nav missing Accessibility link). 2 BLOCKS-GREEN findings; both small, both bundled in one ship.

**SHIP-NOTICE protocol (Daniel-ratified 2026-05-19 — non-negotiable):** include a `## Repros` section pasting each REPRO block from §5 verbatim. Auditor BLOCK-TEARDOWNs without it.

---

## §1 — C6B-001: `/accessibility` route

**Verified at supervisor pre-flight 2026-05-19T20:30Z:** `git ls-tree 3e640a905 -- src/app/accessibility/` returns EMPTY. Live `curl -sI https://www.centralreform.live/accessibility` returns `HTTP 307` (proxy redirects to `/login` because the path isn't in `publicExactRoutes`/`publicPrefixes`). No accessibility statement page exists.

**Fix:**
1. NEW `src/app/accessibility/page.tsx` — server component with the accessibility statement. Stub is fine; content can grow later. Include:
   - Page title + canonical heading "Accessibility Statement"
   - Conformance target (WCAG 2.1 AA aspirational)
   - Contact path for accessibility issues (mailto Daniel? or a Google Form? — Daniel-default below)
   - Last-updated date (e.g. "Last updated: 2026-05-19")
2. Add `/accessibility` to `publicExactRoutes` in `src/proxy.ts` (whitelist for unauth access).
3. Add `metadata.robots = { index: true, follow: true }` per the C5D-007 pattern (other legal pages already do this).
4. Page should use the existing legal-page layout/styling if one exists (trace from `/privacy` or `/terms` pages for the pattern).

**Daniel-ratified default on content:** stub it with placeholder copy + a "this page is being developed" note. Daniel iterates the actual copy post-ship; don't block lane on prose authorship.

---

## §2 — C6B-002: Legal-nav missing Accessibility link

**Verified at supervisor pre-flight 2026-05-19T20:30Z:** no dedicated `LegalNav.tsx` component exists in `src/components/nav/`. The legal links (Privacy / Terms / SMS Consent / Changelog) are likely rendered in `src/components/Footer.tsx` OR inline on the login page. Coder TRACES where legal links actually render and adds the Accessibility link there.

**Fix:**
1. **Trace step:** `grep -rE "Privacy|/privacy" src/components/ src/app/` to find where the legal-nav surface renders.
2. Add a new `<Link href="/accessibility">Accessibility</Link>` next to the existing Privacy / Terms / SMS Consent / Changelog links.
3. Verify the link appears on EVERY page that currently renders the other legal links (Footer is the most likely shared surface; verify it appears on `/`, `/login`, `/privacy`, `/terms`, etc).
4. **Bonus (POLISH, C6B-003 if cheap):** if some legal pages don't render the legal-nav but should, add the missing surface. This is non-blocking; surface as OPEN-FOLLOWUP if the work grows.

---

## §3 — Files you'll likely touch

- `src/app/accessibility/page.tsx` (NEW) — the route page
- `src/components/Footer.tsx` (most likely) — add Accessibility link to legal nav
- `src/proxy.ts` — add `/accessibility` to `publicExactRoutes`
- Possibly `src/app/login/page.tsx` or `src/app/login/LoginClient.tsx` if legal links render there inline
- New regression test asserting `/accessibility` is publicly accessible + `<a href="/accessibility">` exists in Footer DOM

---

## §4 — Coord coordination contract

- Lane 1 (coder-2): touches `src/lib/mcp/tools/library-download.ts` + `src/lib/drive/*` — fully disjoint.
- Lane 2 (coder-1): touches `src/lib/mcp/tools/templates.ts` + `index.ts` + `firestore.rules` — fully disjoint.
- **`src/proxy.ts`:** you add `/accessibility` to publicExactRoutes; nobody else touches it this wave. Claim with TTL 1h when you start the edit; release on push.

---

## §5 — REPRO blocks (paste verbatim into SHIP-NOTICE)

```
### REPRO-L5-accessibility-route (C6B-001)
preconditions: production master post-ship
steps: curl -sI https://www.centralreform.live/accessibility
expected: HTTP 200 with content; Cache-Control header normal; page accessible without auth
observed_pre_fix: HTTP 307 → /login (route does not exist; proxy redirects unauth)

### REPRO-L5-accessibility-content (C6B-001)
preconditions: production master post-ship
steps: curl -s https://www.centralreform.live/accessibility | grep -iE "<h1[^>]*>Accessibility|WCAG|accessibility statement"
expected: at least one match (page has accessibility statement content)
observed_pre_fix: 307 → /login HTML returned

### REPRO-L5-login-legal-nav (C6B-002)
preconditions: production master post-ship
steps: curl -s https://www.centralreform.live/login | grep -oE 'href="/accessibility"'
expected: at least one match (login page renders legal-nav with Accessibility link)
observed_pre_fix: zero matches (Accessibility link absent)

### REPRO-L5-other-legal-pages-nav (C6B-002 cross-page consistency)
preconditions: production master post-ship
steps: for path in /privacy /terms /sms-consent /changelog; do curl -s "https://www.centralreform.live$path" | grep -oE 'href="/accessibility"' | head -1; done
expected: each page returns at least one match
observed_pre_fix: zero matches on all four
```

---

## §6 — Binding rules (read before starting)

1. **SHIP-NOTICE `## Repros` section is MANDATORY** (decisions.md 2026-05-19T~19:30Z Decision 1). Paste each REPRO-L5-* block from §5 verbatim. Auditor BLOCK-TEARDOWNs without it. Auditor executes the curls at the deployed surface after Vercel deploy.
2. **Auditor verdicts are BINARY** (ACCEPT or BLOCK-TEARDOWN; no DEFER).
3. **Single-commit narrow lane → cherry-pick over fresh origin/master** at push time, not rebase.
4. **Pre-flight before writing code** per `[[feedback_cowork_prompt_verify_before_write]]`. Trace the legal-nav surface BEFORE editing; if `src/components/Footer.tsx` isn't where legal links render, the prompt's assumption is wrong — adapt.

---

## §7 — Effort estimate

1-2h. Mostly trace work + small additions. Stub accessibility content is fine; copy can iterate.

---

## §8 — Hard NOs

- Do NOT touch `src/lib/mcp/tools/library-download.ts` or `src/lib/drive/*` (Lane 1).
- Do NOT touch `src/lib/mcp/tools/templates.ts` or `firestore.rules` (Lane 2).
- Do NOT attempt `/login` bundle diet in this lane (deferred). If you see an obvious eager firebase import while editing the login page for the legal-nav, surface as POLISH OPEN-FOLLOWUP — don't try to fix it here.
- Do NOT attempt `/perform` SSR work (already shipped; pre-flight confirmed).
- Do NOT write accessibility-statement marketing prose — Daniel iterates post-ship. Stub is fine.
