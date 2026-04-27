// One-shot READ-ONLY audit of production Firestore for v50-07 migration planning.
// Bound by .paul/phases/v50-07-migration-cutover/v50-07-01-PLAN.md.
// Run with: npx tsx scripts/audit-v50.ts
// Writes report to .paul/phases/v50-07-migration-cutover/v50-07-01-DRY-RUN-REPORT.md
//
// READ-ONLY: no setDoc / updateDoc / deleteDoc anywhere. Verifies migration
// marker state but does NOT mutate it. Invokes runMigration in dry-run mode
// only (which itself never writes).

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

import {
    runMigration,
    type MigrationDoc,
    type MigrationFirestore,
} from './migrate-v50'

dotenv.config({ path: '.env.local' })

const REPORT_PATH = path.join(
    '.paul',
    'phases',
    'v50-07-migration-cutover',
    'v50-07-01-DRY-RUN-REPORT.md',
)

interface SetlistTrackLike {
    songId?: string
    liturgicalSlot?: unknown
    [k: string]: unknown
}

interface SetlistAuditResult {
    totalCount: number
    withEmbeddedTracks: number
    totalEmbeddedTrackCount: number
    distinctEmbeddedSongIds: number
    sampleEmbeddedSetlistIds: string[]
    withLiveState: number
    sampleLiveStateSetlistIds: string[]
    embeddedTracksWithLiturgicalSlot: number
    setlistIdsWithEmbedded: Set<string>
    sampleTrackShapes: Array<{ setlistId: string; trackKeys: string[]; trackSample: Record<string, unknown> }>
    songsCollectionCount: number
    fieldFrequency: Record<string, number>
}

interface TracksAuditResult {
    totalCount: number
    distinctSetlistIdCount: number
    distinctSongIdCount: number
    tracksWithLiturgicalSlot: number
    setlistIdsWithTopLevel: Set<string>
}

interface SplitBrainDelta {
    legacyOnlyCount: number
    legacyOnlySamples: string[]
    topLevelOnlyCount: number
    topLevelOnlySamples: string[]
    bothCount: number
    bothSamples: string[]
}

interface OrphanAudit {
    chatsCount: number | 'absent'
    songGroupsCount: number | 'absent'
    configSongGroupsExists: boolean
}

interface MarkerAudit {
    exists: boolean
    appliedAt?: number
    affectedSongCount?: number
    // Set if the marker path in migrate-v50.ts is structurally invalid against real Firestore.
    pathBugDetected?: boolean
    pathBugMessage?: string
}

function sample<T>(arr: T[], n: number): T[] {
    return arr.slice(0, n)
}

async function auditMarker(
    db: FirebaseFirestore.Firestore,
): Promise<MarkerAudit> {
    // migrate-v50.ts uses MARKER_PATH = 'system/migrations/v50', which is a 3-segment
    // path. In Firestore, paths alternate collection/doc, so 3 segments = collection.
    // db.doc() on it throws. The script has never run against real Firestore (tests
    // use a fake adapter), so this bug never surfaced. Audit the collection contents
    // instead and surface the bug as a finding.
    const pathBugMessage =
        'migrate-v50.ts uses MARKER_PATH=\'system/migrations/v50\' which is a 3-segment Firestore path = collection, not document. db.doc(MARKER_PATH).get/set will throw `documentPath must point to a document` against real Firestore. Script must be patched in v50-07-02 before any apply attempt.'
    try {
        const collSnap = await db.collection('system/migrations/v50').get()
        if (collSnap.empty) {
            return {
                exists: false,
                pathBugDetected: true,
                pathBugMessage,
            }
        }
        // Treat any doc in this collection as marker presence. Pull the most-recent.
        const docs = collSnap.docs
            .map((d) => d.data() as Record<string, unknown>)
            .filter((d) => typeof d.appliedAt === 'number')
        const latest = docs.sort(
            (a, b) =>
                (b.appliedAt as number) - (a.appliedAt as number),
        )[0]
        return {
            exists: true,
            appliedAt:
                typeof latest?.appliedAt === 'number'
                    ? (latest.appliedAt as number)
                    : undefined,
            affectedSongCount:
                typeof latest?.affectedSongCount === 'number'
                    ? (latest.affectedSongCount as number)
                    : undefined,
            pathBugDetected: true,
            pathBugMessage,
        }
    } catch (err) {
        // If even the collection read fails, treat as absent and propagate bug note.
        return {
            exists: false,
            pathBugDetected: true,
            pathBugMessage: `${pathBugMessage}\nCollection read also failed: ${err instanceof Error ? err.message : String(err)}`,
        }
    }
}

async function auditSetlists(
    db: FirebaseFirestore.Firestore,
): Promise<SetlistAuditResult> {
    const snap = await db.collection('setlists').get()

    let withEmbeddedTracks = 0
    let totalEmbeddedTrackCount = 0
    const distinctSongIds = new Set<string>()
    const sampleEmbedded: string[] = []
    let withLiveState = 0
    const sampleLiveState: string[] = []
    let embeddedTracksWithLiturgicalSlot = 0
    const setlistIdsWithEmbedded = new Set<string>()
    const sampleTrackShapes: SetlistAuditResult['sampleTrackShapes'] = []
    const fieldFrequency: Record<string, number> = {}

    for (const doc of snap.docs) {
        const data = doc.data() ?? {}
        const tracks: SetlistTrackLike[] = Array.isArray(data.tracks)
            ? (data.tracks as SetlistTrackLike[])
            : []

        if (tracks.length > 0) {
            withEmbeddedTracks += 1
            totalEmbeddedTrackCount += tracks.length
            setlistIdsWithEmbedded.add(doc.id)
            if (sampleEmbedded.length < 5) sampleEmbedded.push(doc.id)
            // Capture track shape from first encountered setlist for the report
            if (sampleTrackShapes.length < 3 && tracks[0]) {
                const first = tracks[0] as Record<string, unknown>
                sampleTrackShapes.push({
                    setlistId: doc.id,
                    trackKeys: Object.keys(first).sort(),
                    trackSample: first,
                })
            }
            for (const t of tracks) {
                for (const k of Object.keys(t)) {
                    fieldFrequency[k] = (fieldFrequency[k] ?? 0) + 1
                }
                if (typeof t.songId === 'string' && t.songId.length > 0) {
                    distinctSongIds.add(t.songId)
                }
                if (
                    t.liturgicalSlot !== undefined &&
                    t.liturgicalSlot !== null
                ) {
                    embeddedTracksWithLiturgicalSlot += 1
                }
            }
        }

        if (data.liveState !== undefined && data.liveState !== null) {
            withLiveState += 1
            if (sampleLiveState.length < 5) sampleLiveState.push(doc.id)
        }
    }

    // Songs collection size — needed for migration filter analysis.
    const songsSnap = await db.collection('songs').get()
    const songsCollectionCount = songsSnap.size

    return {
        totalCount: snap.size,
        withEmbeddedTracks,
        totalEmbeddedTrackCount,
        distinctEmbeddedSongIds: distinctSongIds.size,
        sampleEmbeddedSetlistIds: sampleEmbedded,
        withLiveState,
        sampleLiveStateSetlistIds: sampleLiveState,
        embeddedTracksWithLiturgicalSlot,
        setlistIdsWithEmbedded,
        sampleTrackShapes,
        songsCollectionCount,
        fieldFrequency,
    }
}

async function auditTopLevelTracks(
    db: FirebaseFirestore.Firestore,
): Promise<TracksAuditResult> {
    const snap = await db.collection('tracks').get()

    const distinctSetlistIds = new Set<string>()
    const distinctSongIds = new Set<string>()
    let tracksWithLiturgicalSlot = 0

    for (const doc of snap.docs) {
        const data = doc.data() ?? {}
        if (typeof data.setlistId === 'string' && data.setlistId.length > 0) {
            distinctSetlistIds.add(data.setlistId)
        }
        if (typeof data.songId === 'string' && data.songId.length > 0) {
            distinctSongIds.add(data.songId)
        }
        if (data.liturgicalSlot !== undefined && data.liturgicalSlot !== null) {
            tracksWithLiturgicalSlot += 1
        }
    }

    return {
        totalCount: snap.size,
        distinctSetlistIdCount: distinctSetlistIds.size,
        distinctSongIdCount: distinctSongIds.size,
        tracksWithLiturgicalSlot,
        setlistIdsWithTopLevel: distinctSetlistIds,
    }
}

function computeSplitBrainDelta(
    embedded: Set<string>,
    topLevel: Set<string>,
): SplitBrainDelta {
    const legacyOnly: string[] = []
    const topLevelOnly: string[] = []
    const both: string[] = []

    for (const id of embedded) {
        if (topLevel.has(id)) both.push(id)
        else legacyOnly.push(id)
    }
    for (const id of topLevel) {
        if (!embedded.has(id)) topLevelOnly.push(id)
    }

    return {
        legacyOnlyCount: legacyOnly.length,
        legacyOnlySamples: sample(legacyOnly, 5),
        topLevelOnlyCount: topLevelOnly.length,
        topLevelOnlySamples: sample(topLevelOnly, 5),
        bothCount: both.length,
        bothSamples: sample(both, 5),
    }
}

async function auditOrphanCollections(
    db: FirebaseFirestore.Firestore,
): Promise<OrphanAudit> {
    let chatsCount: number | 'absent' = 'absent'
    try {
        const chatsSnap = await db.collection('chats').get()
        chatsCount = chatsSnap.size
    } catch {
        chatsCount = 'absent'
    }

    let songGroupsCount: number | 'absent' = 'absent'
    try {
        const sgSnap = await db.collection('songGroups').get()
        songGroupsCount = sgSnap.size
    } catch {
        songGroupsCount = 'absent'
    }

    let configSongGroupsExists = false
    try {
        const cfgSnap = await db.doc('config/songGroups').get()
        configSongGroupsExists = cfgSnap.exists
    } catch {
        configSongGroupsExists = false
    }

    return { chatsCount, songGroupsCount, configSongGroupsExists }
}

interface DryRunCapture {
    affectedSongCount: number
    sampleLines: string[]
    skippedAlreadyApplied: boolean
}

async function runDryRun(
    db: FirebaseFirestore.Firestore,
    FieldValue: typeof import('firebase-admin/firestore').FieldValue,
): Promise<DryRunCapture> {
    const captured: string[] = []
    const log = (msg: string): void => {
        captured.push(msg)
        // eslint-disable-next-line no-console
        console.log(msg)
    }

    const adapter: MigrationFirestore = {
        async getDoc(p) {
            // Intercept the broken marker path (3-segment = collection, not doc)
            // to keep the dry-run progressable. Real Firestore would throw here.
            if (p === 'system/migrations/v50') {
                return { exists: false, data: null }
            }
            const s = await db.doc(p).get()
            return {
                exists: s.exists,
                data: s.exists ? (s.data() as Record<string, unknown>) : null,
            }
        },
        async listCollection(p): Promise<MigrationDoc[]> {
            const s = await db.collection(p).get()
            return s.docs.map((d) => ({
                id: d.id,
                data: d.data() as Record<string, unknown>,
            }))
        },
        async setDoc() {
            throw new Error(
                'audit-v50: dry-run path must not call setDoc — bug',
            )
        },
        async updateDoc() {
            throw new Error(
                'audit-v50: dry-run path must not call updateDoc — bug',
            )
        },
        async deleteDoc() {
            throw new Error(
                'audit-v50: dry-run path must not call deleteDoc — bug',
            )
        },
    }
    void FieldValue

    const result = await runMigration(adapter, { mode: 'dry-run', log })
    return {
        affectedSongCount: result.affectedSongCount,
        sampleLines: captured.filter(
            (l) => l.startsWith('[DRY] ') || l.startsWith('[v50] '),
        ),
        skippedAlreadyApplied: !!result.skippedAlreadyApplied,
    }
}

function formatReport(args: {
    timestamp: string
    projectId: string
    marker: MarkerAudit
    setlists: SetlistAuditResult
    tracks: TracksAuditResult
    splitBrain: SplitBrainDelta
    orphans: OrphanAudit
    dryRun: DryRunCapture
}): string {
    const { timestamp, projectId, marker, setlists, tracks, splitBrain, orphans, dryRun } = args

    const bugBlock = marker.pathBugDetected
        ? `

> 🐛 **BUG FOUND in \`migrate-v50.ts\`:** ${marker.pathBugMessage}
>
> **Action required in v50-07-02:** patch \`MARKER_PATH\` to a valid 2-segment doc path (e.g., \`system/v50Migration\` or \`migrations/v50State\`). Same applies to any \`setDoc(MARKER_PATH, ...)\` call.`
        : ''

    const markerSection = marker.exists
        ? `**Marker docs found** in collection \`system/migrations/v50\`:
- latest appliedAt: ${marker.appliedAt ?? '?'} (${marker.appliedAt ? new Date(marker.appliedAt).toISOString() : 'unknown'})
- latest affectedSongCount: ${marker.affectedSongCount ?? '?'}

⚠️ Migration appears to have been applied previously (collection contains marker docs).${bugBlock}`
        : `**Marker collection empty / absent.** Migration has never been applied.${bugBlock}`

    return `# v50-07-01 DRY-RUN REPORT

Generated: ${timestamp}
Firebase project: \`${projectId}\`
Source script: \`scripts/audit-v50.ts\` (read-only)

---

## 1. Migration Marker

${markerSection}

---

## 2. Setlists Collection (\`setlists/*\`)

| Metric | Count |
|--------|-------|
| Total setlist documents | **${setlists.totalCount}** |
| Setlists with non-empty embedded \`tracks[]\` | **${setlists.withEmbeddedTracks}** |
| Total embedded track count (sum of all \`tracks[]\` lengths) | **${setlists.totalEmbeddedTrackCount}** |
| Distinct songIds referenced from embedded tracks | **${setlists.distinctEmbeddedSongIds}** |
| Setlists with non-null \`liveState\` field (v50-02 orphan) | **${setlists.withLiveState}** |
| Embedded tracks with \`liturgicalSlot\` field (v50-02 orphan) | **${setlists.embeddedTracksWithLiturgicalSlot}** |
| \`songs/*\` collection size | **${setlists.songsCollectionCount}** |

Sample setlist IDs with embedded tracks:
${setlists.sampleEmbeddedSetlistIds.length > 0 ? setlists.sampleEmbeddedSetlistIds.map((id) => `- \`${id}\``).join('\n') : '(none)'}

Sample setlist IDs with \`liveState\`:
${setlists.sampleLiveStateSetlistIds.length > 0 ? setlists.sampleLiveStateSetlistIds.map((id) => `- \`${id}\``).join('\n') : '(none)'}

### Embedded track field-frequency

How often each field appears across all ${setlists.totalEmbeddedTrackCount} embedded tracks. Helps identify whether the legacy shape uses \`songId\` (v5.0 expected), \`fileId\` (v1.x storage ref), or something else as the song reference.

| Field | Occurrences | % of tracks |
|-------|-------------|-------------|
${Object.entries(setlists.fieldFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => `| \`${field}\` | ${count} | ${setlists.totalEmbeddedTrackCount > 0 ? ((count / setlists.totalEmbeddedTrackCount) * 100).toFixed(1) : '0.0'}% |`)
    .join('\n')}

### Sample track shapes (first track from first 3 setlists)

${setlists.sampleTrackShapes.map((shape, i) => `**Setlist ${i + 1} (\`${shape.setlistId}\`)** — keys: \`${shape.trackKeys.join('`, `')}\`

\`\`\`json
${JSON.stringify(shape.trackSample, null, 2)}
\`\`\`
`).join('\n\n')}

---

## 3. Top-Level Tracks Collection (\`tracks/*\`)

| Metric | Count |
|--------|-------|
| Total track documents | **${tracks.totalCount}** |
| Distinct setlistId values | **${tracks.distinctSetlistIdCount}** |
| Distinct songId values | **${tracks.distinctSongIdCount}** |
| Tracks with \`liturgicalSlot\` field (v50-02 orphan) | **${tracks.tracksWithLiturgicalSlot}** |

---

## 4. Split-Brain Delta

Cross-reference of which setlists have embedded \`tracks[]\` vs. top-level \`tracks/{id}\` documents.

| Bucket | Count | Sample IDs |
|--------|-------|------------|
| **Legacy-only** (embedded tracks, NO top-level) | ${splitBrain.legacyOnlyCount} | ${splitBrain.legacyOnlySamples.length > 0 ? splitBrain.legacyOnlySamples.map((s) => `\`${s}\``).join(', ') : '—'} |
| **Top-level only** (no embedded, has top-level) | ${splitBrain.topLevelOnlyCount} | ${splitBrain.topLevelOnlySamples.length > 0 ? splitBrain.topLevelOnlySamples.map((s) => `\`${s}\``).join(', ') : '—'} |
| **Both** (embedded AND top-level — split-brain) | ${splitBrain.bothCount} | ${splitBrain.bothSamples.length > 0 ? splitBrain.bothSamples.map((s) => `\`${s}\``).join(', ') : '—'} |

---

## 5. Orphan v50-02 Data

v50-02 deleted the *code* for AI chat, song-groups, and live-swap UI but left the *data* in place per close note. This audit confirms what's still in production.

| Source | State |
|--------|-------|
| \`chats/*\` collection | ${typeof orphans.chatsCount === 'number' ? `**${orphans.chatsCount} docs**` : '_absent (✓)_'} |
| \`songGroups/*\` collection | ${typeof orphans.songGroupsCount === 'number' ? `**${orphans.songGroupsCount} docs**` : '_absent (✓)_'} |
| \`config/songGroups\` doc | ${orphans.configSongGroupsExists ? '**EXISTS**' : '_absent (✓)_'} |
| Setlists with \`liveState\` field | **${setlists.withLiveState}** (see Section 2) |
| Embedded tracks with \`liturgicalSlot\` | **${setlists.embeddedTracksWithLiturgicalSlot}** (see Section 2) |
| Top-level tracks with \`liturgicalSlot\` | **${tracks.tracksWithLiturgicalSlot}** (see Section 3) |

---

## 6. Dry-Run Output (existing \`migrate-v50.ts\`)

The existing script does ONLY the v50-04 song-defaults backfill (\`songs/{id}.defaults\` + \`recent[]\` from setlist \`tracks[]\` history). It does NOT reshape tracks or scrub orphans.

**Affected song count:** ${dryRun.affectedSongCount}
${dryRun.skippedAlreadyApplied ? '**Skipped:** marker already exists' : ''}

Captured output:
\`\`\`
${dryRun.sampleLines.join('\n')}
\`\`\`

---

## 7. Recommendation

_(Synthesized in Task 2 — see below.)_

`
}

async function main(): Promise<void> {
    const startedAt = new Date().toISOString()

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    if (!projectId || !clientEmail || !privateKey) {
        console.error(
            '[audit-v50] Missing Firebase Admin credentials in .env.local — aborting.',
        )
        console.error(
            '[audit-v50] Required: NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
        )
        process.exit(1)
    }

    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getFirestore, FieldValue } = await import(
        'firebase-admin/firestore'
    )

    if (getApps().length === 0) {
        initializeApp({
            credential: cert({ projectId, clientEmail, privateKey }),
        })
    }
    const db = getFirestore()

    console.log(`[audit-v50] Connected to project: ${projectId}`)
    console.log(`[audit-v50] Starting read-only audit at ${startedAt}`)
    console.log('')

    console.log('[audit-v50] 1/6 Checking migration marker...')
    const marker = await auditMarker(db)
    console.log(
        `[audit-v50]   Marker: ${marker.exists ? 'EXISTS (' + (marker.appliedAt ?? '?') + ')' : 'absent'}`,
    )

    console.log('[audit-v50] 2/6 Auditing setlists collection...')
    const setlists = await auditSetlists(db)
    console.log(
        `[audit-v50]   ${setlists.totalCount} setlists, ${setlists.withEmbeddedTracks} with embedded tracks, ${setlists.totalEmbeddedTrackCount} total embedded tracks`,
    )

    console.log('[audit-v50] 3/6 Auditing top-level tracks collection...')
    const tracks = await auditTopLevelTracks(db)
    console.log(
        `[audit-v50]   ${tracks.totalCount} top-level tracks, ${tracks.distinctSetlistIdCount} distinct setlistIds`,
    )

    console.log('[audit-v50] 4/6 Computing split-brain delta...')
    const splitBrain = computeSplitBrainDelta(
        setlists.setlistIdsWithEmbedded,
        tracks.setlistIdsWithTopLevel,
    )
    console.log(
        `[audit-v50]   Legacy-only: ${splitBrain.legacyOnlyCount}, Top-level only: ${splitBrain.topLevelOnlyCount}, Both: ${splitBrain.bothCount}`,
    )

    console.log('[audit-v50] 5/6 Auditing orphan v50-02 collections...')
    const orphans = await auditOrphanCollections(db)
    console.log(
        `[audit-v50]   chats: ${orphans.chatsCount}, songGroups: ${orphans.songGroupsCount}, config/songGroups: ${orphans.configSongGroupsExists ? 'exists' : 'absent'}`,
    )

    console.log('[audit-v50] 6/6 Running migrate-v50.ts dry-run...')
    const dryRun = await runDryRun(db, FieldValue)
    console.log(`[audit-v50]   Dry-run: ${dryRun.affectedSongCount} songs would be touched`)

    const reportBody = formatReport({
        timestamp: startedAt,
        projectId,
        marker,
        setlists,
        tracks,
        splitBrain,
        orphans,
        dryRun,
    })

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
    fs.writeFileSync(REPORT_PATH, reportBody, 'utf8')
    console.log('')
    console.log(`[audit-v50] Report written to ${REPORT_PATH}`)
    console.log(
        '[audit-v50] Audit complete. Production Firestore was NOT mutated.',
    )
}

const isMainModule =
    typeof require !== 'undefined' && require.main === module
if (isMainModule) {
    main().catch((err) => {
        console.error('[audit-v50] FATAL:', err)
        process.exit(1)
    })
}
