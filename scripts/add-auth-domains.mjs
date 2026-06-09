// Add hostnames to Firebase Authentication's "Authorized domains" allowlist.
//
// WHY: a new tenant domain (e.g. brotherslazaroff.live) that is NOT on this
// allowlist makes Google sign-in fail with `auth/unauthorized-domain` — the
// signInWithPopup throws before the popup opens, so "click sign in → nothing".
// This is project-wide config (single Firebase project crcmusiccharts), not
// per-tenant. Run once per new tenant host.
//
// AUTH: this box has no Admin SA creds / gcloud. We reuse the firebase CLI
// login by exchanging its stored refresh_token for an access token via the
// public firebase-tools OAuth client (same trick the Admin-SDK prod scripts
// use). The token carries cloud-platform scope, which the Identity Toolkit
// admin API accepts.
//
// USAGE:
//   node scripts/add-auth-domains.mjs brotherslazaroff.live www.brotherslazaroff.live
//   node scripts/add-auth-domains.mjs --dry-run brotherslazaroff.live   (preview only)

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const PROJECT = process.env.FIREBASE_PROJECT || "crcmusiccharts"
// Public firebase-tools OAuth client (embedded in the open-source CLI).
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const domains = args.filter((a) => !a.startsWith("--"))
if (domains.length === 0) {
    console.error("Usage: node scripts/add-auth-domains.mjs [--dry-run] <domain> [<domain> ...]")
    process.exit(1)
}

function refreshToken() {
    const p = join(homedir(), ".config", "configstore", "firebase-tools.json")
    const j = JSON.parse(readFileSync(p, "utf8"))
    const t = j?.tokens?.refresh_token
    if (!t) throw new Error(`No refresh_token in ${p} — run \`firebase login\` first`)
    return t
}

async function accessToken() {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: refreshToken(),
            grant_type: "refresh_token",
        }),
    })
    if (!res.ok) throw new Error(`token exchange failed ${res.status}: ${await res.text()}`)
    return (await res.json()).access_token
}

const CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`

async function main() {
    const token = await accessToken()
    const auth = { Authorization: `Bearer ${token}` }

    const getRes = await fetch(CONFIG_URL, { headers: auth })
    if (!getRes.ok) throw new Error(`GET config failed ${getRes.status}: ${await getRes.text()}`)
    const cfg = await getRes.json()
    const existing = cfg.authorizedDomains || []
    console.log("Current authorizedDomains:", existing)

    const toAdd = domains.filter((d) => !existing.includes(d))
    if (toAdd.length === 0) {
        console.log("Nothing to add — all requested domains already authorized.")
        return
    }
    const merged = [...existing, ...toAdd]
    console.log("Will add:", toAdd)
    console.log("New authorizedDomains:", merged)

    if (dryRun) {
        console.log("[--dry-run] no write performed.")
        return
    }

    const patchRes = await fetch(`${CONFIG_URL}?updateMask=authorizedDomains`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ authorizedDomains: merged }),
    })
    if (!patchRes.ok) throw new Error(`PATCH failed ${patchRes.status}: ${await patchRes.text()}`)
    const updated = await patchRes.json()
    console.log("✓ Updated authorizedDomains:", updated.authorizedDomains)
}

main().catch((e) => {
    console.error("FAILED:", e.message)
    process.exit(1)
})
