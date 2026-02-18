"use client"

/**
 * QR Sign-In for Shared Devices
 *
 * Displays a QR code that musicians scan with their phone.
 * The phone approves the sign-in, and this component automatically
 * signs in on the current device using a Firebase custom token.
 *
 * Lifecycle: create session → show QR → poll → receive token → sign in
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { signInWithCustomToken } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { QRCodeSVG } from "qrcode.react"
import { Smartphone, RefreshCw, Loader2 } from "lucide-react"
import { logger } from "@/lib/logger"

type QRState = "creating" | "active" | "approved" | "signing-in" | "error"

interface SessionData {
    code: string
    expiresAt: number
}

export function QRSignIn() {
    const [state, setState] = useState<QRState>("creating")
    const [session, setSession] = useState<SessionData | null>(null)
    const [approvedName, setApprovedName] = useState<string | null>(null)
    const [timeLeft, setTimeLeft] = useState(0)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const cleanup = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    }, [])

    const createSession = useCallback(async () => {
        cleanup()
        setState("creating")
        try {
            const res = await fetch("/api/auth/qr", { method: "POST" })
            if (!res.ok) throw new Error("Failed to create session")
            const data = await res.json()
            setSession({ code: data.code, expiresAt: data.expiresAt })
            setTimeLeft(Math.ceil((data.expiresAt - Date.now()) / 1000))
            setState("active")
        } catch (err) {
            logger.error("[QR] Create session error:", err)
            setState("error")
        }
    }, [cleanup])

    // Create session on mount
    useEffect(() => {
        createSession()
        return cleanup
    }, [createSession, cleanup])

    // Poll for approval when active
    useEffect(() => {
        if (state !== "active" || !session) return

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/auth/qr?code=${session.code}`)

                if (res.status === 410 || res.status === 404) {
                    // Expired — auto-refresh
                    createSession()
                    return
                }

                if (!res.ok) return

                const data = await res.json()

                if (data.status === "approved" && data.token) {
                    cleanup()
                    setApprovedName(data.userName || null)
                    setState("signing-in")

                    // Sign in on this device
                    await signInWithCustomToken(auth, data.token)
                    setState("approved")
                    // Auth state change will trigger the app to reload/redirect
                }
            } catch {
                // Silent — will retry on next poll
            }
        }, 2000)

        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [state, session, createSession, cleanup])

    // Countdown timer
    useEffect(() => {
        if (state !== "active") return

        countdownRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    // Expired — auto-refresh
                    createSession()
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
    }, [state, createSession])

    const qrUrl = session
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/qr/${session.code}`
        : ""

    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60

    // ── Render ──

    if (state === "creating") {
        return (
            <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Generating QR code…</p>
            </div>
        )
    }

    if (state === "signing-in" || state === "approved") {
        return (
            <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-green-500" />
                </div>
                <p className="text-sm font-medium text-foreground">
                    Signing in{approvedName ? ` as ${approvedName}` : ""}…
                </p>
            </div>
        )
    }

    if (state === "error") {
        return (
            <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-xs text-muted-foreground">Couldn&apos;t generate QR code</p>
                <button
                    onClick={createSession}
                    className="text-xs text-violet-500 hover:text-violet-400 flex items-center gap-1"
                >
                    <RefreshCw className="h-3 w-3" /> Try again
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center gap-4">
            {/* QR Code */}
            <div className="bg-white p-3 rounded-xl shadow-sm">
                <QRCodeSVG
                    value={qrUrl}
                    size={160}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                />
            </div>

            {/* Instructions */}
            <div className="flex items-center gap-2 text-muted-foreground">
                <Smartphone className="h-4 w-4 shrink-0" />
                <p className="text-xs">Scan with your phone to sign in</p>
            </div>

            {/* Countdown */}
            <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                Expires in {minutes}:{seconds.toString().padStart(2, "0")}
            </p>
        </div>
    )
}
