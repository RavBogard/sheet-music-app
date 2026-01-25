"use client"

import { useState } from "react"
import { X, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface DriveFile {
    id: string
    name: string
    mimeType: string
}

interface ImportModalProps {
    driveFiles: DriveFile[]
    onClose: () => void
    onImport: (tracks: any[]) => void
}

export function ImportModal({ driveFiles, onClose, onImport }: ImportModalProps) {
    const [importing, setImporting] = useState(false)
    const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Filter to show only docs and spreadsheets
    const importableFiles = driveFiles.filter(f =>
        f.mimeType === "application/vnd.google-apps.document" ||
        f.mimeType === "application/vnd.google-apps.spreadsheet" ||
        f.mimeType.includes("spreadsheet") ||
        f.name.endsWith(".xlsx") ||
        f.name.endsWith(".xls") ||
        f.name.endsWith(".doc") ||
        f.name.endsWith(".docx")
    )

    const handleImport = async (file: DriveFile) => {
        setSelectedFile(file)
        setImporting(true)
        setError(null)

        try {
            const res = await fetch("/api/setlist/parse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId: file.id, mimeType: file.mimeType })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || "Failed to parse document")
            }

            onImport(data.tracks)
            onClose()
        } catch (e: any) {
            setError(e.message)
            setImporting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Import Setlist from Drive</h3>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-300 p-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                {importing ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
                        <div className="text-lg">AI is parsing "{selectedFile?.name}"...</div>
                        <div className="text-sm text-zinc-500">This may take a few seconds</div>
                    </div>
                ) : (
                    <>
                        <p className="text-zinc-400 mb-4">
                            Select a Google Doc or Excel file to import. AI will extract the song list automatically.
                        </p>
                        <ScrollArea className="flex-1">
                            <div className="space-y-2">
                                {importableFiles.length === 0 && (
                                    <div className="text-center py-8 text-zinc-500">
                                        No importable documents found. Make sure you have shared Google Docs or Excel files with the app.
                                    </div>
                                )}
                                {importableFiles.map(file => (
                                    <button
                                        key={file.id}
                                        onClick={() => handleImport(file)}
                                        className="w-full text-left p-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                    >
                                        <FileText className="h-5 w-5 text-blue-400" />
                                        <span className="flex-1 truncate">{file.name}</span>
                                        <span className="text-xs text-zinc-500">
                                            {file.mimeType.includes("document") ? "Doc" : "Excel"}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </>
                )}
            </div>
        </div>
    )
}
