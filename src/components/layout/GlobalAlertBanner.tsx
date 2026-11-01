"use client"

import { useEffect } from "react"
import { useAlertStore } from "@/lib/alert-store"
import { AlertCircle, Info, TriangleAlert } from "lucide-react"

export function GlobalAlertBanner() {
    const { alert, init } = useAlertStore()

    useEffect(() => {
        init()
    }, [init])

    if (!alert || !alert.visible || !alert.message) return null

    const config = {
        info: { bg: "bg-brand/10", border: "border-brand/20", text: "text-brand", icon: Info },
        warning: { bg: "bg-caution/10", border: "border-caution/20", text: "text-caution", icon: TriangleAlert },
        error: { bg: "bg-destructive/10", border: "border-destructive/20", text: "text-destructive", icon: AlertCircle },
    }
    const c = config[alert.type || "info"] || config.info
    const Icon = c.icon

    return (
        <div className={`w-full ${c.bg} ${c.border} border-b px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium ${c.text}`}>
            <Icon className="w-4 h-4 shrink-0" />
            <span>{alert.message}</span>
        </div>
    )
}
