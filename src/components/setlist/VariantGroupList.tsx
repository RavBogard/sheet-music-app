"use client"

import { useCallback, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import type { FoldedGroup } from "@/lib/setlist-variant-fold"
import type { toDate } from "@/lib/firestore-helpers"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * The folded past-setlists list (WEB-05), shared by /setlists and /perform:
 * each per-instrument or "(Copy)" setlist sits under its parent service,
 * behind a small "+N versions" toggle in the group row's meta line. Display
 * only: every setlist stays reachable, nothing is renamed or re-sorted.
 *
 * Option B: a group head is the SAME row as every other setlist. `renderRow`
 * receives the toggle as `extra` and draws it inside its meta line.
 */
export function VariantGroupList<T extends { id: string; name: string; eventDate?: Parameters<typeof toDate>[0] }>({
    groups,
    renderRow,
}: {
    groups: FoldedGroup<T>[]
    renderRow: (setlist: T, extra?: ReactNode) => ReactNode
    /** Unused since the redo (a parentless group promotes its first version to the head row); kept so callers need no change. */
    renderInfo?: (setlist: T, extra?: ReactNode) => ReactNode
}) {
    const t = useT()
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const toggle = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    return (
        <div className="flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card">
            {groups.map(({ parent, variants: folded }, gi) => {
                // A group with no parent row promotes its first version to the
                // head, so the head is a real setlist row with the same
                // actions as every other row; the rest fold under it.
                const head = parent ?? folded[0]
                const variants = parent ? folded : folded.slice(1)
                if (!head) return null
                const groupId = parent ? parent.id : `group-${gi}-${head.id}`
                const open = expanded.has(groupId)
                const chip = variants.length > 0 ? (
                    <button
                        type="button"
                        data-testid="setlist-variants-toggle"
                        aria-expanded={open}
                        aria-label={open ? t("setlist.variantsHide") : t("setlist.variantsShow", { count: variants.length })}
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            toggle(groupId)
                        }}
                        className={cn(
                            "touch-hit pointer-events-auto relative z-10 inline-flex shrink-0 items-center gap-0.5 rounded-full border border-input px-1.5 leading-[1.125rem]",
                            "text-xs font-semibold text-brand hover:bg-accent cursor-pointer",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                    >
                        {t("setlist.variantsChip", { count: variants.length })}
                        <ChevronDown
                            aria-hidden
                            className={cn("h-3 w-3 transition-transform motion-reduce:transition-none", open && "rotate-180")}
                        />
                    </button>
                ) : null
                return (
                    <div key={groupId}>
                        {parent ? renderRow(parent, chip) : (
                            <div data-testid="setlist-group-head">{renderRow(head, chip)}</div>
                        )}
                        {open && variants.length > 0 && (
                            // The versions, as the same rows, on a faint tint so
                            // they read as belonging to the row above.
                            <div className="flex flex-col divide-y divide-rule border-t border-rule bg-muted/40 [&_article]:bg-transparent [&_a]:bg-transparent">
                                {variants.map((v) => <div key={v.id}>{renderRow(v)}</div>)}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
