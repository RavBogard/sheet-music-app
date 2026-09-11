import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { generatePdfJob, importBatchJob } from "@/inngest/functions"

// Create an API that serves zero-config routing
export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        generatePdfJob,
        importBatchJob
    ],
})
