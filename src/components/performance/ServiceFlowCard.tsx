"use client"

import { BookOpen, Heart, ArrowLeftRight, StickyNote, Music, ChevronRight } from "lucide-react"
import { QueueItem } from "@/lib/store"
import { useT } from "@/i18n/client"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"

interface ServiceFlowCardProps {
    item: QueueItem
    index: number
    total: number
    /** Optional upcoming items to show as "Up Next" preview */
    upNext?: QueueItem[]
}

const TYPE_STYLES: Record<string, {
    icon: typeof BookOpen
    color: string
    /** performSetlist catalogue key for the type's label. */
    labelKey: string
}> = {
    reading: { icon: BookOpen, color: 'text-amber-400', labelKey: 'performSetlist.trackType.reading' },
    prayer: { icon: Heart, color: 'text-blue-400', labelKey: 'performSetlist.trackType.prayer' },
    transition: { icon: ArrowLeftRight, color: 'text-zinc-400', labelKey: 'performSetlist.trackType.transition' },
    note: { icon: StickyNote, color: 'text-zinc-500', labelKey: 'performSetlist.trackType.note' },
    header: { icon: ArrowLeftRight, color: 'text-zinc-300', labelKey: 'performSetlist.trackType.section' },
}

function UpNextPreview({ items }: { items: QueueItem[] }) {
    const t = useT()
    if (items.length === 0) return null

    return (
        <div className="w-full max-w-sm mt-auto pt-8">
            <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-zinc-600 mb-3 text-center">
                {t("performSetlist.upNext")}
            </p>
            <div className="space-y-1.5">
                {items.map((item, i) => {
                    const isSong = !item.trackType || item.trackType === 'song'
                    const style = TYPE_STYLES[item.trackType || 'note'] || TYPE_STYLES.note
                    const ItemIcon = isSong ? Music : style.icon

                    return (
                        <div
                            key={`${item.fileId}-${i}`}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand/5 border border-brand/10"
                        >
                            <ItemIcon className={`h-4 w-4 shrink-0 ${isSong ? 'text-zinc-400' : style.color}`} />
                            <span className={`text-sm truncate ${isSong ? 'text-zinc-300 font-medium' : 'text-zinc-500'}`}>
                                {item.name}
                            </span>
                            {isSong && (
                                <DirectionalIcon icon={ChevronRight} className="h-3.5 w-3.5 text-zinc-600 shrink-0 ms-auto" />
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function ServiceFlowCard({ item, index, total, upNext = [] }: ServiceFlowCardProps) {
    const t = useT()
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
                <UpNextPreview items={upNext} />
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

            {/* Type Label */}
            <span className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-4">
                {t(style.labelKey)}
            </span>

            {/* Performer */}
            {item.performer && (
                <p className="text-xl text-zinc-400 mb-2">
                    {item.performer}
                </p>
            )}

            {/* Duration */}
            {item.estimatedMinutes && (
                <p className="text-lg text-zinc-500">
                    {t("performSetlist.estimatedMinutes", { minutes: item.estimatedMinutes })}
                </p>
            )}

            {/* Description */}
            {item.description && (
                <p className="text-lg text-zinc-400 text-center mt-6 max-w-lg italic">
                    {item.description}
                </p>
            )}

            {/* Position */}
            <div className="text-sm text-zinc-600 pt-8">
                {index + 1} / {total}
            </div>

            {/* Up Next */}
            <UpNextPreview items={upNext} />
        </div>
    )
}
