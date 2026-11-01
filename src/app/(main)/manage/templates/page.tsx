"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ChevronLeft, Loader2 } from "lucide-react"
import { PageContainer, PageHeader } from "@/components/layout/Page"
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
        // Option B: the one page container and head row, as Manage.
        <PageContainer className="space-y-4 pb-24">
            <PageHeader
                leading={
                    <button
                        type="button"
                        aria-label={t("manage-templates.backToManage")}
                        onClick={() => router.push("/manage")}
                        className="-ms-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <DirectionalIcon icon={ChevronLeft} aria-hidden className="h-5 w-5" />
                    </button>
                }
                title={t("manage-templates.pageTitle")}
            />
            <TemplatesSection />
        </PageContainer>
    )
}
