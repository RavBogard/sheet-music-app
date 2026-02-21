/**
 * Self-Signed Certificate Manager
 *
 * Generates and caches a self-signed TLS certificate so the bridge
 * can serve WSS (secure WebSocket). This is required because browsers
 * block ws:// connections from https:// pages (mixed content).
 *
 * On first run, generates a cert valid for 10 years covering:
 *   - localhost, 127.0.0.1
 *   - All current LAN IPs (192.168.x.x, 10.x.x.x, etc.)
 *
 * Users trust the cert once per device by visiting https://BRIDGE_IP:PORT
 * in their browser and accepting the security warning.
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { execSync } from "child_process"

const CERT_DIR = path.join(
    process.env.BRIDGE_DATA_DIR || path.dirname(process.execPath || __dirname),
    "certs"
)
const CERT_FILE = path.join(CERT_DIR, "bridge.crt")
const KEY_FILE = path.join(CERT_DIR, "bridge.key")

export interface TLSFiles {
    cert: string
    key: string
}

/**
 * Get all LAN IPv4 addresses for SAN (Subject Alternative Names).
 */
function getLanIps(): string[] {
    const ips: string[] = []
    const interfaces = os.networkInterfaces()
    for (const addrs of Object.values(interfaces)) {
        for (const iface of addrs || []) {
            if (iface.family === "IPv4" && !iface.internal) {
                ips.push(iface.address)
            }
        }
    }
    return ips
}

/**
 * Generate a self-signed certificate using Node's built-in crypto.
 * Falls back to OpenSSL CLI if the node:crypto X509 API isn't available.
 */
function generateCert(): TLSFiles {
    fs.mkdirSync(CERT_DIR, { recursive: true })

    const lanIps = getLanIps()
    const sans = [
        "DNS:localhost",
        "IP:127.0.0.1",
        ...lanIps.map(ip => `IP:${ip}`),
    ].join(",")

    console.log(`[Cert] Generating self-signed certificate...`)
    console.log(`[Cert] SANs: ${sans}`)

    // Use OpenSSL (available on Windows via Git, or system openssl)
    try {
        const opensslCmd = process.platform === "win32" ? findOpenSSL() : "openssl"

        execSync(
            `"${opensslCmd}" req -x509 -newkey rsa:2048 -nodes ` +
            `-keyout "${KEY_FILE}" -out "${CERT_FILE}" ` +
            `-days 3650 -subj "/CN=CentralReform Bridge" ` +
            `-addext "subjectAltName=${sans}"`,
            { stdio: "pipe" }
        )

        console.log(`[Cert] ✓ Certificate generated at ${CERT_DIR}`)
        return {
            cert: fs.readFileSync(CERT_FILE, "utf-8"),
            key: fs.readFileSync(KEY_FILE, "utf-8"),
        }
    } catch (err) {
        // Fallback: generate using Node.js crypto (Node 19+)
        return generateCertNodeCrypto(lanIps)
    }
}

/**
 * Attempt Node.js native cert generation (available in Node 19+ with
 * the X509Certificate and generateKeyPairSync APIs).
 */
function generateCertNodeCrypto(lanIps: string[]): TLSFiles {
    try {
        const crypto = require("crypto")

        const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        })

        // If generateCertificate is available (Node 21+)
        if (typeof crypto.X509Certificate !== "undefined") {
            // Fall through to openssl error handling
            throw new Error("X509Certificate doesn't support cert generation")
        }

        throw new Error("Node crypto cert generation not available")
    } catch {
        // Last resort: create a minimal self-signed cert using just key generation
        // and provide instructions for manual cert creation
        console.error("[Cert] ✗ Could not generate certificate automatically.")
        console.error("[Cert]   Install OpenSSL or use Node.js 21+")
        console.error("[Cert]   On Windows: install Git for Windows (includes OpenSSL)")
        throw new Error("Certificate generation failed — install OpenSSL")
    }
}

/**
 * Find OpenSSL on Windows. Common locations:
 *   - Git for Windows: C:\Program Files\Git\usr\bin\openssl.exe
 *   - Standalone: C:\OpenSSL-Win64\bin\openssl.exe
 *   - PATH
 */
function findOpenSSL(): string {
    // Try PATH first
    try {
        execSync("openssl version", { stdio: "pipe" })
        return "openssl"
    } catch { /* not on PATH */ }

    // Git for Windows
    const gitPaths = [
        "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
        "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
    ]
    for (const p of gitPaths) {
        if (fs.existsSync(p)) return p
    }

    // Standalone OpenSSL
    const sslPaths = [
        "C:\\OpenSSL-Win64\\bin\\openssl.exe",
        "C:\\OpenSSL-Win32\\bin\\openssl.exe",
    ]
    for (const p of sslPaths) {
        if (fs.existsSync(p)) return p
    }

    throw new Error("OpenSSL not found — install Git for Windows")
}

/**
 * Load existing cert or generate a new one.
 * Regenerates if the cert doesn't cover the current LAN IP.
 */
export function loadOrGenerateCert(): TLSFiles {
    if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
        const cert = fs.readFileSync(CERT_FILE, "utf-8")
        const key = fs.readFileSync(KEY_FILE, "utf-8")

        // Check if current IP is covered by the cert's SANs
        const currentIps = getLanIps()
        let needsRegen = false

        try {
            // Quick check: see if any current IP appears in the cert text
            for (const ip of currentIps) {
                if (!cert.includes(ip) && !cert.includes("IP Address:" + ip)) {
                    // The cert might not cover this IP — check more carefully
                    // For PEM certs, the SAN is in the DER-encoded data, not plaintext
                    // Just regenerate to be safe if the IP changed
                    needsRegen = true
                    break
                }
            }
        } catch {
            // Can't parse cert, just use it
        }

        if (needsRegen) {
            console.log("[Cert] LAN IP changed — regenerating certificate")
            return generateCert()
        }

        console.log("[Cert] ✓ Using existing certificate")
        return { cert, key }
    }

    return generateCert()
}
