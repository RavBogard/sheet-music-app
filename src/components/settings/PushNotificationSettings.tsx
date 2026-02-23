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

/**
 * Push notification preference toggle for Settings page.
 * Handles permission request, FCM token registration, and opt-out.
 */
export function PushNotificationSettings() {
    const { user } = useAuth()
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
                    setPermStatus('granted')
                    toast.success("Push notifications enabled")
                } else {
                    const status = getPushPermissionStatus()
                    setPermStatus(status)
                    if (status === 'denied') {
                        toast.error("Notifications blocked by browser. Check your browser settings.")
                    } else {
                        toast.error("Could not enable push notifications")
                    }
                }
            } else {
                const token = localStorage.getItem('crc_push_token')
                if (token) {
                    await unregisterPushNotifications(user.uid, token)
                    localStorage.removeItem('crc_push_token')
                }
                setEnabled(false)
                toast.success("Push notifications disabled")
            }
        } catch {
            toast.error("Failed to update notification settings")
        } finally {
            setLoading(false)
        }
    }, [user])

    if (!supported) {
        return (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <BellOff className="w-4 h-4" />
                Push notifications are not supported in this browser.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Push Notifications</h3>
                        <p className="text-sm text-muted-foreground">
                            Get notified when setlists are published or updated
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    <Switch
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        disabled={loading || permStatus === 'denied'}
                    />
                </div>
            </div>

            {permStatus === 'denied' && (
                <p className="text-xs text-amber-500 pl-[52px]">
                    Notifications are blocked by your browser. Open your browser&apos;s notification settings to allow them.
                </p>
            )}
        </div>
    )
}
