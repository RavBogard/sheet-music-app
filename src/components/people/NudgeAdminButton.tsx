"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { BellRing, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { useT } from "@/i18n/client"

export function NudgeAdminButton() {
    const { user } = useAuth()
    const t = useT()
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
            if (!res.ok) throw new Error(t("people.notifyFailed"))
            setNudged(true)
            toast.success(t("people.notified"))
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t("people.genericError"))
        } finally {
            setNudging(false)
        }
    }

    if (nudged) {
        return (
            <Button variant="outline" className="w-full gap-2 border-success/20 text-success bg-success/10 hover:bg-success/10" disabled>
                <CheckCircle2 className="w-4 h-4" />
                {t("people.adminNotified")}
            </Button>
        )
    }

    return (
        <Button variant="outline" onClick={handleNudge} disabled={nudging} className="w-full gap-2">
            <BellRing className={`w-4 h-4 ${nudging ? "animate-pulse" : ""}`} />
            {nudging ? t("people.notifying") : t("people.nudgeAdmin")}
        </Button>
    )
}
