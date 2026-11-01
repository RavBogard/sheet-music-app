"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, BellOff, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/lib/auth-context"
import {
    isPushSupported,
    getPushPermissionStatus,
    registerPushNotifications,
    unregisterPushNotifications,
} from "@/lib/push-notifications"
import { toast } from "sonner"
import { useT } from "@/i18n/client"

/**
 * Push notification preference toggle for Settings page.
 * Handles permission request, FCM token registration, and opt-out.
 */
export function PushNotificationSettings() {
    const { user } = useAuth()
    const t = useT()
    const [supported, setSupported] = useState(false)
    const [enabled, setEnabled] = useState(false)
    const [loading, setLoading] = useState(false)
    const [permStatus, setPermStatus] = useState<NotificationPermission | 'unsupported'>('default')

    useEffect(() => {
        const sup = isPushSupported()
        setSupported(sup)
        if (sup) {
            const status = getPushPermissionStatus()
            setPermStatus(status)
            // If permission was granted and we have a stored token, mark as enabled
            if (status === 'granted') {
                const storedToken = localStorage.getItem('crc_push_token')
                setEnabled(!!storedToken)
            }
        }
    }, [])

    const handleToggle = useCallback(async (checked: boolean) => {
        if (!user) return
        setLoading(true)

        try {
            if (checked) {
                const token = await registerPushNotifications(user.uid)
                if (token) {
                    localStorage.setItem('crc_push_token', token)
                    setEnabled(true)
                    setPermStatus('granted') // i18n-ignore: permission state value, not text
                    toast.success(t("settings.push.enabled"))
                } else {
                    const status = getPushPermissionStatus()
                    setPermStatus(status)
                    if (status === 'denied') {
                        toast.error(t("settings.push.blockedToast"))
                    } else {
                        toast.error(t("settings.push.enableFailed"))
                    }
                }
            } else {
                const token = localStorage.getItem('crc_push_token')
                if (token) {
                    await unregisterPushNotifications(user.uid, token)
                    localStorage.removeItem('crc_push_token')
                }
                setEnabled(false)
                toast.success(t("settings.push.disabled"))
            }
        } catch {
            toast.error(t("settings.push.updateFailed"))
        } finally {
            setLoading(false)
        }
    }, [user, t])

    if (!supported) {
        return (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <BellOff className="w-4 h-4" />
                {t("settings.push.unsupported")}
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <h3 id="push-notifications-title" className="text-sm font-bold text-foreground">{t("settings.push.title")}</h3>
                    <p id="push-notifications-desc" className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.push.description")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    <Switch
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        disabled={loading || permStatus === 'denied'}
                        aria-labelledby="push-notifications-title"
                        aria-describedby="push-notifications-desc"
                    />
                </div>
            </div>

            {permStatus === 'denied' && (
                <p className="text-xs text-caution">
                    {t("settings.push.blockedHint")}
                </p>
            )}
        </div>
    )
}
