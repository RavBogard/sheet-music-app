"use client"

import { useState, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileUp, X, Loader2, CheckCircle, Music } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"

const ACCEPTED_TYPES = ".pdf,.xml,.musicxml,.mxl"
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

        const validExt = /\.(pdf|xml|musicxml|mxl)$/i.test(selectedFile.name)
        if (!validExt) {
            toast.error("Only PDF and MusicXML files are supported.")
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
        dropZoneRef.current?.classList.remove('border-purple-500')
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile) handleFileSelect(droppedFile)
    }, [handleFileSelect])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        dropZoneRef.current?.classList.add('border-purple-500')
    }, [])

    const handleDragLeave = useCallback(() => {
        dropZoneRef.current?.classList.remove('border-purple-500')
    }, [])

    const handleUpload = async () => {
        if (!file || !user) return

        setUploading(true)

        try {
            const token = await user.getIdToken()
            if (!token) throw new Error("Not authenticated")

            const formData = new FormData()
            formData.append('file', file)
            if (title.trim()) formData.append('title', title.trim())
            if (key) formData.append('key', key)
            if (bpm) formData.append('bpm', bpm)
            if (tags.trim()) formData.append('tags', tags.trim())

            const res = await fetch('/api/library/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
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

            <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Music className="h-5 w-5 text-purple-400" />
                        Upload to Library
                    </DialogTitle>
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
                                className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
                            >
                                <FileUp className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
                                <p className="text-sm text-zinc-400 mb-1">
                                    Drop a file here or <span className="text-purple-400">browse</span>
                                </p>
                                <p className="text-xs text-zinc-600">PDF or MusicXML, up to {MAX_SIZE_MB}MB</p>
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
                                <div className="h-10 w-10 bg-purple-600/20 rounded-lg flex items-center justify-center shrink-0">
                                    <FileUp className="h-5 w-5 text-purple-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                    <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB</p>
                                </div>
                                <button onClick={() => setFile(null)} className="text-zinc-500 hover:text-white">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Metadata fields */}
                        {file && (
                            <>
                                {/* Title */}
                                <div>
                                    <label className="text-xs text-zinc-500 mb-1 block">Title</label>
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Song title"
                                        className="bg-zinc-900 border-zinc-700 text-white"
                                    />
                                </div>

                                {/* Key + BPM row */}
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label className="text-xs text-zinc-500 mb-1 block">Key</label>
                                        <select
                                            value={key}
                                            onChange={(e) => setKey(e.target.value)}
                                            className="w-full h-9 px-3 rounded-md bg-zinc-900 border border-zinc-700 text-white text-sm"
                                        >
                                            <option value="">—</option>
                                            {KEY_OPTIONS.filter(k => k).map(k => (
                                                <option key={k} value={k}>{k}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-zinc-500 mb-1 block">BPM</label>
                                        <Input
                                            type="number"
                                            value={bpm}
                                            onChange={(e) => setBpm(e.target.value)}
                                            placeholder="120"
                                            min={30}
                                            max={300}
                                            className="bg-zinc-900 border-zinc-700 text-white"
                                        />
                                    </div>
                                </div>

                                {/* Tags */}
                                <div>
                                    <label className="text-xs text-zinc-500 mb-1 block">Tags (comma-separated)</label>
                                    <Input
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                        placeholder="shabbat, morning, healing"
                                        className="bg-zinc-900 border-zinc-700 text-white"
                                    />
                                </div>

                                {/* Upload button */}
                                <Button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="w-full bg-purple-600 hover:bg-purple-500 text-white"
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
