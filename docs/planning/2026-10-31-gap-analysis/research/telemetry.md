# Telemetry (lead), 2026-10-31

## Vercel runtime errors, last 7 days
All 16 error groups are one problem: `/api/drive/file/[fileId]` gets a Drive **403** on four ids,
again and again from Oct 26 to Oct 31, including today on the current deployment
(`dpl_HgnkaNska64gGc6tHwzGAWLsz8nj`).

| Drive id | What it is (from `setting-parts-dryrun.json`) | Hits |
|---|---|---|
| `1tcdg8vT…` | "1. Erev Rosh" (a **folder** name, no extension) | 11 |
| `1IpxlOcz…` | "crl-test-charts-cycle5C" (a test **folder**) | 3 |
| `1ch79JH6…` | "Shabbat" (a **folder**) | 1 |
| `1URRI7OB…` | "Shabbat morning" (a **folder**) | 1 |

All four have rows in `library_index` (they were stamped `crc__core` by the 2026-10-12
collection-visibility migration). So **Drive folders are indexed as if they were charts**.
Someone, on several days and at times that look like rehearsal or prep, opens one, and the
file route asks Drive for the content of a folder, which fails.

- **TEL-01** (bug, S2, quick win S): Exclude `application/vnd.google-apps.folder` from
  `library_index`, both at index time and in search/list results, and have the file route return
  a clear "this is a folder" message rather than a 403. Back-fill: mark the existing folder rows
  under F-05 (dryRun first).
- **TEL-02** (gap, S3, quick win XS): Vercel Web Analytics is **not enabled** on the project, so
  there is no route or device usage data at all. That makes "what is actually used?" (dead-surface
  questions) unanswerable. The app has its own `/api/web-vitals` beacon into Firestore and
  Sentry, but no usage counts. Recommend turning on Web Analytics (free tier), or adding
  route-level counters to the existing beacon. Adoption tracking (which players open Perform each
  week) would directly measure the paper-to-iPad move. Enabling Analytics is a dashboard toggle
  for Daniel, or a project setting, plus `@vercel/analytics` in the layout.
