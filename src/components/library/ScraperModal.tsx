"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Link as LinkIcon, CheckCircle, Music, Globe, Search, Send, Bot, User } from "lucide-react"
import { toast } from "sonner"
import { useOrg } from "@/lib/org/org-context"
import { coreSectionLabel } from "@/lib/songs/picker-scope"
import { apiFetch } from "@/lib/api-client"
import { useQueryClient } from "@tanstack/react-query"
import { broadcastCacheInvalidation } from "@/lib/library-cache"
import { useT } from "@/i18n/client"
import { useChartContentDir } from "@/components/i18n/ChartContent"

import { type Setlist } from "@/lib/setlist-firebase"

interface ScraperModalProps {
    onUploadComplete?: (fileId: string, title: string) => void
    setlists?: Setlist[]
    onAddToSetlist?: (setId: string, files: { id: string, name: string, mimeType: string, metadata?: any }[]) => void
}

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DialogDescription } from '@radix-ui/react-dialog'

export function ScraperModal({ onUploadComplete, setlists = [], onAddToSetlist }: ScraperModalProps) {
    const queryClient = useQueryClient()
    const org = useOrg()
    const t = useT()
    const chartDir = useChartContentDir()
    const [open, setOpen] = useState(false)
    const [url, setUrl] = useState("")
    const [rawText, setRawText] = useState("")
    
    type ChatMessage = {
        role: 'user' | 'model'
        content: string
        results?: { title: string, artist: string, url: string }[]
    }
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState("")
    
    const [mode, setMode] = useState<'search' | 'url' | 'text'>('search')
    const [scraping, setScraping] = useState(false)
    const [searching, setSearching] = useState(false)
    
    // Verified data
    const [title, setTitle] = useState("")
    const [artist, setArtist] = useState("")
    const [content, setContent] = useState("")
    const [collection, setCollection] = useState("uploads")
    const [selectedSetlistId, setSelectedSetlistId] = useState("")
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
        setRawText("")
        setChatInput("")
        setChatMessages([])
        setTitle("")
        setArtist("")
        setContent("")
        setCollection("uploads")
        setSelectedSetlistId("")
        setScraping(false)
        setSearching(false)
        setUploading(false)
        setStep('input')
    }, [])

    const handleChatSubmit = async () => {
        if (!chatInput.trim()) return
        
        const newUserMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
        const newHistory = [...chatMessages, newUserMsg]
        setChatMessages(newHistory)
        setChatInput("")
        setSearching(true)
        
        try {
            const res = await fetch('/api/charts/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: newHistory })
            })
            
            const data = await res.json()
            
            if (!res.ok) {
                throw new Error(data.error || t("libraryScraper.searchFailed"))
            }
            
            const newBotMsg: ChatMessage = {
                role: 'model',
                content: data.message || t("libraryScraper.searchResultsIntro"),
                results: data.results || []
            }
            
            setChatMessages([...newHistory, newBotMsg])
        } catch (err: any) {
            toast.error(err.message || t("libraryScraper.assistantError"))
        } finally {
            setSearching(false)
        }
    }

    const handleScrape = async (targetUrl?: string) => {
        const scrapeUrl = targetUrl || url
        if (mode === 'url' || targetUrl) {
            if (!scrapeUrl.trim()) return
            try {
                new URL(scrapeUrl)
            } catch {
                toast.error(t("libraryScraper.invalidUrl"))
                return
            }
        } else if (mode === 'text') {
            if (!rawText.trim()) return
        }

        setScraping(true)
        
        try {
            const res = await fetch('/api/charts/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify((mode === 'url' || targetUrl) ? { url: scrapeUrl.trim() } : { rawText: rawText.trim() })
            })
            
            const data = await res.json()
            
            if (!res.ok) {
                throw new Error(data.error || t("libraryScraper.scrapeFailed"))
            }
            
            setTitle(data.title || "")
            setArtist(data.artist || "")
            setContent(data.content || "")
            setStep('verify')
            
        } catch (err: any) {
            toast.error(err.message || t("libraryScraper.scrapeError"))
        } finally {
            setScraping(false)
        }
    }

    const handleSave = async () => {
        if (!content.trim() || !title.trim()) {
            toast.error(t("libraryScraper.titleAndContentRequired"))
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
                const data = await res.json().catch(() => ({ error: t("libraryScraper.uploadFailed") }))
                throw new Error(data.error || t("libraryScraper.uploadFailed"))
            }
            
            const data = await res.json()
            
            setStep('success')
            toast.success(t("libraryScraper.importedToast"))
            
            queryClient.invalidateQueries({ queryKey: ['library'] })
            broadcastCacheInvalidation()

            if (selectedSetlistId && onAddToSetlist && data.fileId) {
                onAddToSetlist(selectedSetlistId, [{
                    id: data.fileId,
                    name: title || fileName,
                    mimeType: "text/plain"
                }])
            }
            
            onUploadComplete?.(data.fileId, data.title)
            
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
            closeTimerRef.current = setTimeout(() => {
                setOpen(false)
                reset()
            }, 1500)
            
        } catch (err: any) {
            toast.error(err.message || t("libraryScraper.saveError"))
            setUploading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Globe className="h-4 w-4" />
                    {t("libraryScraper.addSong")}
                </Button>
            </DialogTrigger>

            <DialogContent className="w-full sm:max-w-2xl bg-background border-border text-foreground max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-brand" />
                        {t("libraryScraper.dialogTitle")}
                    </DialogTitle>
                    <VisuallyHidden>
                        <DialogDescription>{t("libraryScraper.dialogDescription")}</DialogDescription>
                    </VisuallyHidden>
                </DialogHeader>

                {step === 'success' ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <CheckCircle className="h-12 w-12 text-green-400" />
                        <p className="text-sm text-zinc-300">{t("libraryScraper.importedSuccess")}</p>
                    </div>
                ) : step === 'input' ? (
                    <div className="space-y-4 py-4">
                        <div className="flex bg-muted/50 p-1 rounded-lg mb-4">
                            <button
                                onClick={() => setMode('search')}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'search' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t("libraryScraper.modeSearch")}
                            </button>
                            <button
                                onClick={() => setMode('url')}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'url' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t("libraryScraper.modeUrl")}
                            </button>
                            <button
                                onClick={() => setMode('text')}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'text' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t("libraryScraper.modeText")}
                            </button>
                        </div>

                        {mode === 'search' ? (
                            <div className="space-y-4 flex flex-col h-[400px]">
                                {/* Chat History Area */}
                                <div className="flex-1 overflow-y-auto bg-muted/20 rounded-lg p-4 space-y-4 border border-border">
                                    {chatMessages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-2">
                                            <Bot className="h-8 w-8" />
                                            <p className="text-xs text-center max-w-[200px]">{t("libraryScraper.chatEmpty")}</p>
                                        </div>
                                    ) : (
                                        chatMessages.map((msg, i) => (
                                            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                                                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                                </div>
                                                <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                    <div className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-brand text-white rounded-se-sm' : 'bg-zinc-800/80 text-zinc-100 rounded-ss-sm'}`}>
                                                        {msg.content}
                                                    </div>
                                                    
                                                    {msg.results && msg.results.length > 0 && (
                                                        <div className="flex flex-col gap-2 w-full mt-1">
                                                            {msg.results.map((res, idx) => (
                                                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 gap-3 w-full shadow-sm">
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-sm font-medium text-foreground truncate">{res.title}</p>
                                                                        <p className="text-xs text-muted-foreground truncate">{res.artist}</p>
                                                                    </div>
                                                                    <Button 
                                                                        size="sm" 
                                                                        className="shrink-0 bg-brand hover:bg-brand/80 h-7 text-xs px-3"
                                                                        onClick={() => {
                                                                            setUrl(res.url)
                                                                            handleScrape(res.url)
                                                                        }}
                                                                        disabled={scraping}
                                                                    >
                                                                        {scraping && url === res.url ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            t("libraryScraper.importResult")
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {searching && (
                                        <div className="flex gap-3">
                                            <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300">
                                                <Bot className="h-4 w-4" />
                                            </div>
                                            <div className="p-3 rounded-lg bg-zinc-800/80 text-zinc-100 rounded-ss-sm flex items-center gap-2">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span className="text-xs">{t("libraryScraper.thinking")}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Chat Input Area */}
                                <div className="flex gap-2 shrink-0">
                                    <div className="relative flex-1">
                                        <Input
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder={t("libraryScraper.chatPlaceholder")}
                                            aria-label={t("libraryScraper.chatLabel")}
                                            className="bg-muted/50 border-border pe-10"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleChatSubmit()
                                            }}
                                            disabled={searching}
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label={t("libraryScraper.sendMessage")}
                                            className="absolute end-1 top-1/2 -translate-y-1/2 h-7 w-7 text-brand hover:bg-brand/10 hover:text-brand"
                                            onClick={handleChatSubmit}
                                            disabled={searching || !chatInput.trim()}
                                        >
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : mode === 'url' ? (
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">{t("libraryScraper.urlLabel")}</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <LinkIcon className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                            // i18n-ignore: example URL, not prose
                                            placeholder="https://tabs.ultimate-guitar.com/..."
                                            aria-label={t("libraryScraper.urlAria")}
                                            className="ps-9"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleScrape()
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">{t("libraryScraper.pasteLabel")}</label>
                                <Textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder={t("libraryScraper.pastePlaceholder")}
                                    className="h-32 text-xs font-mono bg-muted/20"
                                />
                            </div>
                        )}
                        
                        {mode !== 'search' && (
                            <Button
                                onClick={() => handleScrape()}
                                disabled={scraping || (mode === 'url' ? !url.trim() : !rawText.trim())}
                                className="w-full bg-brand hover:bg-brand/80 text-white"
                            >
                                {scraping ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin me-2" />
                                        {t("libraryScraper.extracting")}
                                    </>
                                ) : (
                                    t("libraryScraper.fetchChart")
                                )}
                            </Button>
                        )}
                        {mode !== 'search' && (
                            <p className="text-xs text-muted-foreground text-center">
                                {t("libraryScraper.fetchHint")}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">{t("libraryScraper.titleLabel")}</label>
                                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">{t("libraryScraper.artistLabel")}</label>
                                <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs text-muted-foreground block">{t("libraryScraper.contentLabel")}</label>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("libraryScraper.monospacedFont")}</span>
                            </div>
                            <Textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                data-chart-preview
                                {...chartDir}
                                className="font-mono text-sm min-h-[350px] resize-y bg-muted/20"
                                spellCheck={false}
                            />
                        </div>

                        {/* Collection */}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label htmlFor="scraper-collection" className="text-xs text-muted-foreground mb-1 block">{t("libraryScraper.sectionLabel")}</label>
                                <select
                                    id="scraper-collection"
                                    value={collection}
                                    onChange={(e) => setCollection(e.target.value)}
                                    className="w-full h-9 px-3 rounded-md bg-muted/30 border border-border text-foreground text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                >
                                    <option value="crc">{coreSectionLabel(org)}</option>
                                    {/* i18n-ignore: songbook collection name (data) */}
                                    <option value="supplemental">Shireinu</option>
                                    {/* i18n-ignore: songbook collection name (data) */}
                                    <option value="nava">Nava Tehilah</option>
                                    <option value="uploads">{t("libraryScraper.sectionUploads")}</option>
                                </select>
                            </div>

                            {/* Add to Setlist */}
                            {setlists.length > 0 && (
                                <div className="flex-1">
                                    <label htmlFor="scraper-setlist" className="text-xs text-brand font-medium mb-1 block">{t("libraryScraper.addToSetlist")}</label>
                                    <select
                                        id="scraper-setlist"
                                        value={selectedSetlistId}
                                        onChange={(e) => setSelectedSetlistId(e.target.value)}
                                        className="w-full h-9 px-3 rounded-md bg-brand/10 border border-brand/30 text-foreground text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                    >
                                        <option value="">{t("libraryScraper.dontAddToSetlist")}</option>
                                        {setlists.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setStep('input')} disabled={uploading}>
                                {t("libraryScraper.back")}
                            </Button>
                            <Button 
                                onClick={handleSave} 
                                disabled={uploading}
                                className="bg-brand hover:bg-brand/80 text-white"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin me-2" />
                                        {t("libraryScraper.generating")}
                                    </>
                                ) : (
                                    t("libraryScraper.saveChart")
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
