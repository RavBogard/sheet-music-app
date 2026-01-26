"use client"

import { useState } from "react"
import { X, Printer, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/lib/setlist-firebase"

interface PrintModalProps {
    setlistName: string
    tracks: SetlistTrack[]
    driveFiles: { id: string; name: string; mimeType: string }[]
    onClose: () => void
}

export function PrintModal({ setlistName, tracks, driveFiles, onClose }: PrintModalProps) {
    const [title, setTitle] = useState(setlistName)
    const [date, setDate] = useState(new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }))
    const [musicianName, setMusicianName] = useState("")
    const [eventName, setEventName] = useState("")
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Get linked PDF files for tracks
    const linkedPdfTracks = tracks.filter(t => {
        if (!t.fileId) return false
        const file = driveFiles.find(f => f.id === t.fileId)
        return file && (file.mimeType.includes('pdf') || file.name.endsWith('.pdf'))
    })

    const handleGenerate = async (mode: 'download' | 'print') => {
        setGenerating(true)
        setError(null)

        try {
            const response = await fetch('/api/setlist/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    date,
                    musicianName: musicianName || undefined,
                    eventName: eventName || undefined,
                    tracks: tracks.map(t => ({
                        title: t.title,
                        key: t.key || '',
                        notes: t.notes || '',
                        fileId: t.fileId
                    }))
                })
            })

            if (!response.ok) {
                const errData = await response.json()
                throw new Error(errData.error || 'Failed to generate PDF')
            }

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)

            if (mode === 'download') {
                // Download the PDF
                const a = document.createElement('a')
                a.href = url
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                onClose()
            } else {
                // Open print dialog
                const printWindow = window.open(url)
                if (printWindow) {
                    printWindow.onload = () => {
                        printWindow.print()
                    }
                }
            }
        } catch (e: any) {
            console.error('Print generation failed:', e)
            setError(e.message || 'Failed to generate PDF')
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-xl w-full max-w-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <h2 className="text-xl font-bold">Print Setlist</h2>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-sm text-zinc-400 mb-1 block">Title</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Setlist title for cover page"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400 mb-1 block">Date</label>
                        <Input
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            placeholder="e.g., Saturday, January 25, 2026"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400 mb-1 block">Musician Name (optional)</label>
                        <Input
                            value={musicianName}
                            onChange={(e) => setMusicianName(e.target.value)}
                            placeholder="e.g., John Smith - Piano"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400 mb-1 block">Event/Service (optional)</label>
                        <Input
                            value={eventName}
                            onChange={(e) => setEventName(e.target.value)}
                            placeholder="e.g., Shabbat Morning Service"
                        />
                    </div>

                    {/* Stats */}
                    <div className="bg-zinc-800 rounded-lg p-4 text-sm">
                        <div className="flex justify-between mb-2">
                            <span className="text-zinc-400">Total songs</span>
                            <span className="font-medium">{tracks.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-400">PDFs to include</span>
                            <span className="font-medium text-green-400">{linkedPdfTracks.length}</span>
                        </div>
                        {linkedPdfTracks.length < tracks.length && (
                            <p className="text-xs text-yellow-400 mt-2">
                                Note: {tracks.length - linkedPdfTracks.length} song(s) don't have linked PDF files and won't be included in the packet.
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 border-t border-zinc-800">
                    <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => handleGenerate('download')}
                        disabled={generating || linkedPdfTracks.length === 0}
                    >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download PDF
                    </Button>
                    <Button
                        className="flex-1 gap-2"
                        onClick={() => handleGenerate('print')}
                        disabled={generating || linkedPdfTracks.length === 0}
                    >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Print Now
                    </Button>
                </div>
            </div>
        </div>
    )
}
