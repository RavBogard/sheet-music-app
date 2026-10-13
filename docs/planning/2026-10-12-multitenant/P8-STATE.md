# Phase 8 (Nava Tehila onboarding): state at pause, 2026-10-13

> **Superseded 2026-10-13 by `RETURN-CODE-MULTITENANT-2026-10-12-P8.md`.** The phase is
> closed; the work listed under "Left in phase 8" is done. Kept as the record of where the
> first sitting stopped. The chart finding here ("existing library rows for both new songs")
> was right, and the return says what the bytes settled.

Paused because Daniel shut the computer down. Not a return; `RETURN-CODE-MULTITENANT-2026-10-12-P8.md` is written when the phase gate passes.

## Done and verified in production

- **Tenant** `navatehila` created with `create_tenant` through `/api/platform/mcp` (dry run, then applied; audit `HTB8lA1uW9V6ZeIelF1c`).
  - Settings, applied with `update_tenant` (audit `N4xSqkq78exdWPCEywh5`): Hebrew branding (נאוה תהילה), library tabs `nava` (default) and `uploads`, the four Nava service types (קבלת שבת, שחרית, ימים נוראים, הלל), books `shabbat-maariv`, `shabbat-shacharit`, `shirei-tshuvah`.
  - Print footer and packet subject overridden so they read "{shortName} • פרויקט של הרב דניאל בוגרד", not "{shortName} Books".
  - Locale: he, rtl, Asia/Jerusalem, israel.
  - Flags: perform on; mixer, driveInbox, schedulingEmails, todayFeed, notifyBand off.
- **Address** `navatehila.vercel.app` attached by `create_tenant` itself, now that `VERCEL_API_TOKEN` is on the project. It is also in the Firebase authorized domains. `/login`, `/privacy`, `/terms` and `/accessibility` serve `lang="he" dir="rtl"` with Hebrew titles; `/site.webmanifest` carries the Hebrew name.
- **nava move** `move-nava-collection.ts -- --to navatehila --apply`: 284 documents and 142 Storage objects. Manifest `manifests/move-nava-collection-2026-10-13T13-56-53-738Z.json` (`bb46f775`).
  - Before and after, all 101 CRC setlists read back identical. All 1,406 CRC chart links resolve (0 unresolved). CRC nava tab 141, CRC default library and BL library identical.
  - Nava sees 141 rows. `navatehila__nava` is listed and shared with and assigned to crc; `crc__nava.movedTo` is set.
  - A CRC edit is refused with `not_owner`, "belongs to Nava Tehila; you can use it but not change it", and nothing is written.
  - Production golden (CRC and BL, MCP included): all surfaces identical.
- **Platform-owner token test**: Daniel's token minted for navatehila (`resolveMintOrg` + `createMcpToken`, the token route's own calls), used at `navatehila.vercel.app/api/mcp`.
  - It sees 141 nava rows and no setlists, templates, musicians or contacts.
  - A CRC setlist and a CRC-only chart opened by id return not found.
- **CRC-only refusal**: a throwaway CRC member gets 403 at `navatehila.vercel.app/api/mcp/tokens` ("This account isn't a member of Nava Tehila") and 200 at CRC.
- **Cleanup**: test tokens `clx4fssLLg1hKBDkV9jk`, `FCsR9C89BnHNTvHwz8ID` and the platform token `vV2VCu167bM3Q0fIdzqB` are revoked. Throwaway users are deleted. Scratch credentials are deleted.

## Left in phase 8

1. **Chart updates under ruling 8.** A read-only subagent was stopped mid-run, before it wrote a plan. It left downloads in the session scratch folder `nava-charts/` (drive/, drive-extra/, library/), which may not survive a reboot.
   - It found what look like existing library rows for both "new" songs: `upload-129b7877-9516-4590-832d-07a1df52af34` (pitchu-li) and `upload-5d72423a-75b3-4d68-9579-502cb99f17da` (Halluyah / Kol Haneshama, Daphna). Check those before adding anything, to avoid duplicates.
   - Library rows it matched for the changed songs:
     - Lakh Amar Libi `upload-1870c12e-f052-4a79-a677-0a1a7f84c3cc`
     - Niggun Tishrei `upload-4675dc8a-f9e2-4f48-ab6a-9340865823ee`
     - Arba'im Shana `upload-3fbb3fae-5400-4312-a932-0dee73d977d0`
     - Bati Legani `upload-a6a4cc7c-a496-4419-a793-204c56667002`
     - Yedaber Aleihem / Shamru Edotav `upload-f03dc4c0-0930-4358-abe6-cd983364c829`
     - Ehyeh Asher Ehyeh `upload-737e52a7-fa67-4560-8a3f-f3653b131e7b`
   - Next: compare the bytes; find the in-place byte-replacement path (`collections-admin.ts` mentions byte replacements); dry run and manifest; apply; check that CRC setlists still resolve.
2. Write the phase 8 return; update `~/shireishabbat/ops/tasks/MULTITENANT-P8.json`.

## Notes for phase 9

- A tenant bearer posted to another tenant's address is served as the token's own tenant (`orgFrom` reads the token, not the host). No data crosses tenants, and minting at an address is refused for non-members. Decide whether `/api/mcp` should also refuse when the token's tenant differs from the address's.

## Resuming

The temporary admin credential is rebuilt from the firebase CLI login, as earlier phases did (scratch `adc.json`). A platform token comes from `scripts/ops/multitenant/mint-platform-token.ts -- --uid 93Xn3DbS0bSNb8zmfzLyfOMX1A13 --days 2`.

GATE: tenant id and address `navatehila` — proceeded because the handoff leaves the slug to Code; it is the organisation's own name.
GATE: Hebrew display name נאוה תהילה, English "Nava Tehila" in the platform console — proceeded because the tenant is Hebrew-first (ruling 7) and the console stays English.
GATE: Nava's footer drops "Books" — proceeded because the phase 7 return asked Nava's branding to set its own footer; the credit line stays (ruling 4).
GATE: nava ownership move run in production — proceeded because ruling 6 approves it; manifest and undo exist; CRC was checked identical before and after.
