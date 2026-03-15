import { NextResponse } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { getStorage } from "firebase-admin/storage"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        initAdmin()
        const db = require('firebase-admin/firestore').getFirestore()
        const b = require('firebase-admin/storage').getStorage().bucket()
        const [allFiles] = await b.getFiles()
        
        return NextResponse.json({
            success: true,
            recentFiles: allFiles.map((f: any) => ({ name: f.name, timeCreated: f.metadata.timeCreated }))
                .sort((a: any, b: any) => new Date(b.timeCreated || 0).getTime() - new Date(a.timeCreated || 0).getTime())
                .slice(0, 20)
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
    }
}
