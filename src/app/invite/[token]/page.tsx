"use client"

/**
 * Multi-tenant phase 4: accept a tenant invitation.
 *
 * The platform owner sends a link (the tenant's address + /invite/<token>).
 * Signed out: sign in with Google first. Signed in: one button. The server
 * checks the address, the email and that the link is unused and current.
 * Same layout as the QR approval page.
 */

import { useEffect, useState, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2, Loader2, LogIn, MailOpen } from "lucide-react"
import { useT } from "@/i18n/client"

type Peek = {
    orgId: string
    tenantName: string
    role: "admin" | "band_leader" | "musician" | "member"
    email: string
    status: "open" | "accepted" | "expired" | "revoked"
}

type PageState = "loading" | "ready" | "accepting" | "success" | "unavailable" | "error"

// One whole sentence per role (articles and word order differ by language).
const JOINED = {
    admin: "invite.joinedAdmin",
    band_leader: "invite.joinedBandLeader",
    musician: "invite.joinedMusician",
    member: "invite.joinedMember",
} as const satisfies Record<Peek["role"], string>

const INVITED = {
    admin: "invite.invitedAdmin",
    band_leader: "invite.invitedBandLeader",
    musician: "invite.invitedMusician",
    member: "invite.invitedMember",
} as const satisfies Record<Peek["role"], string>

// Fixed messages are kept as keys (translated at render); a server-sent error stays as its text.
const MESSAGE = {
    notValid: "invite.notValid",
    expired: "invite.expired",
    alreadyUsed: "invite.alreadyUsed",
    somethingWrong: "invite.somethingWrong",
} as const
type Message = { key: (typeof MESSAGE)[keyof typeof MESSAGE] } | { text: string }

export default function InvitePage() {
    const params = useParams()
    const router = useRouter()
    const token = (params?.token as string) ?? ""
    const { user, signIn, loading: authLoading } = useAuth()
    const [state, setState] = useState<PageState>("loading")
    const [peek, setPeek] = useState<Peek | null>(null)
    const [message, setMessage] = useState<Message | null>(null)
    const t = useT()

    useEffect(() => {
        if (!token) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`)
                if (cancelled) return
                if (!res.ok) {
                    setMessage({ key: MESSAGE.notValid })
                    setState("unavailable")
                    return
                }
                const p = (await res.json()) as Peek
                setPeek(p)
                if (p.status === "open") setState("ready")
                else {
                    setMessage({ key: p.status === "expired" ? MESSAGE.expired : MESSAGE.alreadyUsed })
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
            if (!idToken) throw new Error(t("invite.signInFirst"))
            const res = await fetch("/api/invite/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ token }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || t("invite.acceptFailed"))
            // Pick up the new role in the session claims.
            await auth.currentUser?.getIdToken(true).catch(() => {})
            setState("success")
        } catch (err) {
            setMessage(err instanceof Error ? { text: err.message } : { key: MESSAGE.somethingWrong })
            setState("error")
        }
    }

    if (authLoading || state === "loading") {
        return (
            <Shell>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-sm">{t("invite.checking")}</p>
            </Shell>
        )
    }

    if (state === "unavailable" || state === "error") {
        return (
            <Shell>
                <AlertCircle className="h-12 w-12 text-amber-500" />
                <h1 className="text-xl font-bold text-foreground">{t("invite.unavailableTitle")}</h1>
                <p className="text-muted-foreground text-sm text-center max-w-sm">{message ? ("key" in message ? t(message.key) : message.text) : t("invite.tryAgain")}</p>
                <Button variant="outline" onClick={() => router.push("/")}>
                    {t("invite.goHome")}
                </Button>
            </Shell>
        )
    }

    if (state === "success" && peek) {
        return (
            <Shell>
                <CheckCircle2 className="h-12 w-12 text-success" />
                <h1 className="text-xl font-bold text-foreground">{t("invite.joinedTitle")}</h1>
                <p className="text-muted-foreground text-sm text-center max-w-sm">
                    {t(JOINED[peek.role], { tenantName: peek.tenantName })}
                </p>
                <Button onClick={() => router.push("/")}>{t("invite.continue")}</Button>
            </Shell>
        )
    }

    if (!peek) return null
    const invited = t(INVITED[peek.role], { tenantName: peek.tenantName })

    return (
        <Shell>
            <MailOpen className="h-12 w-12 text-primary" />
            <h1 className="text-xl font-bold text-foreground text-center max-w-sm">{invited}</h1>
            {!user ? (
                <>
                    <p className="text-muted-foreground text-sm text-center max-w-sm">
                        {withBold(t("invite.signInForEmail", { email: SLOT }), peek.email)}
                    </p>
                    <Button onClick={() => signIn()} className="w-full max-w-xs h-12 rounded-xl font-semibold text-base">
                        <LogIn className="h-5 w-5 me-2" />
                        {t("invite.signInWithGoogle")}
                    </Button>
                </>
            ) : (
                <>
                    <p className="text-muted-foreground text-sm text-center max-w-sm">
                        {withBold(t("invite.signedInAs", { email: SLOT }), user.email)}
                    </p>
                    <Button
                        onClick={accept}
                        disabled={state === "accepting"}
                        className="w-full max-w-xs h-12 rounded-xl font-semibold text-base"
                    >
                        {state === "accepting" ? <Loader2 className="h-5 w-5 me-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 me-2" />}
                        {t("invite.accept")}
                    </Button>
                </>
            )}
        </Shell>
    )
}

/** Marks where the bold value goes inside a translated sentence (never shown). */
const SLOT = "\u0000"

/** A translated sentence with a value in bold at its placeholder. */
function withBold(text: string, value: ReactNode): ReactNode {
    const [before, ...rest] = text.split(SLOT)
    if (rest.length === 0) return text
    return (
        <>
            {before}
            <span className="font-semibold text-foreground">{value}</span>
            {rest.join("")}
        </>
    )
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 p-6 bg-background">{children}</div>
}
