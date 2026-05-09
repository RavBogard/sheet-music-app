/**
 * Firebase Cloud Messaging Service Worker
 *
 * Handles background push notifications when the app is not in the foreground.
 * FCM requires this file at /firebase-messaging-sw.js
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Firebase config is received from URL parameters to ensure background execution works.
// Fallback to postMessage just in case it's registered the old way.
let messaging = null

const urlParams = new URL(location).searchParams
const initialConfig = {
    apiKey: urlParams.get('apiKey'),
    projectId: urlParams.get('projectId'),
    messagingSenderId: urlParams.get('messagingSenderId'),
    appId: urlParams.get('appId'),
}

if (initialConfig.apiKey && initialConfig.projectId) {
    try {
        firebase.initializeApp(initialConfig)
        messaging = firebase.messaging()
        messaging.onBackgroundMessage(handleBackgroundMessage)
    } catch (e) {
        // Already initialized
        try { messaging = firebase.messaging() } catch { /* ignore */ }
    }
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        if (messaging) return // Already initialized
        try {
            firebase.initializeApp(event.data.config)
            messaging = firebase.messaging()
            messaging.onBackgroundMessage(handleBackgroundMessage)
        } catch (e) {
            // Already initialized
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
