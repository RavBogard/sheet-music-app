"use client"

import { useState, useCallback } from "react"
import { Loader2, Import } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore"
import { getDb } from "@/lib/firebase"
import { getDefaultTemplate, TEMPLATE_LABELS, convertSetlistToTemplate, type TemplateSlot } from "@/lib/liturgical-templates"
import { useOrg } from "@/lib/org/org-context"
import { serviceTypeKeysFor, serviceTypeLabel } from "@/lib/org/tenant-lists"
import { useCustomTemplates } from "@/lib/template-firebase"
import { TemplateEditor } from "@/app/(main)/manage/templates/TemplateEditor"
import { fetchTracksForSetlistClient } from "@/lib/client-tracks"
import type { SetlistTrack } from "@/types/models"
import { toast } from "sonner"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"

interface SetlistSummary {
    id: string
    name: string
    trackCount: number
    date?: string
    tracks: SetlistTrack[]
    hydrated: boolean
}

export function TemplatesSection() {
    const org = useOrg()
    const t = useT()
    const fmt = useFormat()
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
            toast.error(t("admin-templates.selectFirst"))
            return
        }
        setLoadingSetlists(true)
        setShowImportPicker(true)
        try {
            const db = await getDb()
            // Multi-tenant phase 2: import only from this tenant's setlists.
            const q = query(
                collection(db, "setlists"),
                where("orgId", "==", org),
                orderBy("date", "desc"),
                limit(10),
            )
            const snap = await getDocs(q)
            const setlists: SetlistSummary[] = snap.docs.map(d => {
                const data = d.data()
                return {
                    id: d.id,
                    name: data.name || t("admin-templates.untitledSetlist"),
                    trackCount: data.trackCount || (data.tracks?.length ?? 0),
                    date: data.date?.toDate ? fmt.date(data.date, { month: 'short', day: 'numeric', year: 'numeric' }) : '',
                    tracks: data.tracks || [],
                    hydrated: data.hydrated === true,
                }
            })
            setRecentSetlists(setlists)
        } catch (err) {
            toast.error(t("admin-templates.fetchSetlistsFailed"))
            setShowImportPicker(false)
        } finally {
            setLoadingSetlists(false)
        }
    }

    const handlePickSetlist = async (setlist: SetlistSummary) => {
        // v60-06-06: read tracks via canonical 2-branch fetcher — hydrated
        // setlists hit the top-level `tracks` collection; legacy setlists
        // use the embedded array from the picker fetch.
        let resolvedTracks
        try {
            resolvedTracks = await fetchTracksForSetlistClient(setlist.id, {
                hydrated: setlist.hydrated,
                tracks: setlist.tracks,
            })
        } catch (err) {
            toast.error(t("admin-templates.loadTracksFailed"))
            return
        }
        const slots = convertSetlistToTemplate(resolvedTracks)
        setImportedSlots(slots)
        setShowImportPicker(false)
        toast.success(t("admin-templates.imported", { count: slots.length, setlistName: setlist.name }))
    }

    if (templatesLoading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    // Multi-tenant phase 1: the tenant's service types (built-in catalogue when it lists none).
    const templateKeys = serviceTypeKeysFor(org)
    const regularKeys = templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === "regular")
    const holidayKeys = templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === "holiday")

    return (
        <div className="space-y-4">
            {/* Import button */}
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={openImportPicker} disabled={!selectedKey || loadingSetlists} className="min-h-11">
                    {loadingSetlists ? <Loader2 className="h-4 w-4 me-1.5 animate-spin" /> : <Import className="h-4 w-4 me-1.5" />}
                    {loadingSetlists ? t("admin-templates.loading") : t("admin-templates.importFromSetlist")}
                </Button>
            </div>

            <div className="flex gap-6">
                {/* Sidebar: template list */}
                <div className="w-64 shrink-0 space-y-4">
                    <TemplateGroup
                        title={t("admin-templates.regularServices")}
                        keys={regularKeys}
                        overrides={overrides}
                        selectedKey={selectedKey}
                        onSelect={setSelectedKey}
                    />
                    <TemplateGroup
                        title={t("admin-templates.holidayServices")}
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
                            {t("admin-templates.selectToEdit")}
                        </div>
                    )}
                </div>
            </div>

            {/* Import from Setlist picker dialog */}
            {showImportPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowImportPicker(false)}>
                    <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">{t("admin-templates.importFromSetlist")}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            {t("admin-templates.importPickerHint", { templateLabel: serviceTypeLabel(org, selectedKey!) })}
                        </p>
                        {loadingSetlists ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                            </div>
                        ) : recentSetlists.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">{t("admin-templates.noSetlists")}</p>
                        ) : (
                            <div className="space-y-1">
                                {recentSetlists.map(sl => (
                                    <button
                                        key={sl.id}
                                        onClick={() => handlePickSetlist(sl)}
                                        className="w-full text-start px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors min-h-11"
                                    >
                                        <div className="font-medium">{sl.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t("admin-templates.trackCount", { count: sl.trackCount })}{sl.date ? ` \u00b7 ${sl.date}` : ''}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setShowImportPicker(false)}>{t("admin-templates.cancel")}</Button>
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
    const t = useT()
    const org = useOrg()
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
                            className={cn(
                                "w-full text-start px-3 py-2 rounded-lg text-sm transition-colors min-h-11",
                                isSelected
                                    ? "bg-brand/10 text-foreground border border-brand/30"
                                    : "hover:bg-accent border border-transparent"
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span>{serviceTypeLabel(org, key)}</span>
                                {isCustomized && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                                        {t("admin-templates.customBadge")}
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground">{t("admin-templates.slotCount", { count: meta?.slotCount ?? 0 })}</div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
