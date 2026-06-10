"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { signInWithCustomToken } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { syncSessionCookie } from "@/lib/session-cookie"
import { Loader2, AlertCircle } from "lucide-react"
import { logger } from "@/lib/logger"

type State = "loading" | "failed"

/**
 * Headless variant of `QRSignIn`'s consume logic: the code comes from `?code=`
 * (not generated/displayed), and the qr-session is PRE-APPROVED by
 * create_test_account, so we consume once (no poll) and sign in.
 *
 * The code + next are read from `window.location.search` (mirrors LoginClient)
 * to avoid the `useSearchParams()` CSR-bailout that would otherwise require a
 * Suspense boundary at build time.
 */
export default function TestLoginClient() {
    const router = useRouter()
    const [state, setState] = useState<State>("loading")
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true

        const params = new URLSearchParams(window.location.search)
        const code = params.get("code")
        if (!code) {
            setState("failed")
            return
        }

        const run = async () => {
            try {
                // Single GET — the doc is pre-approved, so no polling/refresh
                // (that is the QR-display behavior; this link is one-shot).
                const res = await fetch(`/api/auth/qr?code=${encodeURIComponent(code)}`)
                if (!res.ok) {
                    setState("failed")
                    return
                }
                const data = await res.json()
                if (data.status !== "approved" || !data.token) {
                    setState("failed")
                    return
                }

                const cred = await signInWithCustomToken(auth, data.token)
                // Mint the session cookie via the production path BEFORE
                // redirecting, so the destination SSR sees an authenticated
                // request (no /login bounce from middleware).
                await syncSessionCookie(cred.user)

                const next = params.get("next")
                const dest =
                    next && next.startsWith("/") && !next.startsWith("//")
                        ? next
                        : "/setlists"
                router.replace(dest)
            } catch (err) {
                logger.error("[test-login] sign-in failed", err)
                setState("failed")
            }
        }
        run()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (state === "failed") {
        return (
            <div className="flex flex-col items-center gap-3 py-6" role="alert">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm font-medium text-foreground">
                    Invalid or expired login link
                </p>
                <p className="text-xs text-muted-foreground">
                    Test login links are single-use and expire after 5 minutes.
                    Mint a fresh one with create_test_account.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center gap-3 py-6" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm font-medium text-foreground">Signing in…</p>
        </div>
    )
}
