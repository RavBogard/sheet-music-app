# ipad-text-viewer-fetch-fix — DIAGNOSIS

**Lane:** `ipad-text-viewer-fetch-fix` (Tier 1)
**Dispatched:** `msg-ipad-text-viewer-fetch-fix-001` from supervisor 2026-05-24T16:00Z
**Closes:** ipad-sweep FINDINGS §F-1 (HIGH future-Friday)
**Reference convergence pattern:** `audio-viewer-f7` (`912ea2c3d`) — `src/components/music/AudioViewer.tsx` (124 LOC).
**Base SHA:** `c76b2a34a` (origin/master at lane start)

---

## Failure signature on prod iPad WebKit

From `.paul/research/ipad-webkit-prod-sweep/FINDINGS.md` §F-1, the actual
per-chart verdict in `perform-ipad-real-setlists.spec.ts ›
kabbalat-shabbat-5-22` was:

> Per-chart verdict `FAILED Failed to load text file` at row 5.

`Failed to load text file` is the literal error string `TextScoreViewer.tsx`
sets when its `fetch(url)` resolves but `res.ok === false`. The smoking gun
in the sweep:

> The SAME `upload-046649f0-1c68-4586-b021-964bb84c3228` fileId renders
> successfully at row 4 (`RENDERED`) and row 6 (`RENDERED` retry attempt).
> The bytes are fetchable. Failure occurs only when the row routes to the
> **text viewer** for that fileId.

So three rows in the same setlist bond to the **same fileId**, but only the
row routed to `TextScoreViewer` fails — the rows routed to `PDFViewer` for
that same fileId render. That isolates the failure to the
TextScoreViewer-specific fetch path, not the upstream byte source.

---

## Current code path — TextScoreViewer

Reading `src/components/music/TextScoreViewer.tsx` at `c76b2a34a`:

```tsx
interface TextScoreViewerProps {
    url: string
}

export function TextScoreViewer({ url }: TextScoreViewerProps) {
    // ...
    useEffect(() => {
        let cancelled = false
        async function loadText() {
            setLoading(true)
            setError(null)
            try {
                const res = await fetch(url)
                if (!res.ok) throw new Error("Failed to load text file")
                const text = await res.text()
                if (!cancelled) { setContent(text); setLoading(false) }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || "Failed to load chart")
                    setLoading(false)
                }
            }
        }
        loadText()
        return () => { cancelled = true }
    }, [url])
```

- Takes a `url` prop (string).
- Single `fetch(url)`. No `@/lib/offline-idb` integration.
- On `res.ok === false` → throws `"Failed to load text file"`.
- On `fetch` rejection → falls into catch, surfaces `err.message`.

The viewer has **no fileId at all** — it depends entirely on the URL the
parent (`PDFOverlay`) hands it.

## The URL `PDFOverlay` hands TextScoreViewer

Reading `src/components/performance/PDFOverlay.tsx` at `c76b2a34a`:

```tsx
// `fileUrl` (a cached-blob object URL, or the network URL on miss) is ONLY
// for the non-PDF viewers (SmartScore/Text/Image): they `fetch(url)` /
// `<img src>` the URL directly with NO IDB fallback, so the blob: URL is
// their offline path.
const [fileUrl, setFileUrl] = useState<string>("")
useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    async function resolve() {
        if (!track.fileId) { setFileUrl(""); return }
        const { getFile } = await import("@/lib/offline-idb")
        const blob = await getFile(track.fileId)
        if (cancelled) return
        if (blob) {
            objectUrl = URL.createObjectURL(blob)
            setFileUrl(objectUrl)
        } else {
            setFileUrl(networkUrl)
        }
    }
    resolve()
    return () => {
        cancelled = true
        if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
}, [track.fileId, networkUrl])

// ...later in render:
isText ? (
    fileUrl && <TextScoreViewer url={fileUrl} />
) : ...
```

So when iPad WebKit opens the Song 5 row that's routed to TextScoreViewer:

1. PDFOverlay's `resolve()` effect calls `getFile(track.fileId)`.
2. If the fileId is in IDB → returns a Blob with mime
   `application/pdf` (because the bytes IS a PDF; the row's track.type is
   `'text'` from a legacy/asymmetric bind — see
   `[[project_track_mimetype_gotcha]]`).
3. `URL.createObjectURL(blob)` produces a `blob:` URL.
4. PDFOverlay sets `fileUrl = blob:…`.
5. TextScoreViewer mounts with `url={blob:…}`, fires `fetch(blob:…)`.

## Why `fetch(blob:…)` plausibly fails on iPad WebKit

This is the EXACT failure class that bit the PDF path on 2026-05-22 and
was fixed by `webkit-pdf-reload-fix` (`575bc47ae`, master-tip entry
`[prior tip 575bc47ae]` — "transient first-tap 'Failed to load PDF',
precached-blob race"). Master-tip describes the mechanism:

> iPad/iOS WebKit intermittently fails a `fetch()` of a freshly-created
> object URL with "Load failed" on the first tap, surfacing as "Failed to
> load PDF" (no `/api/drive/file` request; self-heals on Retry).

The PDF path's fix was to STOP routing through `fileUrl` (the blob:) and
hand `PDFViewer` the network URL directly — `PDFViewer` then resolves
IDB internally and never touches the blob:-fetch race.

TextScoreViewer was not updated in that lane (audio-viewer-f7 followed
the same shape, also avoiding `fileUrl`). The text branch is the
remaining viewer that still goes through PDFOverlay's `fileUrl` blob:
pipe — and shows the same failure shape, just on text-typed rows.

## Secondary failure surface: row 5 was offline-cached, rows 4+6 were too

If row 5's IDB entry is *missing* and the iPad is online, the resolve
sets `fileUrl = /api/drive/file/<id>` and `fetch(networkUrl)` works.
That's not the failure path here — rows 4 and 6 are bonded to the same
fileId and rendered (so IDB held it, or the fetch succeeded), but row 5
failed.

The IDB-hit path is what dies: `blob:` → `fetch(blob:)` → "Failed to
load text file" on iPad WebKit. The dispatch's hypothesis ("text-viewer
skips the offline-idb `getFile()` helper PDFViewer + AudioViewer both
use") is the structural framing — the text viewer doesn't have ITS OWN
IDB hook the way the other viewers do, so it inherits the blob:-fetch
race rather than dodging it.

## Mime-stamping asymmetry (secondary explanation, NOT load-bearing)

`[[project_track_mimetype_gotcha]]` notes mime-stamping is asymmetric by
bind path. For the same `upload-046649f0-...` fileId:

- Rows 4 + 6: track.type undefined → falls back to `libMimeType` →
  `libMimeType` is likely `application/pdf` (uploaded via picker /
  modern MCP) → `isText: false`, `isImage: false` → PDF branch.
- Row 5: track.type === `'text'` (set by some legacy bind path) → forces
  `isText: true` regardless of libMimeType → TextScoreViewer branch.

This explains **why** the same fileId routes to two different viewers.
It does NOT explain the load failure — that's the blob:-fetch race on
TextScoreViewer's side. Fixing TextScoreViewer's offline pipe fixes the
load; fixing the asymmetric bind is a separate ingest-side lane (see
`.paul/research/ingest-mutator-matrix/FINDINGS.md` for the wider
treatment of this class of bug).

## What the bytes ARE

A PDF, presumably (the same bytes that render in PDFViewer rows 4 + 6).
When TextScoreViewer fetches them and calls `.text()`, the result is the
binary PDF interpreted as a (probably mojibake-y) string. The C5D-001
XSS regression path React-escapes any embedded markup, so even garbage
bytes render as visible text without script-execution risk — the chart
just looks wrong, not dangerous.

That mojibake render is irrelevant to F-1 — F-1's failure is at the
`fetch()` step, which never completes successfully. The row never gets
to render. (Whether the bind itself is wrong — track.type='text' on PDF
bytes — is the ingest-side question. Out of scope for this lane.)

## Fix shape

Converge with AudioViewer's pattern verbatim:

1. Change prop signature from `url: string` → `fileId: string`.
2. Resolve src in TextScoreViewer's own `useEffect`:
   - Try `getFile(fileId)` first.
   - On hit → `URL.createObjectURL(blob)` → fetch (it's the SAME
     blob:-fetch race the PDF path now skips; BUT in
     TextScoreViewer's case we need the *text*, so we can either
     `fetch(blob:)` it back into a string OR convert blob directly via
     `blob.text()`. Use `blob.text()` — that's the WebKit-safe path,
     it reads bytes through the Blob API directly without a `fetch`
     round-trip).
   - On miss → `fetch("/api/drive/file/<id>")` (network path, same as
     AudioViewer's fallback).
   - On IDB throw → fall through to network (defensive; `getFile` itself
     swallows so this catch arm is effectively dead, but mirrors
     AudioViewer for consistency).
   - Revoke any created object URL on unmount + fileId change.
3. Update PDFOverlay's dispatch site:
   - `<TextScoreViewer url={fileUrl} />` →
   - `<TextScoreViewer fileId={track.fileId} />`
   - PDFOverlay's `fileUrl` is now only used by SmartScore + Image
     branches (those still inherit the blob: pipe; **fixing them is out
     of scope** per dispatch — only the text viewer is in scope here).

## Why `blob.text()` over `fetch(blob:)`

`Blob.prototype.text()` is a direct read of the blob's bytes as a UTF-8
string. It does NOT go through the fetch infrastructure. The WebKit
"blob:-fetch race" the master-tip entry for `575bc47ae` describes is
specifically a `fetch()` call against a freshly-created object URL — it
does NOT bite the Blob API itself. `blob.text()` is what we want for the
IDB-hit path; `fetch(networkUrl).text()` is the network fallback.

This matches what PDFViewer does internally for the PDF path
(reads bytes directly as a `Uint8Array`, not via a `fetch()` of a blob:
URL).

## Out-of-scope per dispatch

- ⛔ PDFViewer / SmartScoreViewer / AudioViewer / ImageScoreViewer behavior unchanged.
- ⛔ PDFOverlay viewer-dispatch logic unchanged (only the prop passed to
  TextScoreViewer changes; the dispatch tree stays).
- ⛔ Library-side mime-stamping path NOT in scope (separate ingest-matrix fix lane).
- ⛔ SmartTransposer / use-smart-transposer DO-NOT-TOUCH.
- ⛔ bridge / monitor / firestore.rules / vercel.json changes.

## LOC estimate (vs dispatch ~50-100 LOC)

- TextScoreViewer.tsx: ~+25 LOC (add fileId-resolve effect, swap prop)
  and ~-2 LOC (drop the `url` prop reference in the load effect).
- PDFOverlay.tsx: ~+1 LOC (swap prop name + value), ~-1 LOC.
- text-score-viewer.test.tsx: ~+80 LOC for 5 new cases + existing 3
  XSS regression cases adapted to the new prop signature.

Total ~100-110 LOC, within dispatch's ~50-100 LOC budget bound (test
expansion is the bulk; the prod code change is small). If test
expansion overshoots, surface in SHIP-NOTICE per
`[[feedback_paul_phase_commits]]`-style honest bookkeeping.
