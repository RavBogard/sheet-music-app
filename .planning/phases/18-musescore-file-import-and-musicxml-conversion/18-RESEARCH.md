# Phase 18: MuseScore File Import and MusicXML Conversion - Research

**Researched:** 2026-03-18
**Domain:** MuseScore file formats (.mscz/.mscx), XML transformation, serverless file conversion
**Confidence:** MEDIUM

## Summary

This phase adds support for uploading MuseScore files (.mscz, .mscx) to the existing library upload flow, converting them server-side to MusicXML so they can be rendered by the existing OpenSheetMusicDisplay (OSMD) viewer. The critical insight from research is that **MSCX is NOT MusicXML** -- they are completely different XML schemas with different element structures, naming conventions, and organizational patterns. There is no simple rename or passthrough; a real transformation is required.

The most viable approach for this Vercel-hosted app is a **pure JavaScript XSLT-based conversion** using the `musicxml-mscx` library (which uses SaxonJS under the hood) or a custom lightweight XML transformer. The MuseScore CLI approach is ruled out because it requires a ~200MB GUI application with display server dependencies, which exceeds Vercel's 250MB function size limit and cannot run headless reliably in MuseScore 4. The project already has `jszip` installed (used in PrintModal) for extracting .mscz archives, and `opensheetmusicdisplay` for rendering the output MusicXML.

**Primary recommendation:** Use `jszip` (already installed) to extract .mscx from .mscz archives, then convert MSCX XML to MusicXML using an XSLT transform via SaxonJS on the server side. Store the converted MusicXML in Firebase Storage alongside the original file. Accept that conversion fidelity will be partial (basic notes, chords, rests, time signatures, key signatures) rather than pixel-perfect.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jszip | ^3.10.1 | Extract .mscx from .mscz ZIP archives | Already in project, proven ZIP handling |
| opensheetmusicdisplay | ^1.9.4 | Render converted MusicXML scores | Already the app's MusicXML renderer |
| firebase-admin | ^13.6.0 | Store converted files in Firebase Storage | Already the app's storage layer |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| saxon-js | ^2.x | XSLT 3.0 processor for Node.js | Server-side MSCX-to-MusicXML transformation |
| xslt3 | ^2.x | CLI for compiling XSLT to SEF (SaxonJS executable format) | Build step to pre-compile XSLT stylesheets |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SaxonJS XSLT | Custom JS XML parser | More control but vastly more code to write and maintain; XSLT handles tree transforms natively |
| SaxonJS XSLT | musicxml-mscx npm package | That package is not published to npm; would need to vendor or fork. Its XSLT sheets could be extracted and used directly with SaxonJS |
| Server-side conversion | Client-side conversion | Keeps server simple but increases client bundle size and parse time |
| MuseScore CLI | All JS approaches | Perfect fidelity but impossible on Vercel (250MB limit, requires GUI/display server) |
| External conversion API | In-process conversion | Adds external dependency, latency, cost; overkill for this use case |

**Installation:**
```bash
npm install saxon-js
npm install -D xslt3
```

## Architecture Patterns

### Recommended Conversion Flow
```
User uploads .mscz/.mscx
        |
        v
[UploadDialog] -- accepts .mscz, .mscx in addition to existing types
        |
        v
[POST /api/library/upload] -- detects file extension
        |
        v
  .mscz? ──> jszip.loadAsync(buffer) ──> extract .mscx file from ZIP
        |
        v
  .mscx XML ──> XSLT transform ──> MusicXML output
        |
        v
  Store BOTH: original .mscz/.mscx + converted .musicxml in Firebase Storage
        |
        v
  library_index entry: mimeType = 'application/vnd.recordare.musicxml+xml'
  (so the app treats it as MusicXML for rendering)
```

### File Storage Pattern
```
library/
  upload-{uuid}.mscz          # Original file (preserved for re-conversion)
  upload-{uuid}.xml            # Converted MusicXML (served for rendering)
```

### Pattern 1: MSCZ Extraction
**What:** Extract .mscx content from .mscz ZIP archive
**When to use:** Any .mscz file upload
**Example:**
```typescript
import JSZip from 'jszip'

async function extractMscx(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer)

    // MuseScore 4: .mscz contains a single .mscx file at root or in a subfolder
    // MuseScore 3: .mscz contains a .mscx file, possibly with images/thumbnails
    const mscxFile = Object.keys(zip.files).find(name => name.endsWith('.mscx'))

    if (!mscxFile) {
        throw new Error('No .mscx file found in .mscz archive')
    }

    return await zip.files[mscxFile].async('text')
}
```

### Pattern 2: MSCX to MusicXML Conversion
**What:** Transform MuseScore's proprietary XML to standard MusicXML
**When to use:** After extracting .mscx content
**Key challenge:** MSCX and MusicXML have fundamentally different structures:
- MSCX: `<Staff id="1"><Measure><voice>...</voice></Measure></Staff>`
- MusicXML: `<part id="P1"><measure number="1">...</measure></part>`

```typescript
// Option A: Using SaxonJS with pre-compiled XSLT
import SaxonJS from 'saxon-js'

async function convertMscxToMusicXml(mscxContent: string): Promise<string> {
    const result = await SaxonJS.transform({
        stylesheetFileName: 'path/to/mscx-to-musicxml.sef.json',
        sourceText: mscxContent,
        sourceType: 'xml',
        destination: 'serialized',
    }, 'async')

    return result.principalResult
}
```

### Pattern 3: Upload Route Extension
**What:** Extend the existing upload API to handle .mscz/.mscx files
**When to use:** Modification to existing `/api/library/upload/route.ts`

```typescript
// In the upload handler, after reading the buffer:
const ext = file.name.match(/\.(mscz|mscx)$/i)?.[1]?.toLowerCase()

if (ext === 'mscz' || ext === 'mscx') {
    // 1. Extract .mscx if needed
    const mscxContent = ext === 'mscz'
        ? await extractMscx(buffer)
        : buffer.toString('utf-8')

    // 2. Convert to MusicXML
    const musicXml = await convertMscxToMusicXml(mscxContent)

    // 3. Store original
    await uploadToStorage(`${fileId}-original`, buffer, 'application/octet-stream')

    // 4. Store converted MusicXML (this is what gets served)
    const xmlBuffer = Buffer.from(musicXml, 'utf-8')
    await uploadToStorage(fileId, xmlBuffer, 'application/xml')

    // 5. Set content type to XML for rendering
    contentType = 'application/xml'
}
```

### Anti-Patterns to Avoid
- **Attempting MuseScore CLI on Vercel:** The MuseScore binary is ~200MB, requires a display server (X11/Xvfb), and MuseScore 4 has regressed CLI support. This will never work on Vercel serverless.
- **Treating MSCX as MusicXML:** They are completely different XML schemas. Passing MSCX directly to OSMD will fail silently or throw parsing errors.
- **Client-side conversion:** Would bloat the client bundle with SaxonJS (~2MB+) and XSLT stylesheets. Server-side is the right place.
- **Storing only the converted file:** Always preserve the original .mscz/.mscx so the user can re-download it and conversion can be re-run if the transform improves.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP extraction | Custom ZIP parser | `jszip` (already installed) | ZIP format has many edge cases; jszip handles them all |
| XML tree transformation | Manual DOM walking + string building | XSLT via SaxonJS | XSLT is purpose-built for XML-to-XML transforms; manual approaches are fragile and incomplete |
| MSCX element mapping | Custom element-by-element mapper | Adapt XSLT from musicxml-mscx project | The musicxml-mscx project has already mapped the structural differences between formats |
| File type detection | Extension string matching only | Extension + magic bytes check | .mscz files are ZIP archives (PK magic bytes); .mscx files are XML (<?xml header) |

**Key insight:** The MSCX format is intentionally undocumented and changes between MuseScore versions. Building a custom parser means maintaining compatibility with an unstable, unversioned format. Using existing XSLT transforms from the open-source community is far more sustainable.

## Common Pitfalls

### Pitfall 1: MSCX Format Version Incompatibility
**What goes wrong:** MuseScore 3 and MuseScore 4 use different MSCX schemas. A converter built for one version may fail on the other.
**Why it happens:** The MSCX format has no stability guarantee and changes between major versions.
**How to avoid:** Check the `<programVersion>` element in the MSCX XML to detect the version. Support the most common version (MuseScore 4) first, with graceful degradation.
**Warning signs:** Conversion produces empty or malformed MusicXML for certain files.

### Pitfall 2: Incomplete Conversion Fidelity
**What goes wrong:** Not all musical notation translates perfectly between MSCX and MusicXML. Lyrics, complex articulations, custom formatting, and layout directives may be lost.
**Why it happens:** MSCX has MuseScore-specific elements (layout, style, playback settings) that have no MusicXML equivalent.
**How to avoid:** Set clear expectations: convert core musical content (notes, rests, chords, time/key signatures, parts, dynamics). Document what IS and ISN'T supported. Show a warning toast after conversion noting partial fidelity.
**Warning signs:** Users report "missing elements" in converted scores.

### Pitfall 3: Vercel Function Timeout on Large Scores
**What goes wrong:** Complex orchestral scores with many parts/measures could cause XSLT transformation to exceed the 60-second Hobby plan timeout.
**Why it happens:** XSLT processing is CPU-intensive; SaxonJS processes the entire document tree in memory.
**How to avoid:** The app's 25MB file size limit already constrains input size. Most single-instrument or small ensemble scores (the typical use case for a synagogue band) will process in seconds. Monitor and log conversion times.
**Warning signs:** Timeouts on upload for complex scores.

### Pitfall 4: MSCZ Files Without .mscx Inside
**What goes wrong:** Some .mscz files may have unexpected internal structure (e.g., MuseScore 4 uses a different ZIP layout than MuseScore 3).
**Why it happens:** MuseScore 4 may nest the .mscx file differently or include additional metadata files.
**How to avoid:** Search all ZIP entries for any file ending in `.mscx`, not just the root level. Log the ZIP structure if no .mscx is found for debugging.
**Warning signs:** "No .mscx file found" errors on files that open fine in MuseScore.

### Pitfall 5: MIME Type and File Extension Misalignment
**What goes wrong:** The upload handler currently validates against a whitelist of MIME types. Browsers may send .mscz files with `application/octet-stream` or `application/x-musescore`.
**Why it happens:** .mscz/.mscx are not standard MIME types; browsers fall back to generic types.
**How to avoid:** Validate by file extension (`.mscz`, `.mscx`) rather than MIME type for these formats. The existing code already does extension-based fallback validation.
**Warning signs:** Upload rejects valid .mscz files with "unsupported file type" error.

## Code Examples

### Existing Upload Handler Extension Points

The current upload handler at `src/app/api/library/upload/route.ts` validates file types at line 14:
```typescript
const ALLOWED_TYPES: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/xml': '.xml',
    'text/xml': '.xml',
    'application/vnd.recordare.musicxml+xml': '.musicxml',
    'application/vnd.recordare.musicxml': '.musicxml',
}
```

And at line 64 (extension-based fallback):
```typescript
if (!ALLOWED_TYPES[mimeType] && !file.name.match(/\.(pdf|xml|musicxml|mxl)$/i)) {
```

Both need `.mscz` and `.mscx` added.

### Existing Client Upload Acceptance
The `UploadDialog.tsx` at line 12:
```typescript
const ACCEPTED_TYPES = ".pdf,.xml,.musicxml,.mxl"
```
Needs `.mscz,.mscx` appended.

### Existing File Type Detection
The `queue-utils.ts` at line 13-17:
```typescript
const fileType = (() => {
    if (!track.fileId) return 'pdf'
    if (track.fileId.startsWith('db-') || track.fileId.endsWith('.musicxml') || ...) return 'musicxml'
    return 'pdf'
})()
```
Since converted files will be stored as `.xml` in Firebase Storage and the library_index entry will have `mimeType: 'application/xml'`, no changes needed here -- the file will already be served as MusicXML.

### Firebase Storage Path Pattern
From `firebase-storage.ts` line 34:
```typescript
function getStoragePath(fileId: string, mimeType?: string): string {
    let ext = mimeType?.includes('pdf') ? '.pdf'
        : mimeType?.includes('xml') ? '.xml'
            : mimeType?.includes('audio') ? '.mp3'
                : ''
    return `library/${fileId}${ext}`
}
```
Converted MusicXML will naturally get `.xml` extension. The original .mscz can be stored with a custom path like `library/originals/${fileId}.mscz`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MuseScore 3 CLI headless export | MuseScore 4 requires display server | 2023 (MS4 release) | CLI conversion on serverless is no longer viable |
| musicxml-mscx as standalone tool | Still the primary open-source XSLT converter | Ongoing | Only realistic JS-based conversion option |
| Manual XML DOM manipulation | XSLT transforms via SaxonJS | Stable | Purpose-built for this exact problem |

**Deprecated/outdated:**
- MuseScore 3 CLI headless mode: MuseScore 4 broke headless CLI support; requires Xvfb workaround
- Direct MSCX-as-MusicXML assumption: Never worked; formats are fundamentally different

## Open Questions

1. **XSLT Stylesheet Source**
   - What we know: The `musicxml-mscx` project has XSLT stylesheets for MSCX-to-MusicXML conversion
   - What's unclear: Whether those stylesheets can be directly extracted and used with SaxonJS, or need significant adaptation. The project is 59% XSLT code.
   - Recommendation: Clone the repo, extract the relevant XSLT files, compile them to SEF format for SaxonJS. If extraction is too complex, write a simpler custom XSLT covering core musical elements only.

2. **MuseScore 4 vs 3 Format Differences**
   - What we know: MSCX format changes between versions with no stability guarantee
   - What's unclear: Exact structural differences between MS3 and MS4 MSCX that affect conversion
   - Recommendation: Focus on MuseScore 4 format first (most likely version users have). Detect version from `<programVersion>` and warn on unsupported versions.

3. **Conversion Fidelity Expectations**
   - What we know: Full-fidelity conversion between proprietary and standard formats is extremely difficult
   - What's unclear: What level of fidelity is acceptable for the synagogue band use case
   - Recommendation: Target core notation (notes, rests, chords, key/time signatures, parts, dynamics). Accept that layout, lyrics, and advanced articulations may be lost. Show a conversion quality indicator.

4. **SaxonJS Bundle Size Impact**
   - What we know: SaxonJS is server-only (used in API route), so no client bundle impact
   - What's unclear: Exact size of SaxonJS + compiled XSLT in the serverless function bundle
   - Recommendation: Monitor the serverless function bundle size after adding SaxonJS. If it approaches 250MB limit, the XSLT can be loaded from a separate file.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.1 |
| Config file | vitest config in package.json or vitest.config.ts |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm run test:ci` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MS-01 | .mscz ZIP extraction yields .mscx content | unit | `npx vitest run src/lib/__tests__/musescore-converter.test.ts -t "extract"` | Wave 0 |
| MS-02 | .mscx XML converts to valid MusicXML | unit | `npx vitest run src/lib/__tests__/musescore-converter.test.ts -t "convert"` | Wave 0 |
| MS-03 | Upload API accepts .mscz/.mscx files | integration | `npx vitest run src/app/api/library/__tests__/upload-musescore.test.ts` | Wave 0 |
| MS-04 | Converted MusicXML renders in OSMD | manual-only | Manual test in browser | N/A |
| MS-05 | Original file preserved alongside conversion | unit | `npx vitest run src/lib/__tests__/musescore-converter.test.ts -t "preserve"` | Wave 0 |
| MS-06 | UploadDialog accepts .mscz/.mscx file types | unit | `npx vitest run src/components/library/__tests__/upload-dialog-musescore.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm run test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/musescore-converter.test.ts` -- covers MS-01, MS-02, MS-05
- [ ] `src/app/api/library/__tests__/upload-musescore.test.ts` -- covers MS-03
- [ ] `src/components/library/__tests__/upload-dialog-musescore.test.ts` -- covers MS-06
- [ ] Test fixture files: sample .mscz and .mscx files for unit tests
- [ ] `npm install saxon-js` and `npm install -D xslt3` -- new dependencies

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/app/api/library/upload/route.ts` -- current upload flow
- Existing codebase: `src/components/library/UploadDialog.tsx` -- current client upload UI
- Existing codebase: `src/components/music/SmartScoreViewer.tsx` -- OSMD rendering
- Existing codebase: `src/lib/firebase-storage.ts` -- storage patterns
- Existing codebase: `src/lib/queue-utils.ts` -- file type detection
- Existing codebase: `package.json` -- jszip already installed

### Secondary (MEDIUM confidence)
- [MuseScore File Formats Handbook](https://musescore.org/en/handbook/3/file-formats) -- .mscz is ZIP of .mscx + assets
- [musicxml-mscx GitHub](https://github.com/infojunkie/musicxml-mscx) -- XSLT-based bidirectional converter
- [MuseScore MSCX format discussion](https://musescore.org/en/node/41106) -- no official spec; format changes per version
- [Vercel Function Limits](https://vercel.com/docs/functions/limitations) -- 250MB bundle, 60s timeout (Hobby)
- [MusicXML 4.0 Structure](https://www.w3.org/2021/06/musicxml40/tutorial/structure-of-musicxml-files/) -- score-partwise format

### Tertiary (LOW confidence)
- SaxonJS programmatic API for Node.js -- based on npm package docs, needs validation during implementation
- musicxml-mscx XSLT stylesheet extractability -- needs hands-on testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- jszip and OSMD already installed and proven in the codebase; SaxonJS is the standard XSLT processor for Node.js
- Architecture: MEDIUM -- the conversion flow is straightforward but XSLT stylesheet availability/quality for MSCX-to-MusicXML is uncertain
- Pitfalls: HIGH -- well-documented issues with MuseScore format instability and Vercel constraints
- Conversion fidelity: LOW -- the exact quality of output depends heavily on the XSLT stylesheet used; may need iterative refinement

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (30 days -- stable domain, formats don't change frequently)
