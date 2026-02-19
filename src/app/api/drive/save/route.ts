
import { NextRequest, NextResponse } from "next/server";
import { DriveClient } from "@/lib/google-drive";
import { withAuth } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        // Rate limit: 10 uploads/min
        const limited = await checkRateLimit(req, 'upload')
        if (limited) return limited

        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        // 2. Parse Body
        const { sourceFileId, xmlContent, name } = await req.json();

        if (!sourceFileId || !xmlContent) {
            return NextResponse.json({ error: "Missing sourceFileId or xmlContent" }, { status: 400 });
        }

        const drive = new DriveClient();

        // 3. Get Parent Folder of source file
        const sourceMeta = await drive.getFileMetadata(sourceFileId) as { id?: string; name?: string; mimeType?: string; parents?: string[] };
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

    } catch (error: unknown) {
        logger.error("Save Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return NextResponse.json({ error: `Save Failed: ${(error instanceof Error ? error.message : "Unknown error")}` }, { status: 500 });
    }
}
