"use client"
import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Link, FileText, AlertTriangle, CheckCircle2, ChevronRight, Music, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"

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

type Step = 'input' | 'processing' | 'review'

export function ImporterModal({ open, onOpenChange, onComplete }: ImporterModalProps) {
    const [step, setStep] = useState<Step>('input')
    const [url, setUrl] = useState("")
    const [csvFile, setCsvFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [items, setItems] = useState<ParsedItem[]>([])
    const [isExecuting, setIsExecuting] = useState(false)

    // Reset state on open
    useEffect(() => {
        if (open) {
            setStep('input')
            setUrl("")
            setCsvFile(null)
            setItems([])
            setIsExecuting(false)
        }
    }, [open])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setCsvFile(e.target.files[0])
            setUrl("") // Clear URL if file selected
        }
    }

    const handleParse = async () => {
        if (!url && !csvFile) {
            toast.error("Please provide a Google Sheets URL or upload a CSV file.")
            return
        }

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
                const data = await res.json()
                throw new Error(data.error || "Failed to parse data.")
            }

            const data = await res.json()
            setItems(data.items || [])
            setStep('review')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error parsing spreadsheet.")
            setStep('input')
        }
    }

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
                const data = await res.json()
                throw new Error(data.error || "Execution failed.")
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
                    <DialogTitle className="text-xl">Import Setlist AI</DialogTitle>
                    <DialogDescription>
                        {step === 'input' && "Provide a spreadsheet to instantly build your setlist and download charts."}
                        {step === 'processing' && "Our AI is reading your spreadsheet headers automatically..."}
                        {step === 'review' && "Review what the AI found. We've flagged potential duplicate charts and private Drive links."}
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
                                    onChange={(e) => { setUrl(e.target.value); setCsvFile(null) }}
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

                            <div className="pt-4 flex justify-end">
                                <Button
                                    onClick={handleParse}
                                    disabled={!url && !csvFile}
                                    className="gap-2 shrink-0 bg-blue-600 hover:bg-blue-500"
                                >
                                    Next: Analyze Spreadsheet <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-6" />
                            <h3 className="text-lg font-bold mb-2">Analyzing Rows</h3>
                            <p className="text-sm text-muted-foreground text-center max-w-sm">
                                Passing data to OpenAI to map dynamic columns, extract performer names, and verify Google Drive linkage permissions...
                            </p>
                        </div>
                    )}

                    {step === 'review' && (
                        <>
                            <ScrollArea className="flex-1 bg-muted/10">
                                <div className="p-0">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-muted/50 sticky top-0 z-10 text-xs uppercase text-muted-foreground shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">Type</th>
                                                <th className="px-4 py-3 font-semibold w-1/3">Title</th>
                                                <th className="px-4 py-3 font-semibold">Key/Lead</th>
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
                                                                        placeholder="Lead"
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
                            </ScrollArea>

                            {/* Review Action Footer */}
                            <div className="p-4 border-t border-border bg-background flex items-center justify-between shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
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
                </div>
            </DialogContent>
        </Dialog>
    )
}
