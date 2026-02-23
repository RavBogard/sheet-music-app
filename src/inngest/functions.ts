import { inngest } from "./client"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { getFirestore, getStorage } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

export const generatePdfJob = inngest.createFunction(
    { id: "generate-pdf-job" },
    { event: "pdf/generate" },
    async ({ event, step }) => {
        const { jobId, uid, printReq } = event.data as {
            jobId: string
            uid: string
            printReq: PrintRequest
        }

        // Initialize progress logging via Firestore so the client can listen
        const db = getFirestore()
        const jobRef = db.collection("print_jobs").doc(jobId)

        await step.run("initialize-job", async () => {
            await jobRef.set({
                status: "processing",
                progress: 0,
                message: "Starting PDF generation...",
                createdAt: new Date().toISOString(),
                uid
            })
        })

        // Generate the PDF and save it immediately. This avoids returning a huge Uint8Array 
        // through the Inngest step serializer which enforces a 4MB payload limit.
        const { stats, downloadUrl } = await step.run("generate-and-save-pdf", async () => {
            const pdfResult = await generatePrintPdf(printReq, async (progress) => {
                await jobRef.update({
                    status: progress.phase,
                    progress: Math.round((progress.currentTrack / Math.max(1, progress.totalTracks)) * 100),
                    message: progress.message
                }).catch(err => logger.warn("[PDF Job] Progress update failed:", err))
            })

            const bucket = getStorage().bucket()
            const file = bucket.file(`print-jobs/${jobId}.pdf`)

            // Using Buffer.from is safe here since pdfResult.pdf never leaves this V8 closure
            const buffer = Buffer.from(pdfResult.pdf)
            await file.save(buffer, {
                contentType: 'application/pdf',
                metadata: {
                    cacheControl: 'public, max-age=86400', // 1 day
                    customMetadata: { generatedFor: uid },
                },
            })

            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 1000 * 60 * 60 * 24
            })

            return { stats: pdfResult.stats, downloadUrl: url }
        })

        // Mark the job as complete
        await step.run("complete-job", async () => {
            await jobRef.update({
                status: "complete",
                progress: 100,
                message: "PDF ready for download",
                downloadUrl,
                stats
            })
        })

        return { success: true, url: downloadUrl }
    }
)
