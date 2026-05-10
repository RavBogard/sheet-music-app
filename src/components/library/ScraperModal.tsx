"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Link as LinkIcon, CheckCircle, Music, Globe } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import { useQueryClient } from "@tanstack/react-query"
import { broadcastCacheInvalidation } from "@/lib/library-cache"

interface ScraperModalProps {
    onUploadComplete?: (fileId: string, title: string) => void
}

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DialogDescription } from '@radix-ui/react-dialog'

export function ScraperModal({ onUploadComplete }: ScraperModalProps) {
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)
    const [url, setUrl] = useState("")
    const [scraping, setScraping] = useState(false)
    
    // Verified data
    const [title, setTitle] = useState("")
    const [artist, setArtist] = useState("")
    const [content, setContent] = useState("")
    const [collection, setCollection] = useState("uploads")
    const [step, setStep] = useState<'input' | 'verify' | 'success'>('input')
    const [uploading, setUploading] = useState(false)
    
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
        }
    }, [])

    const reset = useCallback(() => {
        setUrl("")
        setTitle("")
        setArtist("")
        setContent("")
        setCollection("uploads")
        setScraping(false)
        setUploading(false)
        setStep('input')
    }, [])

    const handleScrape = async () => {
        if (!url.trim()) return
        
        try {
            // Very basic URL validation
            new URL(url)
        } catch {
            toast.error("Please enter a valid URL")
            return
        }

        setScraping(true)
        
        try {
            const res = await fetch('/api/charts/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() })
            })
            
            const data = await res.json()
            
            if (!res.ok) {
                throw new Error(data.error || 'Failed to scrape URL')
            }
            
            setTitle(data.title || "")
            setArtist(data.artist || "")
            setContent(data.content || "")
            setStep('verify')
            
        } catch (err: any) {
            toast.error(err.message || 'Error scraping chart')
        } finally {
            setScraping(false)
        }
    }

    const handleSave = async () => {
        if (!content.trim() || !title.trim()) {
            toast.error("Title and content are required")
            return
        }
        
        setUploading(true)
        try {
            // Generate Text Blob
            const textContent = `${title}\n${artist}\n\n${content}`
            const textBlob = new Blob([textContent], { type: 'text/plain' })
            
            // Create a File object from the Blob
            const fileName = `${title} - ${artist}`.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.txt'
            const file = new File([textBlob], fileName, { type: 'text/plain' })
            
            const formData = new FormData()
            formData.append('file', file)
            formData.append('title', title)
            if (collection) formData.append('collection', collection)
            
            const res = await apiFetch('/api/library/upload', {
                method: 'POST',
                body: formData,
            })
            
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'Upload failed' }))
                throw new Error(data.error || 'Upload failed')
            }
            
            const data = await res.json()
            
            setStep('success')
            toast.success('Chart imported and saved to Drive')
            
            queryClient.invalidateQueries({ queryKey: ['library'] })
            broadcastCacheInvalidation()
            
            onUploadComplete?.(data.fileId, data.title)
            
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
            closeTimerRef.current = setTimeout(() => {
                setOpen(false)
                reset()
            }, 1500)
            
        } catch (err: any) {
            toast.error(err.message || 'Error saving chart')
            setUploading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Globe className="h-4 w-4" />
                    Import from URL
                </Button>
            </DialogTrigger>

            <DialogContent className="w-full sm:max-w-2xl bg-background border-border text-foreground max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-brand" />
                        Import Chart from URL
                    </DialogTitle>
                    <VisuallyHidden>
                        <DialogDescription>Import chords and lyrics from a website URL and save them as a native text chart.</DialogDescription>
                    </VisuallyHidden>
                </DialogHeader>

                {step === 'success' ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <CheckCircle className="h-12 w-12 text-green-400" />
                        <p className="text-sm text-zinc-300">Imported successfully!</p>
                    </div>
                ) : step === 'input' ? (
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Chart URL (Ultimate Guitar, Chordie, etc.)</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="https://tabs.ultimate-guitar.com/..."
                                        className="pl-9"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleScrape()
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <Button
                            onClick={handleScrape}
                            disabled={scraping || !url.trim()}
                            className="w-full bg-brand hover:bg-brand/80 text-white"
                        >
                            {scraping ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Extracting Chart...
                                </>
                            ) : (
                                "Fetch Chart"
                            )}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                            The system will try to extract just the lyrics and chords and format them perfectly.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">Artist</label>
                                <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs text-muted-foreground block">Chart Content (Verify Alignment)</label>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monospaced Font</span>
                            </div>
                            <Textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="font-mono text-sm min-h-[350px] resize-y bg-muted/20"
                                spellCheck={false}
                            />
                        </div>

                        {/* Collection */}
                        <div>
                            <label htmlFor="scraper-collection" className="text-xs text-muted-foreground mb-1 block">Library Section</label>
                            <select
                                id="scraper-collection"
                                value={collection}
                                onChange={(e) => setCollection(e.target.value)}
                                className="w-full h-9 px-3 rounded-md bg-muted/30 border border-border text-foreground text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                            >
                                <option value="crc">CRC Charts</option>
                                <option value="supplemental">Shireinu</option>
                                <option value="uploads">Uploads</option>
                            </select>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setStep('input')} disabled={uploading}>
                                Back
                            </Button>
                            <Button 
                                onClick={handleSave} 
                                disabled={uploading}
                                className="bg-brand hover:bg-brand/80 text-white"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Generating Chart...
                                    </>
                                ) : (
                                    "Save Chart to Library"
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
