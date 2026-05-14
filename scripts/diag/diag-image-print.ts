// One-shot READ-ONLY diagnostic for the v70-01-02 UAT failure:
// "the png file isn't displaying in the printed packet".
//
// Bisects the image-chart print chain by inspecting production data:
//   1. library_index entries with image/* mimeType — where the upload landed
//   2. actual Storage object path — library/{id} (no ext) vs library/{id}.png
//   3. songs/{id} mirror — does it carry mimeType?
//   4. tracks/* bound to those image fileIds — is track.mimeType persisted?
//      (this is THE bisection point: if track.mimeType is missing, the print
//      pipeline's isImageTrack() never matches and the image is never embedded)
//
// Read-only. Safe against production.

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'crcmusiccharts'
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const bucketName = process.env.FIREBASE_STORAGE_BUCKET
    || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    || `${projectId}.firebasestorage.app`

console.log('env: projectId=', projectId, 'clientEmail set?', !!clientEmail, 'privateKey set?', !!privateKey, 'bucket=', bucketName)

if (!clientEmail || !privateKey) {
    console.error('Missing admin SDK credentials in .env.local')
    process.exit(1)
}

if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: bucketName })
}
const db = getFirestore()
const bucket = getStorage().bucket(bucketName)

async function objectExists(path: string): Promise<boolean> {
    try {
        const [exists] = await bucket.file(path).exists()
        return exists
    } catch {
        return false
    }
}

async function main() {
    // ── 1. Find image-typed library_index entries ──
    console.log('\n=== library_index entries with image/* mimeType ===')
    // mimeType range query: 'image/' .. 'image0' captures image/png + image/jpeg
    const imgLib = await db.collection('library_index')
        .where('mimeType', '>=', 'image/')
        .where('mimeType', '<', 'image0')
        .limit(50)
        .get()
    console.log('matches:', imgLib.size)

    const imageFileIds: string[] = []
    for (const d of imgLib.docs) {
        const data = d.data()
        imageFileIds.push(d.id)
        console.log('\n  library_index/' + d.id)
        console.log('    name:', data.name, '| status:', data.status, '| mimeType:', data.mimeType)
        console.log('    storageUrl:', data.storageUrl)

        // ── 2. Where are the bytes ACTUALLY stored? ──
        const noExt = `library/${d.id}`
        const pngPath = `library/${d.id}.png`
        const jpgPath = `library/${d.id}.jpg`
        const [hasNoExt, hasPng, hasJpg] = await Promise.all([
            objectExists(noExt), objectExists(pngPath), objectExists(jpgPath),
        ])
        console.log(`    storage: ${noExt} → ${hasNoExt} | ${pngPath} → ${hasPng} | ${jpgPath} → ${hasJpg}`)

        // ── 3. songs/{id} mirror ──
        const songDoc = await db.collection('songs').doc(d.id).get()
        console.log('    songs/' + d.id + ' exists?', songDoc.exists,
            songDoc.exists ? '| mimeType: ' + JSON.stringify(songDoc.data()?.mimeType) : '')
    }

    if (imageFileIds.length === 0) {
        console.log('\n  NO image-typed library_index entries found — Daniel may not have an image chart uploaded, or mimeType is stored differently.')
    }

    // ── 4. tracks/* bound to those image fileIds — IS track.mimeType PERSISTED? ──
    console.log('\n=== tracks/* bound to image fileIds (the bisection point) ===')
    for (const fileId of imageFileIds) {
        const trackSnap = await db.collection('tracks').where('fileId', '==', fileId).limit(20).get()
        console.log(`\n  tracks where fileId == ${fileId}: ${trackSnap.size} match(es)`)
        trackSnap.docs.forEach((t) => {
            const data = t.data()
            console.log('    track/' + t.id, JSON.stringify({
                title: data.title,
                setlistId: data.setlistId,
                fileId: data.fileId,
                fileName: data.fileName,
                mimeType: data.mimeType,   // ← if undefined, isImageTrack() never matches in print
                type: data.type,
            }))
        })
    }

    // ── 5. Recent setlists for context (which one did Daniel print?) ──
    console.log('\n=== 5 most-recent setlists ===')
    const recentSetlists = await db.collection('setlists').orderBy('updatedAt', 'desc').limit(5).get()
    recentSetlists.docs.forEach((s) => {
        const data = s.data()
        console.log('  setlists/' + s.id, JSON.stringify({
            name: data.name, trackCount: data.trackCount, fileIds: data.fileIds, hydrated: data.hydrated,
        }))
    })
}

main().catch((err) => {
    console.error('ERR:', err.message)
    process.exit(1)
}).then(() => process.exit(0))
