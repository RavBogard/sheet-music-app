/**
 * One-shot migration: strip the legacy `isPublic` field from every setlist doc.
 *
 * v4.0 declared "all setlists public" but left `isPublic` in the schema and in
 * several code paths that hardcoded `false`. v4.1 removes the field from code;
 * this script removes it from existing Firestore data so stale values stop
 * affecting any ad-hoc query tooling.
 *
 * Idempotent: second run touches 0 docs.
 *
 * Run:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json pnpm tsx scripts/migrate-remove-isPublic.ts
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
        if (Object.prototype.hasOwnProperty.call(data, 'isPublic')) {
            batch.update(doc.ref, { isPublic: FieldValue.delete() })
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
