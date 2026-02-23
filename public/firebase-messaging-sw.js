/**
 * Firebase Cloud Messaging Service Worker
 *
 * Handles background push notifications when the app is not in the foreground.
 * FCM requires this file at /firebase-messaging-sw.js
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Firebase config is received from the main app via postMessage.
// The SW waits for config before initializing Firebase.
let messaging = null

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        if (messaging) return // Already initialized
        try {
            firebase.initializeApp(event.data.config)
            messaging = firebase.messaging()
            messaging.onBackgroundMessage(handleBackgroundMessage)
        } catch (e) {
            // Already initialized (e.g. after SW update)
            try { messaging = firebase.messaging() } catch { /* ignore */ }
        }
    }
})

// Handle background messages
function handleBackgroundMessage(payload) {
    const { title, body } = payload.notification || {}
    if (!title) return

    const options = {
        body: body || '',
        icon: '/logo.jpg',
        badge: '/icon.svg',
        data: {
            url: payload.fcmOptions?.link || payload.data?.link || '/',
        },
    }

    self.registration.showNotification(title, options)
}

// Handle notification click — deep link into the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const url = event.notification.data?.url || '/'

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing window if available
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(url)
                    return client.focus()
                }
            }
            // Open new window
            return self.clients.openWindow(url)
        })
    )
})
