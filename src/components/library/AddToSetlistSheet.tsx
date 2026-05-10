"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ListPlus, Search, Music, Plus, Loader2 } from "lucide-react"
import type { Setlist, FirestoreDate } from "@/types/models"
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface AddToSetlistSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  setlists: Setlist[]
  loading: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelectSetlist: (id: string, setlist: Setlist) => void
  createNewSetlist: (name: string) => Promise<void>
  pendingCount: number
}

/** Format a Firestore date for display in the setlist row */
function formatDate(date: FirestoreDate | undefined): string {
  if (!date) return ''
  let d: Date | null = null
  if (date instanceof Date) d = date
  else if (typeof date === 'string') d = new Date(date)
  else if (typeof date === 'number') d = new Date(date)
  else if (typeof date === 'object' && date !== null) {
    const obj = date as { toDate?: () => Date; seconds?: number }
    if (typeof obj.toDate === 'function') d = obj.toDate()
    else if (typeof obj.seconds === 'number') d = new Date(obj.seconds * 1000)
  }
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AddToSetlistSheet({
  isOpen,
  onOpenChange,
  setlists,
  loading,
  searchQuery,
  onSearchChange,
  onSelectSetlist,
  createNewSetlist,
  pendingCount,
}: AddToSetlistSheetProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newSetName, setNewSetName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const title = pendingCount > 1
    ? `Add ${pendingCount} songs to Setlist`
    : 'Add to Setlist'

  const handleCreate = async () => {
    if (!newSetName.trim()) return
    setIsSubmitting(true)
    await createNewSetlist(newSetName.trim())
    setIsSubmitting(false)
    setIsCreating(false)
    setNewSetName("")
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[70vh] flex flex-col rounded-t-2xl"
        aria-describedby="add-to-setlist-description"
      >
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center gap-2 text-lg font-display">
            <ListPlus className="h-5 w-5 text-primary" />
            {title}
          </SheetTitle>
          <SheetDescription id="add-to-setlist-description" className="sr-only">
            Select a setlist to add the selected songs to
          </SheetDescription>
        </SheetHeader>

        {/* Search input and Create button */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search setlists..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 bg-muted/50 border-border/50 focus-visible:ring-primary/30"
              disabled={isCreating}
            />
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className="shrink-0"
            onClick={() => setIsCreating(!isCreating)}
            aria-label="Create new setlist"
          >
            <Plus className={`h-4 w-4 transition-transform ${isCreating ? 'rotate-45' : ''}`} />
          </Button>
        </div>

        {/* Create New Setlist Inline Form */}
        {isCreating && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-2 animate-in slide-in-from-top-2 fade-in">
            <Input
              autoFocus
              placeholder="New Setlist Name (e.g. Friday Night)"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setIsCreating(false)
              }}
              className="bg-background"
              disabled={isSubmitting}
            />
            <Button size="sm" onClick={handleCreate} disabled={!newSetName.trim() || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        )}

        {/* Setlist list */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            /* Loading skeletons */
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="h-10 w-10 rounded-md bg-muted/60" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-muted/60" />
                    <div className="h-3 w-20 rounded bg-muted/60" />
                  </div>
                </div>
              ))}
            </div>
          ) : setlists.length === 0 ? (
            /* Empty / no results state */
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Music className="h-10 w-10 mb-3 opacity-40" />
              {searchQuery ? (
                <p className="text-sm">No setlists match &ldquo;{searchQuery}&rdquo;</p>
              ) : (
                <p className="text-sm">No editable setlists found</p>
              )}
            </div>
          ) : (
            /* Setlist rows */
            <div className="space-y-1">
              {setlists.map((setlist) => (
                <button
                  key={setlist.id}
                  onClick={() => onSelectSetlist(setlist.id, setlist)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                    <ListPlus className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{setlist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(setlist.updatedAt || setlist.date)}
                      {setlist.trackCount > 0 && (
                        <span className="ml-2">{setlist.trackCount} songs</span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
