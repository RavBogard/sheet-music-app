"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { BellRing, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"

export function NudgeAdminButton() {
    const { user } = useAuth()
    const [nudging, setNudging] = useState(false)
    const [nudged, setNudged] = useState(false)

    const handleNudge = async () => {
        if (!user) return
        setNudging(true)
        try {
            const token = await user.getIdToken()
            const res = await fetch("/api/nudge-admin", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (!res.ok) throw new Error("Failed to notify admins")
            setNudged(true)
            toast.success("Admins have been notified!")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Error")
        } finally {
            setNudging(false)
        }
    }

    if (nudged) {
        return (
            <Button variant="outline" className="w-full gap-2 border-green-500/20 text-green-600 bg-green-50 hover:bg-green-50" disabled>
                <CheckCircle2 className="w-4 h-4" />
                Admin Notified
            </Button>
        )
    }

    return (
        <Button variant="outline" onClick={handleNudge} disabled={nudging} className="w-full gap-2">
            <BellRing className={`w-4 h-4 ${nudging ? "animate-pulse" : ""}`} />
            {nudging ? "Notifying..." : "Nudge Admin"}
        </Button>
    )
}
