
import { NextRequest, NextResponse } from "next/server";
import { DriveClient } from "@/lib/google-drive";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

initAdmin();

export async function POST(req: NextRequest) {
    try {
        // 1. Admin Check
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.split("Bearer ")[1];
        await getAuth().verifyIdToken(token);

        // 2. Parse Body
        const { sourceFileId, xmlContent, name } = await req.json();

        if (!sourceFileId || !xmlContent) {
            return NextResponse.json({ error: "Missing sourceFileId or xmlContent" }, { status: 400 });
        }

        const drive = new DriveClient();

        // 3. Get Parent Folder of source file
        const sourceMeta = await drive.getFileMetadata(sourceFileId) as any;
        const parents = sourceMeta.parents || [];

        // 4. Create New File
        // Name defaults to "{OriginalName}.musicxml" if not provided
        const fileName = name || (sourceMeta.name ? sourceMeta.name.replace(/\.pdf$/i, '') + '.musicxml' : 'score.musicxml');

        const newFile = await drive.createFile({
            name: fileName,
            mimeType: 'application/vnd.recordare.musicxml+xml', // Standard mime? or text/xml
            content: xmlContent,
            parents: parents
        });

        return NextResponse.json({
            success: true,
            fileId: newFile.id,
            name: newFile.name
        });

    } catch (error: any) {
        console.error("Save Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return NextResponse.json({ error: `Save Failed: ${error.message}` }, { status: 500 });
    }
}
