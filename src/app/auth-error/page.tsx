"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle, LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export default function AuthErrorPage() {
    const { signOut } = useAuth()

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
            <div className="max-w-md space-y-6">
                <div className="flex justify-center">
                    <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-4">
                        <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-500" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Authentication Error
                    </h1>
                    <p className="text-muted-foreground">
                        We detected an issue with your login session that was causing a redirect loop. 
                        This usually happens when your browser&apos;s cached data gets out of sync with the server.
                    </p>
                </div>

                <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-4">
                        Clicking the button below will securely clear your local session and let you log in fresh.
                    </p>
                    <Button 
                        onClick={signOut}
                        className="w-full sm:w-auto min-w-[200px]"
                        size="lg"
                    >
                        <LogOut className="mr-2 h-5 w-5" />
                        Refresh Session
                    </Button>
                </div>
            </div>
        </div>
    )
}
