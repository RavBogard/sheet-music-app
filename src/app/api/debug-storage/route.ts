import { NextResponse } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { getStorage } from "firebase-admin/storage"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        initAdmin()
        const db = require('firebase-admin/firestore').getFirestore()
        const doc = await db.collection('library_index').doc('upload-a06055c4-c67b-4f7c-8d1b-de4cc0082915').get()
        
        return NextResponse.json({
            success: true,
            exists: doc.exists,
            data: doc.data()
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
    }
}
