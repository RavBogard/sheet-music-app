"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAlertStore } from "@/lib/alert-store"
import { toast } from "sonner"

export function GlobalAlertCard() {
    const { alert, loading, init, setAlert } = useAlertStore()
    const [msg, setMsg] = useState("")
    const [type, setType] = useState<"info" | "warning" | "error">("info")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        init()
    }, [init])

    useEffect(() => {
        if (alert) {
            setMsg(alert.message)
            setType(alert.type || "info")
        }
    }, [alert])

    const handleSave = async (visible: boolean) => {
        setSaving(true)
        try {
            await setAlert({ visible, message: msg, type })
            toast.success(visible ? "Global alert published" : "Global alert hidden")
        } catch (e) {
            toast.error("Failed to update global alert")
        } finally {
            setSaving(false)
        }
    }

    if (loading) return null

    return (
        <div className="bg-card border border-border p-4 rounded-xl space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                Global Alert Banner
            </h4>
            <p className="text-xs text-muted-foreground">
                Display a persistent message at the top of the entire application.
            </p>

            <div className="space-y-3">
                <Input
                    placeholder="e.g. 'Rehearsal moved to Sunday 5pm due to snow'"
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                />

                <div className="flex gap-2">
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value as any)}
                        className="bg-muted text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                        <option value="info">Info (Blue)</option>
                        <option value="warning">Warning (Yellow)</option>
                        <option value="error">Urgent (Red)</option>
                    </select>
                </div>

                <div className="flex gap-2 pt-2">
                    <Button
                        size="sm"
                        variant="default"
                        disabled={saving || !msg.trim()}
                        onClick={() => handleSave(true)}
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {alert?.visible ? "Update Banner" : "Publish Banner"}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={saving || !alert?.visible}
                        onClick={() => handleSave(false)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                        Disable
                    </Button>
                </div>
            </div>
        </div>
    )
}
