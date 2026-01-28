import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

import { env } from "./env";

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
let app: any;
let db: any;
let auth: any;
let googleProvider: any;

try {
    if (getApps().length > 0) {
        app = getApp();
    } else if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
    } else {
        // Prevent crash during build if env vars are missing
        console.warn("Firebase API Key missing. Using mock app.");
        app = {};
    }

    if (firebaseConfig.apiKey) {
        db = getFirestore(app);
        auth = getAuth(app);
        googleProvider = new GoogleAuthProvider();
    } else {
        db = {}
        auth = {}
        googleProvider = new GoogleAuthProvider()
    }

} catch (e) {
    console.error("Firebase Initialization Failed", e);
    app = {};
    db = {};
    auth = {};
    googleProvider = new GoogleAuthProvider();
}

export { app, db, auth, googleProvider };
