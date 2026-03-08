"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, Loader2, Import } from "lucide-react"
import { Button } from "@/components/ui/button"
import { collection, query, orderBy, limit, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { getAllTemplateKeys, getDefaultTemplate, TEMPLATE_LABELS, convertSetlistToTemplate, type TemplateSlot } from "@/lib/liturgical-templates"
import { useCustomTemplates } from "@/lib/template-firebase"
import { TemplateEditor } from "./TemplateEditor"
import type { SetlistTrack } from "@/types/models"
import { toast } from "sonner"

interface SetlistSummary {
    id: string
    name: string
    trackCount: number
    date?: string
    tracks: SetlistTrack[]
}

export default function TemplatesPage() {
    const { isAdmin, isBandLeader, loading: authLoading } = useAuth()
    const router = useRouter()
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const { overrides, loading: templatesLoading } = useCustomTemplates()
    const [importedSlots, setImportedSlots] = useState<TemplateSlot[] | null>(null)
    const [showImportPicker, setShowImportPicker] = useState(false)
    const [recentSetlists, setRecentSetlists] = useState<SetlistSummary[]>([])
    const [loadingSetlists, setLoadingSetlists] = useState(false)

    const handleImportConsumed = useCallback(() => {
        setImportedSlots(null)
    }, [])

    const openImportPicker = async () => {
        if (!selectedKey) {
            toast.error("Select a template first")
            return
        }
        setLoadingSetlists(true)
        setShowImportPicker(true)
        try {
            const q = query(
                collection(db, "setlists"),
                where("isPublic", "==", true),
                orderBy("date", "desc"),
                limit(10),
            )
            const snap = await getDocs(q)
            const setlists: SetlistSummary[] = snap.docs.map(d => {
                const data = d.data()
                return {
                    id: d.id,
                    name: data.name || "Untitled",
                    trackCount: data.trackCount || (data.tracks?.length ?? 0),
                    date: data.date?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '',
                    tracks: data.tracks || [],
                }
            })
            setRecentSetlists(setlists)
        } catch (err) {
            toast.error("Failed to fetch setlists")
            setShowImportPicker(false)
        } finally {
            setLoadingSetlists(false)
        }
    }

    const handlePickSetlist = (setlist: SetlistSummary) => {
        const slots = convertSetlistToTemplate(setlist.tracks)
        setImportedSlots(slots)
        setShowImportPicker(false)
        toast.success(`Imported ${slots.length} slots from "${setlist.name}" — review and save`)
    }

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
                    <div className="flex-1" />
                    <Button variant="outline" size="sm" onClick={openImportPicker} disabled={!selectedKey}>
                        <Import className="h-3.5 w-3.5 mr-1.5" />
                        Import from Setlist
                    </Button>
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
                                importedSlots={importedSlots}
                                onImportConsumed={handleImportConsumed}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-64 text-muted-foreground">
                                Select a template to edit
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Import from Setlist picker dialog */}
            {showImportPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowImportPicker(false)}>
                    <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">Import from Setlist</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Pick a setlist to import its tracks as template slots into &ldquo;{TEMPLATE_LABELS[selectedKey!]?.label ?? selectedKey}&rdquo;.
                        </p>
                        {loadingSetlists ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                            </div>
                        ) : recentSetlists.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No setlists found</p>
                        ) : (
                            <div className="space-y-1">
                                {recentSetlists.map(sl => (
                                    <button
                                        key={sl.id}
                                        onClick={() => handlePickSetlist(sl)}
                                        className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors"
                                    >
                                        <div className="font-medium">{sl.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {sl.trackCount} tracks{sl.date ? ` \u00b7 ${sl.date}` : ''}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setShowImportPicker(false)}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}
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
