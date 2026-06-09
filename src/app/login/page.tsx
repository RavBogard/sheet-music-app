import { headers } from "next/headers"
import { getServerCongregationConfig } from "@/lib/server-auth"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgBranding } from "@/lib/org/branding"
import LoginClient from "./LoginClient"

/**
 * /login — Server Component skeleton + CSR form (P2-013).
 *
 * SSR renders the full visible chrome (ambient glow, logo, heading, glass-card
 * shell, footer) so unauth visitors see structure immediately on slow networks.
 * `LoginClient` is a client component nested inside the glass card; its first
 * render — both SSR'd and hydrated — is the disabled "Sign in with Google"
 * button shell, which matches the final-form classnames exactly so the
 * button doesn't shift on hydration (CLS < 0.1 target). Once `useAuth` resolves
 * client-side, the button becomes interactive and the existing
 * onAuthStateChanged → router.replace(?next || /setlists) flow takes over.
 *
 * Authoring of new auth methods (email/password, magic-link, etc.) belongs
 * inside LoginClient — page.tsx stays the static skeleton.
 */
export default async function LoginPage() {
    // v11-03-02: Brothers Lazaroff tenant gets a dark photographic band hero +
    // wordmark instead of the synagogue congregation chrome. The CRC/default
    // branch below is unchanged (getServerCongregationConfig path). LoginClient,
    // the legal nav, and noscript are kept identical so auth + GDPR/SMS
    // compliance never regress per tenant.
    const orgId = coerceOrgId((await headers()).get("x-org-id"))
    if (orgId === "brotherslazaroff") {
        const { shortName, tagline } = getOrgBranding(orgId)
        return (
            <div className="min-h-screen bl-hero flex flex-col items-center justify-center p-4 relative overflow-hidden">
                {/* Navy ambient glow over the photographic hero */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                    <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-brand/[0.10] blur-3xl" />
                    <div className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[55%] rounded-full bg-brand/[0.08] blur-3xl" />
                </div>

                <main id="main-content" className="w-full max-w-sm space-y-8 text-center relative z-10">
                    <div className="flex flex-col items-center gap-3">
                        <h1 className="font-display uppercase font-bold tracking-tight text-foreground text-4xl sm:text-5xl leading-[0.95] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                            {shortName}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {tagline}
                        </p>
                    </div>

                    <div className="glass-card rounded-2xl p-6 space-y-5">
                        <LoginClient />

                        <noscript>
                            <p className="text-xs text-destructive">
                                Sign-in requires JavaScript. Please enable it in your browser settings to continue.
                            </p>
                        </noscript>

                        <p className="text-xs text-muted-foreground">
                            Only authorized accounts can access the full library.
                        </p>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        {shortName} &middot; St. Louis, MO
                    </p>

                    <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <a href="/privacy" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Privacy</a>
                        <a href="/terms" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Terms</a>
                        <a href="/sms-consent" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">SMS Consent</a>
                        <a href="/changelog" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Changelog</a>
                        <a href="/accessibility" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Accessibility</a>
                    </nav>
                </main>
            </div>
        )
    }

    const config = await getServerCongregationConfig().catch(() => null)
    const shortName = (config?.shortName as string | undefined) || DEFAULT_SHORT_NAME
    const fullName = (config?.name as string | undefined) || "Central Reform Congregation"
    const location = (config?.location as string | undefined) || "St. Louis, MO"
    const logoUrl = (config?.logoUrl as string | undefined) || "/logo.jpg"

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Subtle brand gradient ambient glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-brand/[0.04] blur-3xl" />
                <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand/[0.03] blur-3xl" />
            </div>

            {/* C5B-001: `<main id="main-content">` is the target of the root
                skip-link in `app/layout.tsx`. Without it, unauth visitors on
                /login who tab to the skip-link land nowhere (axe-confirmed). */}
            <main id="main-content" className="w-full max-w-sm space-y-8 text-center relative z-10">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-brand/15 blur-xl scale-150" aria-hidden="true" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={logoUrl}
                            alt={shortName}
                            className="relative h-24 w-24 rounded-full border-2 border-border/60 object-cover shadow-lg shadow-brand/10"
                        />
                    </div>
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground font-display tracking-tight">{shortName}</h1>
                        <p className="text-muted-foreground text-sm mt-1.5">
                            Sign in to access the music library
                        </p>
                    </div>
                </div>

                <div className="glass-card rounded-2xl p-6 space-y-5">
                    <LoginClient />

                    {/* C5B-008: JS is required to complete sign-in (Firebase
                        Auth Web SDK runs client-side). The button itself now
                        SSRs as an enabled affordance so the surface looks
                        correct pre-hydrate; this banner tells no-JS users
                        why clicking won't help and what to do. */}
                    <noscript>
                        <p className="text-xs text-destructive">
                            Sign-in requires JavaScript. Please enable it in your browser settings to continue.
                        </p>
                    </noscript>

                    <p className="text-xs text-muted-foreground">
                        Only authorized accounts can access the full library.
                    </p>
                </div>

                <p className="text-xs text-muted-foreground">
                    {fullName} &middot; {location}
                </p>

                {/* C5B-009: pre-signin disclosure links (GDPR/CCPA). Distinct
                    from Lane 6's global Footer.tsx — that surface is for
                    authed pages; /login is unauth and never renders the
                    global Footer. SMS-Consent is required because the app
                    sends SMS notifications on publish_setlist. */}
                <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <a href="/privacy" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Privacy</a>
                    <a href="/terms" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Terms</a>
                    <a href="/sms-consent" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">SMS Consent</a>
                    <a href="/changelog" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Changelog</a>
                    <a href="/accessibility" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">Accessibility</a>
                </nav>
            </main>
        </div>
    )
}
