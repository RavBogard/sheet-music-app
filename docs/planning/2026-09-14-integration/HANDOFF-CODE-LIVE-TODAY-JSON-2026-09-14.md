# HANDOFF → Code (centralreform.live): publish `today.json`

From: Cowork sitting with Daniel, 2026-09-14 (`RULINGS-INTEGRATION-2026-09-14.md` #5).
Consumers: the siddur reader (replaces its hardcoded `CAL`) and Overlays (default "Today's order", scan-card book). Both keep working when the file is absent.

## What it is

A small, public, metadata-only document describing the next (or current) service, derived from **published** setlists. No liturgical text, no chart bytes, no personal names beyond the leading rabbi's already-public title. It is the one place the family states "what tonight is."

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-18T20:05:11Z",
  "services": [
    {
      "setlistId": "…",
      "name": "Shir Shabbat — September 18",
      "serviceType": "kabbalat-shabbat",
      "eventDate": "2026-09-18",
      "startsAt": "2026-09-18T23:00:00Z",
      "book": "shabbat-maariv",
      "startFolio": 2,
      "rabbi": "Rabbi Daniel Bogard",
      "stream": { "url": "https://…", "startsAt": "2026-09-18T22:55:00Z" },
      "publishedAt": "2026-09-17T15:12:00Z",
      "version": 7
    }
  ]
}
```

`services` holds every published setlist whose `eventDate` is today or in the next 7 days, soonest first. `startsAt` comes from the setlist's `eventDate` + a per-`serviceType` default start time held in the congregation config (`get_congregation_context`), overridable per setlist. `stream.url` comes from congregation config; `stream.startsAt` defaults to five minutes before `startsAt`. `startFolio` is the first `liturgyRef.folio` on the setlist. Absent fields are omitted, not nulled.

## Build

**W1 — Emit on publish.** `publish_setlist` (and unpublish/republish) regenerates the document and writes it to a public, CDN-cached path on the canonical host: `https://www.centralreform.live/today.json`, `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=600`, CORS `*`, `GET` only. A daily regeneration also runs so a stale week rolls off without a publish. Use the existing Inngest/cron path; guard against the double-start already documented for Vercel cron.

**W2 — Config.** Add `serviceTypes[].defaultStartLocal` and `stream.url` to the congregation config doc; expose them through `get_congregation_context`; editable through an admin MCP tool (stage→confirm).

**W3 — Tenant boundary.** The file is per-org (`orgId: crc`); TBI or any future tenant gets its own path. Nothing cross-tenant is ever in one file.

**W4 — Guard.** A test that walks the emitted object for forbidden keys: no `tracks`, `fileId`, `notes`, chart URLs, or any Hebrew/liturgical text field. Same posture as Overlays' `now-route.test.ts`.

## Don'ts

Do not add a "now playing" or live pointer here — that was declined (rulings, deferred 9/10). This is the plan, not the state. Do not read unpublished setlists.

## Return

`RETURN-CODE-LIVE-TODAY-JSON-<date>.md` with a captured `today.json`, headers, the guard's forbidden-key list, and the config tool text for Daniel to accept.
