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
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function init() {
    if (getApps().length > 0) return
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (saJson) {
        initializeApp({ credential: cert(JSON.parse(saJson)) })
    } else {
        initializeApp({ credential: applicationDefault() })
    }
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
