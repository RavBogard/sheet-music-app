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
import * as selfsigned from "selfsigned"

const CERT_DIR = path.join(
    process.env.BRIDGE_DATA_DIR || process.cwd(),
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
 * Generate a self-signed certificate using pure JS (selfsigned).
 * This elegantly avoids any OpenSSL or OS-specific binary dependencies.
 */
async function generateCert(): Promise<TLSFiles> {
    fs.mkdirSync(CERT_DIR, { recursive: true })

    const lanIps = getLanIps()

    // Create Subject Alternative Names array
    // type 2 is DNS, type 7 is IP
    const altNames: { type: number; value?: string; ip?: string }[] = [
        { type: 2 as const, value: "localhost" },         // DNS name
        { type: 7 as const, ip: "127.0.0.1" }            // IP address
    ]

    // Add all LAN IPs to the SAN list
    for (const ip of lanIps) {
        altNames.push({ type: 7 as const, ip })
    }

    console.log(`[Cert] Generating pure-JS self-signed certificate...`)
    console.log(`[Cert] Covered IPs: ${lanIps.join(", ")}`)

    try {
        const attrs = [{ name: "commonName", value: "CentralReform Bridge" }]
        // The @types/selfsigned definitions are famously inaccurate.
        // We cast to any to bypass the faulty types while keeping the logic correct.
        const pems = await (selfsigned.generate as any)(attrs, {
            keySize: 2048,
            days: 3650, // 10 years
            algorithm: "sha256",
            extensions: [
                { name: "basicConstraints", cA: true },
                { name: "subjectAltName", altNames }
            ]
        })

        fs.writeFileSync(CERT_FILE, pems.cert)
        fs.writeFileSync(KEY_FILE, pems.private)

        console.log(`[Cert] ✓ Certificate generated at ${CERT_DIR}`)

        return {
            cert: pems.cert,
            key: pems.private
        }
    } catch (err) {
        console.error("[Cert] ✗ Fatal error generating certificate:", err)
        throw new Error("Certificate generation failed")
    }
}

/**
 * Load existing cert or generate a new one.
 * Regenerates if the cert doesn't cover the current LAN IP.
 */
export async function loadOrGenerateCert(): Promise<TLSFiles> {
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
