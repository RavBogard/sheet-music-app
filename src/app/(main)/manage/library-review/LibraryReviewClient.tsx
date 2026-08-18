"use client"

/**
 * Cycle-3 NEW-4 (A4) — /manage/library-review client.
 *
 * Keyboard-driven review surface. Three tabs, dense Logic-Pro track-list
 * rows, side-panel AI-suggestion diff. Single keystroke actions:
 *
 *   j / ↓ / ArrowDown  → next row
 *   k / ↑ / ArrowUp    → previous row
 *   Enter              → expand diff (toggle)
 *   1 / 2 / 3          → switch tab
 *   a                  → Accept    (AI Review only)
 *   r                  → Reject    (AI Review only)
 *   e                  → Edit      (AI Review only — opens form)
 *   y                  → Retry     (AI Failed + Import Failures)
 *   n                  → Dismiss   (AI Failed + Import Failures)
 *   Escape             → close edit form / collapse diff
 *
 * Action handlers call /api/admin/library-review/* and refetch the queue.
 * No optimistic UI — admin frequency is dozens/week, throughput is
 * irrelevant; correctness matters.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api-client"
import { formatError } from "@/lib/format-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
    AiFailedRow,
    AiReviewRow,
    EditPayload,
    ImportFailureRow,
    ReviewQueueResult,
} from "@/lib/library/review-queue"

type TabKey = "review" | "failed" | "import"

interface Props {
    initial: ReviewQueueResult | null
    initialError: string | null
}

export default function LibraryReviewClient({ initial, initialError }: Props) {
    const [data, setData] = useState<ReviewQueueResult | null>(initial)
    const [error, setError] = useState<string | null>(initialError)
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState<TabKey>("review")
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [busy, setBusy] = useState(false)
    const [filter, setFilter] = useState("")
    const filterInputRef = useRef<HTMLInputElement>(null)

    const refetch = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await apiFetch("/api/admin/library-review/queue")
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                setError(body?.message ?? `Queue refresh failed (HTTP ${res.status}).`)
                return
            }
            const body = await res.json()
            const { ok: _ok, ...payload } = body
            setData(payload as ReviewQueueResult)
        } catch (err) {
            setError(`Queue refresh failed: ${formatError(err)}`)
        } finally {
            setLoading(false)
        }
    }, [])

    // Filtered + currently-active row list
    const activeRows = useMemo(() => {
        if (!data) return []
        const term = filter.trim().toLowerCase()
        if (tab === "review") {
            const rows = data.aiReview.filter((r) =>
                !term ? true : r.title.toLowerCase().includes(term),
            )
            return rows
        }
        if (tab === "failed") {
            return data.aiFailed.filter((r) =>
                !term ? true : r.title.toLowerCase().includes(term),
            )
        }
        return data.importFailures.filter((r) =>
            !term
                ? true
                : (r.driveName ?? "").toLowerCase().includes(term),
        )
    }, [data, tab, filter])

    // Reset selection when tab/filter changes
    useEffect(() => {
        const first = activeRows[0]
        if (!first) {
            setSelectedRowId(null)
        } else {
            const stillThere = activeRows.some((r) => rowKey(r) === selectedRowId)
            if (!stillThere) setSelectedRowId(rowKey(first))
        }
        setEditing(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, filter, data])

    const selectedIdx = activeRows.findIndex(
        (r) => rowKey(r) === selectedRowId,
    )
    const selected = selectedIdx >= 0 ? activeRows[selectedIdx] : null

    const navigate = useCallback(
        (delta: number) => {
            if (activeRows.length === 0) return
            const nextIdx = Math.min(
                activeRows.length - 1,
                Math.max(0, selectedIdx + delta),
            )
            setSelectedRowId(rowKey(activeRows[nextIdx]))
        },
        [activeRows, selectedIdx],
    )

    const doAction = useCallback(
        async (
            endpoint:
                | "accept"
                | "reject"
                | "edit"
                | "retry"
                | "dismiss",
            body: Record<string, unknown>,
            successMessage: string,
        ) => {
            setBusy(true)
            try {
                const res = await apiFetch(
                    `/api/admin/library-review/${endpoint}`,
                    {
                        method: "POST",
                        body: JSON.stringify(body),
                    },
                )
                const data = await res.json().catch(() => null)
                if (!res.ok || data?.ok === false) {
                    toast.error(
                        data?.message ?? `Action failed (HTTP ${res.status}).`,
                    )
                    return false
                }
                toast.success(successMessage)
                await refetch()
                return true
            } catch (err) {
                toast.error(`Action failed: ${formatError(err)}`)
                return false
            } finally {
                setBusy(false)
            }
        },
        [refetch],
    )

    // ─── Keyboard handler ──────────────────────────────────────────────────

    useEffect(() => {
        function handler(e: KeyboardEvent) {
            // Don't capture when editing form has focus or filter input has focus
            const target = e.target as HTMLElement | null
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable)
            ) {
                if (e.key === "Escape" && target.tagName === "INPUT") {
                    ;(target as HTMLInputElement).blur()
                }
                return
            }
            if (busy) return

            if (e.key === "/" && !editing) {
                e.preventDefault()
                filterInputRef.current?.focus()
                return
            }
            if (e.key === "Escape") {
                setEditing(false)
                setExpanded(false)
                return
            }
            if (e.key === "j" || e.key === "ArrowDown") {
                e.preventDefault()
                navigate(1)
                return
            }
            if (e.key === "k" || e.key === "ArrowUp") {
                e.preventDefault()
                navigate(-1)
                return
            }
            if (e.key === "Enter") {
                e.preventDefault()
                setExpanded((v) => !v)
                return
            }
            if (e.key === "1") {
                e.preventDefault()
                setTab("review")
                return
            }
            if (e.key === "2") {
                e.preventDefault()
                setTab("failed")
                return
            }
            if (e.key === "3") {
                e.preventDefault()
                setTab("import")
                return
            }
            if (!selected) return

            if (tab === "review") {
                const row = selected as AiReviewRow
                if (e.key === "a") {
                    e.preventDefault()
                    void doAction(
                        "accept",
                        { rowId: row.rowId },
                        `Accepted: ${row.title}`,
                    )
                } else if (e.key === "r") {
                    e.preventDefault()
                    void doAction(
                        "reject",
                        { rowId: row.rowId },
                        `Rejected: ${row.title}`,
                    )
                } else if (e.key === "e") {
                    e.preventDefault()
                    setEditing(true)
                    setExpanded(true)
                }
            } else if (tab === "failed") {
                const row = selected as AiFailedRow
                if (e.key === "y") {
                    e.preventDefault()
                    void doAction(
                        "retry",
                        { rowId: row.rowId, kind: "enrichment" },
                        `Retry queued: ${row.title}`,
                    )
                } else if (e.key === "n") {
                    e.preventDefault()
                    void doAction(
                        "dismiss",
                        { rowId: row.rowId, kind: "enrichment" },
                        `Dismissed: ${row.title}`,
                    )
                }
            } else if (tab === "import") {
                const row = selected as ImportFailureRow
                if (e.key === "y") {
                    e.preventDefault()
                    void doAction(
                        "retry",
                        { rowId: row.driveFileId, kind: "import" },
                        `Retry queued: ${row.driveName ?? row.driveFileId}`,
                    )
                } else if (e.key === "n") {
                    e.preventDefault()
                    void doAction(
                        "dismiss",
                        { rowId: row.driveFileId, kind: "import" },
                        `Dismissed: ${row.driveName ?? row.driveFileId}`,
                    )
                }
            }
        }

        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [busy, editing, tab, selected, navigate, doAction])

    const counts = data
        ? {
              review: data.aiReview.length,
              failed: data.aiFailed.length,
              import: data.importFailures.length,
          }
        : { review: 0, failed: 0, import: 0 }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-7xl mx-auto px-4 py-4 pb-20 space-y-3">
                {/* Header */}
                <header className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-brand" />
                            Library Review
                        </h1>
                        <p className="text-muted-foreground text-xs mt-0.5">
                            AI enrichment review queue + Drive import failures.
                            Keyboard:{" "}
                            <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono">
                                j/k
                            </kbd>{" "}
                            navigate,{" "}
                            <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono">
                                a/r/e
                            </kbd>{" "}
                            review,{" "}
                            <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono">
                                y/n
                            </kbd>{" "}
                            retry/dismiss.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            ref={filterInputRef}
                            placeholder="Filter…  ( / )"
                            aria-label="Filter review queue"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="h-8 w-44 text-xs"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void refetch()}
                            disabled={loading}
                            aria-label="Refresh queue"
                            className="h-8"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </header>

                {/* Calibration banner */}
                {data && (
                    <CalibrationBanner config={data.config} />
                )}

                {error && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs">
                        {error}
                    </div>
                )}

                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as TabKey)}
                    className="w-full"
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="review" className="flex-1 min-h-9 gap-2 text-xs">
                            <span className="text-[10px] font-mono opacity-60">1</span>
                            AI Review
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
                                {counts.review}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="failed" className="flex-1 min-h-9 gap-2 text-xs">
                            <span className="text-[10px] font-mono opacity-60">2</span>
                            AI Failed
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
                                {counts.failed}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="import" className="flex-1 min-h-9 gap-2 text-xs">
                            <span className="text-[10px] font-mono opacity-60">3</span>
                            Import Failures
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
                                {counts.import}
                            </Badge>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="review" className="mt-3">
                        <ReviewSplit
                            rows={activeRows as AiReviewRow[]}
                            selectedRowId={selectedRowId}
                            setSelectedRowId={setSelectedRowId}
                            expanded={expanded}
                            setExpanded={setExpanded}
                            editing={editing}
                            setEditing={setEditing}
                            busy={busy}
                            doAction={doAction}
                            threshold={data?.config.threshold ?? 0.7}
                        />
                    </TabsContent>

                    <TabsContent value="failed" className="mt-3">
                        <FailedList
                            rows={activeRows as AiFailedRow[]}
                            selectedRowId={selectedRowId}
                            setSelectedRowId={setSelectedRowId}
                            busy={busy}
                            doAction={doAction}
                        />
                    </TabsContent>

                    <TabsContent value="import" className="mt-3">
                        <ImportList
                            rows={activeRows as ImportFailureRow[]}
                            selectedRowId={selectedRowId}
                            setSelectedRowId={setSelectedRowId}
                            busy={busy}
                            doAction={doAction}
                        />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Sticky bottom action hint bar */}
            <ActionBar tab={tab} hasSelection={!!selected} editing={editing} busy={busy} />
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function rowKey(row: AiReviewRow | AiFailedRow | ImportFailureRow): string {
    return "driveFileId" in row ? row.driveFileId : row.rowId
}

function formatBytes(n: number): string {
    if (!n) return "—"
    if (n < 1024) return `${n}B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
    return `${(n / 1024 / 1024).toFixed(1)}M`
}

function shortMime(m: string): string {
    if (!m) return "?"
    if (m === "application/pdf") return "pdf"
    if (m === "application/xml") return "xml"
    if (m.startsWith("image/")) return m.slice("image/".length)
    return m.split("/").pop() ?? m
}

// ─── Calibration banner ────────────────────────────────────────────────────

function CalibrationBanner({
    config,
}: {
    config: ReviewQueueResult["config"]
}) {
    if (!config.aiProviderConfigured) {
        return (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-xs">
                <strong>AI enrichment is dormant.</strong>{" "}
                GEMINI_API_KEY is not set in this environment, so new rows
                will sit at <code>pending</code> until configured. Set it in
                the Vercel dashboard to activate the Gemini subscriber.
            </div>
        )
    }
    if (!config.autoApplyEnabled) {
        return (
            <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-xs">
                <strong>Calibration mode.</strong>{" "}
                <code>aiConfig/autoApplyEnabled</code> is <code>false</code> —
                every enrichment lands here for human review. Confidence
                threshold:{" "}
                <code className="font-mono">{config.threshold.toFixed(2)}</code>.
                Flip the flag in Firebase Console (or via the admin MCP tool)
                once you trust the model.
            </div>
        )
    }
    return (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-xs">
            <strong>Auto-apply on.</strong>{" "}
            Only rows tripping a review trigger land here. Threshold:{" "}
            <code className="font-mono">{config.threshold.toFixed(2)}</code>.
        </div>
    )
}

// ─── Review tab (split list + detail) ──────────────────────────────────────

function ReviewSplit({
    rows,
    selectedRowId,
    setSelectedRowId,
    expanded,
    setExpanded,
    editing,
    setEditing,
    busy,
    doAction,
    threshold,
}: {
    rows: AiReviewRow[]
    selectedRowId: string | null
    setSelectedRowId: (id: string) => void
    expanded: boolean
    setExpanded: (v: boolean) => void
    editing: boolean
    setEditing: (v: boolean) => void
    busy: boolean
    doAction: (
        endpoint: "accept" | "reject" | "edit" | "retry" | "dismiss",
        body: Record<string, unknown>,
        successMessage: string,
    ) => Promise<boolean>
    threshold: number
}) {
    const selected = rows.find((r) => r.rowId === selectedRowId) ?? null

    if (rows.length === 0) {
        return (
            <EmptyState
                icon={<Check className="w-6 h-6 text-emerald-500" />}
                title="Inbox zero."
                hint="No rows currently waiting for review."
            />
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-3">
            <ul role="list" className="border rounded-md overflow-hidden">
                {rows.map((row) => (
                    <ReviewRow
                        key={row.rowId}
                        row={row}
                        active={row.rowId === selectedRowId}
                        onClick={() => {
                            setSelectedRowId(row.rowId)
                            setExpanded(true)
                        }}
                        threshold={threshold}
                    />
                ))}
            </ul>

            <div>
                {selected && expanded ? (
                    editing ? (
                        <EditForm
                            row={selected}
                            busy={busy}
                            onCancel={() => setEditing(false)}
                            onSubmit={async (edits) => {
                                const ok = await doAction(
                                    "edit",
                                    { rowId: selected.rowId, edits },
                                    `Edited: ${selected.title}`,
                                )
                                if (ok) setEditing(false)
                            }}
                        />
                    ) : (
                        <ReviewDetail
                            row={selected}
                            busy={busy}
                            threshold={threshold}
                            onAccept={() =>
                                doAction(
                                    "accept",
                                    { rowId: selected.rowId },
                                    `Accepted: ${selected.title}`,
                                )
                            }
                            onReject={() =>
                                doAction(
                                    "reject",
                                    { rowId: selected.rowId },
                                    `Rejected: ${selected.title}`,
                                )
                            }
                            onEdit={() => setEditing(true)}
                        />
                    )
                ) : (
                    <div className="border rounded-md p-4 text-xs text-muted-foreground">
                        Select a row (or press{" "}
                        <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono">
                            Enter
                        </kbd>
                        ) to inspect the AI suggestion.
                    </div>
                )}
            </div>
        </div>
    )
}

function ReviewRow({
    row,
    active,
    onClick,
    threshold,
}: {
    row: AiReviewRow
    active: boolean
    onClick: () => void
    threshold: number
}) {
    const confidence = row.suggestion?.confidence ?? null
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                aria-current={active ? "true" : undefined}
                className={
                    "w-full text-left h-8 px-2 grid grid-cols-[16px_minmax(0,1fr)_60px_44px_44px] items-center gap-2 border-b last:border-b-0 cursor-pointer transition-colors " +
                    (active
                        ? "bg-brand/10 border-l-2 border-l-brand"
                        : "hover:bg-accent/40 border-l-2 border-l-transparent")
                }
            >
                <span aria-hidden="true">
                    {active ? (
                        <ChevronDown className="w-3 h-3" />
                    ) : (
                        <ChevronRight className="w-3 h-3 opacity-50" />
                    )}
                </span>
                <span className="truncate text-xs">
                    {row.title}
                    {row.triggers.length > 0 && (
                        <span className="ml-2 inline-flex gap-1 align-middle">
                            {row.triggers.map((t) => (
                                <TriggerChip key={t} trigger={t} />
                            ))}
                        </span>
                    )}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {row.collection}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                    {shortMime(row.mimeType)}
                </span>
                <ConfidenceCell value={confidence} threshold={threshold} />
            </button>
        </li>
    )
}

function ConfidenceCell({
    value,
    threshold,
}: {
    value: number | null
    threshold: number
}) {
    if (value === null) {
        return <span className="text-[10px] font-mono text-muted-foreground">—</span>
    }
    const color =
        value >= threshold
            ? "text-emerald-600 dark:text-emerald-400"
            : value >= threshold - 0.1
              ? "text-amber-600 dark:text-amber-400"
              : "text-rose-600 dark:text-rose-400"
    return (
        <span className={`text-[10px] font-mono ${color}`}>
            {(value * 100).toFixed(0)}%
        </span>
    )
}

function TriggerChip({ trigger }: { trigger: string }) {
    const label =
        trigger === "is_chart_false"
            ? "not-chart"
            : trigger === "low_confidence"
              ? "low-conf"
              : trigger === "collection_disagrees_with_folder"
                ? "coll-?"
                : trigger === "duplicate_candidates"
                  ? "dupe?"
                  : trigger === "review_required"
                    ? "ai-flag"
                    : trigger
    return (
        <Badge
            variant="outline"
            className="h-4 px-1 text-[9px] font-mono leading-none"
        >
            {label}
        </Badge>
    )
}

function ReviewDetail({
    row,
    busy,
    threshold,
    onAccept,
    onReject,
    onEdit,
}: {
    row: AiReviewRow
    busy: boolean
    threshold: number
    onAccept: () => void
    onReject: () => void
    onEdit: () => void
}) {
    const sug = row.suggestion
    return (
        <div className="border rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{row.title}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {row.rowId} · {shortMime(row.mimeType)} ·{" "}
                        {formatBytes(row.sizeBytes)} · {row.source}
                        {row.subfolder && ` · subfolder=${row.subfolder.slice(0, 12)}…`}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="default"
                        onClick={onAccept}
                        disabled={busy || !sug}
                        className="h-7 text-xs gap-1"
                    >
                        <Check className="w-3 h-3" /> Accept (a)
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={onEdit}
                        disabled={busy}
                        className="h-7 text-xs"
                    >
                        Edit (e)
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onReject}
                        disabled={busy}
                        className="h-7 text-xs gap-1"
                    >
                        <X className="w-3 h-3" /> Reject (r)
                    </Button>
                </div>
            </div>
            {sug ? (
                <div className="grid grid-cols-[1fr_1fr] divide-x text-xs">
                    <FieldColumn
                        title="Current"
                        rows={[
                            ["title", row.current.title],
                            ["collection", row.current.collection],
                            ["key", row.current.key ?? "—"],
                            ["bpm", row.current.bpm?.toString() ?? "—"],
                            ["lead", row.current.leadMusician ?? "—"],
                            [
                                "tags",
                                row.current.tags?.join(", ") ?? "—",
                            ],
                        ]}
                    />
                    <FieldColumn
                        title="AI suggestion"
                        confidence={
                            <ConfidenceCell
                                value={sug.confidence}
                                threshold={threshold}
                            />
                        }
                        rows={[
                            [
                                "title",
                                sug.suggested_title ?? "(no change)",
                                sug.suggested_title &&
                                sug.suggested_title !== row.current.title
                                    ? "changed"
                                    : "same",
                            ],
                            [
                                "collection",
                                sug.suggested_collection ?? "(advisory only)",
                                sug.collection_disagrees_with_folder
                                    ? "warn"
                                    : "same",
                            ],
                            [
                                "key",
                                sug.suggested_key ?? "—",
                                sug.suggested_key &&
                                sug.suggested_key !== row.current.key
                                    ? "changed"
                                    : "same",
                            ],
                            [
                                "bpm",
                                sug.suggested_bpm?.toString() ?? "—",
                                sug.suggested_bpm !== null &&
                                sug.suggested_bpm !== row.current.bpm
                                    ? "changed"
                                    : "same",
                            ],
                            [
                                "lead",
                                sug.suggested_lead ?? "—",
                                sug.suggested_lead &&
                                sug.suggested_lead !== row.current.leadMusician
                                    ? "changed"
                                    : "same",
                            ],
                            [
                                "tags",
                                sug.suggested_tags.join(", ") || "—",
                                sug.suggested_tags.length > 0
                                    ? "changed"
                                    : "same",
                            ],
                        ]}
                    />
                </div>
            ) : (
                <div className="p-3 text-xs text-muted-foreground">
                    No AI suggestion attached to this row.
                </div>
            )}
            {sug && (sug.concerns.length > 0 || row.duplicateCandidates.length > 0) && (
                <div className="px-3 py-2 border-t bg-muted/20 space-y-1">
                    {sug.concerns.length > 0 && (
                        <div className="text-[11px]">
                            <span className="font-mono text-muted-foreground mr-1">
                                concerns:
                            </span>
                            {sug.concerns.join(" • ")}
                        </div>
                    )}
                    {row.duplicateCandidates.length > 0 && (
                        <div className="text-[11px]">
                            <span className="font-mono text-muted-foreground mr-1">
                                duplicate candidates:
                            </span>
                            {row.duplicateCandidates.map((c) => (
                                <span
                                    key={c.rowId}
                                    className="inline-block mr-2"
                                >
                                    {c.title}{" "}
                                    <span className="font-mono text-muted-foreground">
                                        ({c.collection})
                                    </span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function FieldColumn({
    title,
    rows,
    confidence,
}: {
    title: string
    rows: Array<[string, string] | [string, string, "same" | "changed" | "warn"]>
    confidence?: React.ReactNode
}) {
    return (
        <div>
            <div className="px-3 py-1 bg-muted/40 text-[10px] font-mono uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                <span>{title}</span>
                {confidence}
            </div>
            <dl className="px-3 py-2 space-y-1">
                {rows.map(([k, v, mark]) => {
                    const tone =
                        mark === "changed"
                            ? "text-foreground"
                            : mark === "warn"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                    return (
                        <div
                            key={k}
                            className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"
                        >
                            <dt className="text-[10px] font-mono uppercase text-muted-foreground self-center">
                                {k}
                            </dt>
                            <dd className={`text-xs truncate ${tone}`}>
                                {v || "—"}
                            </dd>
                        </div>
                    )
                })}
            </dl>
        </div>
    )
}

// ─── Edit form ─────────────────────────────────────────────────────────────

function EditForm({
    row,
    busy,
    onCancel,
    onSubmit,
}: {
    row: AiReviewRow
    busy: boolean
    onCancel: () => void
    onSubmit: (edits: EditPayload) => Promise<void> | void
}) {
    const sug = row.suggestion
    // Pre-fill from AI suggestion, falling back to current values.
    const [title, setTitle] = useState(
        sug?.suggested_title ?? row.current.title,
    )
    const [collection, setCollection] = useState(
        sug?.suggested_collection ?? row.current.collection,
    )
    const [key, setKey] = useState(sug?.suggested_key ?? row.current.key ?? "")
    const [bpm, setBpm] = useState<string>(
        sug?.suggested_bpm?.toString() ?? row.current.bpm?.toString() ?? "",
    )
    const [leadMusician, setLeadMusician] = useState(
        sug?.suggested_lead ?? row.current.leadMusician ?? "",
    )
    const [tags, setTags] = useState(
        (sug?.suggested_tags && sug.suggested_tags.length > 0
            ? sug.suggested_tags
            : row.current.tags ?? []
        ).join(", "),
    )

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const edits: EditPayload = {}
        if (title.trim() && title !== row.current.title) edits.title = title.trim()
        if (collection !== row.current.collection) {
            if (
                collection === "core" ||
                collection === "supplemental" ||
                collection === "uploads" ||
                collection === "nava"
            ) {
                edits.collection = collection
            }
        }
        if (key !== (row.current.key ?? "")) edits.key = key
        if (bpm.trim() === "") {
            if (row.current.bpm) edits.bpm = null
        } else {
            const n = Number(bpm)
            if (Number.isFinite(n) && n > 0) edits.bpm = n
        }
        if (leadMusician !== (row.current.leadMusician ?? "")) {
            edits.leadMusician = leadMusician
        }
        const tagList = tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        const currentTags = row.current.tags ?? []
        if (
            tagList.length !== currentTags.length ||
            tagList.some((t, i) => t !== currentTags[i])
        ) {
            edits.tags = tagList
        }
        if (Object.keys(edits).length === 0) {
            toast.message("No changes to save.")
            return
        }
        await onSubmit(edits)
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="border rounded-md overflow-hidden"
        >
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                <div className="text-sm font-medium truncate">
                    Edit · {row.title}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        type="submit"
                        disabled={busy}
                        className="h-7 text-xs"
                    >
                        Save
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="h-7 text-xs"
                    >
                        Cancel (esc)
                    </Button>
                </div>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2 text-xs">
                <Field label="title" full>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-7 text-xs"
                    />
                </Field>
                <Field label="collection">
                    <select
                        value={collection}
                        onChange={(e) => setCollection(e.target.value)}
                        className="h-7 text-xs border rounded-md px-2 bg-background"
                    >
                        <option value="core">core</option>
                        <option value="supplemental">supplemental</option>
                        <option value="nava">nava</option>
                        <option value="uploads">uploads</option>
                    </select>
                </Field>
                <Field label="key">
                    <Input
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="h-7 text-xs"
                    />
                </Field>
                <Field label="bpm">
                    <Input
                        value={bpm}
                        onChange={(e) => setBpm(e.target.value)}
                        className="h-7 text-xs"
                        inputMode="numeric"
                    />
                </Field>
                <Field label="lead">
                    <Input
                        value={leadMusician}
                        onChange={(e) => setLeadMusician(e.target.value)}
                        className="h-7 text-xs"
                    />
                </Field>
                <Field label="tags" full>
                    <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="comma-separated"
                        aria-label="Tags (comma-separated)"
                    />
                </Field>
            </div>
        </form>
    )
}

function Field({
    label,
    children,
    full,
}: {
    label: string
    children: React.ReactNode
    full?: boolean
}) {
    return (
        <label
            className={`${full ? "col-span-2" : ""} grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2`}
        >
            <span className="text-[10px] font-mono uppercase text-muted-foreground">
                {label}
            </span>
            {children}
        </label>
    )
}

// ─── Failed list (AI exhausted retries) ────────────────────────────────────

function FailedList({
    rows,
    selectedRowId,
    setSelectedRowId,
    busy,
    doAction,
}: {
    rows: AiFailedRow[]
    selectedRowId: string | null
    setSelectedRowId: (id: string) => void
    busy: boolean
    doAction: (
        endpoint: "accept" | "reject" | "edit" | "retry" | "dismiss",
        body: Record<string, unknown>,
        successMessage: string,
    ) => Promise<boolean>
}) {
    if (rows.length === 0) {
        return (
            <EmptyState
                icon={<Check className="w-6 h-6 text-emerald-500" />}
                title="No AI failures."
                hint="Rows that exhaust retries land here."
            />
        )
    }
    return (
        <ul role="list" className="border rounded-md overflow-hidden">
            {rows.map((row) => {
                const active = row.rowId === selectedRowId
                return (
                    <li key={row.rowId}>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedRowId(row.rowId)}
                            onKeyDown={(e) => {
                                if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault()
                                    setSelectedRowId(row.rowId)
                                }
                            }}
                            aria-current={active ? "true" : undefined}
                            className={
                                "px-2 py-1.5 grid grid-cols-[minmax(0,1fr)_60px_44px_auto] items-start gap-2 border-b last:border-b-0 cursor-pointer transition-colors " +
                                (active
                                    ? "bg-brand/10 border-l-2 border-l-brand"
                                    : "hover:bg-accent/40 border-l-2 border-l-transparent")
                            }
                        >
                            <div className="min-w-0">
                                <div className="text-xs truncate">{row.title}</div>
                                <div className="text-[10px] font-mono text-rose-600 dark:text-rose-400 truncate">
                                    {row.lastError}
                                </div>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                                {row.collection}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                                {row.attempts}× tried
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        void doAction(
                                            "retry",
                                            { rowId: row.rowId, kind: "enrichment" },
                                            `Retry queued: ${row.title}`,
                                        )
                                    }}
                                    disabled={busy}
                                    className="h-6 text-[10px] px-2"
                                >
                                    Retry (y)
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        void doAction(
                                            "dismiss",
                                            { rowId: row.rowId, kind: "enrichment" },
                                            `Dismissed: ${row.title}`,
                                        )
                                    }}
                                    disabled={busy}
                                    className="h-6 text-[10px] px-2"
                                >
                                    Dismiss (n)
                                </Button>
                            </div>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

// ─── Import failures ───────────────────────────────────────────────────────

function ImportList({
    rows,
    selectedRowId,
    setSelectedRowId,
    busy,
    doAction,
}: {
    rows: ImportFailureRow[]
    selectedRowId: string | null
    setSelectedRowId: (id: string) => void
    busy: boolean
    doAction: (
        endpoint: "accept" | "reject" | "edit" | "retry" | "dismiss",
        body: Record<string, unknown>,
        successMessage: string,
    ) => Promise<boolean>
}) {
    if (rows.length === 0) {
        return (
            <EmptyState
                icon={<Check className="w-6 h-6 text-emerald-500" />}
                title="No import failures."
                hint="Drive-sync errors land here."
            />
        )
    }
    return (
        <ul role="list" className="border rounded-md overflow-hidden">
            {rows.map((row) => {
                const active = row.driveFileId === selectedRowId
                return (
                    <li key={row.driveFileId}>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedRowId(row.driveFileId)}
                            onKeyDown={(e) => {
                                if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault()
                                    setSelectedRowId(row.driveFileId)
                                }
                            }}
                            aria-current={active ? "true" : undefined}
                            className={
                                "px-2 py-1.5 grid grid-cols-[minmax(0,1fr)_80px_44px_auto] items-start gap-2 border-b last:border-b-0 cursor-pointer transition-colors " +
                                (active
                                    ? "bg-brand/10 border-l-2 border-l-brand"
                                    : "hover:bg-accent/40 border-l-2 border-l-transparent")
                            }
                        >
                            <div className="min-w-0">
                                <div className="text-xs truncate">
                                    {row.driveName ?? row.driveFileId}
                                </div>
                                <div className="text-[10px] font-mono text-rose-600 dark:text-rose-400 truncate">
                                    {row.errorMessage}
                                </div>
                            </div>
                            <Badge
                                variant="outline"
                                className="h-4 px-1.5 text-[9px] font-mono"
                            >
                                {row.status}
                            </Badge>
                            <div className="text-[10px] font-mono text-muted-foreground">
                                {row.attemptCount}×
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        void doAction(
                                            "retry",
                                            { rowId: row.driveFileId, kind: "import" },
                                            `Retry queued: ${row.driveName ?? row.driveFileId}`,
                                        )
                                    }}
                                    disabled={busy}
                                    className="h-6 text-[10px] px-2"
                                >
                                    Retry (y)
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        void doAction(
                                            "dismiss",
                                            { rowId: row.driveFileId, kind: "import" },
                                            `Dismissed: ${row.driveName ?? row.driveFileId}`,
                                        )
                                    }}
                                    disabled={busy}
                                    className="h-6 text-[10px] px-2"
                                >
                                    Dismiss (n)
                                </Button>
                            </div>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

// ─── Action bar (bottom-sticky keystroke hints) ────────────────────────────

function ActionBar({
    tab,
    hasSelection,
    editing,
    busy,
}: {
    tab: TabKey
    hasSelection: boolean
    editing: boolean
    busy: boolean
}) {
    const dim = "opacity-50"
    const lit = "opacity-100"
    const enabled = (cond: boolean) => (cond ? lit : dim)
    return (
        <footer className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 z-40">
            <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-3">
                    <Hint k="j/k">navigate</Hint>
                    <Hint k="↵">expand</Hint>
                    <Hint k="/">filter</Hint>
                    {tab === "review" && (
                        <>
                            <Hint
                                k="a"
                                className={enabled(hasSelection && !editing && !busy)}
                            >
                                accept
                            </Hint>
                            <Hint
                                k="r"
                                className={enabled(hasSelection && !editing && !busy)}
                            >
                                reject
                            </Hint>
                            <Hint
                                k="e"
                                className={enabled(hasSelection && !editing && !busy)}
                            >
                                edit
                            </Hint>
                        </>
                    )}
                    {(tab === "failed" || tab === "import") && (
                        <>
                            <Hint k="y" className={enabled(hasSelection && !busy)}>
                                retry
                            </Hint>
                            <Hint k="n" className={enabled(hasSelection && !busy)}>
                                dismiss
                            </Hint>
                        </>
                    )}
                    {editing && <Hint k="esc">cancel</Hint>}
                </div>
                <div className="flex items-center gap-2">
                    {busy && (
                        <span className="inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> working…
                        </span>
                    )}
                </div>
            </div>
        </footer>
    )
}

function Hint({
    k,
    children,
    className,
}: {
    k: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
            <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono leading-none">
                {k}
            </kbd>
            {children}
        </span>
    )
}

function EmptyState({
    icon,
    title,
    hint,
}: {
    icon: React.ReactNode
    title: string
    hint: string
}) {
    return (
        <div className="border rounded-md p-6 text-center">
            <div className="flex justify-center mb-2">{icon}</div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        </div>
    )
}
