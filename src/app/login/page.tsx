import { getServerCongregationConfig } from "@/lib/server-auth"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
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

            <div className="w-full max-w-sm space-y-8 text-center relative z-10">
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

                    <p className="text-xs text-muted-foreground/60">
                        Only authorized accounts can access the full library.
                    </p>
                </div>

                <p className="text-xs text-muted-foreground/40">
                    {fullName} &middot; {location}
                </p>
            </div>
        </div>
    )
}
