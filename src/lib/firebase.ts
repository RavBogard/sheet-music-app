import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore, FirestoreSettings, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
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
        // Use initializeFirestore instead of getFirestore to configure transport.
        //
        // Two settings work together to eliminate AbortError console noise:
        //
        // 1. experimentalForceLongPolling: Bypasses WebChannel streaming,
        //    which had a retry loop bug in SDK 12.8.0 generating dozens
        //    of AbortErrors per second.
        //
        // 2. useFetchStreams: false: Uses XMLHttpRequest instead of fetch()
        //    for the long-polling transport. When the SDK adds/removes
        //    listeners, it aborts the current in-flight poll request.
        //    fetch().abort() throws a DOMException(AbortError) that shows
        //    in the console. XHR.abort() cancels silently. Same behavior,
        //    no console noise from normal SDK operations.
        try {
            db = initializeFirestore(app, {
                experimentalForceLongPolling: true,
                useFetchStreams: false,
                localCache: persistentLocalCache({
                    tabManager: persistentMultipleTabManager(),
                }),
            } as FirestoreSettings);
        } catch (e1) {
            // Persistence may fail in private browsing or restricted environments.
            // Fall back to in-memory cache (no offline persistence).
            try {
                db = initializeFirestore(app, {
                    experimentalForceLongPolling: true,
                    useFetchStreams: false,
                } as FirestoreSettings);
            } catch {
                // Already initialized (e.g. hot reload)
                db = getFirestore(app);
            }
            logger.warn("Firestore offline persistence unavailable, using network-only", e1);
        }
        auth = getAuth(app);
        googleProvider = new GoogleAuthProvider();
    } else {
        db = {} as unknown as Firestore
        auth = {} as unknown as Auth
        googleProvider = new GoogleAuthProvider()
    }

} catch (e) {
    logger.error("Firebase Initialization Failed", e);
    app = {} as unknown as FirebaseApp;
    db = {} as unknown as Firestore;
    auth = {} as unknown as Auth;
    googleProvider = new GoogleAuthProvider();
}

export { app, db, auth, googleProvider };
