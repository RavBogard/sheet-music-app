"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronUp, ChevronDown, Plus, Trash2, Save, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { saveCustomTemplate, deleteCustomTemplate } from "@/lib/template-firebase"
import { TEMPLATE_LABELS, type TemplateSlot } from "@/lib/liturgical-templates"
import type { TrackType } from "@/types/models"
import { toast } from "sonner"

const SLOT_TYPES: TrackType[] = ["song", "prayer", "reading", "transition", "note", "header"]

const TYPE_COLORS: Record<string, string> = {
    song: "bg-blue-500/20 text-blue-400",
    prayer: "bg-purple-500/20 text-purple-400",
    reading: "bg-green-500/20 text-green-400",
    transition: "bg-yellow-500/20 text-yellow-400",
    note: "bg-zinc-500/20 text-zinc-400",
    header: "bg-brand/20 text-brand",
}

interface TemplateEditorProps {
    templateKey: string
    defaultSlots: TemplateSlot[]
    customSlots: TemplateSlot[] | null
}

export function TemplateEditor({ templateKey, defaultSlots, customSlots }: TemplateEditorProps) {
    const { user } = useAuth()
    const [slots, setSlots] = useState<TemplateSlot[]>([])
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    // Reset when template changes
    useEffect(() => {
        setSlots(customSlots ?? defaultSlots)
        setExpandedIndex(null)
        setDirty(false)
    }, [templateKey, defaultSlots, customSlots])

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
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 font-medium">
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
                    />
                ))}
            </div>

            {/* Add slot */}
            <Button variant="outline" size="sm" onClick={addSlot} className="w-full">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Slot
            </Button>
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
}: {
    slot: TemplateSlot
    index: number
    total: number
    expanded: boolean
    onToggleExpand: () => void
    onUpdate: (updates: Partial<TemplateSlot>) => void
    onMove: (direction: -1 | 1) => void
    onRemove: () => void
}) {
    const typeColor = TYPE_COLORS[slot.type ?? "song"] ?? TYPE_COLORS.song

    return (
        <div className={`rounded-lg border transition-colors ${expanded ? "border-brand/30 bg-brand/5" : "border-transparent hover:bg-accent/50"}`}>
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
                        className="p-0.5 rounded hover:bg-accent disabled:opacity-20"
                    >
                        <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                        onClick={() => onMove(1)}
                        disabled={index === total - 1}
                        className="p-0.5 rounded hover:bg-accent disabled:opacity-20"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </button>
                </div>

                {/* Index */}
                <span className="text-xs text-muted-foreground w-6 text-right">{index + 1}</span>

                {/* Type badge */}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor}`}>
                    {slot.type ?? "song"}
                </span>

                {/* Label */}
                <span className="flex-1 text-sm truncate">{slot.label}</span>

                {/* Queries preview */}
                {slot.queries.length > 0 && (
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
                    className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground"
                >
                    <Trash2 className="h-3.5 w-3.5" />
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

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            Search Queries (comma-separated)
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
