import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"

export async function GET() {
    try {
        const db = getFirestore()
        const snapshot = await db.collection('library_index').get()
        const allFiles = snapshot.docs.map(doc => doc.data())

        const EXPORTABLE_GOOGLE_TYPES = [
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet',
            'application/vnd.google-apps.presentation',
        ]
        const migratable = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            EXPORTABLE_GOOGLE_TYPES.includes(f.mimeType)
        )

        const failed = migratable.filter(f => f.storageFailed)
        const neverTried = migratable.filter(f => !f.storageCopiedAt && !f.storageFailed)
        const inStorage = migratable.filter(f => f.storageCopiedAt && !f.storageFailed)

        return NextResponse.json({
            migratable: migratable.length,
            neverTried: neverTried.length,
            failed: failed.length,
            inStorage: inStorage.length,
            failedFiles: failed.map(f => ({ name: f.name, mime: f.mimeType, err: f.storageError })),
            neverTriedFiles: neverTried.map(f => ({ name: f.name, mime: f.mimeType }))
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
