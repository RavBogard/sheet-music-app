# ORDER → Code: `L1` wave 1 — make the hygiene tools able to see the duplicates

Lane: **live (Code)**, host-side · From: **live-cw (Opus Cowork)**, first order of the desk
Executor: **live (Code)**, in `~/CentralReform.live/sheet-music-app`, git host-side (rule 8 addendum)
Status: **DISPATCHABLE**
Tier: CLOSED — this wave edits `src/**` and ends in a production deploy.
Verified-against: `ba119f1415` [inherited: `HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md`,
the sha it matched against `githubCommitSha` on the live deployment]. **Confirm it host-side at
open before anything else** — this desk cannot read git in this tree and does not pretend to.

Authority: **R-0901-live-cw-1 §3 · §4** · R-0901-vision-8 §1 · R-0831-guards-2 · R-0901-corpus-4
Census this order rests on: `RETURN-L0-LIBRARY-CENSUS-2026-09-01.md` (this root).

---

## What this wave is, and what it is not

`L1` is the hygiene phase, and it cannot start with a `force: true` run: **the tools cannot
currently see most of the duplicates.** This wave repairs the instruments and changes no data.
Nothing is merged, marked or deleted here. The dedupe run itself is wave 2, after this desk has
walked the new plan with Daniel.

**This wave does not touch chart bonds, setlists, the book registry, `moments`, or anything in
`src/lib/books/**`.** Rosh Hashanah is sundown Sept 11 and the machzor pagemap on the fleet is
verified; this wave has no business near it.

---

## W1 — the dedupe normalizer strips the file extension before grouping

**The defect, measured.** The dominant duplication shape in this library is a Drive row named
`X.pdf` beside an upload row named `X`. `dedupe_library`'s normalizer keeps the extension, so the
exact pass cannot group them at all.

```bash
python3 - <<'PY'
import json,re,unicodedata,collections
rows=json.load(open("all_rows.json"))   # exhaustive list_library paging, visible set
def norm(s):
    s=unicodedata.normalize("NFKD",s); s="".join(c for c in s if not unicodedata.combining(c)).lower()
    s=re.sub(r'\.(pdf|txt|png|jpe?g|docx?|xlsx?|mp3)$','',s)
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
g=collections.defaultdict(list)
for r in rows: g[norm(r["name"])].append(r)
print(sum(len(v)-1 for v in g.values() if len(v)>1))
PY
```

This desk **observed** 84 losers across 83 groups from that normalize, against the 8 the shipped
exact pass **returned** and the 71 `forceScore: 0.85` **returned**, all three run at HEAD
`ba119f1415` on 2026-09-01T22:0xZ against the live surface. 65 of the 83 groups span a Drive id
and an upload id. The union of the three passes is 113 rows; they agree on only 42.

**The work.** Strip the file extension in the dedupe normalizer before grouping, leaving the
stored `name` untouched. **Show the fail branch, do not promise it (R-0831-guards-2):** a test
that the pre-change normalizer does NOT group `Achot ketana` with `Achot ketana.pdf` and the
post-change one does. Take the pairs from the return's §B list rather than inventing fixtures.

**Do not run `force: true`.** End W1 with a `dryRun` plan and put its group count in the return.

## W2 — `archived` leaves the browse and enters the hygiene scan (R-0901-live-cw-1 §3, Daniel's call)

`dedupe_library` and `reconcile_library` filter `status: 'archived'` out of their scan;
`list_library`'s default browse does not, hiding only `duplicate` and `orphaned`. Both sides move:
the browse hides `archived`, and the two hygiene tools stop filtering it.

This desk **observed** 20 archived rows in the browse, 17 with an active row of the same name and
12 sharing that row's `fileSize`, and `filteredOut.byStatus.archived = 20` **reported** by both
hygiene tools — measured at HEAD `ba119f1415`, 2026-09-01T22:0xZ, same instrument.

Keep `includeNonChartHealthy` working as the audit escape hatch: it should now also surface
`archived`, so nothing becomes unreachable by any tool.

## W3 — why `list_library` sees a different library than the hygiene tools: DIAGNOSE, DO NOT FIX

`list_library` **reported** `coverage.total: 891` and returned 891 unique fileIds under exhaustive
paging; `dedupe_library`, `reconcile_library` and `backfill_library_index` each **reported**
`coverage.total: 943` — measured at HEAD `ba119f1415`, 2026-09-01T22:0xZ, same instrument. The
three agree with each other and disagree with the browse. Cycle-3 DATA-002 added that uniform
`coverage` field precisely so these four could be correlated, so the disagreement is a defect in
the contract's own purpose.

**Return the cause; do not change behaviour in this wave.** Some of the rows only the fuzzy pass
flags resolve to no row the browse will return, so a fix chosen before the cause is known could
silently move rows in or out of Daniel's catalog. If the cause turns out to be a one-line scope
difference, say so and stop anyway — this desk rules on it with Daniel, then orders it.

## W4 — eleven rows whose stored mime disagrees with their name

Eleven rows carry `mimeType: application/pdf` with names ending `.doc` / `.docx`, all in
`uploads`, all secular. This desk **observed** them at HEAD `ba119f1415`, 2026-09-01T22:0xZ, same
instrument; they are listed in the return's §E. The browse hides them by extension while the
stored mime says chart. **Correct the stored mime; do not delete, do not rename, do not move
collections.** They stay reversible and they stay findable via `includeNonCharts`.

---

## Guards

**The Rosh Hashanah guard is not optional and it is the last thing you check before you call this
done (R-0901-vision-8 §1).** Every deploy before Sept 11 asserts that `list_books` still serves
`shirei-tshuvah` at 184 pages, tier `feed`, and the return says it did. This desk **observed**
that value on the live surface at HEAD `ba119f1415`, 2026-09-01T22:0xZ, before writing this order.

**Assert the identity, not the number (field note 12).** W3's check is that the browse total and
the hygiene total AGREE, not that either equals a figure written here — those move every time
Daniel uploads a chart.

**The build gate this repo has and was not running**, from the satellite-deploy return: a full
local build with env validation skipped. `tsc` and `vitest` are both structurally blind to the
route-export class that failed the first deploy cycle. Run it before you push.

Checks the executor runs and records — **no observed value is supplied here, deliberately; they
are yours to execute and transcribe:**

```text
git log --oneline -1                       # confirm the Verified-against sha
npx tsc --noEmit
SKIP_ENV_VALIDATION=1 npx next build --webpack
```

## Checklist

- [ ] Verified-against sha confirmed host-side at open; family row opened under `live` with claims
- [ ] W1 normalizer change + a fail-branch test taken from the return's §B pairs
- [ ] W1 `dryRun` plan re-run; new group count in the return
- [ ] W2 both filters moved; `includeNonChartHealthy` still reaches everything
- [ ] W3 cause diagnosed and RETURNED; no behaviour change shipped for it
- [ ] W4 eleven mimes corrected, nothing deleted or renamed
- [ ] Build gate green; deploy; **RH guard re-asserted after the deploy and quoted in the return**
- [ ] `RETURN-CODE-LIVE-HYGIENE-1-*.md` at this root; `Lane: live (Code)` on every commit (rule 13)

## Stop conditions

Stop and return, do not decide, if: the W3 cause implies rows would enter or leave Daniel's
catalog; the dedupe plan after W1 exceeds the 113-row union this desk measured, which would mean
the normalizer over-groups; anything in this wave wants to touch `src/lib/books/**`; or a ruling
looks needed. **`live` never spends a ruling id (rule 1)** — it stops and returns.

Claude records; Daniel decides.
