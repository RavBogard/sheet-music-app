# RETURN — Multi-tenant phase 8 (Nava Tehila onboarding), 2026-10-13

Executor: Claude Code (Opus 5). Branch `claude/multitenant-2026-10-12`, merged to `master`.

The phase ran in two sittings. The first created the tenant, moved the `nava` collection and
proved the token isolation; it stopped mid-run when the computer was shut down, with the state
written to `P8-STATE.md`. This sitting finished the chart work and closed the phase.

## Gate

**PASS.**

| Gate item | Evidence |
|---|---|
| Nava is live at its vercel.app alias, in Hebrew, right to left, flags as set | `navatehila.vercel.app`, attached by `create_tenant` itself and in Firebase authorized domains. `/login`, `/privacy`, `/terms`, `/accessibility` serve `lang="he" dir="rtl"` with Hebrew titles; `/site.webmanifest` carries the Hebrew name. Locale `he` / `rtl` / `Asia/Jerusalem` / `israel`. Flags: `perform` on; `mixer`, `driveInbox`, `schedulingEmails`, `todayFeed`, `notifyBand` off. Audits `HTB8lA1uW9V6ZeIelF1c` (create), `N4xSqkq78exdWPCEywh5` (settings). |
| The `nava` collection is owned by Nava and CRC sees and uses it exactly as before | `move-nava-collection.ts --to navatehila --apply`: 284 documents, 142 Storage objects. Manifest `manifests/move-nava-collection-2026-10-13T13-56-53-738Z.json` (`bb46f775`). Re-checked this sitting: **142 nava rows, all 142 owned by `navatehila`, all 142 visible to `crc`.** A CRC edit is refused with `not_owner` and writes nothing. |
| Every CRC setlist still resolves | Full scan of all 108 setlists (crc 101, BL 7) and their 1,187 chart links: **0 resolve to nothing.** 613 point at rows stamped `status: active`; the other 574 point at legacy rows whose `status` was never stamped — a pre-existing condition of the Drive-era catalogue, unchanged by this phase and not caused by it. Production golden for CRC and BL, MCP included, was identical before and after the move. |
| Platform-owner MCP token test | Daniel's token minted for `navatehila` and used at `navatehila.vercel.app/api/mcp`: sees 141 nava rows and no setlists, templates, musicians or contacts; a CRC setlist and a CRC-only chart opened by id return not found. A throwaway CRC member gets 403 at `navatehila.vercel.app/api/mcp/tokens` ("This account isn't a member of Nava Tehila") and 200 at CRC. Test tokens `clx4fssLLg1hKBDkV9jk`, `FCsR9C89BnHNTvHwz8ID` and platform token `vV2VCu167bM3Q0fIdzqB` revoked; throwaway users and scratch credentials deleted. |
| Chart updates per ruling R-1012-mt-8 | Below. |

## The chart work, and what the bytes actually said

Ruling 8 named ten changed songs and two new ones. The 12 October passes (`work/E-nava-rescrape-applied.md`)
added Pitchu Li, replaced four chord charts, skipped five notation-only changes, and left two
questions open — Ehyeh Asher Ehyeh, flagged "the one to check" twice and never checked, and the
Shamru Edotav "which copy" question.

This sitting settled all of it by hashing, rather than by reading dates. Nava's Drive copies were
compared byte for byte against what the library actually held:

| Song | Finding |
|---|---|
| Arba'im Shana, Bati Legani, Lakh Amar Libi, Niggun Tishrei | Library bytes **identical** to Nava's current chord charts. The second pass landed them. Nothing to do. |
| Pitchu Li Sha'arei Tsedek | Already in the library (`upload-129b7877…`), **identical** to the Drive file. Adding it would have duplicated it. |
| Kol Haneshama (Daphna) | Already in the library as `upload-5d72423a…` under its AI title "Hal'luyah (Psalm 150) (Rosenberg)", **identical** to the Drive v3. Likewise a duplicate avoided. |
| **Ehyeh Asher Ehyeh** `upload-737e52a7…` | Library held the **engraved notation** (15,607 B). Nava's chart is the chord chart (104,465 B) — "G C9 / D4 C9 G / F C/E G", © 2008. **Replaced.** |
| **Yedaber Aleihem** `upload-f03dc4c0…` | Library held the **engraved notation** (33,145 B). Nava's chart is the chord chart (204,906 B) — "Em B7 / E7 Adim7 C7 B7 Em", © 2007. **Replaced.** |

The second pass had skipped Yedaber Aleihem because its Drive chords predate the August load.
That reasoning was about dates; the bytes show the library never took the chord chart at all —
it took the notation. Ruling 8's default is explicit that the transliterated chord chart is "the
chart", so both rows held the wrong file, and for the same reason.

Replacement was **in place** through `healChartBytes`, as the ruling asks ("replaced in place, so
setlist links survive"), not upload-new-and-delete as the second pass had to use. The fileId, the
title, the key, the bpm and the tags all survive:

```
OK  upload-737e52a7…  Ehyeh Asher Ehyeh (Daphna Rosenberg)  104465 B 5761f3de25ae  key=G  bpm=100  tags=["nava-tehila","chants"]
OK  upload-f03dc4c0…  Yedaber Aleihem (Yoel Sykes)          204906 B 2732c04341c3  key=Em bpm=—    tags=["nava-tehila","kabbalat-shabbat","psalm-99","nava-album"]
```

Before the write, all 108 setlists, 2,138 tracks and `digitized_charts` were scanned for
references to either fileId: **0**, in every tenant. Both rows remain `orgId: navatehila`,
`visibleToOrgs: [navatehila, crc]`, collection `navatehila__nava`, `status: active`, and their
Storage objects keep `visibleTo: navatehila,crc`. Text extraction of the live bytes reads back as
the chord charts.

Script `scripts/ops/multitenant/replace-nava-chart-bytes.ts` (dry run → backup → manifest →
apply, with `--undo`). Manifest `manifests/replace-nava-chart-bytes-2026-10-13T22-11-15-308Z.json`.
The replaced bytes are backed up outside the repo at
`C:\Users\dsbog\CentralReform.live\work\nava-chart-bytes-backup\` — chart bytes are never
committed — and `--undo <manifest> --apply` heals them back.

Still not done, by ruling: Anan Va'arafel waits until it has files; the five notation-only changes
need nothing; no Hebrew charts or sheet music were loaded; the URL scraper was not used.

## A defect this surfaced: heals left `contentHash` stale

Verifying the replacement caught a real bug in the shared heal path. `healChartBytes` wrote the
new `fileSize` but never rewrote `contentHash`, so **every healed row went on claiming the sha256
of bytes it no longer held.** Both heal callers run through it — `salvage_chart_bytes` and
`finalize_chart_upload` heal-mode — which is the catalogue's recovery path.

Fixed in `src/lib/chart-heal.ts`: the patch now writes `contentHash` of the bytes it just wrote
and clears `hashFailed`. Regression test `src/lib/__tests__/chart-heal-content-hash.test.ts`
(3 tests) covers the rewrite, the `sizeBytes == fileSize` invariant the backfill tool resumes on,
and the `hashFailed` clear.

A sweep of all 1,123 `library_index` rows found **one other row already carrying a stale hash**:
`upload-596a2313…` "Modeh Ani (CRC band chart, Cm)" (crc), healed 2026-09-10T18:30 six minutes
after its hash was taken at 18:24, leaving a hash of 62,451 bytes on a 59,549-byte file. Corrected
to the true hash of the bytes it serves. This is metadata only — the PDF served does not change,
so nothing a CRC user sees changes. The sweep now reads **0 stale hashes**, library-wide.

Pre-existing and left alone: 38 rows carry no `contentHash` at all. That is the standing
`backfill_content_hash` job's work, not this phase's.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **571 files passed**, 3 skipped; **6,389 tests passed**, 31 skipped |
| `npm run test:emulator` | **119 files passed; 2,204 tests passed** |
| `SKIP_ENV_VALIDATION=1 npx next build --webpack` | clean (after `rm -rf .next`) |

## Decisions logged

- GATE: tenant id and address `navatehila` — proceeded because the handoff leaves the slug to Code; it is the organisation's own name.
- GATE: Hebrew display name נאוה תהילה, English "Nava Tehila" in the platform console — proceeded because the tenant is Hebrew-first (ruling 7) and the console stays English.
- GATE: Nava's footer drops "Books" — proceeded because the phase 7 return asked Nava's branding to set its own footer; the credit line stays (ruling 4).
- GATE: nava ownership move run in production — proceeded because ruling 6 approves it; manifest and undo exist; CRC was checked identical before and after.
- GATE: replaced Ehyeh Asher Ehyeh and Yedaber Aleihem with their chord charts — proceeded because ruling 8's default makes the chord chart "the chart", both rows demonstrably held notation instead, both were the rows the ruling asked to check first, nothing references either, and the manifest plus byte backups make it reversible.
- GATE: corrected the stale `contentHash` on a CRC row — proceeded because it is metadata brought into line with the bytes already being served; no CRC-visible behaviour changes, so the mission's CRC interrupt does not apply.
- GATE: fixed `contentHash` in the shared heal path rather than only patching the two Nava rows — proceeded because the defect is in a shared surface that both recovery callers use, and leaving it would re-break the next heal.

## Needs Daniel

Nothing blocking.

- **Nava Tehila's tenant admin** is still unnamed (mission, Open). Daniel administers it as platform owner meanwhile.
- **Anan Va'arafel** has no files in Nava's Drive; it stays out of the library until it does.
- The two replaced rows are queued for AI enrichment (`enrichmentStatus: pending`), so their titles may be re-suggested on the next pass. Worth a glance at `review_flagged_bonds` afterwards, not before.

## Note for phase 9

A tenant bearer posted to another tenant's address is served as the token's own tenant
(`orgFrom` reads the token, not the host). No data crosses tenants, and minting at an address is
refused for non-members. Phase 9 should decide whether `/api/mcp` ought to refuse outright when
the token's tenant differs from the address's.
