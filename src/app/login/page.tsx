"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-context"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
    const { user, loading, signIn } = useAuth()
    const congregation = useCongregation()
    const router = useRouter()

    useEffect(() => {
        if (!loading && user) {
            router.replace("/")
        }
    }, [user, loading, router])

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
                        <h1 className="text-2xl font-semibold text-foreground">CentralReform.live</h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Sign in to access the music library
                        </p>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
                    <Button
                        size="lg"
                        className="w-full bg-foreground text-background hover:opacity-90 transition-opacity h-12 text-base font-medium rounded-xl"
                        onClick={signIn}
                    >
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="h-5 w-5 mr-3" alt="Google" />
                        Sign in with Google
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
