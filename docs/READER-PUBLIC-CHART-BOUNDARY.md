# Reader public chart boundary

CHARTS-001 creates one narrow exception for CRC's siddur reader. It does not
make the chart catalog, Firebase Storage, private file IDs, setlists, or account
data public, and it does not change the public-mirror rule for chart PDFs.

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
`reader_music_crosswalk` document. The reviewed crosswalk, newest exact past
binding, active CRC song/library rows, a 10 MiB limit, and PDF byte signature are
rechecked on every origin fetch. Approved bytes may remain in the CDN for at
most five minutes (`s-maxage=300`, with mandatory revalidation); all metadata,
unavailable, and error responses are `no-store`. No fallback to an older or
fuzzy-title binding is allowed.

Rollback is either to set `READER_PUBLIC_CHARTS_ENABLED=false` or remove the
crosswalk's `publicReaderStatus` field. A data rollback must delete the field,
not set it to null, and must use the post-approval update-time precondition so a
concurrent edit is never overwritten.

The public byte resolver reads Firebase Storage only. It does not use the
private Google Drive fallback, return a Storage URL, or change Storage rules.
