"use client"

import { useState, useEffect } from "react"
import { Database, Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { db } from "@/lib/firebase"
import { collection, query, orderBy, limit, getDocs, getCountFromServer } from "firebase/firestore"
import { LibrarySyncCard } from "./library/LibrarySyncCard"
import { formatDistanceToNow } from "date-fns"

interface SyncRunData {
    startedAt: string
    completedAt: string | null
    status: 'running' | 'completed' | 'failed'
    stats?: {
        totalScanned?: number
        added?: number
        updated?: number
        deleted?: number
        copiedToStorage?: number
        copyErrors?: number
    }
    errors?: Array<{ fileId: string; fileName: string; error: string }>
}

export function LibraryDataSection() {
    const [lastSync, setLastSync] = useState<SyncRunData | null>(null)
    const [fileCount, setFileCount] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                // Get latest sync run
                const syncRunsQuery = query(
                    collection(db, "sync_runs"),
                    orderBy("startedAt", "desc"),
                    limit(1)
                )
                const syncSnap = await getDocs(syncRunsQuery)
                if (!syncSnap.empty) {
                    setLastSync(syncSnap.docs[0].data() as SyncRunData)
                }

                // Get file count from library_index
                const countSnap = await getCountFromServer(collection(db, "library_index"))
                setFileCount(countSnap.data().count)
            } catch {
                // Silent -- will show "No sync data" state
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const statusIcon = lastSync?.status === 'completed'
        ? <CheckCircle className="w-4 h-4 text-success" />
        : lastSync?.status === 'failed'
            ? <AlertCircle className="w-4 h-4 text-red-500" />
            : lastSync?.status === 'running'
                ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                : <Clock className="w-4 h-4 text-muted-foreground" />

    const statusLabel = lastSync?.status === 'completed'
        ? 'Healthy'
        : lastSync?.status === 'failed'
            ? 'Last sync failed'
            : lastSync?.status === 'running'
                ? 'Syncing...'
                : 'No sync data'

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-teal-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Library
                </h2>
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Sync Status Card */}
                    <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                        <h3 className="font-semibold text-foreground text-sm">Sync Status</h3>
                        <div className="flex items-center gap-2">
                            {statusIcon}
                            <span className="text-sm font-medium">{statusLabel}</span>
                        </div>
                        {lastSync?.completedAt && (
                            <p className="text-xs text-muted-foreground">
                                Last sync: {formatDistanceToNow(new Date(lastSync.completedAt), { addSuffix: true })}
                            </p>
                        )}
                        {lastSync?.stats && (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                                <p>Scanned: {lastSync.stats.totalScanned ?? 0}</p>
                                {(lastSync.stats.added ?? 0) > 0 && <p>Added: {lastSync.stats.added}</p>}
                                {(lastSync.stats.updated ?? 0) > 0 && <p>Updated: {lastSync.stats.updated}</p>}
                                {(lastSync.stats.copyErrors ?? 0) > 0 && (
                                    <p className="text-red-400">Copy errors: {lastSync.stats.copyErrors}</p>
                                )}
                            </div>
                        )}
                        {fileCount !== null && (
                            <div className="pt-2 border-t border-border">
                                <p className="text-sm">
                                    <span className="font-semibold">{fileCount}</span>
                                    <span className="text-muted-foreground ml-1">files in library</span>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Sync Now Card */}
                    <LibrarySyncCard />
                </div>
            )}
        </section>
    )
}
