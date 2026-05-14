"use client"
import { useState, useRef, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Link, FileText, AlertTriangle, CheckCircle2, ChevronRight, Music, UploadCloud, FileType2, Calendar, User, ListMusic, FileWarning, Disc3 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import type { ResolvedStructure } from "@/lib/setlist-import/resolve"
import type { Setlist } from "@/types/models"
import { suggestServiceDate, inferServiceType, toDateInputValue, SERVICE_TYPE_LABELS } from "@/lib/setlist-import/interview-defaults"

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
    const [step, setStep] = useState<Step>('input')
    const [url, setUrl] = useState("")
    const [csvFile, setCsvFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [items, setItems] = useState<ParsedItem[]>([])
    const [isParsing, setIsParsing] = useState(false)
    const [isExecuting, setIsExecuting] = useState(false)

    // ── Document-import path (v70-07) ────────────────────────────────────
    const [docFile, setDocFile] = useState<File | null>(null)
    const docFileInputRef = useRef<HTMLInputElement>(null)
    const [isProcessingDoc, setIsProcessingDoc] = useState(false)
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
            toast.error("Please select a document to upload.")
            return
        }

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
            })
            if (!extractRes.ok) {
                const data = await extractRes.json().catch(() => ({}))
                throw new Error(data.error || `Failed to read document (server error ${extractRes.status}).`)
            }
            const { text } = await extractRes.json()

            // 2. Ask Gemini for the structured { sections, tracks } shape.
            const structureRes = await apiFetch('/api/setlists/import/extract-structure', {
                method: 'POST',
                body: JSON.stringify({ text }),
                timeout: 60000,
            })
            if (!structureRes.ok) {
                const data = await structureRes.json().catch(() => ({}))
                throw new Error(data.error || `Failed to extract setlist structure (server error ${structureRes.status}).`)
            }
            const structure = await structureRes.json()

            // 3. Resolve tracks against the library (chart matches + recordings).
            const resolveRes = await apiFetch('/api/setlists/import/resolve', {
                method: 'POST',
                body: JSON.stringify({ sections: structure.sections, tracks: structure.tracks }),
            })
            if (!resolveRes.ok) {
                const data = await resolveRes.json().catch(() => ({}))
                throw new Error(data.error || `Failed to resolve tracks against the library (server error ${resolveRes.status}).`)
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
                ...resolvedStructure.tracks.map((t) => `${t.title} ${t.notes ?? ''}`),
            ].join(' ')
            setResolved(resolvedStructure)
            setDocFileName(docFile.name)
            setInterviewName(docFile.name.replace(/\.[^.]+$/, '').trim() || 'Imported Setlist')
            setInterviewDate(suggestedDate ? toDateInputValue(suggestedDate) : '')
            setInterviewServiceType(inferServiceType(inferredText))
            setInterviewRabbi('')
            setStep('interview')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error processing document.")
            setStep('input')
        } finally {
            setIsProcessingDoc(false)
        }
    }

    const handleParse = async () => {
        if (!url && !csvFile) {
            toast.error("Please provide a Google Sheets URL or upload a CSV file.")
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
                let errorMsg = "Failed to parse data."
                try {
                    const data = await res.json()
                    errorMsg = data.error || errorMsg
                } catch {
                    errorMsg = `Server error ${res.status}: ${res.statusText}. The request may have timed out.`
                }
                throw new Error(errorMsg)
            }

            const data = await res.json()
            setItems(data.items || [])
            setStep('review')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error parsing spreadsheet.")
            setStep('input')
        } finally {
            setIsParsing(false)
        }
    }

    // Commit the resolved structure + interview values as a real setlist.
    // POSTs to the doc-import commit route (flatten + createSetlistServerSide);
    // on success closes the modal and hands the new setlist id to onComplete.
    const handleCommitDocument = async () => {
        if (!resolved || !interviewDate) return
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
                throw new Error(data.error || `Failed to create setlist (server error ${res.status}).`)
            }
            const data = await res.json()
            toast.success("Setlist created successfully!")
            if (onComplete && data.setlistId) {
                onComplete(data.setlistId)
            }
            onOpenChange(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error creating setlist.")
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

    const handleExecute = async () => {
        setIsExecuting(true)
        try {
            const res = await apiFetch('/api/setlists/import/execute', {
                method: 'POST',
                body: JSON.stringify({ items, name: "Imported Setlist" })
            })

            if (!res.ok) {
                let errorMsg = "Execution failed."
                try {
                    const data = await res.json()
                    errorMsg = data.error || errorMsg
                } catch {
                    errorMsg = `Server error ${res.status}: ${res.statusText}. The upload may have timed out.`
                }
                throw new Error(errorMsg)
            }

            const data = await res.json()
            toast.success("Setlist imported successfully!")

            if (onComplete && data.setlistId) {
                onComplete(data.setlistId)
            }
            onOpenChange(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error executing import.")
            setIsExecuting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[900px] gap-0 p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
                    <DialogTitle className="text-title">Import Setlist AI</DialogTitle>
                    <DialogDescription>
                        {step === 'input' && "Provide a spreadsheet or a service-outline document to instantly build your setlist."}
                        {step === 'processing' && "Our AI is reading your file automatically..."}
                        {step === 'review' && "Review what the AI found. We've flagged potential duplicate charts and private Drive links."}
                        {step === 'interview' && "Fill in the details the document didn't cover."}
                        {step === 'preview' && "Review the setlist the AI built before creating it."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {step === 'input' && (
                        <div className="p-8 space-y-8 flex-1 overflow-y-auto">
                            {/* Option 1: URL */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <Link className="h-4 w-4 text-blue-500" />
                                    Google Sheets URL
                                </Label>
                                <Input
                                    placeholder="https://docs.google.com/spreadsheets/d/..."
                                    value={url}
                                    onChange={(e) => { setUrl(e.target.value); setCsvFile(null); setDocFile(null) }}
                                    className="bg-muted/50 border-border"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Make sure the sharing settings are set to &quot;Anyone with the link can view&quot;.
                                </p>
                            </div>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-border"></div>
                                <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs uppercase tracking-wider font-semibold">Or</span>
                                <div className="flex-grow border-t border-border"></div>
                            </div>

                            {/* Option 2: Upload */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-violet-500" />
                                    Upload CSV File
                                </Label>
                                <div
                                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors hover:bg-muted/30 cursor-pointer ${csvFile ? 'border-violet-500 bg-violet-500/5' : 'border-border'}`}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <UploadCloud className={`h-8 w-8 mb-3 ${csvFile ? 'text-violet-500' : 'text-muted-foreground'}`} />
                                    <p className="text-sm font-medium">
                                        {csvFile ? csvFile.name : "Click to select a .csv file"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {csvFile ? `${(csvFile.size / 1024).toFixed(1)} KB` : "Drag and drop intentionally disabled for now."}
                                    </p>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                    />
                                </div>
                            </div>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-border"></div>
                                <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs uppercase tracking-wider font-semibold">Or</span>
                                <div className="flex-grow border-t border-border"></div>
                            </div>

                            {/* Option 3: Upload a service-outline document (v70-07) */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <FileType2 className="h-4 w-4 text-emerald-500" />
                                    Upload Document
                                </Label>
                                <div
                                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors hover:bg-muted/30 cursor-pointer ${docFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-border'}`}
                                    onClick={() => docFileInputRef.current?.click()}
                                >
                                    <UploadCloud className={`h-8 w-8 mb-3 ${docFile ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                    <p className="text-sm font-medium">
                                        {docFile ? docFile.name : "Click to select a .docx, .pdf, or .txt file"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {docFile ? `${(docFile.size / 1024).toFixed(1)} KB` : "AI reads the service outline and builds the setlist."}
                                    </p>
                                    <input
                                        type="file"
                                        accept=".docx,.pdf,.txt"
                                        className="hidden"
                                        ref={docFileInputRef}
                                        onChange={handleDocSelect}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button
                                    onClick={docFile ? handleDocSubmit : handleParse}
                                    disabled={(!url && !csvFile && !docFile) || isParsing || isProcessingDoc}
                                    className="gap-2 shrink-0 bg-blue-600 hover:bg-blue-500"
                                >
                                    {(isParsing || isProcessingDoc) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                    {isParsing || isProcessingDoc
                                        ? "Analyzing..."
                                        : docFile
                                            ? "Next: Analyze Document"
                                            : "Next: Analyze Spreadsheet"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-6" />
                            <h3 className="text-title text-foreground mt-4">Analyzing Rows</h3>
                            <p className="text-sm text-muted-foreground w-64">
                                Passing data to Gemini to map dynamic columns, extract performer names, and verify Google Drive linkage permissions...
                            </p>
                        </div>
                    )}

                    {step === 'review' && (
                        <>
                            <div className="flex-1 overflow-y-auto bg-muted/10">
                                <div className="p-0">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-muted/50 sticky top-0 z-10 text-xs uppercase text-muted-foreground shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">Type</th>
                                                <th className="px-4 py-3 font-semibold w-1/3">Title</th>
                                                <th className="px-4 py-3 font-semibold">Key/Vocal Lead</th>
                                                <th className="px-4 py-3 font-semibold">Library & File Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {items.map((item, idx) => (
                                                <tr key={idx} className={`transition-colors hover:bg-muted/30 ${item.type === 'header' ? 'bg-muted/20' : ''}`}>
                                                    {/* Type */}
                                                    <td className="px-4 py-3">
                                                        {item.type === 'header' ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs font-bold uppercase">
                                                                Header
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400">
                                                                <Music className="h-3.5 w-3.5" /> Song
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
                                                                        placeholder="Key"
                                                                        value={item.key || ""}
                                                                        onChange={(e) => handleItemChange(idx, 'key', e.target.value)}
                                                                        className="h-7 w-16 text-xs bg-background"
                                                                    />
                                                                    <Input
                                                                        placeholder="Vocal Lead"
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
                                                                            {item.chartError === "Private Link" ? "Drive link is private. Cannot download." : "Invalid link."}
                                                                        </span>
                                                                    </div>
                                                                ) : item.chartUrl ? (
                                                                    <div className="flex items-center gap-1.5 text-xs text-green-500 dark:text-green-400">
                                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                                        <span className="truncate max-w-[150px]" title={item.chartUrl}>Has Drive Link</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-xs text-muted-foreground italic">No chart link found</div>
                                                                )}

                                                                {/* Library Match */}
                                                                {item.libraryMatchId && (
                                                                    <div className="flex items-start gap-1.5 text-xs text-violet-500 dark:text-violet-400 bg-violet-500/10 rounded px-2 py-1">
                                                                        <Link className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                                        <span className="leading-tight">
                                                                            Matches library: <strong>{item.libraryMatchName}</strong>
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
                                    <span><strong>{items.filter(i => i.type === 'song').length}</strong> songs found</span>
                                    <span><strong>{items.filter(i => i.chartUrl && !i.chartError && !i.libraryMatchId).length}</strong> new Drive PDFs will be downloaded</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button variant="ghost" onClick={() => setStep('input')} disabled={isExecuting}>
                                        Back
                                    </Button>
                                    <Button onClick={handleExecute} disabled={isExecuting} className="bg-blue-600 hover:bg-blue-500 gap-2">
                                        {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        {isExecuting ? "Executing..." : "Finalize Import"}
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
                                        Setlist Name
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
                                        Service Date <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="interview-date"
                                        type="date"
                                        value={interviewDate}
                                        onChange={(e) => setInterviewDate(e.target.value)}
                                        className="bg-muted/50 border-border"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Required. Suggested from the document filename — adjust if needed.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="interview-service-type" className="text-sm font-semibold flex items-center gap-2">
                                        <ListMusic className="h-4 w-4 text-violet-500" />
                                        Service Type
                                    </Label>
                                    <select
                                        id="interview-service-type"
                                        value={interviewServiceType}
                                        onChange={(e) => setInterviewServiceType(e.target.value as NonNullable<Setlist['templateType']>)}
                                        className="w-full h-10 rounded-md bg-muted/50 border border-border px-3 text-sm cursor-pointer"
                                    >
                                        {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground">
                                        Auto-detected from the document — confirm or change.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="interview-rabbi" className="text-sm font-semibold flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        Rabbi <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                                    </Label>
                                    <Input
                                        id="interview-rabbi"
                                        value={interviewRabbi}
                                        onChange={(e) => setInterviewRabbi(e.target.value)}
                                        placeholder="Led by..."
                                        className="bg-muted/50 border-border"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-background flex items-center justify-between shrink-0 shadow-[0_-10px_30px_#00000033]">
                                <Button variant="ghost" onClick={() => setStep('input')}>
                                    Back
                                </Button>
                                <Button
                                    onClick={() => setStep('preview')}
                                    disabled={!interviewDate}
                                    className="bg-blue-600 hover:bg-blue-500 gap-2"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                    Next: Preview
                                </Button>
                            </div>
                        </>
                    )}

                    {step === 'preview' && resolved && (
                        <>
                            {/* Interview-value header band */}
                            <div className="px-6 py-3 border-b border-border bg-muted/30 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="font-semibold text-foreground text-sm">
                                    {interviewName || 'Untitled Setlist'}
                                </span>
                                {interviewDate && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {interviewDate}
                                    </span>
                                )}
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <ListMusic className="h-3.5 w-3.5" />
                                    {SERVICE_TYPE_LABELS[interviewServiceType]}
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
                                        The document produced no tracks.
                                    </div>
                                ) : (
                                    previewGroups.map((group, gIdx) => (
                                        <div key={group.name ?? `ungrouped-${gIdx}`}>
                                            <div className="px-4 py-2 bg-muted/50 sticky top-0 z-10 text-xs uppercase tracking-wider font-bold text-muted-foreground border-b border-border">
                                                {group.name ?? 'Ungrouped'}
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
                                                            title={`Matches library: ${track.libraryMatch.name}`}
                                                        >
                                                            <Link className="h-3.5 w-3.5 shrink-0" />
                                                            <span className="truncate">{track.libraryMatch.name}</span>
                                                            <span className="text-muted-foreground tabular-nums">
                                                                {Math.round(track.libraryMatch.confidence * 100)}%
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                                                            <FileWarning className="h-3.5 w-3.5" />
                                                            Missing chart
                                                        </span>
                                                    )}
                                                    {track.recordingCandidates.length > 0 && (
                                                        <span
                                                            className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
                                                            title={`${track.recordingCandidates.length} recording candidate(s)`}
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
                                    <span><strong>{resolved.tracks.length}</strong> tracks</span>
                                    <span><strong>{resolved.tracks.filter((t) => t.missingChart).length}</strong> missing a chart</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button variant="ghost" onClick={() => setStep('interview')} disabled={isCommitting}>
                                        Back
                                    </Button>
                                    <Button
                                        onClick={handleCommitDocument}
                                        disabled={isCommitting}
                                        className="bg-blue-600 hover:bg-blue-500 gap-2"
                                    >
                                        {isCommitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        {isCommitting ? "Creating..." : "Create Setlist"}
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
