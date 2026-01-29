
import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url)
        const folderId = url.searchParams.get("folderId")
        const query = url.searchParams.get("q") || ""
        const limitParam = parseInt(url.searchParams.get("limit") || "50")

        // 1. Auth Check (Optional: Could start open, but better protected)
        // For now, let's verify token if we want to restrict to members
        const authHeader = req.headers.get("Authorization")
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1]
            await verifyIdToken(token) // Just verify, don't block heavily yet
        }

        initAdmin()
        const db = getFirestore()

        let dbQuery: FirebaseFirestore.Query = db.collection('library_index')

        // 2. Filtering
        if (query) {
            // Firestore "Search" is tricky. We'll do a simple range filter on 'name'
            // Note: Case sensitivity is an issue with standard Firestore queries.
            // For a true "Search", we'd need a dedicated index (Algolia/Meilisearch).
            // TRICK: We will allow the Client to do simple filtering if the dataset is small (<2000 songs),
            // OR we do a basic prefix match here.

            // Prefix Filter: name >= query AND name <= query + '~'
            // This is case-sensitive.
            dbQuery = dbQuery
                .where('name', '>=', query)
                .where('name', '<=', query + '\uf8ff')
        } else if (folderId) {
            // Folder Navigation: Find items where 'parents' array contains folderId
            dbQuery = dbQuery.where('parents', 'array-contains', folderId)
        } else {
            // Root View? Or "All Songs"? 
            // If no folderId and no query, maybe we just show TOP LEVEL items?
            // But Drive 'parents' logic is tricky if we don't know the Root ID.
            // Strategy: If no params, show "All Docs" (maybe limit to 100 recent)
            dbQuery = dbQuery.orderBy('name').limit(limitParam)
        }

        // Execute
        const snapshot = await dbQuery.get()

        const files = snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                name: data.name,
                mimeType: data.mimeType,
                parents: data.parents,
                webViewLink: data.webViewLink
            }
        })

        return NextResponse.json({
            files,
            nextPageToken: null // Simple pagination for now
        })

    } catch (error: any) {
        console.error("Library List Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
