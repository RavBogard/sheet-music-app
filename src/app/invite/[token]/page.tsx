"use client"

/**
 * Multi-tenant phase 4: accept a tenant invitation.
 *
 * The platform owner sends a link (the tenant's address + /invite/<token>).
 * Signed out: sign in with Google first. Signed in: one button. The server
 * checks the address, the email and that the link is unused and current.
 * Same layout as the QR approval page.
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2, Loader2, LogIn, MailOpen } from "lucide-react"

type Peek = {
    orgId: string
    tenantName: string
    role: "admin" | "band_leader" | "musician" | "member"
    email: string
    status: "open" | "accepted" | "expired" | "revoked"
}

type PageState = "loading" | "ready" | "accepting" | "success" | "unavailable" | "error"

const ROLE_WORDS: Record<Peek["role"], string> = {
    admin: "an admin",
    band_leader: "a band leader",
    musician: "a musician",
    member: "a member",
}

export default function InvitePage() {
    const params = useParams()
    const router = useRouter()
    const token = (params?.token as string) ?? ""
    const { user, signIn, loading: authLoading } = useAuth()
    const [state, setState] = useState<PageState>("loading")
    const [peek, setPeek] = useState<Peek | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        if (!token) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`)
                if (cancelled) return
                if (!res.ok) {
                    setMessage("This invitation link is not valid. Ask for a new one.")
                    setState("unavailable")
                    return
                }
                const p = (await res.json()) as Peek
                setPeek(p)
                if (p.status === "open") setState("ready")
                else {
                    setMessage(
                        p.status === "expired"
                            ? "This invitation has expired. Ask for a new one."
                            : "This invitation has already been used.",
                    )
                    setState("unavailable")
                }
            } catch {
                if (!cancelled) setState("error")
            }
        })()
        return () => {
            cancelled = true
        }
    }, [token])

    const accept = async () => {
        setState("accepting")
        try {
            const idToken = await auth.currentUser?.getIdToken()
            if (!idToken) throw new Error("Please sign in first.")
            const res = await fetch("/api/invite/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ token }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "The invitation could not be accepted.")
            // Pick up the new role in the session claims.
            await auth.currentUser?.getIdToken(true).catch(() => {})
            setState("success")
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Something went wrong.")
            setState("error")
        }
    }

    if (authLoading || state === "loading") {
        return (
            <Shell>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Checking the invitation…</p>
            </Shell>
        )
    }

    if (state === "unavailable" || state === "error") {
        return (
            <Shell>
                <AlertCircle className="h-12 w-12 text-amber-500" />
                <h1 className="text-xl font-bold text-foreground">Invitation not available</h1>
                <p className="text-muted-foreground text-sm text-center max-w-sm">{message || "Please try again."}</p>
                <Button variant="outline" onClick={() => router.push("/")}>
                    Go home
                </Button>
            </Shell>
        )
    }

    if (state === "success" && peek) {
        return (
            <Shell>
                <CheckCircle2 className="h-12 w-12 text-success" />
                <h1 className="text-xl font-bold text-foreground">You&rsquo;re in</h1>
                <p className="text-muted-foreground text-sm text-center max-w-sm">
                    You joined {peek.tenantName} as {ROLE_WORDS[peek.role]}.
                </p>
                <Button onClick={() => router.push("/")}>Continue</Button>
            </Shell>
        )
    }

    if (!peek) return null
    const invited = `You've been invited to join ${peek.tenantName} as ${ROLE_WORDS[peek.role]}.`

    return (
        <Shell>
            <MailOpen className="h-12 w-12 text-primary" />
            <h1 className="text-xl font-bold text-foreground text-center max-w-sm">{invited}</h1>
            {!user ? (
                <>
                    <p className="text-muted-foreground text-sm text-center max-w-sm">
                        Sign in with the Google account for <span className="font-semibold text-foreground">{peek.email}</span> to accept.
                    </p>
                    <Button onClick={() => signIn()} className="w-full max-w-xs h-12 rounded-xl font-semibold text-base">
                        <LogIn className="h-5 w-5 mr-2" />
                        Sign in with Google
                    </Button>
                </>
            ) : (
                <>
                    <p className="text-muted-foreground text-sm text-center max-w-sm">
                        Signed in as <span className="font-semibold text-foreground">{user.email}</span>.
                    </p>
                    <Button
                        onClick={accept}
                        disabled={state === "accepting"}
                        className="w-full max-w-xs h-12 rounded-xl font-semibold text-base"
                    >
                        {state === "accepting" ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                        Accept invitation
                    </Button>
                </>
            )}
        </Shell>
    )
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 p-6 bg-background">{children}</div>
}
