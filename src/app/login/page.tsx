"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-context"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

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

export default function LoginPage() {
    const { user, loading, signIn } = useAuth()
    const congregation = useCongregation()
    const router = useRouter()
    const [signingIn, setSigningIn] = useState(false)

    useEffect(() => {
        if (!loading && user) {
            router.replace("/")
        }
         
    }, [user?.uid, loading, router])

    const handleSignIn = async () => {
        setSigningIn(true)
        try {
            await signIn()
        } finally {
            setSigningIn(false)
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
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-8 text-center">
                <div className="flex flex-col items-center gap-4">
                    <img
                        src="/logo.jpg"
                        alt={congregation.shortName}
                        className="h-20 w-20 rounded-full border border-border object-cover shadow-sm"
                    />
                    <div>
                        <h1 className="text-2xl font-semibold text-foreground">{congregation.shortName}</h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Sign in to access the music library
                        </p>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
                    <Button
                        size="lg"
                        className="w-full bg-foreground text-background hover:opacity-90 transition-opacity h-12 text-base font-medium rounded-xl"
                        onClick={handleSignIn}
                        disabled={signingIn}
                    >
                        {signingIn ? (
                            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                        ) : (
                            <GoogleIcon className="h-5 w-5 mr-3" />
                        )}
                        {signingIn ? "Opening Google…" : "Sign in with Google"}
                    </Button>
                    <p className="text-xs text-muted-foreground/60">
                        Only authorized accounts can access the full library.
                    </p>
                </div>

                <p className="text-xs text-muted-foreground/40">
                    {congregation.name} · {congregation.location}
                </p>
            </div>
        </div>
    )
}
