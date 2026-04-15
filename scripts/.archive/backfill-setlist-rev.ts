/**
 * One-shot migration: stamp every setlist doc with an `updatedAt` timestamp.
 *
 * v4.2 Phase 1.1 (Concurrent-edit Safety) uses `updatedAt` as the concurrency
 * token — every write is run inside a transaction that verifies the client's
 * `expectedUpdatedAt` matches the server's current value. Legacy docs without
 * `updatedAt` need a starting stamp so the precondition can work. Any doc
 * missing the field is skipped-by-convention on first write (precondition=null),
 * but seeding the field up-front makes the check robust and avoids surprises.
 *
 * Idempotent: second run touches 0 docs.
 *
 * Run:
 *   npx tsx scripts/backfill-setlist-rev.ts
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

function init() {
    if (getApps().length > 0) return
    const serviceAccount = {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        throw new Error('Missing Firebase admin credentials in .env.local')
    }
    initializeApp({ credential: cert(serviceAccount) })
}

async function main() {
    init()
    const db = getFirestore()
    const snap = await db.collection('setlists').get()

    let touched = 0
    let skipped = 0
    const batchLimit = 400
    let batch = db.batch()
    let inBatch = 0

    for (const doc of snap.docs) {
        const data = doc.data()
        if (!Object.prototype.hasOwnProperty.call(data, 'updatedAt') || data.updatedAt == null) {
            batch.update(doc.ref, { updatedAt: FieldValue.serverTimestamp() })
            touched++
            inBatch++
            if (inBatch >= batchLimit) {
                await batch.commit()
                batch = db.batch()
                inBatch = 0
            }
        } else {
            skipped++
        }
    }

    if (inBatch > 0) await batch.commit()

    console.log(JSON.stringify({ total: snap.size, touched, skipped }, null, 2))
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
