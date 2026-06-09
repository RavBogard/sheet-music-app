import { NextResponse } from "next/server"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { coerceOrgId } from "@/lib/org/registry"
import { z } from "zod"

export const maxDuration = 120

// No Firestore write — .passthrough() is acceptable here; tracks are
// forwarded to the PDF print pipeline and not persisted.
const schema = z.object({
    title: z.string().min(1),
    tracks: z.array(z.any()).min(1),
}).passthrough()

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const body = ctx.body! as unknown as PrintRequest
        // v11-05-04: per-org print footer. The gig-packet POST has no setlist to
        // read orgId from; the host is authoritative — override any client-sent
        // org with the proxy's resolved x-org-id (crc default → bare doc).
        body.org = coerceOrgId(ctx.req.headers.get("x-org-id"))

        const result = await generatePrintPdf(body)
        const filename = `${(body.title || 'Gig_Packet').replace(/[^a-z0-9]/gi, '_')}.pdf`

        logger.info(`[Print] Generated: ${result.stats.appendedTracks} tracks, ${result.stats.transposedTracks} transposed`)

        return new NextResponse(Buffer.from(result.pdf), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })
    },
    { schema }
)
