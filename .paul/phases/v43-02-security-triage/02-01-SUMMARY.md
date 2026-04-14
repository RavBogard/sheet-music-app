---
phase: v43-02-security-triage
plan: 01
subsystem: security
tags: [chat, gemini, prompt-injection, llm, pii]

requires:
  - phase: v43-01-recursive-research
    provides: S01 finding (chat prompt injection + PII leak)
provides:
  - sanitizeUserMessage helper (exported)
  - injection-defense SYSTEM_PROMPT rules
  - PII-minimized admin context (no email, no sound-engineer flag)
affects: [v43-02-02 drive-proxy, v43-03 bridge-credentials]

tech-stack:
  added: []
  patterns:
    - "Untrusted input delimiter pattern: <untrusted_user_message> + system-prompt instruction to treat tag content as data"
    - "Export helper + SYSTEM_PROMPT constant from a route module for regression testing"

key-files:
  created:
    - src/lib/__tests__/chat-prompt-injection.test.ts
  modified:
    - src/app/api/chat/route.ts

key-decisions:
  - "Kept uid in admin context (not just displayName) because ADMIN_ACTION payloads reference users by uid — stripping uid would break the feature"
  - "Cap at 4000 chars (conservative; Gemini token budget is much higher). Prioritizes DoS protection + forcing concise queries"
  - "2 atomic commits instead of the plan's 4 — route.ts changes are a single cohesive hardening unit"

patterns-established:
  - "For any new LLM-facing endpoint: wrap user input in a named tag + add matching system-prompt instruction"

duration: ~20min
started: 2026-04-14T11:45:00Z
completed: 2026-04-14T12:05:00Z
---

# v4.3 P2 Plan 01: Chat Prompt-Injection Hardening Summary

**Closed audit finding S01: `/api/chat` now treats the user message as untrusted data, the admin context no longer leaks email PII to the LLM, and SYSTEM_PROMPT explicitly defends against override/exfiltration attempts.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min |
| Tasks | 4 of 4 completed |
| Files modified | 1 (+1 test file created) |
| Commits | 2 atomic + push to origin/master |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: User message is untrusted data | Pass | `<untrusted_user_message>` delimiter + SYSTEM_PROMPT instruction |
| AC-2: Length cap + control-char strip | Pass | 4000-char cap → 400; regex strips `\x00-\x08 \x0B \x0C \x0E-\x1F \x7F` |
| AC-3: Admin context drops email | Pass | `displayName [uid:X] [role:Y]` — no email, no sound-engineer flag |
| AC-4: SYSTEM_PROMPT hardening | Pass | 3 defense rules prepended (treat as data / no ADMIN CONTEXT echo / refuse overrides) |
| AC-5: Regression tests | Pass | 9 tests green (`src/lib/__tests__/chat-prompt-injection.test.ts`) |
| AC-6: Quality gates | Pass | tsc clean; 1162/1162 tests (only pre-existing env-vars failure) |

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| T1+T2+T3 | `22db366` | feat | sanitizeUserMessage helper, admin-context slim, SYSTEM_PROMPT hardening |
| T4 | `04380bb` | test | 9 regression tests |

Pushed to `origin/master`; Vercel auto-deploying.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/chat/route.ts` | Modified | Export `sanitizeUserMessage` + `SYSTEM_PROMPT`; apply sanitization; delimit user message; slim admin context; prepend injection-defense rules |
| `src/lib/__tests__/chat-prompt-injection.test.ts` | Created | 9 regression tests |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Bundle tasks 1–3 into one commit | All three changes edit the same file and form a single cohesive "S01 hardening" unit | Cleaner revert story; easier code review than 3 overlapping diffs |
| Keep uid in admin context | ADMIN_ACTION payloads reference users by uid; removing uid would break admin flows | Displayname + uid + role is the minimum viable surface |
| 4000-char cap | Well under Gemini token budget but catches paste-bomb DoS and forces concise queries | Returns 400 with clear error message; users can split long queries |
| Export helper + SYSTEM_PROMPT for testing | Tests need access to the constant; extracting is cleaner than fs-reading the route file | Small surface leak; acceptable for regression coverage |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 1 | Minor refactor to export helper |
| Deferred | 0 | — |
| Commit-structure | 1 | 2 commits instead of 4 (see decision above) |

**Total impact:** Zero AC deviation. The commit count was reduced for cleanliness; the refactor to export `sanitizeUserMessage` was a late-plan addition to enable proper unit testing (cheaper than mocking Gemini + Firestore + liturgical-calendar for an integration test).

## Skill Audit

Plan declared `/ui-ux-pro-max` not required (backend-only). Confirmed: no frontend changes. Skill not invoked — no gap.

## Issues Encountered

None of significance. The chat route's web of imports (Gemini, Firestore, liturgical-calendar, song-usage, templates) makes integration testing expensive; pivoted to pure-helper extraction for unit coverage. Documented as pattern for future LLM-route tests.

## Next Phase Readiness

**Ready:**
- Prompt-injection defense in place; follow-up audit (manual red-team with jailbreak prompts on prod) recommended but not blocking
- Pattern established for any future LLM-facing route (`sanitizeUserMessage` + delimiter + defense rules)

**Concerns:**
- `SYSTEM_PROMPT` is getting large; if more LLM routes appear, extract shared defense block to `src/lib/llm-guards.ts`
- Gemini + Firestore still fetched per request in admin-context path — S08 (perf audit) noted this; not addressed here

**Blockers:** None

**Next plan (recommended):** `02-02-PLAN` for S03 drive file proxy — tighten `isTrustedBrowserRequest` heuristics, require either Bearer or a real Firebase session cookie for /api/drive/file. This is the next-scariest security item and also autonomous. Alternatively: `v43-03` for S02 bridge credential exposure (needs a decision checkpoint — proper fix requires architectural rework of bridge auth).

---
*Phase: v43-02-security-triage, Plan: 01*
*Completed: 2026-04-14*
