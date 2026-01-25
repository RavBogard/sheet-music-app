import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCwwNyMHyuB6bHj3CTdaR0UGVZHAQJRAz0",
    authDomain: "crcmusiccharts.firebaseapp.com",
    projectId: "crcmusiccharts",
    storageBucket: "crcmusiccharts.firebasestorage.app",
    messagingSenderId: "749316879158",
    appId: "1:749316879158:web:c64a0e3e5e45944ea4f997",
    measurementId: "G-5DNPV4TL5H"
};

// Singleton pattern to prevent multiple initializations in dev hot-reloads
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, auth, googleProvider };
