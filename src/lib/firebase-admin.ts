import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export { getAuth, getFirestore };

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

export function initAdmin() {
    if (getApps().length === 0) {
        if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
            console.warn("Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY. API protection will fail.");
        }
        initializeApp({
            credential: cert(serviceAccount)
        });
    }
}

export async function verifyIdToken(token: string) {
    if (!token) return null;
    initAdmin();
    try {
        const decodedToken = await getAuth().verifyIdToken(token);
        return decodedToken;
    } catch (error) {
        console.error("Token verification failed:", error);
        return null;
    }
}
