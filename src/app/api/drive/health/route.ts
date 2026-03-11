import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/drive/health
 *
 * Diagnostic endpoint to check Google Drive and Firebase Storage connectivity.
 * Helps debug "Failed to load PDF" issues.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const results: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
            checks: {} as Record<string, unknown>,
        }

        const hasCredentials = !!(
            process.env.GOOGLE_CREDENTIALS_JSON ||
            (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
        )
        ;(results.checks as Record<string, unknown>).credentials = {
            present: hasCredentials,
            method: process.env.GOOGLE_CREDENTIALS_JSON ? 'json' : 'env-vars',
        }

        const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ||
            `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
        ;(results.checks as Record<string, unknown>).storage = {
            bucket: storageBucket,
            explicit: !!process.env.FIREBASE_STORAGE_BUCKET,
        }

        if (hasCredentials) {
            try {
                const { DriveClient } = await import("@/lib/google-drive")
                const drive = new DriveClient()
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

        const testFileId = ctx.req.nextUrl.searchParams.get('fileId')
        if (testFileId) {
            try {
                const { downloadFromStorage } = await import("@/lib/firebase-storage")
                const storageResult = await downloadFromStorage(testFileId)
                const inStorage = storageResult.success
                ;(results.checks as Record<string, unknown>).testFile = {
                    fileId: testFileId,
                    inStorage,
                    storageContentType: inStorage ? storageResult.data.contentType : undefined,
                    storageSize: inStorage ? storageResult.data.buffer.byteLength : undefined,
                }

                if (!inStorage) {
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
    },
    { role: 'admin' }
)
