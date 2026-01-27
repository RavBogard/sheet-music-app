"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Music2, Loader2 } from "lucide-react"

export default function LoginPage() {
    const { user, loading, signIn } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!loading && user) {
            router.replace("/") // Redirect to home if already logged in
        }
    }, [user, loading, router])

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
                <Loader2 className="animate-spin h-8 w-8 text-zinc-500" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white p-4">
            <div className="w-full max-w-md space-y-8 text-center">
                <div className="flex flex-col items-center gap-4">
                    <img
                        src="/logo.jpg"
                        alt="CRC"
                        className="h-24 w-24 rounded-full border-2 border-zinc-700 object-cover"
                    />
                    <h1 className="text-3xl font-bold">CRC Music Books</h1>
                    <p className="text-zinc-400">
                        Please sign in to access the digital sheet music library.
                    </p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-6 shadow-xl">
                    <Button
                        size="lg"
                        className="w-full bg-white text-black hover:bg-zinc-200 transition-colors h-12 text-lg font-medium"
                        onClick={signIn}
                    >
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="h-6 w-6 mr-3" alt="Google" />
                        Sign in with Google
                    </Button>
                    <p className="text-xs text-zinc-600">
                        Only authorized accounts can access sensitive material.
                    </p>
                </div>
            </div>
        </div>
    )
}
