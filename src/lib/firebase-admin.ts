import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from "@/lib/logger"

export { getAuth, getFirestore, getStorage };


/**
 * Initialize Firebase Admin SDK. Returns true if the app is available,
 * false if credentials are missing (e.g. in dev without env vars).
 * Callers that depend on Admin SDK should check the return value.
 */
export function initAdmin(): boolean {
    if (getApps().length > 0) return true;

    const serviceAccount = {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
    const { projectId, clientEmail, privateKey } = serviceAccount;
    if (!projectId || !clientEmail || !privateKey) {
        logger.warn("Firebase Admin credentials missing (Build/Dev). Skipping initialization.");
        return false;
    }
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`,
    });
    return true;
}

export async function verifyIdToken(token: string) {
    if (!token) return null;
    initAdmin();
    try {
        const decodedToken = await getAuth().verifyIdToken(token);
        return decodedToken;
    } catch (error) {
        logger.error("Token verification failed:", error);
        return null;
    }
}
