"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle, LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useT } from "@/i18n/client"

export default function AuthErrorPage() {
    const { signOut } = useAuth()
    const t = useT()

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
            <div className="max-w-md space-y-6">
                <div className="flex justify-center">
                    <div className="rounded-full bg-destructive/10 p-4">
                        <AlertTriangle className="h-10 w-10 text-destructive" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {t("auth.authErrorTitle")}
                    </h1>
                    <p className="text-muted-foreground">
                        {t("auth.authErrorBody")}
                    </p>
                </div>

                <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-4">
                        {t("auth.authErrorHint")}
                    </p>
                    <Button 
                        onClick={signOut}
                        className="w-full sm:w-auto min-w-[200px]"
                        size="lg"
                    >
                        <LogOut className="me-2 h-5 w-5" />
                        {t("auth.authErrorRefresh")}
                    </Button>
                </div>
            </div>
        </div>
    )
}
