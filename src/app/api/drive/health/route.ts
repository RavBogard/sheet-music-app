import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'

/**
 * GET /api/drive/health
 * 
 * Diagnostic endpoint to check Google Drive and Firebase Storage connectivity.
 * Helps debug "Failed to load PDF" issues.
 */
export async function GET(request: NextRequest) {
    const results: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        checks: {} as Record<string, unknown>,
    }

    // Check 1: Google Drive credentials present
    const hasCredentials = !!(
        process.env.GOOGLE_CREDENTIALS_JSON ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
    )
    ;(results.checks as Record<string, unknown>).credentials = {
        present: hasCredentials,
        method: process.env.GOOGLE_CREDENTIALS_JSON ? 'json' : 'env-vars',
    }

    // Check 2: Firebase Storage bucket
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    ;(results.checks as Record<string, unknown>).storage = {
        bucket: storageBucket,
        explicit: !!process.env.FIREBASE_STORAGE_BUCKET,
    }

    // Check 3: Try to list a file from Drive (quick connectivity test)
    if (hasCredentials) {
        try {
            const { DriveClient } = await import("@/lib/google-drive")
            const drive = new DriveClient()
            // Try listing 1 file to verify connectivity
            const files = await drive.listAllFiles()
            ;(results.checks as Record<string, unknown>).driveAccess = {
                ok: true,
                fileCount: files.length,
                sample: files.slice(0, 3).map(f => ({ name: f.name, id: f.id, mimeType: f.mimeType })),
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error("[DriveHealth] Drive access failed:", msg)
            ;(results.checks as Record<string, unknown>).driveAccess = {
                ok: false,
                error: msg,
            }
        }
    }

    // Check 4: Test a specific fileId if provided
    const testFileId = request.nextUrl.searchParams.get('fileId')
    if (testFileId) {
        try {
            const { downloadFromStorage } = await import("@/lib/firebase-storage")
            const storageResult = await downloadFromStorage(testFileId)
            ;(results.checks as Record<string, unknown>).testFile = {
                fileId: testFileId,
                inStorage: !!storageResult,
                storageContentType: storageResult?.contentType,
                storageSize: storageResult?.buffer.byteLength,
            }

            if (!storageResult) {
                // Try Drive
                try {
                    const { DriveClient } = await import("@/lib/google-drive")
                    const drive = new DriveClient()
                    const metadata = await drive.getFileMetadata(testFileId)
                    ;(results.checks as Record<string, unknown>).testFile = {
                        ...(results.checks as Record<string, unknown>).testFile as object,
                        inDrive: true,
                        driveName: metadata.name,
                        driveMimeType: metadata.mimeType,
                    }
                } catch (e) {
                    ;(results.checks as Record<string, unknown>).testFile = {
                        ...(results.checks as Record<string, unknown>).testFile as object,
                        inDrive: false,
                        driveError: e instanceof Error ? e.message : String(e),
                    }
                }
            }
        } catch (e) {
            ;(results.checks as Record<string, unknown>).testFile = {
                fileId: testFileId,
                error: e instanceof Error ? e.message : String(e),
            }
        }
    }

    return NextResponse.json(results, {
        headers: { 'Cache-Control': 'no-store' },
    })
}
