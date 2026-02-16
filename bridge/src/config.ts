/**
 * Config Manager
 * 
 * Reads monitor configuration from Firestore (config/monitor) and watches
 * for live changes. When the admin updates bus assignments or authorized
 * users in the web app, this picks it up instantly.
 */

import * as admin from "firebase-admin"
import { MonitorConfig } from "./types"

const DEFAULT_CONFIG: MonitorConfig = {
    bridgeUrl: "ws://localhost:9000",
    x32Address: "192.168.1.100",
    x32Port: 10023,
    monitorBuses: [1, 2, 3, 4],
    busAssignments: {},
    authorizedUsers: [],
}

export class ConfigManager {
    private db: admin.firestore.Firestore
    private config: MonitorConfig = DEFAULT_CONFIG
    private unsubscribe: (() => void) | null = null
    private listeners: Array<(config: MonitorConfig) => void> = []

    constructor() {
        // Initialize Firebase Admin
        if (!admin.apps.length) {
            const serviceAccountPath = process.env.FIREBASE_SA_KEY_PATH
            if (serviceAccountPath) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const serviceAccount = require(serviceAccountPath)
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                })
            } else {
                // Application Default Credentials (for GCP environments)
                admin.initializeApp()
            }
        }
        this.db = admin.firestore()
    }

    async loadConfig(): Promise<MonitorConfig> {
        const doc = await this.db.collection("config").doc("monitor").get()
        if (doc.exists) {
            const data = doc.data() as Partial<MonitorConfig>
            this.config = { ...DEFAULT_CONFIG, ...data }
        } else {
            // Create default config doc
            await this.db.collection("config").doc("monitor").set(DEFAULT_CONFIG)
            this.config = DEFAULT_CONFIG
        }
        console.log("[Config] Loaded:", JSON.stringify({
            x32: `${this.config.x32Address}:${this.config.x32Port}`,
            buses: this.config.monitorBuses,
            authorized: this.config.authorizedUsers.length,
        }))
        return this.config
    }

    startWatching(): void {
        this.unsubscribe = this.db.collection("config").doc("monitor")
            .onSnapshot((snap) => {
                if (snap.exists) {
                    const data = snap.data() as Partial<MonitorConfig>
                    this.config = { ...DEFAULT_CONFIG, ...data }
                    console.log("[Config] Updated live — buses:", this.config.monitorBuses,
                        "authorized:", this.config.authorizedUsers.length)
                    this.listeners.forEach(fn => fn(this.config))
                }
            }, (err) => {
                console.error("[Config] Watch error:", err.message)
            })
    }

    stopWatching(): void {
        if (this.unsubscribe) {
            this.unsubscribe()
            this.unsubscribe = null
        }
    }

    getConfig(): MonitorConfig {
        return this.config
    }

    onChange(fn: (config: MonitorConfig) => void): void {
        this.listeners.push(fn)
    }

    /** Verify a Firebase Auth ID token */
    async verifyToken(token: string): Promise<{ uid: string; email?: string } | null> {
        try {
            const decoded = await admin.auth().verifyIdToken(token)
            return { uid: decoded.uid, email: decoded.email }
        } catch {
            return null
        }
    }

    /** Check if a user is authorized for monitor access */
    isAuthorized(uid: string): boolean {
        return this.config.authorizedUsers.includes(uid)
    }

    /** Get which bus is assigned to a user */
    getUserBus(uid: string): number | null {
        for (const [busStr, assignment] of Object.entries(this.config.busAssignments)) {
            if (assignment && assignment.userId === uid) {
                return parseInt(busStr)
            }
        }
        return null
    }

    /** Get Firebase Admin instance for other uses */
    getAdmin(): typeof admin {
        return admin
    }
}
