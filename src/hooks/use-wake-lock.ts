import { useState, useEffect, useCallback, useRef } from "react"
import { logger } from "@/lib/logger"

export function useWakeLock() {
    const [isLocked, setIsLocked] = useState(false)
    const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
    // Track whether we *should* be locked (survives sentinel releases)
    const shouldLockRef = useRef(false)

    const acquireLock = useCallback(async () => {
        if (!('wakeLock' in navigator)) {
            logger.warn('Wake Lock API not supported')
            return
        }
        try {
            const lock = await navigator.wakeLock.request('screen')
            setWakeLock(lock)
            setIsLocked(true)
            logger.info('Wake Lock active')

            lock.addEventListener('release', () => {
                logger.info('Wake Lock released')
                setIsLocked(false)
                setWakeLock(null)
            })
        } catch (err) {
            // Expected: low battery, background tab, or system restriction
            logger.error('Failed to acquire Wake Lock:', err)
        }
    }, [])

    const requestWakeLock = useCallback(async () => {
        shouldLockRef.current = true
        await acquireLock()
    }, [acquireLock])

    const releaseWakeLock = useCallback(async () => {
        shouldLockRef.current = false
        if (wakeLock) {
            try {
                await wakeLock.release()
                setWakeLock(null)
                setIsLocked(false)
            } catch (err) {
                logger.error('Failed to release Wake Lock:', err)
            }
        }
    }, [wakeLock])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            shouldLockRef.current = false
            if (wakeLock) {
                wakeLock.release().catch(e => logger.error("Wake lock release:", e))
            }
        }
    }, [wakeLock])

    // Auto re-acquire on visibility change (tab switch, iOS notification, etc.)
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && shouldLockRef.current) {
                await acquireLock()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [acquireLock])

    return { isLocked, requestWakeLock, releaseWakeLock }
}
