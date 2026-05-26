import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCustomToken, Auth } from "firebase/auth";

// firestore is dynamic-imported by `getDb()` — keeping it out of the
// module-top graph moves the firestore SDK chunk (~236 KB) out of
// /login's preload graph. See `.paul/research/bundle-diet-firestore-lazy-import/FINDINGS.md`
// for the cold-start cost analysis.
import type { Firestore, FirestoreSettings } from "firebase/firestore";

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
        auth = getAuth(app);
        googleProvider = new GoogleAuthProvider();
        googleProvider.addScope('profile');
    } else {
        auth = {} as unknown as Auth
        googleProvider = new GoogleAuthProvider()
        googleProvider.addScope('profile');
    }

} catch (e) {
    logger.error("Firebase Initialization Failed", e);
    app = {} as unknown as FirebaseApp;
    auth = {} as unknown as Auth;
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('profile');
}

/**
 * Lazy-initialized Firestore singleton. The firestore SDK module is
 * dynamic-imported on first call, so it lives in its own webpack chunk
 * instead of being eagerly bundled into every client route's initial
 * preload graph.
 *
 * Why a Promise (Pattern A) and not a top-level await: avoid blocking
 * the parent module's load on a (potentially slow) IDB probe. Callers
 * `await getDb()` at the entry of their async path; subsequent calls
 * return the cached promise.
 *
 * The cache strategy (persistentLocalCache vs memoryLocalCache) is
 * decided at first-call time using the same `storageOk` localStorage
 * probe as the pre-lazy version. WebChannel + setLogLevel('error') +
 * persistent-single-tab manager behavior is preserved verbatim.
 *
 * Historical note: long polling was previously enabled to suppress
 * AbortError console noise in Firebase SDK <12.5. That bug is fixed
 * in v12.9+, so we use the default streaming transport now.
 */
let firestorePromise: Promise<Firestore> | null = null;

/**
 * Cancellation-token wrapper for the async-init-returns-sync-unsub
 * pattern. Use this for `onSnapshot`-style subscribers where the
 * caller treats the return value as a synchronous unsubscribe
 * function but the underlying firestore SDK is now lazy-loaded.
 *
 * ```ts
 * const unsub = subscribeWithDb(db => {
 *   const ref = doc(db, "setlists", id)
 *   return onSnapshot(ref, snap => ...)
 * })
 * // Later, sync:
 * unsub()
 * ```
 *
 * If unsub() runs before the firestore promise resolves, the inner
 * subscription is never attached — cleanup is correct.
 */
export type Unsubscribe = () => void;
export function subscribeWithDb(
    setup: (db: Firestore) => Unsubscribe,
): Unsubscribe {
    let inner: Unsubscribe | null = null;
    let cancelled = false;
    void getDb().then((db) => {
        if (cancelled) return;
        inner = setup(db);
    }).catch((e) => {
        logger.error("[firebase] subscribeWithDb setup threw", e);
    });
    return () => {
        cancelled = true;
        if (inner) {
            try { inner(); } catch (e) { logger.warn("[firebase] inner unsub threw", e); }
            inner = null;
        }
    };
}

export function getDb(): Promise<Firestore> {
    if (firestorePromise) return firestorePromise;
    if (!firebaseConfig.apiKey) {
        // No config — return a mock that preserves the pre-lazy
        // "throws on use" shape rather than blocking the caller.
        firestorePromise = Promise.resolve({} as unknown as Firestore);
        return firestorePromise;
    }
    firestorePromise = (async () => {
        const {
            initializeFirestore,
            getFirestore,
            persistentLocalCache,
            persistentSingleTabManager,
            memoryLocalCache,
            setLogLevel,
        } = await import("firebase/firestore");

        // Suppress harmless "Detected an update time that is in the future" clock-skew warnings
        setLogLevel("error");

        // v60-13-04 (2026-05-13): probe IndexedDB synchronously before choosing
        // the Firestore cache strategy. Daniel UAT showed the dashboard
        // subscription HANGING (no success, no error) in incognito Chrome —
        // the persistentLocalCache config tries to write to IDB and silently
        // blocks the listener when the browser restricts storage. Detect that
        // up front and use memoryLocalCache instead (no offline persistence,
        // but the listener actually fires).
        //
        // Probe heuristic: try localStorage write+read+delete. If it throws
        // OR returns nothing, the browser is in a restricted-storage mode
        // (Safari private, Firefox private, Chrome with site data blocked,
        // etc.) and IDB is also likely restricted.
        const storageOk = (() => {
            if (typeof window === 'undefined') return false  // SSR — doesn't matter
            try {
                const k = '__crc_storage_probe__'
                window.localStorage.setItem(k, '1')
                const ok = window.localStorage.getItem(k) === '1'
                window.localStorage.removeItem(k)
                return ok
            } catch {
                return false
            }
        })()

        try {
            const db = initializeFirestore(app, storageOk ? {
                // persistentSingleTabManager: each tab manages its own IDB independently.
                // Eliminates the cross-tab IDB version coordination that caused the
                // "Firestore shutting down" cascade when multiple tabs were open and
                // one tab's IDB upgrade fired onversionchange across all others.
                // Tradeoff: each tab opens its own Firestore WebChannel instead of sharing
                // one — fine for a small band app.
                localCache: persistentLocalCache({
                    tabManager: persistentSingleTabManager({}),
                }),
            } : {
                // v60-13-04: incognito / restricted-storage path. memoryLocalCache
                // means no offline persistence — but the listener fires immediately
                // instead of hanging on a blocked IDB write. Acceptable tradeoff
                // for incognito since the user has no expectation of persistence.
                localCache: memoryLocalCache(),
            } as FirestoreSettings);
            if (!storageOk) {
                logger.warn("Firestore: restricted-storage detected (likely incognito) — using memory cache, no offline persistence");
            }
            return db;
        } catch (e1) {
            // Persistence may fail in private browsing or restricted environments.
            // Fall back to in-memory cache (no offline persistence).
            try {
                return initializeFirestore(app, { localCache: memoryLocalCache() } as FirestoreSettings);
            } catch {
                // Already initialized (e.g. hot reload)
                return getFirestore(app);
            } finally {
                logger.warn("Firestore persistent cache failed at init, fell back to memory cache", e1);
            }
        }
    })();
    return firestorePromise;
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

// Detect Firestore IDB assertion failures at runtime and prompt the user
// to recover via a sticky toast. NEVER auto-reload — the previous
// auto-reload + load-event-clears-flag combination produced infinite
// reload loops on persistent corruption ("site refreshes within a few
// seconds" bug, root-cause-fixed 2026-05-17).
//
// The sessionStorage flag is now genuinely one-shot per tab: it survives
// reloads (until tab close) and is no longer cleared by a `load` handler.
// One toast per tab. If the user dismisses without acting, that's their
// call — we don't escalate.
if (typeof window !== "undefined") {
    const RECOVERY_FLAG = "firestore-idb-recovery-attempted"

    window.addEventListener("unhandledrejection", (event) => {
        const msg = String(event.reason?.message || event.reason || "")
        const isAssertionFailure =
            msg.includes("INTERNAL ASSERTION FAILED") || msg.includes("Unexpected state")
        if (!isAssertionFailure) return
        if (sessionStorage.getItem(RECOVERY_FLAG)) return  // already prompted this tab

        sessionStorage.setItem(RECOVERY_FLAG, "1")
        logger.warn("[FirestoreRecovery] Firestore IDB assertion failure — prompting user")
        // Dynamic import keeps sonner out of the module-top dep graph (firebase.ts
        // is imported very early; sonner is a UI lib).
        void import("sonner").then(({ toast }) => {
            toast.error("Sync error", {
                description: "Local cache is corrupted. Reload to clear it and reconnect.",
                duration: Infinity,
                action: {
                    label: "Reload",
                    onClick: () => {
                        void clearFirestoreIndexedDB().finally(() => window.location.reload())
                    },
                },
            })
        })
    })

    // The `controllerchange` auto-reload handler that used to live here was
    // removed (2026-05-17). With the serwist PWA retired (see
    // next.config.ts + public/sw.js tombstone), `controllerchange` only
    // ever fires now for the Firebase Messaging SW updating itself —
    // harmless, no reload needed. The old handler waited for engine drain
    // and then reloaded, which raced the other recovery paths and
    // contributed to the refresh-loop bug.
}

/**
 * Call from any Firestore onSnapshot error handler.
 *
 * If the error is "Firestore shutting down" (caused historically by a
 * multi-tab IDB version change when a new deployment landed, or by
 * SwCleanup clearing IDB while listeners were alive), prompt the user
 * via a sticky toast to reload — DO NOT auto-reload.
 *
 * Root-cause fix (2026-05-17): the previous version called
 * `setTimeout(reload, 1500)` and guarded with a module-level `let`
 * flag. That flag reset on every page reload (a fresh JS context gets
 * a fresh `let`), so if the underlying shutdown cause persisted, the
 * 1.5-second delayed reload re-fired immediately after each reload,
 * producing an infinite refresh loop. Symptom: "site loads then
 * refreshes within a few seconds." Fix: never auto-reload. Promote to
 * a `sessionStorage` flag (genuinely sticky per tab) and surface a
 * sonner toast with a user-driven "Reload" action.
 *
 * Returns `true` if the error WAS a shutdown error (caller should
 * skip its own noisy `logger.error` to avoid console flood — recovery
 * is already logging) or `false` if it was something else (caller
 * should log + handle normally).
 */
const SHUTDOWN_RECOVERY_FLAG = 'firestore-shutdown-prompted'
export function recoverFromFirestoreShutdown(err: unknown): boolean {
    if (typeof window === 'undefined') return false
    const msg = String((err as Error)?.message || err || '')
    if (!msg.toLowerCase().includes('shutting down')) return false
    if (sessionStorage.getItem(SHUTDOWN_RECOVERY_FLAG)) return true  // already prompted

    sessionStorage.setItem(SHUTDOWN_RECOVERY_FLAG, '1')
    logger.warn('[FirestoreRecovery] Firestore shut down — prompting user')
    void import('sonner').then(({ toast }) => {
        toast.error('Sync paused', {
            description: 'Firestore disconnected. Reload to resume.',
            duration: Infinity,
            action: { label: 'Reload', onClick: () => window.location.reload() },
        })
    })
    return true
}

// Cycle-7-fixes Lane 4 sub-task A (C7I2-008 + C7I3-005): probe-harness
// Web-SDK wiring. When NEXT_PUBLIC_PROBE_HARNESS_AUTH==='1', expose the
// auth instance + a signIn helper on `window` so cowork Playwright
// drivers can wire `firebaseAuth: getAuth()` via `page.evaluate`. When
// the env var is absent (production builds), this branch never runs and
// nothing is exposed.
if (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_PROBE_HARNESS_AUTH === "1" &&
    auth
) {
    ;(window as unknown as { __c7_auth_for_probes__?: unknown }).__c7_auth_for_probes__ = {
        auth,
        signIn: (token: string) => signInWithCustomToken(auth, token),
    }
}

export { app, auth, googleProvider };
