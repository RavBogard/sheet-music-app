"use client"

import { BookOpen, Heart, ArrowLeftRight, StickyNote } from "lucide-react"
import { QueueItem } from "@/lib/store"

interface ServiceFlowCardProps {
    item: QueueItem
    index: number
    total: number
}

const TYPE_STYLES: Record<string, {
    icon: typeof BookOpen
    color: string
    label: string
}> = {
    reading: { icon: BookOpen, color: 'text-amber-400', label: 'Reading' },
    prayer: { icon: Heart, color: 'text-blue-400', label: 'Prayer' },
    transition: { icon: ArrowLeftRight, color: 'text-zinc-400', label: 'Transition' },
    note: { icon: StickyNote, color: 'text-zinc-500', label: 'Note' },
    header: { icon: ArrowLeftRight, color: 'text-zinc-300', label: 'Section' },
}

export function ServiceFlowCard({ item, index, total }: ServiceFlowCardProps) {
    const trackType = item.trackType || 'note'
    const style = TYPE_STYLES[trackType] || TYPE_STYLES.note
    const Icon = style.icon

    // Headers render as large centered text
    if (trackType === 'header') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 select-none">
                <div className="text-4xl font-bold text-zinc-300 uppercase tracking-[0.2em]">
                    {item.name}
                </div>
                <div className="text-sm text-zinc-600 mt-8">
                    {index + 1} / {total}
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 select-none">
            {/* Type Icon */}
            <div className={`mb-6 ${style.color}`}>
                <Icon className="h-10 w-10" />
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-white text-center mb-4">
                {item.name}
            </h1>

            {/* Performer */}
            {item.performer && (
                <p className="text-xl text-zinc-400 mb-2">
                    {item.performer}
                </p>
            )}

            {/* Duration */}
            {item.estimatedMinutes && (
                <p className="text-lg text-zinc-500">
                    ~{item.estimatedMinutes} min
                </p>
            )}

            {/* Description */}
            {item.description && (
                <p className="text-lg text-zinc-400 text-center mt-6 max-w-lg italic">
                    {item.description}
                </p>
            )}

            {/* Position */}
            <div className="text-sm text-zinc-600 mt-auto pt-8">
                {index + 1} / {total}
            </div>
        </div>
    )
}
