"use client"

import { useCallback, useState, type ReactNode } from "react"
import type { FoldedGroup } from "@/lib/setlist-variant-fold"
import { toDate } from "@/lib/firestore-helpers"
import { useT } from "@/i18n/client"
import { RowDate } from "./RowDate"

/**
 * The folded past-setlists list (WEB-05), shared by /setlists and /perform:
 * each per-instrument or "(Copy)" setlist sits under its parent service,
 * behind a "Show N other versions" toggle. Display only: every setlist stays
 * reachable, nothing is renamed or re-sorted.
 */
export function VariantGroupList<T extends { id: string; name: string; eventDate?: Parameters<typeof toDate>[0] }>({
    groups,
    renderRow,
    renderInfo,
}: {
    groups: FoldedGroup<T>[]
    renderRow: (setlist: T) => ReactNode
    /** The metadata line under a group head that has no parent row. */
    renderInfo?: (setlist: T) => ReactNode
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
            {groups.map(({ parent, baseName, variants }, gi) => {
                const groupId = parent ? parent.id : `group-${gi}-${variants[0]?.id ?? ""}`
                const open = expanded.has(groupId)
                return (
                    <div key={groupId}>
                        {parent ? renderRow(parent) : (
                            // A group with no parent row keeps its siblings' date
                            // column, so the name lines up with every other row.
                            <div data-testid="setlist-group-head" className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 pt-3 pb-1 bg-card">
                                <RowDate date={toDate(variants[0]?.eventDate)} muted />
                                <div className="flex-1 min-w-0">
                                    <p className="text-base font-semibold leading-snug text-foreground line-clamp-2">{baseName}</p>
                                    {variants[0] && renderInfo ? renderInfo(variants[0]) : null}
                                </div>
                            </div>
                        )}
                        {variants.length > 0 && (
                            <div className="ps-[4.75rem] pe-3 pb-1 bg-card">
                                <button
                                    type="button"
                                    data-testid="setlist-variants-toggle"
                                    aria-expanded={open}
                                    onClick={() => toggle(groupId)}
                                    className="min-h-11 px-1 text-sm font-semibold text-brand hover:underline underline-offset-4"
                                >
                                    {open
                                        ? t("setlist.variantsHide")
                                        : t("setlist.variantsShow", { count: variants.length })}
                                </button>
                                {open && (
                                    <div className="flex flex-col divide-y divide-rule border-t border-rule -ms-[4.75rem] -me-3">
                                        {variants.map((v) => <div key={v.id}>{renderRow(v)}</div>)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
