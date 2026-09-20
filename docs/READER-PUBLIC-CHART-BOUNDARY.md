# Reader public chart boundary

CHARTS-001 creates one narrow exception for CRC's siddur reader. This review
establishes the controls local to the new `/api/reader/music/select` and
`/api/reader/music/chart` Modeh endpoints; it is not an assurance of
system-wide chart privacy. These endpoints do not make the chart catalog,
Firebase Storage, private file IDs, setlists, or account data public, and they
do not change the public-mirror rule for chart PDFs.

Known policy-dependent risk: the arbitrary-file paths `/api/drive/file/[fileId]`
and `/api/library/file/[id]` are unchanged by this boundary. Restricting or
migrating those paths is held pending Daniel's decision on the intended
publication semantics for Perform/public-print workflows. Until that decision
and migration are complete, the local Modeh controls below must not be cited as
closing those legacy enumeration or download risks.

The legacy anonymous Firestore `tracks` read **was** one of these risks and is
closed as of R-0919-audit-2 (2026-09-19): `setlists` and `tracks` now grant
`get` publicly but require sign-in for `list`, so a signed-out caller can read
one document whose id it already holds and can no longer enumerate the
collection. That is the enumeration half. The download half above is still
open.

The family rights policy says third-party chart bytes do not cross repositories.
The later CHARTS-001 Producer disposition authorizes anonymous in-reader display
for the exact Modeh Ani/Halpert pilot. No Modeh-specific hold or withdrawal was
found in the source evidence. This exception is therefore limited in code to:

- unit: `awakening.modeh-ani@legacy-shabbat-morning`
- piece: `modeh-ani.halpert`
- organization: `crc`
- format: `application/pdf`

Publication needs all three controls: `READER_PUBLIC_CHARTS_ENABLED=true`, the
code allowlist above, and `publicReaderStatus: "approved"` on that exact
`reader_music_crosswalk` document. Approval also requires this additive nested
manifest (existing private-reader fields remain unchanged):

```text
publicReaderManifest: {
  version: 1,
  songId: "<exact active songs doc id>",
  fileId: "<exact active library_index doc id>",
  storagePath: "library/<that fileId>.pdf", // extensionless form also valid
  generation: "<decimal GCS generation>",
  sha256: "<64 lowercase/uppercase hex digits>",
  sizeBytes: <exact integer>,
  contentType: "application/pdf"
}
```

An old approval with no complete manifest is unavailable, so schema deployment
is migration-compatible but fail-closed. The newest exact past binding must
match the manifest's song/file/normalized MIME; the active CRC catalog row must
match its MIME, size, and SHA-256. The exact GCS path+generation is metadata-
checked before download, streamed through a 4 MiB hard ceiling, hashed, and
then the approval/catalog/latest binding are re-read before delivery. No fuzzy
path guessing, Drive fallback, mutable "latest" object, older occurrence, or
same-instant conflicting representation is accepted.

Every response is `no-store`. There is no CDN/server-cache invalidation channel
that could honestly promise rapid withdrawal, so an approval is rechecked on
every future fetch. Bytes already delivered to a browser or external cache
cannot be erased by revocation.

## Rollout and rollback

1. Deploy this code with `READER_PUBLIC_CHARTS_ENABLED` absent/false and with
   Upstash configured. Confirm the trusted Vercel IP header reaches the route.
2. From the exact reviewed Storage generation, compute SHA-256 and record the
   complete manifest plus `publicReaderStatus: "approved"` using the document's
   update-time precondition. Do not bulk-publish or infer IDs from titles.
3. Set `READER_PUBLIC_CHARTS_ENABLED=true` and redeploy. Environment changes do
   not alter an already-running deployment; old deployment URLs may retain old
   code/environment and must be retired or protected separately.

For immediate data rollback, delete `publicReaderStatus` (or set it to a
non-approved state such as `revoked`) with the post-approval update-time
precondition. Then set the environment flag false and redeploy for a second
independent stop. A flag-only rollback also requires redeploy. No rollback can
revoke bytes a client already received.

## Approving another chart

Nothing here is a Firestore edit alone. Publication needs a code change, a
deploy, and an exact document approval, in that order, and each step fails
closed without the others.

1. **Get the Producer disposition in writing first.** The Modeh Ani/Halpert
   pilot is authorized by the CHARTS-001 Producer disposition. A second chart
   needs its own, naming the unit, the arrangement and the rights basis. Do not
   proceed on a verbal or inferred approval — the whole control is that this
   table is short and every entry is traceable.

2. **Add the entry to the code allow-list.** In
   `src/lib/reader-music-public.ts`, declare a frozen
   `PublicReaderChartDefinition` beside `MODEH_ANI_PUBLIC_READER_CHART` and add
   it to the `PUBLIC_READER_CHARTS` map keyed by its `unitId`:

   ```ts
   export const <NAME>_PUBLIC_READER_CHART = Object.freeze({
       unitId: "<unit id>@<service slug>",
       pieceId: "<piece id>",
       orgId: "crc",
       kind: "pdf",
       contentType: "application/pdf",
   } satisfies PublicReaderChartDefinition)
   ```

   Use the exact spellings the corpus mints — take `unitId` from
   `src/data/books/moments.json`, not from a title. A unit id that disagrees
   with the producer will simply never match and the route will 404 with no
   explanation.

3. **Identify the exact bytes.** Find the active `songs` document id and the
   active `library_index` document id for that arrangement. The Storage object
   is `library/<fileId>.pdf` (the extensionless form is also accepted). Read the
   object's metadata and record its decimal `generation`, `size` and
   `contentType`. Download that exact generation and compute its SHA-256. These
   five values must come from one read of one generation — if the object is
   replaced between the metadata read and the hash, start over.

4. **Check it against the ceiling.** `sizeBytes` must be at or under
   `MAX_PUBLIC_READER_CHART_BYTES` (4 MiB). A larger object is rejected from
   metadata before any byte streams, so an oversized approval publishes nothing
   and looks like a silent failure.

5. **Write the approval onto the crosswalk document.** On the exact
   `reader_music_crosswalk` document whose `orgId`, `momentId` and `pieceId`
   equal the definition's, and whose `status` is already `"reviewed"`, set
   `publicReaderStatus: "approved"` and the complete nested
   `publicReaderManifest` shown above. Use the document's update-time
   precondition so a concurrent edit loses rather than merges. Do not bulk-write
   and do not infer document ids from titles.

6. **Deploy the code change**, with `READER_PUBLIC_CHARTS_ENABLED` already
   `true` in production. If the flag is not yet on, set it to exactly `true`
   (no surrounding whitespace — the production value carried a trailing CRLF
   through 2026-09-07 and the compare is trimmed because of it) and redeploy;
   an environment change does not reach an already-running deployment.

7. **Verify from a signed-out browser.** `POST /api/reader/music/select` for the
   new unit returns the selection; `GET /api/reader/music/chart` returns the
   PDF with `no-store`; an unapproved neighbouring unit still returns 404; an
   `Authorization` or `Range` header on either route is rejected. Record the
   four status codes. Until all four read as expected, treat the chart as not
   published.

## Revoking one

Revocation stops future fetches. It does not recall bytes: every response is
`no-store` and the approval is re-read on every fetch, but anything a browser or
an intermediary already holds is gone from our control. Say so plainly to
whoever asks for the revocation.

1. **Delete `publicReaderStatus`** from that crosswalk document — or set it to a
   non-approved value such as `"revoked"` — using the post-approval update-time
   precondition. This is the immediate stop and needs no deploy: the next fetch
   re-reads the approval and fails closed. Leaving `publicReaderManifest` in
   place is fine and is useful history.

2. **Remove the entry from `PUBLIC_READER_CHARTS`** in
   `src/lib/reader-music-public.ts` and deploy. This is the second, independent
   stop, and it is what makes the allow-list an honest record of what is public.

3. **If every chart is being withdrawn**, also set
   `READER_PUBLIC_CHARTS_ENABLED` to `false` and redeploy. A flag-only rollback
   still requires the redeploy.

4. **Retire or protect old deployment URLs.** A previous deployment keeps its
   own code and environment, so a revocation that stops at production leaves the
   chart reachable on any preview or prior production URL that is still open.

5. **Record the revocation** in this document with the date and the reason, so
   the next reader can tell a withdrawn chart from one that was never approved.

## Anonymous abuse controls

The public select/chart routes reject `Authorization` and `Range`; neither can
create a distinct limiter identity or a partial-response cache variant. They
key only on Vercel's platform-overwritten `x-vercel-forwarded-for` header.
Production requires the distributed Upstash limiter and denies on missing IP,
missing configuration, or Redis failure. The bounded in-process limiter is for
development/tests only.

Add platform/WAF rules as a second layer: per-IP ceilings for
`/api/reader/music/select` and `/api/reader/music/chart`, method allowlists
(POST/OPTIONS and GET/OPTIONS respectively), query/body size limits, and bot/
abuse blocking. Keep the application limiter enabled because WAF configuration
can drift between production and old/preview deployments.

The public byte resolver reads Firebase Storage only. It does not use the
private Google Drive fallback, return a Storage URL, or change Storage rules.
