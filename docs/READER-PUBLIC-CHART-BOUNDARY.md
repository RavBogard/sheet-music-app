# Reader public chart boundary

CHARTS-001 creates one narrow exception for CRC's siddur reader. This review
establishes the controls local to the new `/api/reader/music/select` and
`/api/reader/music/chart` Modeh endpoints; it is not an assurance of
system-wide chart privacy. These endpoints do not make the chart catalog,
Firebase Storage, private file IDs, setlists, or account data public, and they
do not change the public-mirror rule for chart PDFs.

Known policy-dependent risk: the legacy anonymous Firestore `tracks` read and
arbitrary-file paths `/api/drive/file/[fileId]` and
`/api/library/file/[id]` are unchanged by this boundary. Restricting or
migrating those paths is held pending Daniel's decision on the intended
publication semantics for Perform/public-print workflows. Until that decision
and migration are complete, the local Modeh controls below must not be cited as
closing those legacy enumeration or download risks.

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
