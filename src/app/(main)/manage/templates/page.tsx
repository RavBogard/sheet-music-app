"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/Page"
import { TemplatesSection } from "@/components/admin/TemplatesSection"
import { UnauthorizedState } from "@/components/ui/unauthorized-state"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useT } from "@/i18n/client"

export default function TemplatesPage() {
    const { isBandLeader, loading: authLoading } = useAuth()
    const router = useRouter()
    const t = useT()

    if (authLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
        )
    }

    if (!isBandLeader) {
        return (
            <UnauthorizedState 
                title={t("manage-templates.leadersOnlyTitle")} 
                description={t("manage-templates.leadersOnlyDescription")} 
            />
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-5xl mx-auto">
                <PageHeader
                    className="mb-6"
                    leading={
                        <Button variant="ghost" size="icon" aria-label={t("manage-templates.backToManage")} onClick={() => router.push("/manage")} className="rounded-full hover:bg-accent">
                            <DirectionalIcon icon={ArrowLeft} className="w-5 h-5" />
                        </Button>
                    }
                    title={t("manage-templates.pageTitle")}
                />
                <TemplatesSection />
            </div>
        </div>
    )
}
