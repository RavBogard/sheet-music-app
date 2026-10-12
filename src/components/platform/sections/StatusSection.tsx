"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { OrgConfig } from "@/lib/org/config-schema"
import type { TenantDetail } from "@/lib/platform/tenants"
import { platformApi } from "../api"
import { ConfirmDialog, DiffPreview, ErrorLine, PlatformCard, StatusChip, useDryRun } from "../shared"

type Status = OrgConfig["status"]

export function StatusSection({ detail, onSaved }: { detail: TenantDetail; onSaved: () => void }) {
    const orgId = detail.summary.orgId
    const name = detail.summary.name
    const current = detail.config.status
    const next: Status = current === "active" ? "suspended" : "active"
    const run = useDryRun<Status>(onSaved)
    const [confirm, setConfirm] = useState(false)

    return (
        <PlatformCard
            id="status"
            title="Status"
            description="A suspended tenant's addresses show “No such site” until it is turned back on. Nothing is deleted."
            action={<StatusChip tone={current === "active" ? "good" : "bad"}>{current === "active" ? "Active" : "Suspended"}</StatusChip>}
        >
            <ErrorLine error={run.error} />
            {run.result ? (
                <DiffPreview
                    result={run.result}
                    busy={run.busy}
                    applyLabel={next === "suspended" ? "Suspend" : "Turn back on"}
                    onApply={() => (next === "suspended" ? setConfirm(true) : void run.apply())}
                    onCancel={run.cancel}
                />
            ) : (
                <Button
                    variant={next === "suspended" ? "outline" : "default"}
                    disabled={run.busy}
                    onClick={() => void run.preview((dry) => platformApi.setStatus(orgId, next, dry))}
                >
                    {next === "suspended" ? "Suspend tenant" : "Turn tenant back on"}
                </Button>
            )}
            <ConfirmDialog
                open={confirm}
                onOpenChange={setConfirm}
                title={`Suspend ${name}?`}
                description={`Everyone at ${name}'s addresses will see “No such site” until you turn it back on. Nothing is deleted.`}
                confirmLabel={`Suspend ${name}`}
                onConfirm={() => { setConfirm(false); void run.apply() }}
            />
        </PlatformCard>
    )
}
