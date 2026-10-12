"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { FEATURE_KEYS, type OrgConfig } from "@/lib/org/config-schema"
import type { TenantDetail } from "@/lib/platform/tenants"
import { platformApi } from "../api"
import { DiffPreview, ErrorLine, FEATURE_LABELS, PlatformCard, useDryRun } from "../shared"

type Features = OrgConfig["features"]

export function FeaturesSection({ detail, onSaved }: { detail: TenantDetail; onSaved: () => void }) {
    const orgId = detail.summary.orgId
    const [features, setFeatures] = useState<Features>(detail.config.features)
    const run = useDryRun<Features>(onSaved)
    const dirty = FEATURE_KEYS.some((k) => features[k] !== detail.config.features[k])

    return (
        <PlatformCard id="features" title="Features" description="Charts, setlists and Claude are always on.">
            <ul className="divide-y divide-border">
                {FEATURE_KEYS.map((k) => (
                    <li key={k} className="flex items-center justify-between gap-4 py-2.5">
                        <div>
                            <label htmlFor={`feature-${k}`} className="text-sm font-medium cursor-pointer">{FEATURE_LABELS[k].label}</label>
                            <p className="text-xs text-muted-foreground">{FEATURE_LABELS[k].hint}</p>
                        </div>
                        <Switch
                            id={`feature-${k}`}
                            checked={features[k]}
                            disabled={!!run.result || run.busy}
                            onCheckedChange={(v) => setFeatures((f) => ({ ...f, [k]: v }))}
                        />
                    </li>
                ))}
            </ul>
            <ErrorLine error={run.error} />
            {run.result ? (
                <DiffPreview result={run.result} busy={run.busy} onApply={() => void run.apply()} onCancel={run.cancel} />
            ) : (
                <div className="flex gap-2">
                    <Button disabled={!dirty || run.busy} onClick={() => void run.preview((dry) => platformApi.setFeatures(orgId, features, dry))}>
                        Save features
                    </Button>
                    {dirty && <Button variant="outline" onClick={() => setFeatures(detail.config.features)}>Undo changes</Button>}
                </div>
            )}
        </PlatformCard>
    )
}
