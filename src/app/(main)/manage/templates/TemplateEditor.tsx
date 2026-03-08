"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronUp, ChevronDown, Plus, Trash2, Save, RotateCcw, Loader2, Music, Link2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { saveCustomTemplate, deleteCustomTemplate } from "@/lib/template-firebase"
import { TEMPLATE_LABELS, type TemplateSlot } from "@/lib/liturgical-templates"
import type { TrackType, DriveFile } from "@/types/models"
import { SearchOverlay } from "@/components/setlist/v2/SearchOverlay"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const SLOT_TYPES: TrackType[] = ["song", "prayer", "reading", "transition", "note", "header"]

const TYPE_COLORS: Record<string, string> = {
    song: "bg-brand/20 text-brand",
    prayer: "bg-brand/20 text-brand",
    reading: "bg-success/20 text-success",
    transition: "bg-amber-500/20 text-amber-500",
    note: "bg-muted-foreground/20 text-muted-foreground",
    header: "bg-brand/20 text-brand",
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
    const [slots, setSlots] = useState<TemplateSlot[]>([])
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [pickingSlotIndex, setPickingSlotIndex] = useState<number | null>(null)

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
            label: "New Slot",
            type: "song",
            queries: [],
        }
        setSlots(prev => [...prev, newSlot])
        setExpandedIndex(slots.length)
        setDirty(true)
    }, [slots.length])

    const removeSlot = useCallback((index: number) => {
        setSlots(prev => prev.filter((_, i) => i !== index))
        setExpandedIndex(null)
        setDirty(true)
    }, [])

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        try {
            await saveCustomTemplate(templateKey, slots, user.uid)
            setDirty(false)
            toast.success(`Template "${TEMPLATE_LABELS[templateKey]?.label ?? templateKey}" saved`)
        } catch (err) {
            toast.error("Failed to save template")
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async () => {
        if (!confirm("Reset to default? This will delete your customizations.")) return
        setSaving(true)
        try {
            await deleteCustomTemplate(templateKey)
            setSlots(defaultSlots)
            setDirty(false)
            toast.success("Reset to default template")
        } catch (err) {
            toast.error("Failed to reset template")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">
                        {TEMPLATE_LABELS[templateKey]?.label ?? templateKey}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {slots.length} slots
                        {isCustomized && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                                Customized
                            </span>
                        )}
                        {!isCustomized && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-muted-foreground/20 text-muted-foreground font-medium">
                                Default
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isCustomized && (
                        <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Reset to Default
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                            <Save className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* Slot list */}
            <div className="space-y-1 border border-border/50 rounded-lg p-2">
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
                    />
                ))}
            </div>

            {/* Add slot */}
            <Button variant="outline" size="sm" onClick={addSlot} className="w-full">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Slot
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
}) {
    const typeColor = TYPE_COLORS[slot.type ?? "song"] ?? TYPE_COLORS.song

    return (
        <div className={cn("rounded-lg border transition-colors", expanded ? "border-brand/30 bg-brand/5" : "border-transparent hover:bg-accent/50")}>
            {/* Collapsed row */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
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
                <span className="text-xs text-muted-foreground w-6 text-right">{index + 1}</span>

                {/* Type badge */}
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", typeColor)}>
                    {slot.type ?? "song"}
                </span>

                {/* Label */}
                <span className="flex-1 text-sm truncate">{slot.label}</span>

                {/* Linked file indicator */}
                {slot.fileId && (
                    <span className="flex items-center gap-1 text-xs text-brand">
                        <Link2 className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{slot.fileName || "Linked"}</span>
                        {slot.pageNumber && <span className="text-muted-foreground">p.{slot.pageNumber}</span>}
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
                        if (confirm(`Remove "${slot.label}"?`)) onRemove()
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
                            <label className="text-xs text-muted-foreground mb-1 block">Label</label>
                            <Input
                                value={slot.label}
                                onChange={e => onUpdate({ label: e.target.value })}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                            <Select
                                value={slot.type ?? "song"}
                                onValueChange={v => onUpdate({ type: v as TrackType })}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SLOT_TYPES.map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Direct chart association */}
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Linked Chart</label>
                        {slot.fileId ? (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand/10 border border-brand/20 text-sm">
                                    <Music className="h-3.5 w-3.5 text-brand shrink-0" />
                                    <span className="truncate text-brand">{slot.fileName || slot.fileId}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
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
                                        placeholder="Page #"
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
                                <Music className="h-3.5 w-3.5 mr-1.5" />
                                Pick Song from Library
                            </Button>
                        )}
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            Search Queries (comma-separated){slot.fileId ? " — fallback if file removed" : ""}
                        </label>
                        <Input
                            value={slot.queries.join(", ")}
                            onChange={e => onUpdate({
                                queries: e.target.value.split(",").map(q => q.trim()).filter(Boolean)
                            })}
                            placeholder="e.g., shema, sh'ma"
                            className="h-8 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Performer</label>
                            <Input
                                value={slot.defaultPerformer ?? ""}
                                onChange={e => onUpdate({ defaultPerformer: e.target.value || undefined })}
                                placeholder="e.g., Rabbi"
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Duration (min)</label>
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
                            <label className="text-xs text-muted-foreground mb-1 block">Only For (comma-sep)</label>
                            <Input
                                value={slot.onlyFor?.join(", ") ?? ""}
                                onChange={e => onUpdate({
                                    onlyFor: e.target.value
                                        ? e.target.value.split(",").map(q => q.trim()).filter(Boolean)
                                        : undefined,
                                })}
                                placeholder="e.g., daniel_karen"
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                        <Input
                            value={slot.description ?? ""}
                            onChange={e => onUpdate({ description: e.target.value || undefined })}
                            placeholder="Optional description"
                            className="h-8 text-sm"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
