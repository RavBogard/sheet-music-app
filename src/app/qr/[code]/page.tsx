"use client"

/**
 * QR Sign-In Approval Page
 *
 * Opened on a musician's phone after scanning a QR code from a shared iPad.
 * If the phone user is signed in: one-tap approve.
 * If not: sign in with Google first, then approve.
 */

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, Monitor, AlertCircle, LogIn } from "lucide-react"
import { logger } from "@/lib/logger"

type PageState = "loading" | "ready" | "approving" | "success" | "expired" | "error"

export default function QRApprovePage() {
    const params = useParams()
    const router = useRouter()
    const code = params?.code as string
    const { user, signIn, loading: authLoading } = useAuth()
    const [state, setState] = useState<PageState>("loading")
    const [error, setError] = useState<string | null>(null)
    const [autoApproveAttempted, setAutoApproveAttempted] = useState(false)

    // Check if the session is still valid
    useEffect(() => {
        if (!code) return
        fetch(`/api/auth/qr?code=${code}`)
            .then(res => {
                if (res.status === 410) setState("expired")
                else if (res.status === 404) setState("expired")
                else if (res.ok) setState("ready")
                else setState("error")
            })
            .catch(() => setState("error"))
    }, [code])

    // Auto-approve if user is already signed in and session is ready
    useEffect(() => {
        if (state === "ready" && user && !autoApproveAttempted) {
            setAutoApproveAttempted(true)
            handleApprove()
        }
     
    }, [state, user?.uid])

    const handleApprove = async () => {
        if (!user) return
        setState("approving")
        try {
            const idToken = await auth.currentUser?.getIdToken()
            if (!idToken) throw new Error("No auth token")

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
                throw new Error(data.error || "Approval failed")
            }

            setState("success")
        } catch (err) {
            logger.error("[QR Approve]", err)
            setError(err instanceof Error ? err.message : "Something went wrong")
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
                <p className="text-muted-foreground text-sm">Checking session…</p>
            </Shell>
        )
    }

    if (state === "expired") {
        return (
            <Shell>
                <AlertCircle className="h-12 w-12 text-amber-500" />
                <h1 className="text-xl font-bold text-foreground">Session Expired</h1>
                <p className="text-muted-foreground text-sm text-center">
                    This QR code has expired. Ask for a new one on the iPad.
                </p>
            </Shell>
        )
    }

    if (state === "error") {
        return (
            <Shell>
                <AlertCircle className="h-12 w-12 text-red-500" />
                <h1 className="text-xl font-bold text-foreground">Something Went Wrong</h1>
                <p className="text-muted-foreground text-sm text-center">{error || "Please try again."}</p>
                <Button variant="outline" onClick={() => router.push("/")}>Go Home</Button>
            </Shell>
        )
    }

    if (state === "success") {
        return (
            <Shell>
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Signed In!</h1>
                <p className="text-muted-foreground text-sm text-center">
                    The iPad is now signed in as <span className="font-semibold text-foreground">{user?.displayName || user?.email}</span>.
                    You can close this page.
                </p>
            </Shell>
        )
    }

    if (state === "approving") {
        return (
            <Shell>
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-foreground font-medium">Signing in on iPad…</p>
            </Shell>
        )
    }

    // state === "ready"
    if (!user) {
        return (
            <Shell>
                <Monitor className="h-12 w-12 text-violet-500" />
                <h1 className="text-xl font-bold text-foreground">Sign In on iPad</h1>
                <p className="text-muted-foreground text-sm text-center">
                    Sign in with your Google account to continue on the nearby device.
                </p>
                <Button
                    onClick={handleSignInThenApprove}
                    className="w-full max-w-xs h-12 rounded-xl font-semibold text-base"
                >
                    <LogIn className="h-5 w-5 mr-2" />
                    Sign In with Google
                </Button>
            </Shell>
        )
    }

    // User is signed in, session is ready — auto-approve should have fired,
    // but show a manual button as fallback
    return (
        <Shell>
            <Monitor className="h-12 w-12 text-violet-500" />
            <h1 className="text-xl font-bold text-foreground">Sign In on iPad</h1>
            <p className="text-muted-foreground text-sm text-center">
                Tap below to sign in as <span className="font-semibold text-foreground">{user.displayName || user.email}</span> on the nearby device.
            </p>
            <Button
                onClick={handleApprove}
                className="w-full max-w-xs h-14 rounded-xl font-bold text-lg bg-violet-600 hover:bg-violet-500"
            >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Approve Sign-In
            </Button>
        </Shell>
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
