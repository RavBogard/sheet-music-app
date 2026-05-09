/**
 * Push Notifications via Firebase Cloud Messaging (FCM)
 *
 * Client-side:
 *   - Request notification permission
 *   - Get FCM token
 *   - Store token in user's Firestore profile
 *
 * Server-side (API routes):
 *   - Send push notifications via Firebase Admin SDK
 *   - Called from broadcastNotification / createNotification paths
 *
 * This module handles the client-side portion.
 */

import { db } from "./firebase"
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore"
import { logger } from "./logger"

/**
 * Request notification permission and register for push notifications.
 * Stores the FCM token in the user's Firestore profile.
 *
 * Returns the token on success, or null if denied/unavailable.
 */
export async function registerPushNotifications(uid: string): Promise<string | null> {
    try {
        // Check browser support
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            logger.info('[Push] Notifications not supported in this browser')
            return null
        }

        // Request permission
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
            logger.info('[Push] Notification permission denied')
            return null
        }

        // Register the messaging SW with the Firebase config as URL parameters
        // This ensures the SW always has the config even on cold starts from background notifications
        const swUrl = new URL('/firebase-messaging-sw.js', window.location.origin)
        if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) swUrl.searchParams.set('apiKey', process.env.NEXT_PUBLIC_FIREBASE_API_KEY)
        if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) swUrl.searchParams.set('projectId', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
        if (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) swUrl.searchParams.set('messagingSenderId', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)
        if (process.env.NEXT_PUBLIC_FIREBASE_APP_ID) swUrl.searchParams.set('appId', process.env.NEXT_PUBLIC_FIREBASE_APP_ID)

        const swRegistration = await navigator.serviceWorker.register(swUrl.toString())

        // Get FCM token
        const { getMessaging, getToken } = await import('firebase/messaging')
        const { app } = await import('./firebase')
        const messaging = getMessaging(app)

        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
        if (!vapidKey) {
            logger.warn('[Push] VAPID key not configured')
            return null
        }

        const token = await getToken(messaging, { vapidKey })
        if (!token) {
            logger.warn('[Push] Failed to get FCM token')
            return null
        }

        // Store token in user's Firestore profile
        const userRef = doc(db, 'users', uid)
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(token),
        })

        logger.info('[Push] Registered for push notifications')
        return token
    } catch (err) {
        logger.warn('[Push] Registration failed:', err)
        return null
    }
}

/**
 * Unregister push notifications by removing the FCM token.
 */
export async function unregisterPushNotifications(uid: string, token: string): Promise<void> {
    try {
        const userRef = doc(db, 'users', uid)
        await updateDoc(userRef, {
            fcmTokens: arrayRemove(token),
        })
        logger.info('[Push] Unregistered from push notifications')
    } catch (err) {
        logger.warn('[Push] Unregistration failed:', err)
    }
}

/**
 * Check if push notifications are currently enabled for this browser.
 */
export function isPushSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator
}

/**
 * Get the current notification permission status.
 */
export function getPushPermissionStatus(): NotificationPermission | 'unsupported' {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
}
