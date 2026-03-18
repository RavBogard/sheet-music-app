"use client"

import { useState, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileUp, X, Loader2, CheckCircle, Music } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"

const ACCEPTED_TYPES = ".pdf,.xml,.musicxml,.mxl,.mscz,.mscx"
const MAX_SIZE_MB = 25

const KEY_OPTIONS = [
    '', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
    'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
    'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm',
    'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bbm', 'Bm',
]

interface UploadDialogProps {
    onUploadComplete?: (fileId: string, title: string) => void
}

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DialogDescription } from '@radix-ui/react-dialog'

export function UploadDialog({ onUploadComplete }: UploadDialogProps) {
    const { user } = useAuth()
    const [open, setOpen] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState("")
    const [key, setKey] = useState("")
    const [bpm, setBpm] = useState("")
    const [tags, setTags] = useState("")
    const [uploading, setUploading] = useState(false)
    const [success, setSuccess] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dropZoneRef = useRef<HTMLDivElement>(null)

    const reset = useCallback(() => {
        setFile(null)
        setTitle("")
        setKey("")
        setBpm("")
        setTags("")
        setUploading(false)
        setSuccess(false)
    }, [])

    const handleFileSelect = useCallback((selectedFile: File) => {
        if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
            toast.error(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`)
            return
        }

        const validExt = /\.(pdf|xml|musicxml|mxl|mscz|mscx)$/i.test(selectedFile.name)
        if (!validExt) {
            toast.error("Only PDF, MusicXML, and MuseScore files are supported.")
            return
        }

        setFile(selectedFile)
        // Auto-fill title from filename
        if (!title) {
            setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''))
        }
    }, [title])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dropZoneRef.current?.classList.remove('border-brand')
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile) handleFileSelect(droppedFile)
    }, [handleFileSelect])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        dropZoneRef.current?.classList.add('border-brand')
    }, [])

    const handleDragLeave = useCallback(() => {
        dropZoneRef.current?.classList.remove('border-brand')
    }, [])

    const handleUpload = async () => {
        if (!file || !user) return

        setUploading(true)

        try {
            const formData = new FormData()
            formData.append('file', file)
            if (title.trim()) formData.append('title', title.trim())
            if (key) formData.append('key', key)
            if (bpm) formData.append('bpm', bpm)
            if (tags.trim()) formData.append('tags', tags.trim())

            const res = await apiFetch('/api/library/upload', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'Upload failed' }))
                throw new Error(data.error || `Upload failed (${res.status})`)
            }

            const data = await res.json()
            setSuccess(true)
            toast.success(data.message || 'File uploaded successfully')

            // Notify parent
            onUploadComplete?.(data.fileId, data.title)

            // Close after a moment
            setTimeout(() => {
                setOpen(false)
                reset()
            }, 1500)

        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed')
            setUploading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload
                </Button>
            </DialogTrigger>

            <DialogContent className="w-full sm:max-w-md bg-background border-border text-foreground">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Music className="h-5 w-5 text-brand" />
                        Upload to Library
                    </DialogTitle>
                    <VisuallyHidden>
                        <DialogDescription>Upload a new PDF, MusicXML, or MuseScore file to the song library.</DialogDescription>
                    </VisuallyHidden>
                </DialogHeader>

                {success ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <CheckCircle className="h-12 w-12 text-green-400" />
                        <p className="text-sm text-zinc-300">Uploaded successfully!</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Drop zone / File picker */}
                        {!file ? (
                            <div
                                ref={dropZoneRef}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-zinc-700 rounded-xl p-4 sm:p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
                            >
                                <FileUp className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
                                <p className="text-sm text-zinc-400 mb-1">
                                    Drop a file here or <span className="text-brand">browse</span>
                                </p>
                                <p className="text-xs text-zinc-600">PDF, MusicXML, or MuseScore, up to {MAX_SIZE_MB}MB</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPTED_TYPES}
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) handleFileSelect(f)
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                                <div className="h-10 w-10 bg-brand/10 rounded-lg flex items-center justify-center shrink-0">
                                    <FileUp className="h-5 w-5 text-brand" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                    <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB</p>
                                </div>
                                <button onClick={() => setFile(null)} className="text-zinc-500 hover:text-white" aria-label="Remove file">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Metadata fields */}
                        {file && (
                            <>
                                {/* Title */}
                                <div>
                                    <label htmlFor="upload-title" className="text-xs text-muted-foreground mb-1 block">Title</label>
                                    <Input
                                        id="upload-title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Song title"
                                    />
                                </div>

                                {/* Key + BPM row */}
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label htmlFor="upload-key" className="text-xs text-muted-foreground mb-1 block">Key</label>
                                        <select
                                            id="upload-key"
                                            value={key}
                                            onChange={(e) => setKey(e.target.value)}
                                            className="w-full h-9 px-3 rounded-md bg-muted/30 border border-border text-foreground text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                        >
                                            <option value="">—</option>
                                            {KEY_OPTIONS.filter(k => k).map(k => (
                                                <option key={k} value={k}>{k}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label htmlFor="upload-bpm" className="text-xs text-muted-foreground mb-1 block">BPM</label>
                                        <Input
                                            id="upload-bpm"
                                            type="number"
                                            value={bpm}
                                            onChange={(e) => setBpm(e.target.value)}
                                            placeholder="120"
                                            min={30}
                                            max={300}
                                        />
                                    </div>
                                </div>

                                {/* Tags */}
                                <div>
                                    <label htmlFor="upload-tags" className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                                    <Input
                                        id="upload-tags"
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                        placeholder="shabbat, morning, healing"
                                    />
                                </div>

                                {/* Upload button */}
                                <Button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="w-full bg-brand hover:bg-brand/80 text-white"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Upload to Library
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
