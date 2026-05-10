"use client"

import { useState, useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { transposeChord, keyUsesFlats } from "@/lib/music-math"
import { Loader2 } from "lucide-react"

interface TextScoreViewerProps {
    url: string
}

export function TextScoreViewer({ url }: TextScoreViewerProps) {
    const { transposition } = useMusicStore()
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        async function loadText() {
            setLoading(true)
            setError(null)
            try {
                const res = await fetch(url)
                if (!res.ok) throw new Error("Failed to load text file")
                const text = await res.text()
                if (!cancelled) {
                    setContent(text)
                    setLoading(false)
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || "Failed to load chart")
                    setLoading(false)
                }
            }
        }
        loadText()
        return () => { cancelled = true }
    }, [url])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error || !content) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-muted-foreground">{error || "Failed to load chart"}</p>
            </div>
        )
    }

    // Split content into lines and optionally Title/Artist header
    const lines = content.split(/\r?\n/)
    
    // Simple heuristic for chord lines
    const isChordToken = (token: string) => {
        const chordRegex = /^([A-G][b#]?)(m|maj|dim|aug|sus|add|\d)*(?:\/[A-G][b#]?)?$/i
        if (/^[|()\[\]\-,]+$/.test(token)) return true
        if (/^x\d$/i.test(token)) return true
        if (token.toUpperCase() === "N.C.") return true
        return chordRegex.test(token)
    }

    const isChordLine = (line: string): boolean => {
        const tokens = line.trim().split(/\s+/)
        if (tokens.length === 0 || tokens[0] === "") return false
        
        const validChords = tokens.filter(t => isChordToken(t)).length
        return (validChords / tokens.length) >= 0.75
    }

    // Attempt to guess if we should prefer flats based on the first chord we transpose
    // A better approach would be to estimateKey on the whole document, but this is simple and fast
    const preferFlats = transposition !== 0 ? undefined : undefined // default music-math behavior

    const processedLines = lines.map((line, idx) => {
        if (transposition === 0 || !isChordLine(line)) {
            return { 
                id: idx,
                textLength: line.trimEnd().length, 
                content: <div key={idx} className="whitespace-pre">{line || ' '}</div> 
            }
        }

        const regex = /([a-zA-Z0-9#b/]+)(\s*)/g
        const htmlLine = line.replace(regex, (match, word, spaces) => {
            if (isChordToken(word)) {
                const transposed = transposeChord(word, transposition, preferFlats)
                const lengthDiff = transposed.length - word.length
                
                let newSpaces = spaces
                if (lengthDiff > 0) {
                    newSpaces = spaces.slice(0, Math.max(0, spaces.length - lengthDiff))
                } else if (lengthDiff < 0) {
                    newSpaces = spaces + ' '.repeat(-lengthDiff)
                }
                
                return `<span class="text-brand font-bold">${transposed}</span>${newSpaces}`
            }
            return match
        })
        
        const plainText = htmlLine.replace(/<[^>]+>/g, '')
        
        return { 
            id: idx,
            textLength: plainText.trimEnd().length, 
            content: <div key={idx} className="whitespace-pre" dangerouslySetInnerHTML={{ __html: htmlLine || ' ' }} />
        }
    })

    // Calculate max length to scale font-size so it fits in the container without scrolling
    const maxLineLength = Math.max(...processedLines.map(l => l.textLength), 40)
    // 0.605 is roughly the aspect ratio (width/height) of a typical monospace character
    const fontSizeCalc = `min(15px, calc(100cqi / ${(maxLineLength + 2) * 0.605}))`

    return (
        <div className="min-h-full bg-background text-foreground overflow-auto">
            {/* Chart Container */}
            <div className="max-w-4xl mx-auto bg-card sm:my-8 sm:rounded-xl shadow-sm sm:border border-border min-h-[850px] p-4 sm:p-12">
                <div className="@container w-full">
                    <div 
                        className="font-mono leading-relaxed overflow-x-hidden"
                        style={{ fontSize: fontSizeCalc }}
                    >
                        {processedLines.map((line) => line.content)}
                    </div>
                </div>
            </div>
            {/* Bottom padding for toolbar */}
            <div className="h-24"></div>
        </div>
    )
}
