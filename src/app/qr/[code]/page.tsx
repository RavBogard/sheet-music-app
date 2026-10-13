"use client"

/**
 * QR Sign-In Approval Page
 *
 * Opened on a musician's phone after scanning a QR code from a shared iPad.
 * If the phone user is signed in: one-tap approve.
 * If not: sign in with Google first, then approve.
 */

import { useState, useEffect, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { auth } from "@/lib/firebase"
import { useOrg } from "@/lib/org/org-context"
import { getOrgBranding } from "@/lib/org/branding"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, Monitor, AlertCircle, LogIn } from "lucide-react"
import { logger } from "@/lib/logger"
import { useT } from "@/i18n/client"

type PageState = "loading" | "ready" | "approving" | "success" | "expired" | "error"

export default function QRApprovePage() {
    const params = useParams()
    const router = useRouter()
    const code = params?.code as string
    const { user, signIn, loading: authLoading } = useAuth()
    const t = useT()
    const [state, setState] = useState<PageState>("loading")
    const [error, setError] = useState<string | null>(null)
    const [autoApproveAttempted, setAutoApproveAttempted] = useState(false)
    // v11.5-05 (Q3): host-derived tenant name so the expired/used copy is
    // branded on both sites (no hardcoded "CRC" leak on the BL host).
    const org = useOrg()
    const orgName = getOrgBranding(org).shortName

    // Check if the session is still valid.
    // WS-31: a phone that scans before the iPad's background registration POST
    // lands gets 404 (not-yet-registered) — distinct from 410 (genuinely
    // expired/already-used). Retry 404 on a short cadence so an early scan
    // recovers, while staying in the "Checking session…" loading state (no
    // blank screen, no premature "expired"). 410 and a 404 that persists past
    // the recovery window still resolve to "expired".
    useEffect(() => {
        if (!code) return
        let cancelled = false
        let attempts = 0
        const MAX_ATTEMPTS = 6 // ~6 checks
        const RETRY_INTERVAL_MS = 1000 // ~1s apart → ~5s recovery window
        let timer: ReturnType<typeof setTimeout> | null = null

        const check = async () => {
            attempts += 1
            try {
                const res = await fetch(`/api/auth/qr?code=${code}`)
                if (cancelled) return
                if (res.status === 410) {
                    setState("expired")
                } else if (res.ok) {
                    setState("ready")
                } else if (res.status === 404 && attempts < MAX_ATTEMPTS) {
                    // Not registered yet — keep "Checking session…" and retry.
                    timer = setTimeout(check, RETRY_INTERVAL_MS)
                } else {
                    // Persistent 404 past the window means the iPad never
                    // registered → expired; any other status → unrecoverable.
                    setState(res.status === 404 ? "expired" : "error")
                }
            } catch {
                if (!cancelled) setState("error")
            }
        }

        check()

        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
        }
    }, [code])

    // Auto-approve if user is already signed in and session is ready
    useEffect(() => {
        if (state === "ready" && user && !autoApproveAttempted) {
            setAutoApproveAttempted(true)
            handleApprove()
        }
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, user?.uid])

    const handleApprove = async () => {
        if (!user) return
        setState("approving")
        try {
            const idToken = await auth.currentUser?.getIdToken()
            if (!idToken) throw new Error(t("auth.approveNoToken"))

            const res = await fetch("/api/auth/qr", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ code }),
            })

            if (res.status === 410) {
                setState("expired")
                return
            }

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || t("auth.approveFailed"))
            }

            setState("success")
        } catch (err) {
            logger.error("[QR Approve]", err)
            setError(err instanceof Error ? err.message : t("auth.approveSomethingWrong"))
            setState("error")
        }
    }

    const handleSignInThenApprove = async () => {
        await signIn()
        // Auth state change will trigger the auto-approve effect
    }

    // ── Render ──

    if (authLoading || state === "loading") {
        return (
            <Shell>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-sm">{t("auth.approveChecking")}</p>
            </Shell>
        )
    }

    if (state === "expired") {
        return (
            <Shell>
                <AlertCircle className="h-12 w-12 text-amber-500" />
                <h1 className="text-xl font-bold text-foreground">{t("auth.approveExpiredTitle")}</h1>
                <p className="text-muted-foreground text-sm text-center">
                    {t("auth.approveExpiredBody", { orgName })}
                </p>
            </Shell>
        )
    }

    if (state === "error") {
        return (
            <Shell>
                <AlertCircle className="h-12 w-12 text-red-500" />
                <h1 className="text-xl font-bold text-foreground">{t("auth.approveErrorTitle")}</h1>
                <p className="text-muted-foreground text-sm text-center">{error || t("auth.approveTryAgain")}</p>
                <Button variant="outline" onClick={() => router.push("/")}>{t("auth.approveGoHome")}</Button>
            </Shell>
        )
    }

    if (state === "success") {
        return (
            <Shell>
                <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                    <CheckCircle2 className="h-10 w-10 text-success" />
                </div>
                <h1 className="text-xl font-bold text-foreground">{t("auth.approveSignedInTitle")}</h1>
                <p className="text-muted-foreground text-sm text-center">
                    {withBoldName(t("auth.approveSignedInBody", { userName: NAME_SLOT }), user?.displayName || user?.email)}
                </p>
            </Shell>
        )
    }

    if (state === "approving") {
        return (
            <Shell>
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-foreground font-medium">{t("auth.approveSigningInOnIpad")}</p>
            </Shell>
        )
    }

    // state === "ready"
    if (!user) {
        return (
            <Shell>
                <Monitor className="h-12 w-12 text-violet-500" />
                <h1 className="text-xl font-bold text-foreground">{t("auth.approveTitle")}</h1>
                <p className="text-muted-foreground text-sm text-center">
                    {t("auth.approveSignInPrompt")}
                </p>
                <Button
                    onClick={handleSignInThenApprove}
                    className="w-full max-w-xs h-12 rounded-xl font-semibold text-base"
                >
                    <LogIn className="h-5 w-5 me-2" />
                    {t("auth.approveSignInWithGoogle")}
                </Button>
            </Shell>
        )
    }

    // User is signed in, session is ready — auto-approve should have fired,
    // but show a manual button as fallback
    return (
        <Shell>
            <Monitor className="h-12 w-12 text-violet-500" />
            <h1 className="text-xl font-bold text-foreground">{t("auth.approveTitle")}</h1>
            <p className="text-muted-foreground text-sm text-center">
                {withBoldName(t("auth.approveTapToSignInAs", { userName: NAME_SLOT }), user.displayName || user.email)}
            </p>
            <Button
                onClick={handleApprove}
                className="w-full max-w-xs h-14 rounded-xl font-bold text-lg bg-violet-600 hover:bg-violet-500"
            >
                <CheckCircle2 className="h-5 w-5 me-2" />
                {t("auth.approveButton")}
            </Button>
        </Shell>
    )
}

/** Marks where the bold name goes inside a translated sentence (never shown). */
const NAME_SLOT = "\u0000"

/** A translated sentence with the person's name in bold at its `{userName}` slot. */
function withBoldName(text: string, name: ReactNode): ReactNode {
    const [before, ...rest] = text.split(NAME_SLOT)
    if (rest.length === 0) return text
    return (
        <>
            {before}
            <span className="font-semibold text-foreground">{name}</span>
            {rest.join("")}
        </>
    )
}

/** Centered full-screen layout */
function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 p-6 bg-background">
            {children}
        </div>
    )
}
