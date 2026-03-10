"use client"

import { useState } from "react"
import { ScanSearch, Archive, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DriveFile } from "@/types/models"
import { findDuplicateGroups, DuplicateGroup } from "@/lib/duplicate-scanner"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface DuplicateScannerProps {
  files: DriveFile[]
  onArchiveComplete: () => void
}

export function DuplicateScanner({ files, onArchiveComplete }: DuplicateScannerProps) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [scanned, setScanned] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archiving, setArchiving] = useState(false)

  const handleScan = () => {
    const results = findDuplicateGroups(files)
    setGroups(results)
    setScanned(true)

    // Pre-select newer duplicates in each group (keep the first/alphabetically-first)
    const autoSelect = new Set<string>()
    for (const group of results) {
      // Keep first item, select rest
      for (let i = 1; i < group.items.length; i++) {
        autoSelect.add(group.items[i].id)
      }
    }
    setSelected(autoSelect)
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
      toast.success(`Archived ${archived} duplicate${archived !== 1 ? "s" : ""}`)
      onArchiveComplete()
      setOpen(false)
      setScanned(false)
      setGroups([])
      setSelected(new Set())
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

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setScanned(false)
      setGroups([])
      setSelected(new Set())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" title="Scan for duplicates">
          <ScanSearch className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Duplicate Scanner</DialogTitle>
          <DialogDescription>
            Find charts with similar names that may be duplicates.
          </DialogDescription>
        </DialogHeader>

        {!scanned ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <ScanSearch className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Scan {files.length} charts for potential duplicates using name similarity.
            </p>
            <Button onClick={handleScan} className="min-h-11">
              Scan Library
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">No duplicates found.</p>
            <p className="text-xs text-muted-foreground">Your library looks clean!</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {groups.map((group, gi) => (
                <div key={gi} className="border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Group {gi + 1} — {Math.round(group.similarity * 100)}% similar
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.items.length} charts
                    </span>
                  </div>
                  {group.items.map((item, ii) => (
                    <label
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer min-h-11",
                        "hover:bg-brand/5 transition-colors",
                        selected.has(item.id) && "bg-destructive/10"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        className="h-4 w-4 rounded border-border accent-brand"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm truncate",
                          ii === 0 && !selected.has(item.id) && "font-medium"
                        )}>
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.mimeType?.split("/").pop()?.toUpperCase()}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
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
