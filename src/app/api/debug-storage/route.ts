import { NextResponse } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { getStorage } from "firebase-admin/storage"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        initAdmin()
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
        const bucket = getStorage().bucket(bucketName)
        
        const [files] = await bucket.getFiles({ prefix: 'library/upload-' })
        
        return NextResponse.json({
            success: true,
            bucket: bucketName,
            files: files.map(f => ({
                name: f.name,
                contentType: f.metadata.contentType,
                size: f.metadata.size,
                created: f.metadata.timeCreated
            })).sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime()).slice(0, 20)
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
    }
}
