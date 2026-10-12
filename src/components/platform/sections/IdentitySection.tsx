"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { OrgConfig } from "@/lib/org/config-schema"
import type { TenantDetail } from "@/lib/platform/tenants"
import { platformApi } from "../api"
import { checkIdentity, formValues, IDENTITY_FIELDS, kindAt } from "../identity-fields"
import { DiffPreview, ErrorLine, PlatformCard, selectClass, useDryRun } from "../shared"

export function IdentitySection({ detail, onSaved }: { detail: TenantDetail; onSaved: () => void }) {
    const orgId = detail.summary.orgId
    const initial = useMemo(() => formValues(detail.config), [detail.config])
    const [values, setValues] = useState(initial)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const run = useDryRun<OrgConfig>(onSaved)

    const dirty = IDENTITY_FIELDS.some((f) => values[f.path] !== initial[f.path])

    const save = () => {
        const check = checkIdentity(detail.config, values)
        setErrors(check.errors)
        if (Object.keys(check.errors).length > 0 || check.changed.length === 0) return
        void run.preview((dryRun) => platformApi.updateTenant(orgId, check.patch, dryRun))
    }

    return (
        <PlatformCard id="identity" title="Identity" description="Name, look and language. Checked against the tenant config rules before anything is sent.">
            <div className="grid gap-4 md:grid-cols-2">
                {IDENTITY_FIELDS.map((f) => {
                    const k = kindAt(f.path)
                    if (!k) return null
                    const id = `identity-${f.path.replace(/\./g, "-")}`
                    const err = errors[f.path]
                    const set = (v: string) => setValues((s) => ({ ...s, [f.path]: v }))
                    return (
                        <div key={f.path} className={k.kind === "record" ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
                            <Label htmlFor={id}>{f.label}</Label>
                            {k.kind === "enum" ? (
                                <select id={id} className={`${selectClass} w-full`} value={values[f.path]} onChange={(e) => set(e.target.value)}>
                                    {k.options.map((o) => (
                                        <option key={o} value={o}>{f.optionLabels?.[o] ?? o}</option>
                                    ))}
                                </select>
                            ) : k.kind === "record" ? (
                                <Textarea id={id} rows={3} className="font-mono text-xs" value={values[f.path]} onChange={(e) => set(e.target.value)} aria-invalid={!!err} />
                            ) : (
                                <Input id={id} value={values[f.path]} onChange={(e) => set(e.target.value)} aria-invalid={!!err} />
                            )}
                            {err ? (
                                <p className="text-xs text-destructive">{err}</p>
                            ) : f.hint ? (
                                <p className="text-xs text-muted-foreground">{f.hint}</p>
                            ) : null}
                        </div>
                    )
                })}
            </div>
            <ErrorLine error={errors._form ?? null} />
            <ErrorLine error={run.error} />
            {run.result ? (
                <DiffPreview result={run.result} busy={run.busy} onApply={() => void run.apply()} onCancel={run.cancel} />
            ) : (
                <div className="flex gap-2">
                    <Button onClick={save} disabled={!dirty || run.busy}>
                        {run.busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                        Save
                    </Button>
                    {dirty && (
                        <Button variant="outline" onClick={() => { setValues(initial); setErrors({}) }}>Undo changes</Button>
                    )}
                </div>
            )}
        </PlatformCard>
    )
}
