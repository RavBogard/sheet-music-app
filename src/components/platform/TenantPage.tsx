"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import type { TenantDetail } from "@/lib/platform/tenants"
import { errorText, platformApi } from "./api"
import { ErrorLine, StatusChip } from "./shared"
import { IdentitySection } from "./sections/IdentitySection"
import { FeaturesSection } from "./sections/FeaturesSection"
import { StatusSection } from "./sections/StatusSection"
import { AddressesSection } from "./sections/AddressesSection"
import { PeopleSection } from "./sections/PeopleSection"
import { CollectionsSection } from "./sections/CollectionsSection"
import { ViewAsSection } from "./sections/ViewAsSection"

const JUMP = [
    ["identity", "Identity"],
    ["features", "Features"],
    ["status", "Status"],
    ["addresses", "Addresses"],
    ["people", "People"],
    ["collections", "Collections"],
    ["view-as", "View as"],
] as const

export function TenantPage({ orgId }: { orgId: string }) {
    const [detail, setDetail] = useState<TenantDetail | null>(null)
    const [error, setError] = useState<string | null>(null)
    /** Bumped after every applied change so each section re-reads the fresh config. */
    const [version, setVersion] = useState(0)

    const load = useCallback(async () => {
        setError(null)
        try {
            setDetail(await platformApi.getTenant(orgId))
            setVersion((v) => v + 1)
        } catch (e) {
            setError(errorText(e))
        }
    }, [orgId])

    useEffect(() => { void load() }, [load])

    const reload = () => void load()

    return (
        <div className="space-y-6">
            <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> All tenants
            </Link>
            {!detail ? (
                error ? <ErrorLine error={error} /> : (
                    <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading tenant…</p>
                )
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold">{detail.summary.name}</h2>
                        <code className="text-xs text-muted-foreground">{detail.summary.orgId}</code>
                        <StatusChip tone={detail.summary.status === "active" ? "good" : "bad"}>
                            {detail.summary.status === "active" ? "Active" : "Suspended"}
                        </StatusChip>
                    </div>
                    <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
                        {JUMP.map(([id, label]) => (
                            <a key={id} href={`#${id}`} className="text-xs rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                                {label}
                            </a>
                        ))}
                    </nav>
                    <ErrorLine error={error} />
                    <div key={version} className="space-y-6">
                        <IdentitySection detail={detail} onSaved={reload} />
                        <FeaturesSection detail={detail} onSaved={reload} />
                        <StatusSection detail={detail} onSaved={reload} />
                        <AddressesSection detail={detail} onChanged={reload} />
                        <PeopleSection detail={detail} />
                        <CollectionsSection detail={detail} />
                        <ViewAsSection detail={detail} />
                    </div>
                </>
            )}
        </div>
    )
}
