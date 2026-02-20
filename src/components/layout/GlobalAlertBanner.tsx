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
        info: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-600 dark:text-blue-400", icon: Info },
        warning: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-600 dark:text-yellow-400", icon: TriangleAlert },
        error: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-600 dark:text-red-400", icon: AlertCircle },
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
