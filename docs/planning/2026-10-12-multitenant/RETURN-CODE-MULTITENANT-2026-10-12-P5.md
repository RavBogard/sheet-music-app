# RETURN — Multi-tenant phase 5 (shared collections), 2026-10-12

Executor: Claude Code (Opus 5.5), with two Opus lanes: lane 1 built the server, rules, MCP, visibility job and nava move; lane 2 built the browser pickers, Swap sheet and library page. Branch `claude/multitenant-2026-10-12`, merged to `master`.

Shipped:
- App: `6b86d098` (Vercel `dpl_7Eck96FoVeZ8F2qAubQuXfVGWejb`); `80f17599` is the index file only.
- Firestore rules, Storage rules and indexes deployed.
- Visibility stamp applied in production.

**The nava ownership move itself has not run in production.** It needs the Nava tenant, which phase 8 creates. Phase 5 rehearsed it on a restore of production.

## Gate

**PASS.**

| Gate item | Evidence |
|---|---|
| CRC and BL libraries, pickers and MCP library results match the golden captures | Lane goldens were committed before any change (`cfeb23bb`, `78f5540c`) and still pass after the merge. The production HTTP golden diff against `golden/http-before` is identical for every CRC surface, including CRC's MCP instructions. The only BL difference is its own agent guide, which is the known phase 4 change. In production, CRC's `list_library` for `nava` returns 141 rows (the restore counted 141), and BL's library returns 81. `includeShared` reads answer for both tenants. A BL search finds only BL's own chart. |
| …and the probe baseline | **BL probe 19/19** (`golden/bl-probe-p5.txt`). Persona probe against deployed rules, diffed with phase 2's after-capture (`golden/persona-diff-p5.txt`), has 11 differences, all expected: <br>• Six are members listing their **own** tenant's `library_index`, which phase 5 opens for the shared pickers. Cross-tenant lists are still refused, with no difference there. <br>• Five are "own membership" reads that are still allowed but now find no document. That is a fixture difference: the phase 2 capture ran after the migration had made membership docs for the probe accounts. |
| Chart bytes refused across tenants except through visibility or openable-by-link | `download_chart` in production: a BL token on a CRC chart and a CRC token on a BL chart both get `chart_not_found`; CRC's own chart opens. The persona probe's Storage reads across tenants are unchanged (refused). `/api/library/file` still serves any chart to an in-app fetch at either address, because both tenants keep the default link-open setting; that is today's behaviour, as the handoff requires. Emulator tests cover the closed-setting paths, including a chart whose **owner** has closed it (see decision 2). |
| The nava move rehearsal on the scratch restore leaves every CRC setlist resolving | Fresh production export `gs://crcmusiccharts-backups/multitenant-2026-10-12-p5-rehearsal`, loaded into the emulator. `scripts/ops/multitenant/rehearse-nava-move.ts` ran stamp then move (`golden/nava-move-rehearsal-p5.txt`). It moved 142 rows (141 active, 1 duplicate). <br>• All **101 CRC setlists** read back byte-identical. <br>• Every bonded CRC track's chart stays visible to CRC. <br>• CRC's nava tab: 141 → 141. CRC default library unchanged. <br>• BL sees none of the moved rows. <br>• A CRC edit is refused with "Yedid Nefesh (Rosenberg) belongs to Nava Tehila; you can use it but not change it." and nothing is written. <br>• Undoing the move, then the stamp, returns every document to the start, byte-identical. |

## Checklist

| Item | Result |
|---|---|
| Rows carry `collectionId` and `visibleToOrgs`; one job recomputes visibility from `collections` | PASS. `src/lib/library/visibility.ts` and `visibility-job.ts`. Sharing changes re-stamp rows, songs and Storage `visibleTo` metadata. |
| Stamp in production, with dry run, manifest and undo | PASS. Dry run 1,123 `library_index` + 1,177 `songs` + 1,180 objects, 0 shared (identical to the restore). Applied: 2,300 docs, 1,180 objects. A second dry run finds 0 to change. Manifest: `manifests/stamp-collection-visibility-2026-10-12T23-13-53-813Z.json`. |
| Reads by visibility, writes by ownership | PASS. Eleven read sites check visibility, including `download_chart`, which had no check before. Eight write sites refuse a chart the caller can see but not own, with the message above. Cleanup and dedupe sweeps stay owner-only. |
| `search_library` / `list_library` take `includeShared` and return `ownerOrgId` | PASS, live in production. |
| `create_collection`, `set_collection_sharing` for tenant admins | PASS. CRC's and BL's tool lists grow by these two. |
| Storage rules read `visibleTo` metadata | PASS. Without it, phase 2's `orgId` check applies. |
| Per-tenant `library.openByLink` (default on) | PASS. See decision 2. |
| Pickers, Swap sheet and library page: own charts first, shared collections as chips (off by default), shared rows read-only, CRC nava tab by visibility, offline caching | PASS (component tests and goldens). No browser click-through: the browser automation tools didn't connect this session. Production accepts the browser's exact queries: members get 0 rows today (nothing is shared yet), pending accounts and other tenants are refused. |
| `move-nava-collection.ts` (dry run, manifest, undo) | PASS, rehearsed (above). Production run waits for phase 8. |

## Test tails (merged tree `ba9278e5`, then follow-ups)

- `npx vitest run`: **511 files passed** (3 skipped). Tests: **5,937 passed**.
- `npm run test:emulator`: 117 of 118 files. One failure, `wait_for_setlist_change` "returns timedOut", ran while the rehearsal emulator loaded the machine; alone it passes 10/10. Tests: 2,201 of 2,202.
- `npx tsc --noEmit`: 0. Clean `next build --webpack`: 0. `login-bundle`: 1 passed.
- Follow-ups: open-by-link and file routes 36/36; library emulator suites 80/80; rules suites 754/754.

## Found at merge and in production

1. **The browser's `collections` query was refused by the rules.** The browser treats a refusal as "nothing shared", so chips would never have appeared, silently. The list rule now reads the bare fields with `hasAny(seenOrgs())`, the form the query prover accepts. A rules test issues the browser's exact queries (`ba9278e5`).
2. **A missing index.** The shared-rows query (`visibleToOrgs` array-contains + `orgId !=`) returned FAILED_PRECONDITION in production. The emulator doesn't enforce indexes. Added and deployed (`80f17599`), then re-checked live.
3. **Row type mismatch** between lane 2's typed rows and lane 1's `VisibilityRow`. The checks now take `VisibilityFields`.

## Security

Lane 1 found and closed (`69fd65f1`, deployed): **a tenant admin could edit another tenant's library rows through `edit_library_entry`**, and byte replacement (salvage, finalize-heal) didn't check the owner. Now only the platform owner is unscoped there, and byte replacement is owner-only. In practice only CRC and BL admins existed, and nothing suggests it was used.

## Decisions

1. **Assigned vs shared (`libraryOrgs`).**
   - A tenant the platform owner *assigns* a collection to sees it by default: tab, pickers, and MCP without `includeShared`.
   - A tenant it's only *shared* with gets an opt-in chip.
   - The nava move sets both `sharedWith` and `assignedTo` to `[crc]`, so CRC sees no change and a Nava admin cannot cut CRC off.
2. **Openable by link follows both the address's tenant and the chart's owner** (`6b86d098`).
   - Lane 1 checked only the address. A tenant that turned link-opening off would still have had its charts served at another tenant's address.
   - Now a chart opens by link only if both allow it; otherwise the member-and-visibility path applies.
   - With CRC and BL on the default, nothing they see changes.
3. **`delete_chart`** refuses a chart in another tenant's upcoming setlist; archive is still allowed. Its "in use" count is the owner's own setlists.
4. **No "From …" badge on CRC's Nava tab**, so the tab keeps its look after the move. Shared rows elsewhere carry "From {owner}".
5. **Nava count.** The move covers 142 rows (141 active + 1 duplicate); the ruling said 140. CRC's tab shows 141 because the duplicate isn't listed. The production move in phase 8 moves all 142.

## Carried forward

- **Nava move in production**: phase 8, after the tenant exists. Command: `move-nava-collection.ts -- --to <navaOrgId> --apply`. Undo: `--undo <manifest> --apply`.
- New UI copy is in `SHARED_COPY` (lane 2) for phase 7.
- From earlier phases: Open Graph alt and `/manifest.json` per tenant before phase 8; phase 2 step 5; the `VERCEL_API_TOKEN` (Needs Daniel, phase 3).
- If the move runs while a CRC device is open, its songs listener may drop the old local copies until the next shared read or reload (lane 2 note). Run the move outside a service.

## Commits

| Commit | What it is |
|---|---|
| `cfeb23bb` … `e4e03267` | Lane 1 (15 commits): goldens; visibility helpers and job; rules; openByLink and indexes; library list; pickers scope; MCP reads/writes; sharing tools; security fix `69fd65f1`; byte-replacement audit; stamp and move scripts; contract notes |
| `78f5540c`, `b2baa985` | Lane 2: goldens; pickers, Swap sheet, library page, offline cache |
| `debbac36`, `7aaa785c` | Merges |
| `ba9278e5` | Lead: provable collections list rule; `VisibilityFields` |
| `6de0e6d0` | Lead: rehearsal driver and result |
| `6a6f8025` | Stamp manifest |
| `6b86d098` | Lead: owner's openable-by-link setting |
| `80f17599` | Lead: shared-rows index |

GATE: production stamp applied without a pause — proceeded because it is owner-only (no row became visible to anyone new), dry run matched the rehearsal exactly, and the manifest undoes it.
GATE: openable-by-link semantics changed from lane 1's host-only reading to host-and-owner — proceeded because it changes nothing for CRC/BL today and matches the ruling ("charts … openable by link … as a per-tenant setting") better.
