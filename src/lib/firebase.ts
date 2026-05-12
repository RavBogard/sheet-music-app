import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore, FirestoreSettings, persistentLocalCache, persistentSingleTabManager, setLogLevel } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";

import { env } from "./env";
import { logger } from "@/lib/logger"

const firebaseConfig = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Singleton pattern to prevent multiple initializations in dev hot-reloads
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let googleProvider: GoogleAuthProvider;

try {
    if (getApps().length > 0) {
        app = getApp();
    } else if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
    } else {
        // Prevent crash during build if env vars are missing
        logger.warn("Firebase API Key missing. Using mock app.");
        app = {} as unknown as FirebaseApp;
    }

    if (firebaseConfig.apiKey) {
        // Use WebChannel streaming (the default) for best performance.
        // All Firestore listeners share a single multiplexed connection,
        // giving ~200-500ms faster cold reads vs the old long-polling config.
        //
        // Historical note: Long polling was previously enabled to suppress
        // AbortError console noise in Firebase SDK <12.5. That bug is fixed
        // in v12.9+, so we use the default streaming transport now.

        // Suppress harmless "Detected an update time that is in the future" clock-skew warnings
        setLogLevel("error");

        try {
            db = initializeFirestore(app, {
                // persistentSingleTabManager: each tab manages its own IDB independently.
                // Eliminates the cross-tab IDB version coordination that caused the
                // "Firestore shutting down" cascade when multiple tabs were open and
                // one tab's IDB upgrade fired onversionchange across all others.
                // Tradeoff: each tab opens its own Firestore WebChannel instead of sharing
                // one — fine for a small band app.
                localCache: persistentLocalCache({
                    tabManager: persistentSingleTabManager({}),
                }),
            } as FirestoreSettings);
        } catch (e1) {
            // Persistence may fail in private browsing or restricted environments.
            // Fall back to in-memory cache (no offline persistence).
            try {
                db = initializeFirestore(app, {} as FirestoreSettings);
            } catch {
                // Already initialized (e.g. hot reload)
                db = getFirestore(app);
            }
            logger.warn("Firestore offline persistence unavailable, using network-only", e1);
        }
        auth = getAuth(app);
        googleProvider = new GoogleAuthProvider();
        googleProvider.addScope('profile');
    } else {
        db = {} as unknown as Firestore
        auth = {} as unknown as Auth
        googleProvider = new GoogleAuthProvider()
        googleProvider.addScope('profile');
    }

} catch (e) {
    logger.error("Firebase Initialization Failed", e);
    app = {} as unknown as FirebaseApp;
    db = {} as unknown as Firestore;
    auth = {} as unknown as Auth;
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('profile');
}

/**
 * Delete all Firestore-related IndexedDB databases.
 * Used to recover from corrupted persistence state left by the old PWA service worker.
 * Safe to call on server (no-ops) and in browsers without indexedDB.databases() support.
 */
export async function clearFirestoreIndexedDB(): Promise<void> {
    if (typeof window === "undefined" || !window.indexedDB) return

    try {
        // Modern browsers: enumerate all IDB databases
        if (typeof indexedDB.databases === "function") {
            const dbs = await indexedDB.databases()
            for (const dbInfo of dbs) {
                if (dbInfo.name && /firestore/i.test(dbInfo.name)) {
                    indexedDB.deleteDatabase(dbInfo.name)
                    logger.info(`[FirestoreRecovery] Deleted IndexedDB: ${dbInfo.name}`)
                }
            }
        } else {
            // Safari <17 fallback: delete known Firestore DB name pattern
            const projectId = firebaseConfig.projectId
            if (projectId) {
                const knownName = `firestore/[default]/${projectId}/main`
                indexedDB.deleteDatabase(knownName)
                logger.info(`[FirestoreRecovery] Deleted IndexedDB (fallback): ${knownName}`)
            }
        }
    } catch (e) {
        logger.warn("[FirestoreRecovery] Failed to clear Firestore IndexedDB", e)
    }
}

// Auto-recovery: detect Firestore assertion failures at runtime and clear corrupted IDB
if (typeof window !== "undefined") {
    const RECOVERY_FLAG = "firestore-idb-recovery-attempted"

    // Clear the recovery flag on clean load so future assertion failures can still trigger recovery.
    window.addEventListener("load", () => {
        sessionStorage.removeItem(RECOVERY_FLAG)
    })

    window.addEventListener("unhandledrejection", async (event) => {
        const msg = String(event.reason?.message || event.reason || "")
        if (
            (msg.includes("INTERNAL ASSERTION FAILED") || msg.includes("Unexpected state")) &&
            !sessionStorage.getItem(RECOVERY_FLAG)
        ) {
            logger.warn("[FirestoreRecovery] Detected Firestore assertion failure, clearing IndexedDB and reloading")
            sessionStorage.setItem(RECOVERY_FLAG, "1")
            await clearFirestoreIndexedDB()
            window.location.reload()
        }
    })

    // When a new deployment lands, the service worker updates and fires controllerchange.
    // That triggers an IndexedDB onversionchange event which terminates all Firestore
    // listeners with "Firestore shutting down". Reloading after the new SW takes control
    // prevents the cascade — the fresh page opens Firestore against the already-bumped
    // IDB version with no version conflict.
    // Delay 3 seconds to let any in-flight Firestore writes (setlist edits, etc.) drain
    // before the page reloads.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            logger.info("[FirestoreRecovery] Service worker updated — reloading in 3s to prevent Firestore shutdown cascade")
            setTimeout(() => window.location.reload(), 3000)
        })
    }
}

/**
 * Call from any Firestore onSnapshot error handler.
 *
 * If the error is "Firestore shutting down" (caused by a multi-tab IDB
 * version change when a new deployment lands), reloads the page once to
 * recover.
 *
 * One-shot per session — NOT debounced. T2.3 fix (2026-05-12): the
 * previous comment claimed "Debounced: subsequent calls within 5s are
 * no-ops" but the flag was never reset, so behavior was effectively
 * permanent. Renamed to `_shutdownRecoveryAttempted` to match
 * semantics. Locked-in design decision: a recurring shutdown error
 * that doesn't resolve after the first reload means something is
 * deeply broken; bombarding the user with reloads doesn't help. If
 * the first reload fails to resolve, surface to Sentry instead of
 * looping.
 */
let _shutdownRecoveryAttempted = false
export function recoverFromFirestoreShutdown(err: unknown): void {
    if (typeof window === 'undefined') return
    const msg = String((err as Error)?.message || err || '')
    if (!msg.toLowerCase().includes('shutting down')) return
    if (_shutdownRecoveryAttempted) return
    _shutdownRecoveryAttempted = true
    logger.warn('[FirestoreRecovery] Firestore shut down — reloading in 1.5s')
    setTimeout(() => window.location.reload(), 1500)
}

export { app, db, auth, googleProvider };
