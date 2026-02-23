"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Mail, ArrowLeft } from "lucide-react"
import { FirebaseError } from "firebase/app"

/** Inline Google logo — avoids DNS+TLS to svgrepo.com */
function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107" />
            <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00" />
            <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50" />
            <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2" />
        </svg>
    )
}

/** Map Firebase auth error codes to user-friendly messages */
function getAuthErrorMessage(error: unknown): string {
    if (error instanceof FirebaseError) {
        switch (error.code) {
            case "auth/invalid-email":
                return "Please enter a valid email address."
            case "auth/user-disabled":
                return "This account has been disabled. Contact an administrator."
            case "auth/user-not-found":
                return "No account found with this email address."
            case "auth/wrong-password":
                return "Incorrect password. Please try again."
            case "auth/invalid-credential":
                return "Invalid email or password. Please try again."
            case "auth/email-already-in-use":
                return "An account with this email already exists. Try signing in instead."
            case "auth/weak-password":
                return "Password must be at least 6 characters."
            case "auth/too-many-requests":
                return "Too many failed attempts. Please try again later."
            case "auth/network-request-failed":
                return "Network error. Please check your connection."
            case "auth/operation-not-allowed":
                return "Email/password sign-in is not enabled. Contact an administrator."
            default:
                return error.message || "An unexpected error occurred."
        }
    }
    return "An unexpected error occurred. Please try again."
}

export default function LoginPage() {
    const { user, loading, signIn, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()
    const congregation = useCongregation()
    const router = useRouter()
    const [signingIn, setSigningIn] = useState(false)

    // Email form state
    const [mode, setMode] = useState<"signin" | "signup">("signin")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [emailLoading, setEmailLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Password reset state
    const [showResetForm, setShowResetForm] = useState(false)
    const [resetEmail, setResetEmail] = useState("")
    const [resetLoading, setResetLoading] = useState(false)
    const [resetSuccess, setResetSuccess] = useState(false)
    const [resetError, setResetError] = useState<string | null>(null)

    useEffect(() => {
        if (!loading && user) {
            router.replace("/")
        }

    }, [user?.uid, loading, router])

    const handleGoogleSignIn = async () => {
        setSigningIn(true)
        try {
            await signIn()
        } finally {
            setSigningIn(false)
        }
    }

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setEmailLoading(true)
        try {
            if (mode === "signup") {
                await signUpWithEmail(email, password, displayName.trim() || email.split("@")[0])
            } else {
                await signInWithEmail(email, password)
            }
        } catch (err) {
            setError(getAuthErrorMessage(err))
        } finally {
            setEmailLoading(false)
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setResetError(null)
        setResetSuccess(false)
        setResetLoading(true)
        try {
            await resetPassword(resetEmail)
            setResetSuccess(true)
        } catch (err) {
            setResetError(getAuthErrorMessage(err))
        } finally {
            setResetLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
        )
    }

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
                        <img
                            src="/logo.jpg"
                            alt={congregation.shortName}
                            className="relative h-24 w-24 rounded-full border-2 border-border/60 object-cover shadow-lg shadow-brand/10"
                        />
                    </div>
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground font-display tracking-tight">{congregation.shortName}</h1>
                        <p className="text-muted-foreground text-sm mt-1.5">
                            Sign in to access the music library
                        </p>
                    </div>
                </div>

                <div className="glass-card rounded-2xl p-6 space-y-5">
                    {/* Google Sign-In */}
                    <Button
                        size="lg"
                        className="w-full bg-foreground text-background hover:opacity-90 transition-opacity h-12 text-base font-medium rounded-xl"
                        onClick={handleGoogleSignIn}
                        disabled={signingIn || emailLoading}
                    >
                        {signingIn ? (
                            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                        ) : (
                            <GoogleIcon className="h-5 w-5 mr-3" />
                        )}
                        {signingIn ? "Opening Google..." : "Sign in with Google"}
                    </Button>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground font-medium">or</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Password Reset Form */}
                    {showResetForm ? (
                        <div className="space-y-4 text-left">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowResetForm(false)
                                    setResetSuccess(false)
                                    setResetError(null)
                                }}
                                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                Back to sign in
                            </button>

                            <div>
                                <h3 className="font-semibold text-foreground">Reset password</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Enter your email and we will send you a reset link.
                                </p>
                            </div>

                            {resetSuccess ? (
                                <div className="bg-success/10 border border-success/20 text-success text-sm rounded-xl p-3">
                                    Password reset email sent! Check your inbox.
                                </div>
                            ) : (
                                <form onSubmit={handleResetPassword} className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="reset-email">Email</Label>
                                        <Input
                                            id="reset-email"
                                            type="email"
                                            placeholder="you@example.com"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                    </div>

                                    {resetError && (
                                        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl p-3">
                                            {resetError}
                                        </div>
                                    )}

                                    <Button
                                        type="submit"
                                        size="lg"
                                        className="w-full h-11 rounded-xl"
                                        disabled={resetLoading}
                                    >
                                        {resetLoading ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Mail className="h-4 w-4 mr-2" />
                                        )}
                                        Send reset link
                                    </Button>
                                </form>
                            )}
                        </div>
                    ) : (
                        /* Email/Password Form */
                        <form onSubmit={handleEmailSubmit} className="space-y-4 text-left">
                            {/* Mode toggle */}
                            <div className="flex rounded-xl bg-muted/50 p-1 border border-border">
                                <button
                                    type="button"
                                    onClick={() => { setMode("signin"); setError(null) }}
                                    className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
                                        mode === "signin"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Sign in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setMode("signup"); setError(null) }}
                                    className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
                                        mode === "signup"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Create account
                                </button>
                            </div>

                            {/* Display Name (signup only) */}
                            {mode === "signup" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="display-name">Display name</Label>
                                    <Input
                                        id="display-name"
                                        type="text"
                                        placeholder="Your name"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        autoComplete="name"
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                                />
                            </div>

                            {/* Error display */}
                            {error && (
                                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl p-3">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                size="lg"
                                className="w-full h-11 rounded-xl"
                                disabled={emailLoading || signingIn}
                            >
                                {emailLoading ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Mail className="h-4 w-4 mr-2" />
                                )}
                                {mode === "signup" ? "Create account" : "Sign in with email"}
                            </Button>

                            {/* Forgot password link (sign-in mode only) */}
                            {mode === "signin" && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowResetForm(true)
                                        setResetEmail(email)
                                    }}
                                    className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
                                >
                                    Forgot password?
                                </button>
                            )}
                        </form>
                    )}

                    <p className="text-xs text-muted-foreground/60">
                        Only authorized accounts can access the full library.
                    </p>
                </div>

                <p className="text-xs text-muted-foreground/40">
                    {congregation.name} &middot; {congregation.location}
                </p>
            </div>
        </div>
    )
}
