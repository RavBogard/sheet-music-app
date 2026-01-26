import { useState, useEffect, useCallback } from 'react';

export function useWakeLock() {
    const [isLocked, setIsLocked] = useState(false);
    const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                // @ts-ignore - types might be missing for some environments
                const lock = await navigator.wakeLock.request('screen');
                setWakeLock(lock);
                setIsLocked(true);
                console.log('Wake Lock active');

                lock.addEventListener('release', () => {
                    console.log('Wake Lock released');
                    setIsLocked(false);
                    setWakeLock(null);
                });
            } catch (err) {
                console.error('Failed to acquire Wake Lock:', err);
            }
        } else {
            console.warn('Wake Lock API not supported');
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLock) {
            try {
                await wakeLock.release();
                setWakeLock(null);
                setIsLocked(false);
            } catch (err) {
                console.error('Failed to release Wake Lock:', err);
            }
        }
    }, [wakeLock]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (wakeLock) {
                wakeLock.release().catch(console.error);
            }
        };
    }, [wakeLock]);

    // Re-acquire on visibility change (e.g. tab switching)
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && !wakeLock) {
                // Optionally re-acquire if it was supposed to be locked
                // For now, we leave it manual or controlled by the component
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [wakeLock]);

    return { isLocked, requestWakeLock, releaseWakeLock };
}
