"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, CheckCircle, AlertCircle, Clock, ArchiveRestore, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase"
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore"
import { LibrarySyncCard } from "./library/LibrarySyncCard"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface ArchivedFile {
    id: string
    name: string
    displayName?: string
    archivedAt?: string
    archivedBy?: string
}

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
    const [archivedFiles, setArchivedFiles] = useState<ArchivedFile[]>([])
    const [archivedExpanded, setArchivedExpanded] = useState(false)
    const [archivedLoading, setArchivedLoading] = useState(false)
    const [restoringId, setRestoringId] = useState<string | null>(null)

    const loadArchived = useCallback(async () => {
        setArchivedLoading(true)
        try {
            const res = await apiFetch('/api/library/list?status=archived&all=true')
            if (res.ok) {
                const data = await res.json()
                setArchivedFiles(data.files || [])
            }
        } catch { /* silent */ } finally {
            setArchivedLoading(false)
        }
    }, [])

    const handleRestore = async (fileId: string) => {
        setRestoringId(fileId)
        try {
            const res = await apiFetch('/api/library/archive', {
                method: 'PATCH',
                body: JSON.stringify({ fileId, archive: false })
            })
            if (!res.ok) throw new Error("Failed to restore")
            toast.success("Song restored to library")
            setArchivedFiles(prev => prev.filter(f => f.id !== fileId))
        } catch {
            toast.error("Failed to restore song")
        } finally {
            setRestoringId(null)
        }
    }

    useEffect(() => {
        const load = async () => {
            try {
                // v4.3 P05: parallelize the two independent reads (~half the
                // wall-time for the admin Data tab first-paint).
                const syncRunsQuery = query(
                    collection(db, "sync_runs"),
                    orderBy("startedAt", "desc"),
                    limit(1)
                )
                const syncSnap = await getDocs(syncRunsQuery)
                if (!syncSnap.empty) {
                    const syncData = syncSnap.docs[0].data() as SyncRunData
                    setLastSync(syncData)
                    setFileCount(syncData.stats?.totalScanned ?? null)
                }
            } catch {
                // Silent -- will show "No sync data" state
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const statusIcon = lastSync?.status === 'completed'
        ? <CheckCircle className="w-5 h-5 text-success" />
        : lastSync?.status === 'failed'
            ? <AlertCircle className="w-5 h-5 text-destructive" />
            : lastSync?.status === 'running'
                ? <Loader2 className="w-5 h-5 text-brand animate-spin" />
                : <Clock className="w-5 h-5 text-muted-foreground" />

    const statusLabel = lastSync?.status === 'completed'
        ? 'Healthy'
        : lastSync?.status === 'failed'
            ? 'Last sync failed'
            : lastSync?.status === 'running'
                ? 'Syncing...'
                : 'No sync data'

    return (
        <div className="space-y-4">
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
                            <span className="text-sm font-medium text-foreground">{statusLabel}</span>
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
                                    <p className="text-destructive">Copy errors: {lastSync.stats.copyErrors}</p>
                                )}
                            </div>
                        )}
                        {fileCount !== null && (
                            <div className="pt-2 border-t border-border">
                                <p className="text-sm">
                                    <span className="font-semibold text-foreground">{fileCount}</span>
                                    <span className="text-muted-foreground ml-1">files in library</span>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Sync Now Card */}
                    <LibrarySyncCard />
                </div>
            )}

            {/* Archived Songs Section */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                    onClick={() => {
                        setArchivedExpanded(!archivedExpanded)
                        if (!archivedExpanded && archivedFiles.length === 0) loadArchived()
                    }}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {archivedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <h3 className="font-semibold text-sm text-foreground">Archived Songs</h3>
                        {archivedFiles.length > 0 && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                {archivedFiles.length}
                            </span>
                        )}
                    </div>
                </button>

                {archivedExpanded && (
                    <div className="border-t border-border">
                        {archivedLoading ? (
                            <div className="flex justify-center p-6">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : archivedFiles.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-4">No archived songs.</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {archivedFiles.map(file => (
                                    <div key={file.id} className="flex items-center justify-between px-4 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate text-foreground">
                                                {file.displayName || file.name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')}
                                            </p>
                                            {file.archivedAt && (
                                                <p className="text-xs text-muted-foreground">
                                                    Archived {formatDistanceToNow(new Date(file.archivedAt), { addSuffix: true })}
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 text-xs shrink-0 ml-3"
                                            disabled={restoringId === file.id}
                                            onClick={() => handleRestore(file.id)}
                                        >
                                            {restoringId === file.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <ArchiveRestore className="h-3.5 w-3.5" />
                                            )}
                                            Restore
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
