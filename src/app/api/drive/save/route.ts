import { NextResponse } from "next/server";
import { DriveClient } from "@/lib/google-drive";
import { createApiHandler } from "@/lib/api-wrapper";
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

export const dynamic = 'force-dynamic'
export const maxDuration = 60;

const schema = z.object({
    sourceFileId: z.string().min(1),
    xmlContent: z.string().min(1),
    name: z.string().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 10 uploads/min
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        const { sourceFileId, xmlContent, name } = ctx.body!

        const drive = new DriveClient();

        // Get Parent Folder of source file
        const sourceMeta = await drive.getFileMetadata(sourceFileId) as { id?: string; name?: string; mimeType?: string; parents?: string[] };
        const parents = sourceMeta.parents || [];

        // Create New File
        const fileName = name || (sourceMeta.name ? sourceMeta.name.replace(/\.pdf$/i, '') + '.musicxml' : 'score.musicxml');

        const newFile = await drive.createFile({
            name: fileName,
            mimeType: 'application/vnd.recordare.musicxml+xml',
            content: xmlContent,
            parents: parents
        });

        return NextResponse.json({
            success: true,
            fileId: newFile.id,
            name: newFile.name
        }, { status: 201 });
    },
    { schema }
)
