"use client"

import { useEffect, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"

interface ImageScoreViewerProps {
    url: string
    alt?: string
}

export function ImageScoreViewer({ url, alt }: ImageScoreViewerProps) {
    const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading")

    useEffect(() => {
        setStatus("loading")
    }, [url])

    if (!url) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-muted-foreground">No chart to display</p>
            </div>
        )
    }

    return (
        <div className="relative flex h-full w-full items-center justify-center bg-background">
            {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}
            {status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <AlertCircle className="h-8 w-8" aria-hidden="true" />
                    <p>Image failed to load — try refreshing</p>
                </div>
            )}
            {/* Native <img> renders the chart. Browsers handle pinch-zoom natively
                on touch devices; mouse-wheel zoom is a polish item for v7.x. */}
            <img
                src={url}
                alt={alt ?? "Chart"}
                className={
                    "max-h-full max-w-full object-contain transition-opacity duration-200 motion-reduce:transition-none " +
                    (status === "loaded" ? "opacity-100" : "opacity-0")
                }
                onLoad={() => setStatus("loaded")}
                onError={() => setStatus("error")}
                draggable={false}
            />
        </div>
    )
}
