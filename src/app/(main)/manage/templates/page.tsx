"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAllTemplateKeys, getDefaultTemplate, TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { useCustomTemplates } from "@/lib/template-firebase"
import { TemplateEditor } from "./TemplateEditor"

export default function TemplatesPage() {
    const { isAdmin, isBandLeader, loading: authLoading } = useAuth()
    const router = useRouter()
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const { overrides, loading: templatesLoading } = useCustomTemplates()

    if (authLoading || templatesLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
        )
    }

    if (!isBandLeader) {
        router.replace("/setlists")
        return null
    }

    const templateKeys = getAllTemplateKeys()
    const regularKeys = templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === "regular")
    const holidayKeys = templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === "holiday")

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/manage")} className="rounded-full hover:bg-accent">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-2xl font-semibold">Template Editor</h1>
                </div>

                <div className="flex gap-6">
                    {/* Sidebar: template list */}
                    <div className="w-64 shrink-0 space-y-4">
                        <TemplateGroup
                            title="Regular Services"
                            keys={regularKeys}
                            overrides={overrides}
                            selectedKey={selectedKey}
                            onSelect={setSelectedKey}
                        />
                        <TemplateGroup
                            title="Holiday Services"
                            keys={holidayKeys}
                            overrides={overrides}
                            selectedKey={selectedKey}
                            onSelect={setSelectedKey}
                        />
                    </div>

                    {/* Main: editor */}
                    <div className="flex-1 min-w-0">
                        {selectedKey ? (
                            <TemplateEditor
                                templateKey={selectedKey}
                                defaultSlots={getDefaultTemplate(selectedKey) ?? []}
                                customSlots={overrides[selectedKey] ?? null}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-64 text-muted-foreground">
                                Select a template to edit
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function TemplateGroup({
    title,
    keys,
    overrides,
    selectedKey,
    onSelect,
}: {
    title: string
    keys: string[]
    overrides: Record<string, unknown>
    selectedKey: string | null
    onSelect: (key: string) => void
}) {
    return (
        <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</h3>
            <div className="space-y-1">
                {keys.map(key => {
                    const meta = TEMPLATE_LABELS[key]
                    const isSelected = selectedKey === key
                    const isCustomized = key in overrides
                    return (
                        <button
                            key={key}
                            onClick={() => onSelect(key)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                isSelected
                                    ? "bg-brand/10 text-brand border border-brand/30"
                                    : "hover:bg-accent border border-transparent"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span>{meta?.label ?? key}</span>
                                {isCustomized && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                                        Custom
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground">{meta?.slotCount ?? 0} slots</div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
