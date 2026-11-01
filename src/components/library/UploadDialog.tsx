"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileUp, X, Loader2, CheckCircle, Music } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { useQueryClient } from "@tanstack/react-query"
import { broadcastCacheInvalidation } from "@/lib/library-cache"
import { toast } from "sonner"
import { useOrg } from "@/lib/org/org-context"
import { coreSectionLabel } from "@/lib/songs/picker-scope"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { interpolateNodes } from "@/components/i18n/interpolate-nodes"

const ACCEPTED_TYPES = ".pdf,.xml,.musicxml,.mxl,.mscz,.mscx,.txt"
const MAX_SIZE_MB = 25

const KEY_OPTIONS = [
    '', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
    'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
    'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm',
    'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bbm', 'Bm',
]

import { type Setlist } from "@/lib/setlist-firebase"

interface UploadDialogProps {
    onUploadComplete?: (fileId: string, title: string) => void
    setlists?: Setlist[]
    onAddToSetlist?: (setId: string, files: { id: string, name: string, mimeType: string, metadata?: any }[]) => void
}

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DialogDescription } from '@radix-ui/react-dialog'

export function UploadDialog({ onUploadComplete, setlists = [], onAddToSetlist }: UploadDialogProps) {
    const { user } = useAuth()
    const org = useOrg()
    const t = useT()
    const fmt = useFormat()
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState("")
    const [key, setKey] = useState("")
    const [bpm, setBpm] = useState("")
    const [tags, setTags] = useState("")
    const [collection, setCollection] = useState("uploads")
    const [selectedSetlistId, setSelectedSetlistId] = useState("")
    const [uploading, setUploading] = useState(false)
    const [success, setSuccess] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dropZoneRef = useRef<HTMLDivElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Cancel in-flight upload and any pending close-timer on unmount.
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort()
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
        }
    }, [])

    const reset = useCallback(() => {
        setFile(null)
        setTitle("")
        setKey("")
        setBpm("")
        setTags("")
        setCollection("uploads")
        setSelectedSetlistId("")
        setUploading(false)
        setSuccess(false)
    }, [])

    const handleFileSelect = useCallback((selectedFile: File) => {
        if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
            toast.error(t("libraryUpload.fileTooLarge", { max: MAX_SIZE_MB }))
            return
        }

        const validExt = /\.(pdf|xml|musicxml|mxl|mscz|mscx|txt)$/i.test(selectedFile.name)
        if (!validExt) {
            toast.error(t("libraryUpload.unsupportedType"))
            return
        }

        setFile(selectedFile)
        // Auto-fill title from filename
        if (!title) {
            setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''))
        }
    }, [title, t])

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
        // Replace any stale controller from a previous attempt.
        abortControllerRef.current?.abort()
        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
            const formData = new FormData()
            formData.append('file', file)
            if (title.trim()) formData.append('title', title.trim())
            if (key) formData.append('key', key)
            if (bpm) formData.append('bpm', bpm)
            if (tags.trim()) formData.append('tags', tags.trim())
            if (collection) formData.append('collection', collection)

            const res = await apiFetch('/api/library/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            })

            if (controller.signal.aborted) return

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: t("libraryUpload.uploadFailed") }))
                throw new Error(data.error || t("libraryUpload.uploadFailedStatus", { status: res.status }))
            }

            const data = await res.json()
            if (controller.signal.aborted) return
            setSuccess(true)
            toast.success(data.message || t("libraryUpload.uploadedToast"))

            // v45-07: invalidate the react-query library cache locally so the new
            // file appears in search / setlist picker without cold reload,
            // then broadcast to any other open tabs via BroadcastChannel.
            queryClient.invalidateQueries({ queryKey: ['library'] })
            broadcastCacheInvalidation()

            // Auto-add to Setlist if selected
            if (selectedSetlistId && onAddToSetlist && data.fileId) {
                // Determine mock mimeType from file name extension
                let mimeType = file.type || "application/pdf"
                if (file.name.toLowerCase().endsWith('.xml') || file.name.toLowerCase().endsWith('.musicxml') || file.name.toLowerCase().endsWith('.mxl')) {
                    mimeType = "application/xml"
                } else if (file.name.toLowerCase().endsWith('.txt')) {
                    mimeType = "text/plain"
                }
                
                onAddToSetlist(selectedSetlistId, [{
                    id: data.fileId,
                    name: title || file.name,
                    mimeType,
                    metadata: { key }
                }])
            }

            // Notify parent
            onUploadComplete?.(data.fileId, data.title)

            // Close after a moment — track timer so unmount can clear it.
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
            closeTimerRef.current = setTimeout(() => {
                setOpen(false)
                reset()
            }, 1500)

        } catch (err) {
            if ((err as Error).name === 'AbortError') return
            toast.error(err instanceof Error ? err.message : t("libraryUpload.uploadFailed"))
            setUploading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    {t("libraryUpload.trigger")}
                </Button>
            </DialogTrigger>

            <DialogContent className="w-full sm:max-w-md bg-background border-border text-foreground">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Music className="h-5 w-5 text-brand" />
                        {t("libraryUpload.dialogTitle")}
                    </DialogTitle>
                    <VisuallyHidden>
                        <DialogDescription>{t("libraryUpload.dialogDescription")}</DialogDescription>
                    </VisuallyHidden>
                </DialogHeader>

                {success ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <CheckCircle className="h-12 w-12 text-green-400" />
                        <p className="text-sm text-zinc-300">{t("libraryUpload.uploadedSuccess")}</p>
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
                                className="border-2 border-dashed border-zinc-700 rounded-lg p-4 sm:p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
                            >
                                <FileUp className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
                                <p className="text-sm text-zinc-400 mb-1">
                                    {interpolateNodes(t("libraryUpload.dropPrompt"), { browse: <span className="text-brand">{t("libraryUpload.browse")}</span> })}
                                </p>
                                <p className="text-xs text-zinc-600">{t("libraryUpload.acceptedHint", { max: MAX_SIZE_MB })}</p>
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
                                    <p className="text-xs text-zinc-500">{t("libraryUpload.fileSizeKb", { size: (file.size / 1024).toFixed(0) })}</p>
                                </div>
                                <button onClick={() => setFile(null)} className="text-zinc-500 hover:text-white" aria-label={t("libraryUpload.removeFile")}>
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Metadata fields */}
                        {file && (
                            <>
                                {/* Title */}
                                <div>
                                    <label htmlFor="upload-title" className="text-xs text-muted-foreground mb-1 block">{t("libraryUpload.titleLabel")}</label>
                                    <Input
                                        id="upload-title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={t("libraryUpload.titlePlaceholder")}
                                    />
                                </div>

                                {/* Key + BPM row */}
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label htmlFor="upload-key" className="text-xs text-muted-foreground mb-1 block">{t("libraryUpload.keyLabel")}</label>
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
                                        <label htmlFor="upload-bpm" className="text-xs text-muted-foreground mb-1 block">{t("libraryUpload.bpmLabel")}</label>
                                        <Input
                                            id="upload-bpm"
                                            type="number"
                                            value={bpm}
                                            onChange={(e) => setBpm(e.target.value)}
                                            placeholder={t("libraryUpload.bpmPlaceholder")}
                                            min={30}
                                            max={300}
                                        />
                                    </div>
                                </div>

                                {/* Tags */}
                                <div>
                                    <label htmlFor="upload-tags" className="text-xs text-muted-foreground mb-1 block">{t("libraryUpload.tagsLabel")}</label>
                                    <Input
                                        id="upload-tags"
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                        placeholder={t("libraryUpload.tagsPlaceholder")}
                                    />
                                </div>

                                {/* Collection */}
                                <div>
                                    <label htmlFor="upload-collection" className="text-xs text-muted-foreground mb-1 block">{t("libraryUpload.sectionLabel")}</label>
                                    <select
                                        id="upload-collection"
                                        value={collection}
                                        onChange={(e) => setCollection(e.target.value)}
                                        className="w-full h-9 px-3 rounded-md bg-muted/30 border border-border text-foreground text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                    >
                                        <option value="crc">{coreSectionLabel(org)}</option>
                                        {/* i18n-ignore: songbook collection name (data) */}
                                        <option value="supplemental">Shireinu</option>
                                        {/* i18n-ignore: songbook collection name (data) */}
                                        <option value="nava">Nava Tehilah</option>
                                        <option value="uploads">{t("libraryUpload.sectionUploads")}</option>
                                    </select>
                                </div>

                                {/* Add to Setlist */}
                                {setlists.length > 0 && (
                                    <div>
                                        <label htmlFor="upload-setlist" className="text-xs text-brand font-medium mb-1 block">{t("libraryUpload.addToSetlist")}</label>
                                        <select
                                            id="upload-setlist"
                                            value={selectedSetlistId}
                                            onChange={(e) => setSelectedSetlistId(e.target.value)}
                                            className="w-full h-9 px-3 rounded-md bg-brand/10 border border-brand/30 text-foreground text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                        >
                                            <option value="">{t("libraryUpload.dontAddToSetlist")}</option>
                                            {setlists.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Upload button */}
                                <Button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="w-full bg-brand hover:bg-brand/80 text-white"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin me-2" />
                                            {t("libraryUpload.uploading")}
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 me-2" />
                                            {t("libraryUpload.submit")}
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
