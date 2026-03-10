"use client"

import { useState, useRef } from "react"
import { HeartPulse, Archive, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { DriveFile } from "@/types/models"
import { scanLibraryHealth, ScanResult, ScanProgress } from "@/lib/pdf-health-scanner"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface PDFHealthScannerProps {
  files: DriveFile[]
  onArchiveComplete: () => void
}

export function PDFHealthScanner({ files, onArchiveComplete }: PDFHealthScannerProps) {
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [scanned, setScanned] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archiving, setArchiving] = useState(false)
  const abortRef = useRef(false)

  const flaggedResults = results.filter(r => r.status !== 'healthy')
  const healthyCount = results.filter(r => r.status === 'healthy').length

  const handleScan = async () => {
    setScanning(true)
    setResults([])
    setSelected(new Set())
    abortRef.current = false

    const scanResults = await scanLibraryHealth(files, (p) => {
      if (!abortRef.current) setProgress(p)
    })

    setResults(scanResults)
    setScanning(false)
    setScanned(true)

    // Pre-select all flagged files
    const flagged = new Set<string>()
    for (const r of scanResults) {
      if (r.status !== 'healthy') flagged.add(r.fileId)
    }
    setSelected(flagged)
  }

  const handleArchive = async () => {
    if (selected.size === 0) return
    setArchiving(true)

    let archived = 0
    let failed = 0

    for (const fileId of selected) {
      try {
        const res = await apiFetch("/api/library/archive", {
          method: "PATCH",
          body: JSON.stringify({ fileId, archive: true }),
        })
        if (res.ok) archived++
        else failed++
      } catch {
        failed++
      }
    }

    setArchiving(false)

    if (archived > 0) {
      toast.success(`Archived ${archived} unhealthy file${archived !== 1 ? "s" : ""}`)
      onArchiveComplete()
      setOpen(false)
      resetState()
    }
    if (failed > 0) {
      toast.error(`Failed to archive ${failed} file${failed !== 1 ? "s" : ""}`)
    }
  }

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const resetState = () => {
    setScanned(false)
    setScanning(false)
    setResults([])
    setSelected(new Set())
    setProgress(null)
    abortRef.current = true
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) resetState()
  }

  const pdfCount = files.filter(f =>
    f.mimeType?.includes('pdf') || f.name?.toLowerCase().endsWith('.pdf')
  ).length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" title="Scan PDF health">
          <HeartPulse className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>PDF Health Scanner</DialogTitle>
          <DialogDescription>
            Check library PDFs for corrupt or unloadable files.
          </DialogDescription>
        </DialogHeader>

        {scanning ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin text-brand" />
            {progress && (
              <>
                <div className="w-full max-w-xs">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {progress.current} / {progress.total}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                  {progress.fileName}
                </p>
              </>
            )}
          </div>
        ) : !scanned ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <HeartPulse className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Scan {pdfCount} PDF{pdfCount !== 1 ? 's' : ''} to detect corrupt or unloadable files.
            </p>
            <Button onClick={handleScan} className="min-h-11" disabled={pdfCount === 0}>
              Scan PDFs
            </Button>
          </div>
        ) : flaggedResults.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-sm text-foreground font-medium">All PDFs healthy</p>
            <p className="text-xs text-muted-foreground">
              {healthyCount} file{healthyCount !== 1 ? 's' : ''} scanned — no issues found.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              {flaggedResults.length} issue{flaggedResults.length !== 1 ? 's' : ''} found,{' '}
              {healthyCount} healthy
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {flaggedResults.map(result => (
                <label
                  key={result.fileId}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer min-h-11",
                    "hover:bg-brand/5 transition-colors",
                    selected.has(result.fileId) && "bg-destructive/10"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(result.fileId)}
                    onChange={() => toggleSelected(result.fileId)}
                    className="h-4 w-4 rounded border-border accent-brand"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{result.fileName}</p>
                    <p className="text-xs text-destructive truncate">
                      {result.status === 'corrupt' ? 'Corrupt' : 'Fetch error'}
                      {result.error ? `: ${result.error}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {selected.size} selected for archival
              </span>
              <Button
                variant="destructive"
                disabled={selected.size === 0 || archiving}
                onClick={handleArchive}
                className="min-h-11 gap-2"
              >
                {archiving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Archive Selected
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
