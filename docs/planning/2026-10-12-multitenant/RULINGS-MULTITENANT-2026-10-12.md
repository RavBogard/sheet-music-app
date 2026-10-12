# RULINGS — Multi-tenant centralreform.live, 2026-10-12

Daniel's rulings on the "Needs Daniel" list in `ANALYSIS-MULTITENANT-2026-10-12.md` (section 7), given 2026-10-12. Where Claude filled in a detail inside a ruling, the line is marked **default (objectable)**: it stands until Daniel says otherwise. Mission: `MISSION-2026-10-12.md`. Build plan: `HANDOFF-CODE-MULTITENANT-2026-10-12.md`. All three files are in this folder.

Verified-against: sheet-music-app `d7c7ec7f` (master).

## Daniel's rulings

**R-1012-mt-1 — Platform domain (2026-10-12).** No new domain is bought. Claude's reading of "let's deploy to vercel alone for now": each new tenant's default address is a `<slug>.vercel.app` alias added to the existing Vercel project, and each alias is added to Firebase authorized domains by the existing add-auth-domains call. Custom domains stay the automated add-on. CRC and BL keep their own domains.
- default (objectable): vercel.app names are global, so if `<slug>.vercel.app` is taken the nearest free name is used and recorded on the tenant. Host-to-tenant comes from the address list, not from reading the first part of the host.

**R-1012-mt-2 — Nava chart rights (2026-10-12).** No written permission is needed. CRC keeps using the collection.

**R-1012-mt-3 — Email (2026-10-12).** No per-tenant email work now. Every tenant sends from the shared sender. Nava's email features are off.
- default (objectable): CRC's and BL's current email wording and from-names move into tenant config unchanged so their mail stays identical. Nothing new (sender domains, per-tenant templates) is built.

**R-1012-mt-4 — Credit line (2026-10-12).** "A project of Rabbi Daniel Bogard" stays on every tenant.
- default (objectable): on CRC and BL the footer keeps the exact wording it shows today (`src/components/Footer.tsx:12`); this ruling is about where it appears, not its text. Hebrew tenants get it translated with the other strings.

**R-1012-mt-5 — People (2026-10-12).** David Lazaroff becomes BL's tenant admin.
- default (objectable): every other current admin account becomes admin of CRC only. David is admin of CRC and BL. Daniel is the sole platform owner.

**R-1012-mt-6 — The `nava` collection (2026-10-12).** The 140 `nava` charts move to Nava Tehila's ownership and are shared back to CRC. CRC can use them but not edit them. Approved as the one CRC-visible change. CRC's "Nava Tehilah" tab and every CRC setlist that uses these charts keep working.

**R-1012-mt-7 — Hebrew (2026-10-12).** Hebrew everywhere: band-facing and admin surfaces, setlist editing included. Opus or Sonnet subagents in the Code session translate; a second subagent reviews. Daniel is not the checker.
- default (objectable): the platform console (only Daniel uses it) and MCP text stay English.

**R-1012-mt-8 — The 10 changed Nava charts (2026-10-12).** Replaced in place, so setlist links survive.
- default (objectable): the transliterated chord-chart PDF stays "the chart", as for the existing 140. The Hebrew chart and the sheet music are not loaded now.
- default (objectable): five of the ten changed only in their notation PDF, so with the chord PDF as the chart they need no replacement; only the songs whose chord PDF changed are replaced. Ehyeh Asher Ehyeh and the Shamru Edotav "which copy" question are checked first.
- default (objectable): the two new charts with files (Pitchu Li Sha'arei Tsedek; Kol Haneshama by Daphna) are added the same way; Anan Va'arafel waits until it has files. Intake is PDF upload or Drive import, never the URL scraper.

## Standing defaults (analysis section 7 — all stand)

- Fix the self-assigned-role hole first, deployed the same day, before any other phase.
- No Edge Config or any other new paid service; the host lookup is a cached public address list.
- Charts and setlists openable by link stay that way, as a per-tenant setting defaulting on.
- Signing in at another tenant's address creates a pending request in that tenant and nothing else.
- "View as this tenant" is read-only, as Daniel.
- Platform tools live on a separate platform MCP server, `/api/platform/mcp`.
- The mixer stays CRC-only behind its flag.
- Shared charts are live references, not copies.
- CRC setlists keep working if an owner unshares or archives a chart.
- notify_band and scheduling emails stay off for Nava; it shares setlist links.
- Legal pages are run by the platform, with the tenant named.
- The Lecha Dodi duplicate and BL's access to the Nava collection are deferred to library cleanup.

## Further defaults set while writing the handoff (objectable)

- An unknown or suspended address shows a plain "no such site" page in production, never CRC. Preview deployments and localhost keep mapping to CRC so testing still works.
- Nava starts with no tenant admin; Daniel administers it as platform owner until one is named.
- Nava's service types come from its own catalogue (Kabbalat Shabbat, Shacharit, High Holidays, Hallel). It gets the shared books only, not CRC's printed booklets.
- Build order: the `nava` ownership move is built and rehearsed in phase 5 and run in production in phase 8, once Nava's tenant exists.

## Still open (owner: Daniel)

- Nava Tehila's tenant admin.
- A neutral platform domain. None is bought now; one can be added later as another address per tenant.
