"use client"

import { ConnectionStatus } from "@/lib/firestore-monitor-client"
import { Wifi, WifiOff, Loader2 } from "lucide-react"

interface ConnectionIndicatorProps {
    status: ConnectionStatus
    error?: string | null
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
    connected: { color: "text-green-500", label: "Connected" },
    connecting: { color: "text-yellow-500", label: "Connecting..." },
    disconnected: { color: "text-muted-foreground", label: "Disconnected" },
    error: { color: "text-red-500", label: "Error" },
}

export function ConnectionIndicator({ status, error }: ConnectionIndicatorProps) {
    const config = STATUS_CONFIG[status]
    const isLoading = status === "connecting"

    return (
        <div className={`flex items-center gap-2 text-xs ${config.color}`}>
            {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : status === "connected" ? (
                <Wifi className="w-3.5 h-3.5" />
            ) : (
                <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{error || config.label}</span>
        </div>
    )
}
