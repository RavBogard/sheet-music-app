"use client"
import { useState, useRef, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Link, FileText, AlertTriangle, CheckCircle2, ChevronRight, Music, UploadCloud, FileType2, Calendar, User, ListMusic, FileWarning, Disc3 } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import type { T } from "@/i18n/core"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { apiFetch } from "@/lib/api-client"
import type { ResolvedStructure } from "@/lib/setlist-import/resolve"
import type { Setlist } from "@/types/models"
import { suggestServiceDate, inferServiceType, toDateInputValue, SERVICE_TYPE_LABELS } from "@/lib/setlist-import/interview-defaults"

type ServiceTemplateType = NonNullable<Setlist['templateType']>

// Phase 7: the service-type labels (interview-defaults SERVICE_TYPE_LABELS) as
// literal catalogue keys, so the picker and the preview header translate.
const SERVICE_TYPE_KEYS: Record<ServiceTemplateType, string> = {
    shabbat_morning: "importer.serviceType.shabbat_morning",
    friday_night: "importer.serviceType.friday_night",
    rosh_hashanah: "importer.serviceType.rosh_hashanah",
    yom_kippur: "importer.serviceType.yom_kippur",
    festival: "importer.serviceType.festival",
    other: "importer.serviceType.other",
}

const BOLD_MARK = "\u0001"

/** Render a translated sentence with one {var} value in <strong>. */
function withBold(text: string, marker: string, bold: React.ReactNode): React.ReactNode {
    const i = text.indexOf(marker)
    if (i < 0) return text
    return <>{text.slice(0, i)}<strong>{bold}</strong>{text.slice(i + marker.length)}</>
}

/** A count sentence ("{count} songs found") with the number in <strong>. */
function countBold(t: T, key: string, count: number): React.ReactNode {
    return withBold(t(key, { count }), String(count), count)
}

interface ParsedItem {
    type: 'header' | 'song'
    title: string
    key?: string
    chartUrl?: string
    performer?: string
    referenceLink?: string
    chartError?: "Private Link" | "Invalid Link"
    libraryMatchId?: string
    libraryMatchName?: string
    similarityScore?: number
}

interface ImporterModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onComplete?: (setlistId: string) => void
}

type Step = 'input' | 'processing' | 'review' | 'interview' | 'preview'

export function ImporterModal({ open, onOpenChange, onComplete }: ImporterModalProps) {
    const t = useT()
    const fmt = useFormat()
    const [step, setStep] = useState<Step>('input')
    const [url, setUrl] = useState("")
    const [csvFile, setCsvFile] = useState<File | null>(null)

    const [items, setItems] = useState<ParsedItem[]>([])
    const [isParsing, setIsParsing] = useState(false)
    const [isExecuting, setIsExecuting] = useState(false)

    // ── Document-import path (v70-07) ────────────────────────────────────
    const [docFile, setDocFile] = useState<File | null>(null)
    const [isProcessingDoc, setIsProcessingDoc] = useState(false)
    // Aborts the in-flight 3-route doc-import chain when the modal closes or the
    // user starts over (v70-08-04 — closing the modal must cancel server work).
    const docSubmitAbortRef = useRef<AbortController | null>(null)
    const [resolved, setResolved] = useState<ResolvedStructure | null>(null)
    const [docFileName, setDocFileName] = useState("")

    // Interview-form fields (parser-unfillable metadata).
    const [interviewName, setInterviewName] = useState("")
    const [interviewDate, setInterviewDate] = useState("")
    const [interviewServiceType, setInterviewServiceType] = useState<NonNullable<Setlist['templateType']>>('other')
    const [interviewRabbi, setInterviewRabbi] = useState("")
    const [isCommitting, setIsCommitting] = useState(false)

    // Reset state on open
    useEffect(() => {
        if (open) {
            setStep('input')
            setUrl("")
            setCsvFile(null)
            setItems([])
            setIsExecuting(false)
            setDocFile(null)
            setIsProcessingDoc(false)
            setResolved(null)
            setDocFileName("")
            setInterviewName("")
            setInterviewDate("")
            setInterviewServiceType('other')
            setInterviewRabbi("")
            setIsCommitting(false)
        } else {
            // Modal closed mid-pipeline — cancel any in-flight doc-import chain.
            docSubmitAbortRef.current?.abort()
        }
    }, [open])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setCsvFile(e.target.files[0])
            setUrl("") // Clear URL if file selected
            setDocFile(null) // Clear document if CSV selected
        }
    }

    const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setDocFile(e.target.files[0])
            setUrl("") // Clear URL if document selected
            setCsvFile(null) // Clear CSV if document selected
        }
    }

    // Chains the three v70-04→06 import routes: extract raw text → ask Gemini
    // for the structured { sections, tracks } shape → resolve tracks against
    // the library. On success, lands on the interview step with the resolved
    // structure in state. Any step failure toasts the server error and returns
    // to the input step. No persistence here — the commit is v70-07-03.
    const handleDocSubmit = async () => {
        if (!docFile) {
            toast.error(t("importer.selectDocument"))
            return
        }

        // Fresh AbortController per run — abort any prior in-flight chain first.
        docSubmitAbortRef.current?.abort()
        const controller = new AbortController()
        docSubmitAbortRef.current = controller

        setIsProcessingDoc(true)
        setStep('processing')
        try {
            // 1. Extract raw text from the .docx / .pdf / .txt document.
            const formData = new FormData()
            formData.append('file', docFile)
            const extractRes = await apiFetch('/api/setlists/import/extract-document', {
                method: 'POST',
                body: formData,
                timeout: 60000,
                signal: controller.signal,
            })
            if (!extractRes.ok) {
                const data = await extractRes.json().catch(() => ({}))
                throw new Error(data.error || t("importer.readDocumentFailed", { status: extractRes.status }))
            }
            const { text } = await extractRes.json()

            // 2. Ask Gemini for the structured { sections, tracks } shape.
            const structureRes = await apiFetch('/api/setlists/import/extract-structure', {
                method: 'POST',
                body: JSON.stringify({ text }),
                timeout: 60000,
                signal: controller.signal,
            })
            if (!structureRes.ok) {
                const data = await structureRes.json().catch(() => ({}))
                throw new Error(data.error || t("importer.extractStructureFailed", { status: structureRes.status }))
            }
            const structure = await structureRes.json()

            // 3. Resolve tracks against the library (chart matches + recordings).
            const resolveRes = await apiFetch('/api/setlists/import/resolve', {
                method: 'POST',
                body: JSON.stringify({ sections: structure.sections, tracks: structure.tracks }),
                timeout: 60000,
                signal: controller.signal,
            })
            if (!resolveRes.ok) {
                const data = await resolveRes.json().catch(() => ({}))
                throw new Error(data.error || t("importer.resolveTracksFailed", { status: resolveRes.status }))
            }
            const resolvedData = await resolveRes.json()
            const resolvedStructure: ResolvedStructure = {
                sections: resolvedData.sections,
                tracks: resolvedData.tracks,
            }

            // Seed the interview form from the document.
            const suggestedDate = suggestServiceDate(docFile.name)
            const inferredText = [
                docFile.name,
                ...resolvedStructure.sections.map((s) => s.name),
                ...resolvedStructure.tracks.map((tr) => `${tr.title} ${tr.notes ?? ''}`),
            ].join(' ')
            setResolved(resolvedStructure)
            setDocFileName(docFile.name)
            setInterviewName(docFile.name.replace(/\.[^.]+$/, '').trim() || t("importer.defaultSetlistName"))
            setInterviewDate(suggestedDate ? toDateInputValue(suggestedDate) : '')
            setInterviewServiceType(inferServiceType(inferredText))
            setInterviewRabbi('')
            setStep('interview')
        } catch (err: unknown) {
            // A deliberate abort (modal closed / "Start over") is not an error
            // to surface — suppress the toast, just reset processing state.
            const aborted =
                controller.signal.aborted ||
                (err instanceof DOMException && err.name === 'AbortError')
            if (!aborted) {
                toast.error(err instanceof Error ? err.message : t("importer.processDocumentError"))
            }
            setStep('input')
        } finally {
            setIsProcessingDoc(false)
            if (docSubmitAbortRef.current === controller) {
                docSubmitAbortRef.current = null
            }
        }
    }

    const handleParse = async () => {
        if (!url && !csvFile) {
            toast.error(t("importer.provideUrlOrCsv"))
            return
        }

        setIsParsing(true)
        setStep('processing')
        try {
            let csvText = undefined
            if (csvFile) {
                csvText = await csvFile.text()
            }

            const res = await apiFetch('/api/setlists/import/parse', {
                method: 'POST',
                body: JSON.stringify({ url: url || undefined, csvText })
            })

            if (!res.ok) {
                let errorMsg = t("importer.parseFailed")
                try {
                    const data = await res.json()
                    errorMsg = data.error || errorMsg
                } catch {
                    errorMsg = t("importer.serverErrorRequestTimeout", { status: res.status, statusText: res.statusText })
                }
                throw new Error(errorMsg)
            }

            const data = await res.json()
            setItems(data.items || [])
            setStep('review')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t("importer.parseSpreadsheetError"))
            setStep('input')
        } finally {
            setIsParsing(false)
        }
    }

    // Commit the resolved structure + interview values as a real setlist.
    // POSTs to the doc-import commit route (flatten + createSetlistServerSide);
    // on success closes the modal and hands the new setlist id to onComplete.
    const handleCommitDocument = async () => {
        if (!resolved || !interviewDate || resolved.tracks.length === 0) return
        setIsCommitting(true)
        try {
            const res = await apiFetch('/api/setlists/import/commit-document', {
                method: 'POST',
                body: JSON.stringify({
                    name: interviewName,
                    eventDate: interviewDate,
                    serviceType: interviewServiceType,
                    rabbi: interviewRabbi || undefined,
                    sections: resolved.sections,
                    tracks: resolved.tracks,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || t("importer.createSetlistFailed", { status: res.status }))
            }
            const data = await res.json()
            toast.success(t("importer.setlistCreated"))
            if (onComplete && data.setlistId) {
                onComplete(data.setlistId)
            }
            onOpenChange(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t("importer.createSetlistError"))
            setIsCommitting(false)
        }
    }

    // Group resolved tracks under their sections in document order. Tracks with
    // no sectionName (or when the doc has no sections at all) fall into an
    // "Ungrouped" bucket rendered last.
    const previewGroups = useMemo(() => {
        if (!resolved) return []
        const groups = resolved.sections
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((s) => ({ name: s.name as string | null, tracks: [] as typeof resolved.tracks }))
        const ungrouped: typeof resolved.tracks = []
        for (const track of resolved.tracks) {
            const g = track.sectionName
                ? groups.find((grp) => grp.name === track.sectionName)
                : undefined
            if (g) g.tracks.push(track)
            else ungrouped.push(track)
        }
        for (const g of groups) g.tracks.sort((a, b) => a.order - b.order)
        ungrouped.sort((a, b) => a.order - b.order)
        const result = groups.filter((g) => g.tracks.length > 0)
        if (ungrouped.length > 0) result.push({ name: null, tracks: ungrouped })
        return result
    }, [resolved])

    const handleItemChange = (index: number, field: keyof ParsedItem, value: string) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: value }
        setItems(newItems)
    }

    // Interview-step "Start over" — explicitly discards the resolved AI-pipeline
    // result and returns to input. Named + explicit so the destructive intent is
    // honest (a plain "Back" silently threw away a 1-3 min pipeline run).
    const handleStartOver = () => {
        docSubmitAbortRef.current?.abort()
        docSubmitAbortRef.current = null
        setDocFile(null)
        setResolved(null)
        setDocFileName("")
        setInterviewName("")
        setInterviewDate("")
        setInterviewServiceType('other')
        setInterviewRabbi("")
        setStep('input')
    }

    const handleExecute = async () => {
        setIsExecuting(true)
        try {
            const res = await apiFetch('/api/setlists/import/execute', {
                method: 'POST',
                body: JSON.stringify({ items, name: t("importer.defaultSetlistName") })
            })

            if (!res.ok) {
                let errorMsg = t("importer.executeFailed")
                try {
                    const data = await res.json()
                    errorMsg = data.error || errorMsg
                } catch {
                    errorMsg = t("importer.serverErrorUploadTimeout", { status: res.status, statusText: res.statusText })
                }
                throw new Error(errorMsg)
            }

            const data = await res.json()
            toast.success(t("importer.setlistImported"))

            if (onComplete && data.setlistId) {
                onComplete(data.setlistId)
            }
            onOpenChange(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t("importer.executeImportError"))
            setIsExecuting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[900px] gap-0 p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
                    <DialogTitle className="text-title">{t("importer.title")}</DialogTitle>
                    <DialogDescription>
                        {step === 'input' && t("importer.descriptionInput")}
                        {step === 'processing' && t("importer.descriptionProcessing")}
                        {step === 'review' && t("importer.descriptionReview")}
                        {step === 'interview' && t("importer.descriptionInterview")}
                        {step === 'preview' && t("importer.descriptionPreview")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {step === 'input' && (
                        <div className="p-8 space-y-8 flex-1 overflow-y-auto">
                            {/* Option 1: URL */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <Link className="h-4 w-4 text-blue-500" />
                                    {t("importer.sheetsUrlLabel")}
                                </Label>
                                <Input
                                    // i18n-ignore: example URL, not prose
                                    placeholder="https://docs.google.com/spreadsheets/d/..."
                                    value={url}
                                    onChange={(e) => { setUrl(e.target.value); setCsvFile(null); setDocFile(null) }}
                                    className="bg-muted/50 border-border"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t("importer.sheetsSharingHint")}
                                </p>
                            </div>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-border"></div>
                                <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("importer.or")}</span>
                                <div className="flex-grow border-t border-border"></div>
                            </div>

                            {/* Option 2: Upload */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-violet-500" />
                                    {t("importer.uploadCsvLabel")}
                                </Label>
                                <label
                                    htmlFor="csv-file-input"
                                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors hover:bg-muted/30 cursor-pointer focus-within:ring-2 focus-within:ring-brand ${csvFile ? 'border-violet-500 bg-violet-500/5' : 'border-border'}`}
                                >
                                    <UploadCloud className={`h-8 w-8 mb-3 ${csvFile ? 'text-violet-500' : 'text-muted-foreground'}`} />
                                    <p className="text-sm font-medium" aria-live="polite">
                                        {csvFile ? csvFile.name : t("importer.selectCsvFile")}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {/* i18n-ignore: file size unit */}
                                        {csvFile ? `${(csvFile.size / 1024).toFixed(1)} KB` : t("importer.dragDropDisabled")}
                                    </p>
                                    <input
                                        id="csv-file-input"
                                        type="file"
                                        accept=".csv"
                                        aria-label={t("importer.uploadCsvAria")}
                                        className="sr-only"
                                        onChange={handleFileSelect}
                                    />
                                </label>
                            </div>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-border"></div>
                                <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("importer.or")}</span>
                                <div className="flex-grow border-t border-border"></div>
                            </div>

                            {/* Option 3: Upload a service-outline document (v70-07) */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <FileType2 className="h-4 w-4 text-emerald-500" />
                                    {t("importer.uploadDocumentLabel")}
                                </Label>
                                <label
                                    htmlFor="doc-file-input"
                                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors hover:bg-muted/30 cursor-pointer focus-within:ring-2 focus-within:ring-brand ${docFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-border'}`}
                                >
                                    <UploadCloud className={`h-8 w-8 mb-3 ${docFile ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                    <p className="text-sm font-medium" aria-live="polite">
                                        {docFile ? docFile.name : t("importer.selectDocumentFile")}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {/* i18n-ignore: file size unit */}
                                        {docFile ? `${(docFile.size / 1024).toFixed(1)} KB` : t("importer.documentHint")}
                                    </p>
                                    <input
                                        id="doc-file-input"
                                        type="file"
                                        accept=".docx,.pdf,.txt"
                                        aria-label={t("importer.uploadDocumentAria")}
                                        className="sr-only"
                                        onChange={handleDocSelect}
                                    />
                                </label>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button
                                    onClick={docFile ? handleDocSubmit : handleParse}
                                    disabled={(!url && !csvFile && !docFile) || isParsing || isProcessingDoc}
                                    className="gap-2 shrink-0 bg-brand hover:bg-brand/90"
                                >
                                    {(isParsing || isProcessingDoc) ? <Loader2 className="h-4 w-4 animate-spin" /> : <DirectionalIcon icon={ChevronRight} className="h-4 w-4" />}
                                    {isParsing || isProcessingDoc
                                        ? t("importer.analyzing")
                                        : docFile
                                            ? t("importer.nextAnalyzeDocument")
                                            : t("importer.nextAnalyzeSpreadsheet")}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-6" />
                            <h3 className="text-title text-foreground mt-4">
                                {isProcessingDoc ? t("importer.readingDocumentHeading") : t("importer.analyzingRowsHeading")}
                            </h3>
                            <p className="text-sm text-muted-foreground w-64">
                                {isProcessingDoc
                                    ? t("importer.readingDocumentBody")
                                    : t("importer.analyzingRowsBody")}
                            </p>
                        </div>
                    )}

                    {step === 'review' && (
                        <>
                            <div className="flex-1 overflow-y-auto bg-muted/10">
                                <div className="p-0">
                                    <table className="w-full text-sm text-start">
                                        <thead className="bg-muted/50 sticky top-0 z-10 text-xs uppercase text-muted-foreground shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">{t("importer.columnType")}</th>
                                                <th className="px-4 py-3 font-semibold w-1/3">{t("importer.columnTitle")}</th>
                                                <th className="px-4 py-3 font-semibold">{t("importer.columnKeyVocalLead")}</th>
                                                <th className="px-4 py-3 font-semibold">{t("importer.columnStatus")}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {items.map((item, idx) => (
                                                <tr key={idx} className={`transition-colors hover:bg-muted/30 ${item.type === 'header' ? 'bg-muted/20' : ''}`}>
                                                    {/* Type */}
                                                    <td className="px-4 py-3">
                                                        {item.type === 'header' ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs font-bold uppercase">
                                                                {t("importer.rowHeader")}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400">
                                                                <Music className="h-3.5 w-3.5" /> {t("importer.rowSong")}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Title Editor */}
                                                    <td className="px-4 py-3">
                                                        <Input
                                                            value={item.title || ""}
                                                            onChange={(e) => handleItemChange(idx, 'title', e.target.value)}
                                                            className={`h-8 ${item.type === 'header' ? 'font-bold uppercase tracking-wider text-xs bg-transparent border-0 px-0' : 'bg-background'}`}
                                                        />
                                                    </td>

                                                    {/* Key & Lead Editor */}
                                                    <td className="px-4 py-3 space-y-1">
                                                        {item.type === 'song' && (
                                                            <>
                                                                <div className="flex items-center gap-2">
                                                                    <Input
                                                                        placeholder={t("importer.keyPlaceholder")}
                                                                        value={item.key || ""}
                                                                        onChange={(e) => handleItemChange(idx, 'key', e.target.value)}
                                                                        className="h-7 w-16 text-xs bg-background"
                                                                    />
                                                                    <Input
                                                                        placeholder={t("importer.vocalLeadPlaceholder")}
                                                                        value={item.performer || ""}
                                                                        onChange={(e) => handleItemChange(idx, 'performer', e.target.value)}
                                                                        className="h-7 w-full text-xs bg-background"
                                                                    />
                                                                </div>
                                                            </>
                                                        )}
                                                    </td>

                                                    {/* Status Warning / Match Messages */}
                                                    <td className="px-4 py-3">
                                                        {item.type === 'song' && (
                                                            <div className="flex flex-col gap-1.5">
                                                                {/* File URL/Error */}
                                                                {item.chartError ? (
                                                                    <div className="flex items-start gap-1.5 text-xs text-red-500 bg-red-500/10 rounded px-2 py-1 border border-red-500/20">
                                                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                                        <span className="leading-tight">
                                                                            {item.chartError === "Private Link" ? t("importer.privateDriveLink") : t("importer.invalidLink")}
                                                                        </span>
                                                                    </div>
                                                                ) : item.chartUrl ? (
                                                                    <div className="flex items-center gap-1.5 text-xs text-green-500 dark:text-green-400">
                                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                                        <span className="truncate max-w-[150px]" title={item.chartUrl}>{t("importer.hasDriveLink")}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-xs text-muted-foreground italic">{t("importer.noChartLink")}</div>
                                                                )}

                                                                {/* Library Match */}
                                                                {item.libraryMatchId && (
                                                                    <div className="flex items-start gap-1.5 text-xs text-violet-500 dark:text-violet-400 bg-violet-500/10 rounded px-2 py-1">
                                                                        <Link className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                                        <span className="leading-tight">
                                                                            {withBold(t("importer.matchesLibrary", { name: BOLD_MARK }), BOLD_MARK, item.libraryMatchName)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Review Action Footer */}
                            <div className="p-4 border-t border-border bg-background flex items-center justify-between shrink-0 shadow-[0_-10px_30px_#00000033]">
                                <div className="text-xs text-muted-foreground flex flex-col">
                                    <span>{countBold(t, "importer.songsFound", items.filter(i => i.type === 'song').length)}</span>
                                    <span>{countBold(t, "importer.newDrivePdfs", items.filter(i => i.chartUrl && !i.chartError && !i.libraryMatchId).length)}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button variant="ghost" onClick={() => setStep('input')} disabled={isExecuting}>
                                        {t("importer.back")}
                                    </Button>
                                    <Button onClick={handleExecute} disabled={isExecuting} className="bg-brand hover:bg-brand/90 gap-2">
                                        {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        {isExecuting ? t("importer.executing") : t("importer.finalizeImport")}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}

                    {step === 'interview' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="interview-name" className="text-sm font-semibold">
                                        {t("importer.setlistNameLabel")}
                                    </Label>
                                    <Input
                                        id="interview-name"
                                        value={interviewName}
                                        onChange={(e) => setInterviewName(e.target.value)}
                                        className="bg-muted/50 border-border"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="interview-date" className="text-sm font-semibold flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-blue-500" />
                                        {t("importer.serviceDateLabel")} <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="interview-date"
                                        type="date"
                                        value={interviewDate}
                                        onChange={(e) => setInterviewDate(e.target.value)}
                                        className="bg-muted/50 border-border"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {t("importer.serviceDateHint")}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="interview-service-type" className="text-sm font-semibold flex items-center gap-2">
                                        <ListMusic className="h-4 w-4 text-violet-500" />
                                        {t("importer.serviceTypeLabel")}
                                    </Label>
                                    <select
                                        id="interview-service-type"
                                        value={interviewServiceType}
                                        onChange={(e) => setInterviewServiceType(e.target.value as ServiceTemplateType)}
                                        className="w-full h-10 rounded-md bg-muted/50 border border-border px-3 text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    >
                                        {(Object.keys(SERVICE_TYPE_LABELS) as ServiceTemplateType[]).map((value) => (
                                            <option key={value} value={value}>{t(SERVICE_TYPE_KEYS[value])}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground">
                                        {t("importer.serviceTypeHint")}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="interview-rabbi" className="text-sm font-semibold flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        {t("importer.rabbiLabel")} <span className="text-xs font-normal text-muted-foreground">{t("importer.optional")}</span>
                                    </Label>
                                    <Input
                                        id="interview-rabbi"
                                        value={interviewRabbi}
                                        onChange={(e) => setInterviewRabbi(e.target.value)}
                                        placeholder={t("importer.rabbiPlaceholder")}
                                        className="bg-muted/50 border-border"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-background flex items-center justify-between shrink-0 shadow-[0_-10px_30px_#00000033]">
                                <Button variant="ghost" onClick={handleStartOver}>
                                    {t("importer.startOver")}
                                </Button>
                                <Button
                                    onClick={() => setStep('preview')}
                                    disabled={!interviewDate}
                                    className="bg-brand hover:bg-brand/90 gap-2"
                                >
                                    <DirectionalIcon icon={ChevronRight} className="h-4 w-4" />
                                    {t("importer.nextPreview")}
                                </Button>
                            </div>
                        </>
                    )}

                    {step === 'preview' && resolved && (
                        <>
                            {/* Interview-value header band */}
                            <div className="px-6 py-3 border-b border-border bg-muted/30 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="font-semibold text-foreground text-sm">
                                    {interviewName || t("importer.untitledSetlist")}
                                </span>
                                {interviewDate && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {fmt.pattern(new Date(interviewDate + 'T00:00:00'), 'PPP')}
                                    </span>
                                )}
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <ListMusic className="h-3.5 w-3.5" />
                                    {t(SERVICE_TYPE_KEYS[interviewServiceType])}
                                </span>
                                {interviewRabbi && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="h-3.5 w-3.5" />
                                        {interviewRabbi}
                                    </span>
                                )}
                            </div>

                            {/* Resolved setlist — grouped by section, max-density text rows */}
                            <div className="flex-1 overflow-y-auto bg-muted/10">
                                {previewGroups.length === 0 ? (
                                    <div className="p-12 text-center text-sm text-muted-foreground">
                                        {t("importer.noTracks")}
                                    </div>
                                ) : (
                                    previewGroups.map((group, gIdx) => (
                                        <div key={group.name ?? `ungrouped-${gIdx}`}>
                                            <div className="px-4 py-2 bg-muted/50 sticky top-0 z-10 text-xs uppercase tracking-wider font-bold text-muted-foreground border-b border-border">
                                                {group.name ?? t("importer.ungrouped")}
                                            </div>
                                            {group.tracks.map((track, tIdx) => (
                                                <div
                                                    key={`${track.title}-${track.order}`}
                                                    className="flex items-center gap-3 px-4 py-2 border-b border-border/40 hover:bg-muted/30 text-sm"
                                                >
                                                    <span className="text-muted-foreground tabular-nums text-xs w-6 shrink-0">
                                                        {tIdx + 1}
                                                    </span>
                                                    <span className="font-medium truncate flex-1 min-w-0" title={track.title}>
                                                        {track.title}
                                                    </span>
                                                    {track.key && (
                                                        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                                            {track.key}
                                                        </span>
                                                    )}
                                                    {track.vocalLead && (
                                                        <span className="text-xs text-muted-foreground truncate max-w-[120px] shrink-0" title={track.vocalLead}>
                                                            {track.vocalLead}
                                                        </span>
                                                    )}
                                                    {track.libraryMatch ? (
                                                        <span
                                                            className="flex items-center gap-1.5 text-xs text-violet-500 dark:text-violet-400 shrink-0 max-w-[200px]"
                                                            title={t("importer.matchesLibrary", { name: track.libraryMatch.name })}
                                                        >
                                                            <Link className="h-3.5 w-3.5 shrink-0" />
                                                            <span className="truncate">{track.libraryMatch.name}</span>
                                                            <span className="text-muted-foreground tabular-nums">
                                                                {Math.round(track.libraryMatch.confidence * 100)}%
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 shrink-0">
                                                            <FileWarning className="h-3.5 w-3.5" />
                                                            {t("importer.missingChart")}
                                                        </span>
                                                    )}
                                                    {track.recordingCandidates.length > 0 && (
                                                        <span
                                                            className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
                                                            title={t("importer.recordingCandidates", { count: track.recordingCandidates.length })}
                                                        >
                                                            <Disc3 className="h-3.5 w-3.5" />
                                                            {track.recordingCandidates.length}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-4 border-t border-border bg-background flex items-center justify-between shrink-0 shadow-[0_-10px_30px_#00000033]">
                                <div className="text-xs text-muted-foreground flex flex-col">
                                    <span>{countBold(t, "importer.trackCount", resolved.tracks.length)}</span>
                                    <span>{countBold(t, "importer.missingChartCount", resolved.tracks.filter((tr) => tr.missingChart).length)}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button variant="ghost" onClick={() => setStep('interview')} disabled={isCommitting}>
                                        {t("importer.back")}
                                    </Button>
                                    <Button
                                        onClick={handleCommitDocument}
                                        disabled={isCommitting || resolved.tracks.length === 0}
                                        className="bg-brand hover:bg-brand/90 gap-2"
                                    >
                                        {isCommitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        {isCommitting ? t("importer.creating") : t("importer.createSetlist")}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
