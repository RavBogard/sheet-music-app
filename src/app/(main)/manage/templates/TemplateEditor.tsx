"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronUp, ChevronDown, Plus, Trash2, Save, RotateCcw, Loader2, Music, Link2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { rabbiSlotsFor, serviceTypeLabel } from "@/lib/org/tenant-lists"
import { saveCustomTemplate, deleteCustomTemplate } from "@/lib/template-firebase"
import { TEMPLATE_LABELS, type TemplateSlot } from "@/lib/liturgical-templates"
import type { TrackType, DriveFile } from "@/types/models"
import { SearchOverlay } from "@/components/library/SearchOverlay"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

const SLOT_TYPES: TrackType[] = ["song", "prayer", "reading", "transition", "note", "header"]

/** Slot type → its display label key (the type itself is a stored enum). */
const SLOT_TYPE_LABEL = {
    song: "manage-templates.slotTypeSong",
    prayer: "manage-templates.slotTypePrayer",
    reading: "manage-templates.slotTypeReading",
    transition: "manage-templates.slotTypeTransition",
    note: "manage-templates.slotTypeNote",
    header: "manage-templates.slotTypeHeader",
} as const satisfies Record<string, string>

function slotTypeKey(type: string | undefined): string {
    return SLOT_TYPE_LABEL[(type ?? "song") as keyof typeof SLOT_TYPE_LABEL] ?? SLOT_TYPE_LABEL.song
}

const TYPE_COLORS: Record<string, string> = {
    // Option B: outlined tags in ink; the type keeps a quiet hue in its text.
    song: "text-foreground",
    prayer: "text-section-blue-ink",
    reading: "text-section-green-ink",
    transition: "text-section-ochre-ink",
    note: "text-muted-foreground",
    header: "text-section-oxblood-ink",
}

interface TemplateEditorProps {
    templateKey: string
    defaultSlots: TemplateSlot[]
    customSlots: TemplateSlot[] | null
    importedSlots?: TemplateSlot[] | null
    onImportConsumed?: () => void
}

export function TemplateEditor({ templateKey, defaultSlots, customSlots, importedSlots, onImportConsumed }: TemplateEditorProps) {
    const { user } = useAuth()
    const org = useOrg()
    const t = useT()
    const [slots, setSlots] = useState<TemplateSlot[]>([])
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [pickingSlotIndex, setPickingSlotIndex] = useState<number | null>(null)

    // Warn about unsaved changes on navigation/close
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (dirty) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [dirty])

    // Reset when template changes
    useEffect(() => {
        setSlots(customSlots ?? defaultSlots)
        setExpandedIndex(null)
        setDirty(false)
    }, [templateKey, defaultSlots, customSlots])

    // Load imported slots when provided
    useEffect(() => {
        if (importedSlots && importedSlots.length > 0) {
            setSlots(importedSlots)
            setDirty(true)
            onImportConsumed?.()
        }
    }, [importedSlots, onImportConsumed])

    const isCustomized = customSlots !== null

    const updateSlot = useCallback((index: number, updates: Partial<TemplateSlot>) => {
        setSlots(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s))
        setDirty(true)
    }, [])

    const moveSlot = useCallback((index: number, direction: -1 | 1) => {
        const target = index + direction
        setSlots(prev => {
            if (target < 0 || target >= prev.length) return prev
            const next = [...prev]
            ;[next[index], next[target]] = [next[target], next[index]]
            return next
        })
        setExpandedIndex(prev => prev === index ? index + direction : prev)
        setDirty(true)
    }, [])

    const addSlot = useCallback(() => {
        const newSlot: TemplateSlot = {
            label: t("manage-templates.newSlotLabel"),
            type: "song",
            queries: [],
        }
        setSlots(prev => [...prev, newSlot])
        setExpandedIndex(slots.length)
        setDirty(true)
    }, [slots.length, t])

    const removeSlot = useCallback((index: number) => {
        setSlots(prev => prev.filter((_, i) => i !== index))
        setExpandedIndex(null)
        setDirty(true)
    }, [])

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        try {
            await saveCustomTemplate(templateKey, slots, user.uid, org)
            setDirty(false)
            toast.success(t("manage-templates.savedToast", { template: serviceTypeLabel(org, templateKey) }))
        } catch (err) {
            toast.error(t("manage-templates.saveFailed"))
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async () => {
        if (!confirm(t("manage-templates.resetConfirm"))) return
        setSaving(true)
        try {
            await deleteCustomTemplate(templateKey, org)
            setSlots(defaultSlots)
            setDirty(false)
            toast.success(t("manage-templates.resetDone"))
        } catch (err) {
            toast.error(t("manage-templates.resetFailed"))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <h2 className="text-sm font-bold leading-tight text-foreground">
                        {serviceTypeLabel(org, templateKey)}
                    </h2>
                    <p className="tnum flex items-center text-xs text-muted-foreground">
                        {t("manage-templates.slotCount", { count: slots.length })}
                        {isCustomized && (
                            <span className="ms-2 rounded-[3px] border border-input px-1.5 text-xs font-bold leading-[1.125rem] text-foreground">
                                {t("manage-templates.customizedBadge")}
                            </span>
                        )}
                        {!isCustomized && (
                            <span className="ms-2 rounded-[3px] border border-rule px-1.5 text-xs font-semibold leading-[1.125rem] text-muted-foreground">
                                {t("manage-templates.defaultBadge")}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isCustomized && (
                        <Button variant="outline" size="sm" onClick={handleReset} disabled={saving} className="touch-hit h-9">
                            <RotateCcw className="h-3.5 w-3.5 me-1.5" />
                            {t("manage-templates.resetToDefault")}
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="touch-hit h-9 font-bold">
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />
                        ) : (
                            <Save className="h-3.5 w-3.5 me-1.5" />
                        )}
                        {t("manage-templates.saveChanges")}
                    </Button>
                </div>
            </div>

            {/* Slot list */}
            <div className="space-y-1 border border-rule bg-card rounded-lg p-2">
                {slots.map((slot, index) => (
                    <SlotRow
                        key={index}
                        slot={slot}
                        index={index}
                        total={slots.length}
                        expanded={expandedIndex === index}
                        onToggleExpand={() => setExpandedIndex(expandedIndex === index ? null : index)}
                        onUpdate={(updates) => updateSlot(index, updates)}
                        onMove={(dir) => moveSlot(index, dir)}
                        onRemove={() => removeSlot(index)}
                        onPickSong={() => setPickingSlotIndex(index)}
                        onlyForHint={rabbiSlotsFor(org)[0]?.key ?? ""}
                    />
                ))}
            </div>

            {/* Add slot */}
            <Button variant="outline" size="sm" onClick={addSlot} className="w-full">
                <Plus className="h-3.5 w-3.5 me-1.5" /> {t("manage-templates.addSlot")}
            </Button>

            {/* Song picker overlay */}
            <SearchOverlay
                isOpen={pickingSlotIndex !== null}
                onClose={() => setPickingSlotIndex(null)}
                onSelect={(file: DriveFile) => {
                    if (pickingSlotIndex !== null) {
                        updateSlot(pickingSlotIndex, {
                            fileId: file.id,
                            fileName: file.name.replace(/\.[^/.]+$/, ''),
                        })
                    }
                    setPickingSlotIndex(null)
                }}
            />
        </div>
    )
}

function SlotRow({
    slot,
    index,
    total,
    expanded,
    onToggleExpand,
    onUpdate,
    onMove,
    onRemove,
    onPickSong,
    onlyForHint,
}: {
    slot: TemplateSlot
    index: number
    total: number
    expanded: boolean
    onToggleExpand: () => void
    onUpdate: (updates: Partial<TemplateSlot>) => void
    onMove: (direction: -1 | 1) => void
    onRemove: () => void
    onPickSong: () => void
    /** A rabbi slot key of this tenant (liturgy.rabbiSlots), for the "Only For" hint. */
    onlyForHint: string
}) {
    const t = useT()
    const typeColor = TYPE_COLORS[slot.type ?? "song"] ?? TYPE_COLORS.song

    return (
        <div className={cn("rounded-lg border transition-colors", expanded ? "border-brand/30 bg-brand/5" : "border-transparent hover:bg-accent/50")}>
            {/* Collapsed row */}
            <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 cursor-pointer"
                onClick={onToggleExpand}
            >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onMove(-1)}
                        disabled={index === 0}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-accent disabled:opacity-20"
                    >
                        <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => onMove(1)}
                        disabled={index === total - 1}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-accent disabled:opacity-20"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </button>
                </div>

                {/* Index */}
                <span className="tnum text-xs text-muted-foreground w-6 text-end">{index + 1}</span>

                {/* Type badge */}
                <span className={cn("shrink-0 rounded-[3px] border border-input px-1.5 text-xs font-bold leading-[1.125rem]", typeColor)}>
                    {t(slotTypeKey(slot.type))}
                </span>

                {/* Label */}
                <span className="min-w-0 flex-[1_1_8rem] text-sm truncate">{slot.label}</span>

                {/* Linked file indicator */}
                {slot.fileId && (
                    <span className="flex items-center gap-1 text-xs text-brand">
                        <Link2 className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{slot.fileName || t("manage-templates.linkedFallback")}</span>
                        {slot.pageNumber && <span className="text-muted-foreground">{t("manage-templates.pageShort", { page: slot.pageNumber })}</span>}
                    </span>
                )}

                {/* Queries preview (only if no direct link) */}
                {!slot.fileId && slot.queries.length > 0 && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {slot.queries.join(", ")}
                    </span>
                )}

                {/* Performer */}
                {slot.defaultPerformer && (
                    <span className="text-xs text-muted-foreground">{slot.defaultPerformer}</span>
                )}

                {/* Delete */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(t("manage-templates.removeSlotConfirm", { label: slot.label }))) onRemove()
                    }}
                    className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive text-muted-foreground"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            {/* Expanded editor */}
            {expanded && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/30">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldLabel")}</label>
                            <Input
                                value={slot.label}
                                onChange={e => onUpdate({ label: e.target.value })}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldType")}</label>
                            <Select
                                value={slot.type ?? "song"}
                                onValueChange={v => onUpdate({ type: v as TrackType })}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SLOT_TYPES.map(type => (
                                        <SelectItem key={type} value={type}>{t(slotTypeKey(type))}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Direct chart association */}
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldLinkedChart")}</label>
                        {slot.fileId ? (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand/10 border border-brand/20 text-sm">
                                    <Music className="h-3.5 w-3.5 text-brand shrink-0" />
                                    <span className="truncate text-brand">{slot.fileName || slot.fileId}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("manage-templates.removeLinkedChart")}
                                    className="min-h-11 min-w-11 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => onUpdate({ fileId: undefined, fileName: undefined, pageNumber: undefined })}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                                <div className="w-20">
                                    <Input
                                        type="number"
                                        min={1}
                                        value={slot.pageNumber ?? ""}
                                        onChange={e => onUpdate({
                                            pageNumber: e.target.value ? Number(e.target.value) : undefined,
                                        })}
                                        placeholder={t("manage-templates.pagePlaceholder")}
                                        className="h-8 text-sm"
                                    />
                                </div>
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={onPickSong}
                            >
                                <Music className="h-3.5 w-3.5 me-1.5" />
                                {t("manage-templates.pickSong")}
                            </Button>
                        )}
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            {slot.fileId ? t("manage-templates.fieldQueriesWithFallback") : t("manage-templates.fieldQueries")}
                        </label>
                        <Input
                            value={slot.queries.join(", ")}
                            onChange={e => onUpdate({
                                queries: e.target.value.split(",").map(q => q.trim()).filter(Boolean)
                            })}
                            placeholder={t("manage-templates.queriesPlaceholder")}
                            className="h-8 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldPerformer")}</label>
                            <Input
                                value={slot.defaultPerformer ?? ""}
                                onChange={e => onUpdate({ defaultPerformer: e.target.value || undefined })}
                                placeholder={t("manage-templates.performerPlaceholder")}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldDuration")}</label>
                            <Input
                                type="number"
                                value={slot.estimatedMinutes ?? ""}
                                onChange={e => onUpdate({
                                    estimatedMinutes: e.target.value ? Number(e.target.value) : undefined,
                                })}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldOnlyFor")}</label>
                            <Input
                                value={slot.onlyFor?.join(", ") ?? ""}
                                onChange={e => onUpdate({
                                    onlyFor: e.target.value
                                        ? e.target.value.split(",").map(q => q.trim()).filter(Boolean)
                                        : undefined,
                                })}
                                placeholder={t("manage-templates.onlyForPlaceholder", { example: onlyForHint })}
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">{t("manage-templates.fieldDescription")}</label>
                        <Input
                            value={slot.description ?? ""}
                            onChange={e => onUpdate({ description: e.target.value || undefined })}
                            placeholder={t("manage-templates.descriptionPlaceholder")}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
