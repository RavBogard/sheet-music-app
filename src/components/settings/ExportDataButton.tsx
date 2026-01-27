"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSetlistService } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"

export function ExportDataButton() {
    const { user } = useAuth()
    const [exporting, setExporting] = useState(false)

    const handleExport = async () => {
        if (!user) return

        setExporting(true)
        const toastId = toast.loading("Preparing backup...")

        try {
            const service = createSetlistService(user.uid, user.displayName)

            // 1. Fetch all Personal Setlists
            // We need a "get all" method. `subscribeToPersonalSetlists` is realtime.
            // We can treat it as a one-off subscription.

            const fetchSetlists = () => new Promise<any[]>((resolve, reject) => {
                const unsubscribe = service.subscribeToPersonalSetlists((data) => {
                    unsubscribe() // Unsub immediately after first fetch
                    resolve(data)
                })
                // Timeout safety?
                setTimeout(() => reject(new Error("Timeout")), 5000)
            })

            const setlists = await fetchSetlists()

            const backup = {
                version: 1,
                date: new Date().toISOString(),
                user: { uid: user.uid, name: user.displayName },
                setlists
            }

            // 2. Download JSON
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `sheet-music-backup-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            toast.success(`Exported ${setlists.length} setlists`, { id: toastId })

        } catch (e: any) {
            console.error(e)
            toast.error("Export failed", { description: e.message, id: toastId })
        } finally {
            setExporting(false)
        }
    }

    if (!user) return null

    return (
        <Button onClick={handleExport} variant="outline" disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Backup Data
        </Button>
    )
}
