import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
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
        db = getFirestore(app);
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
