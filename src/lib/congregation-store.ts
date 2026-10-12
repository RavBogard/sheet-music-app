import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { auth, subscribeWithDb } from "@/lib/firebase"
// Phase 1.6 Option C-1 (cascading lazy) — `doc` and `onSnapshot` are imported
// DYNAMICALLY inside attachListener() below so /login's static-import graph
// doesn't pull the firestore SDK chunk through this module. congregation-store
// is loaded by every route via <ClientProviders> in root layout.tsx; keeping
// firestore off the module-top graph keeps `d94474cc-*.js` + cousin out of
// /login's preload manifest. See
// `.paul/research/bundle-diet-firestore-lazy-import/FINDINGS.md` §Phase-1.6.
import { onAuthStateChanged } from "firebase/auth"
import { logger } from "@/lib/logger"
import type { RabbiProfile } from "@/types/models"
import { coerceOrgId, congregationDocId } from "@/lib/org/registry"
import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import { orgString } from "@/lib/org/strings"

export interface CongregationConfig {
    name: string
    shortName: string
    location: string
    logoUrl: string
    description: string
    themeColor: string
    driveFolderId: string
    features: {
        monitor: boolean
        ai: boolean
        audio: boolean
        collaboration: boolean
    }
    printFooter: string
    defaultMusicians?: Array<{
        uid: string
        name: string
        instrument?: string
    }>
    /**
     * Per-serviceType default start times, keyed by the setlist's
     * `templateType` (`friday_night`, `shabbat_morning`, …). `today.json`
     * turns `eventDate` + `defaultStartLocal` into the instant the reader and
     * Overlays show; a setlist's own `startsAtLocal` overrides it.
     * `HH:mm`, America/Chicago wall clock.
     */
    services?: Record<string, { label: string; defaultStartLocal: string }>
    /** The congregation's stream. `leadMinutes` defaults to 5. */
    stream?: { url: string; leadMinutes?: number }
    scheduling?: {
        rabbiProfiles?: RabbiProfile[]
        defaultReminderHours?: number     // Hours before service to send reminder (default: 48)
        allowSelfScheduling?: boolean     // Can musicians volunteer for open slots?
    }
}

/**
 * The host org as the server rendered it on <html data-org> (raw, so a tenant
 * outside the code registry still finds its primed config); undefined in SSR.
 */
function hostOrg(): string | undefined {
    return typeof document === "undefined" ? undefined : document.documentElement.dataset.org
}

/**
 * Multi-tenant phase 1: the fallback congregation config for an org, from its
 * tenant config's `congregationDefaults` and the `print.footer` string (CRC's
 * values are the former literals; Brothers Lazaroff is frozen to them). Reads
 * the config OrgProvider primed, then the code tables, then CRC.
 */
export function defaultCongregationConfig(org: string | undefined = hostOrg()): CongregationConfig {
    const coerced = coerceOrgId(org)
    const tenant = (org ? peekOrgConfig(org) : undefined) ?? codeOrgConfig(coerced) ?? codeOrgConfig("crc")!
    const d = tenant.congregationDefaults
    return {
        name: d.name,
        shortName: d.shortName,
        location: d.location,
        logoUrl: d.logoUrl,
        description: d.description,
        themeColor: d.themeColor,
        driveFolderId: "",
        features: {
            monitor: true,
            ai: true,
            audio: true,
            collaboration: true,
        },
        printFooter: orgString(tenant.id, "print.footer"),
    }
}

const DEFAULT_CONFIG: CongregationConfig = defaultCongregationConfig()

interface CongregationStore {
    config: CongregationConfig
    isInitialized: boolean
    init: () => () => void // Returns an unsubscribe function
}

export const useCongregationStore = create<CongregationStore>()(
    persist(
        (set, get) => ({
            config: DEFAULT_CONFIG,
            isInitialized: false,
            init: () => {
                if (get().isInitialized) return () => { }
                if (typeof window === 'undefined') return () => { }

                // Multi-tenant phase 1: this module evaluates before OrgProvider
                // primes the tenant config, so a tenant outside the code tables
                // got CRC's fallback above. If the store still holds that
                // module-time fallback, swap in the tenant's own defaults (a
                // no-op for crc and brotherslazaroff, whose values are equal).
                const tenantDefaults = defaultCongregationConfig()
                if (get().config === DEFAULT_CONFIG && JSON.stringify(tenantDefaults) !== JSON.stringify(DEFAULT_CONFIG)) {
                    set({ config: tenantDefaults })
                }

                // UNAUTH-002: firestore.rules require auth to read
                // `config/congregation`. Attaching the doc listener while
                // unauthenticated emits a permission-denied error on every
                // page load (console spam on /perform, /login, etc.).
                // Gate the listener on `auth.currentUser`; unauth surfaces
                // continue to use the persisted DEFAULT_CONFIG fallback.
                let firestoreUnsub: (() => void) | null = null
                // Phase 1.6 race-guard: attachListener became async (dynamic
                // `import("firebase/firestore")` adds a microtask boundary).
                // If the user signs out while a prior attach's import is in
                // flight, detachListener bumps the generation so the stale
                // attach's post-await assignment is skipped — otherwise we'd
                // leak a subscription tied to a signed-out session.
                let attachGen = 0

                const attachListener = async () => {
                    if (firestoreUnsub) return
                    const myGen = ++attachGen
                    const { doc, onSnapshot } = await import("firebase/firestore")
                    if (myGen !== attachGen || firestoreUnsub) return // detach fired or already attached
                    // v11-05-04: subscribe to the HOST org's congregation doc.
                    // <html data-org> is set server-side before hydration
                    // (v11-03-01), so it's stable at attach time — no React
                    // context / OrgProvider ordering risk. crc host (data-org="crc"
                    // or absent → coerceOrgId default) keeps the bare doc id.
                    const org = coerceOrgId(document.documentElement.dataset.org)
                    firestoreUnsub = subscribeWithDb((db) => onSnapshot(
                        doc(db, "config", congregationDocId(org)),
                        (snap) => {
                            if (snap.exists()) {
                                const updated = { ...defaultCongregationConfig(), ...snap.data() as Partial<CongregationConfig> }
                                set({ config: updated, isInitialized: true })
                            }
                        },
                        (err) => {
                            logger.error("[Congregation] Failed to sync config:", err)
                        }
                    ))
                }

                const detachListener = () => {
                    attachGen++ // invalidate any in-flight attach awaiting the firestore module
                    if (firestoreUnsub) {
                        firestoreUnsub()
                        firestoreUnsub = null
                    }
                }

                const authUnsub = onAuthStateChanged(auth, (user) => {
                    if (user) void attachListener()
                    else detachListener()
                })

                set({ isInitialized: true })
                return () => {
                    authUnsub()
                    detachListener()
                    set({ isInitialized: false })
                }
            }
        }),
        {
            name: 'crc_congregation',
            storage: createJSONStorage(() => localStorage),
        }
    )
)

/**
 * Hook backwards-compatibility for components assuming they directly get the config object
 */
export const useCongregation = () => useCongregationStore(state => state.config)
