"use client"

import { useState, useEffect } from "react"
import { DatabaseBackup, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"

interface BackupInfo {
    lastBackupAt?: { toDate?: () => Date } | Date | string
    lastBackupType?: 'gcs' | 'logical'
    lastBackupCounts?: Record<string, number>
}

/**
 * Admin card showing backup status and a manual backup trigger.
 */
export function BackupCard() {
    const [info, setInfo] = useState<BackupInfo | null>(null)
    const [backing, setBacking] = useState(false)

    useEffect(() => {
        const ref = doc(db, 'config', 'backup')
        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                setInfo(snap.data() as BackupInfo)
            }
        }, () => {})
        return () => unsub()
    }, [])

    const handleBackup = async () => {
        setBacking(true)
        try {
            const res = await apiFetch('/api/cron/backup', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                toast.success(data.message || "Backup completed")
            } else {
                toast.error(data.error || "Backup failed")
            }
        } catch {
            toast.error("Backup request failed")
        } finally {
            setBacking(false)
        }
    }

    const lastDate = (() => {
        if (!info?.lastBackupAt) return null
        if (typeof info.lastBackupAt === 'string') return new Date(info.lastBackupAt)
        if (info.lastBackupAt instanceof Date) return info.lastBackupAt
        if (typeof info.lastBackupAt === 'object' && 'toDate' in info.lastBackupAt && info.lastBackupAt.toDate) {
            return info.lastBackupAt.toDate()
        }
        return null
    })()

    return (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
                <DatabaseBackup className="h-4 w-4 text-green-400" />
                <h3 className="text-sm font-semibold">Database Backups</h3>
            </div>

            {lastDate ? (
                <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-muted-foreground">
                        Last backup: {lastDate.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        })}
                    </span>
                    {info?.lastBackupType && (
                        <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {info.lastBackupType}
                        </span>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2 text-sm text-amber-500">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No backups recorded yet
                </div>
            )}

            {info?.lastBackupCounts && (
                <div className="text-xs text-muted-foreground space-x-3">
                    {Object.entries(info.lastBackupCounts).map(([col, count]) => (
                        <span key={col}>{col}: {count}</span>
                    ))}
                </div>
            )}

            <Button
                size="sm"
                variant="outline"
                onClick={handleBackup}
                disabled={backing}
                className="gap-2"
            >
                {backing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                    <DatabaseBackup className="w-3.5 h-3.5" />
                )}
                Backup Now
            </Button>
        </div>
    )
}
