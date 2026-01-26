"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useMusicStore, FileType } from "@/lib/store"
import { levenshtein } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  FileMusic, Music2, Loader2, ChevronLeft, ChevronRight,
  PlayCircle, Home as HomeIcon, ListMusic, Headphones
} from "lucide-react"
import { useSetlistStore } from "@/lib/setlist-store"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { SetlistEditor } from "@/components/setlist/SetlistEditor"
import { ImportModal } from "@/components/setlist/ImportModal"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"
import { AudioLibrary } from "@/components/audio/AudioLibrary"
import { Setlist, SetlistTrack } from "@/lib/setlist-firebase"
import * as XLSX from 'xlsx'

import buildInfo from "@/build-info.json"

// Components
const PDFViewer = dynamic(() => import("@/components/music/PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => import("@/components/music/SmartScoreViewer").then(mod => mod.SmartScoreViewer), { ssr: false })

const MASTER_FOLDER_ID = "1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK"

interface DriveFile {
  id: string
  name: string
  mimeType: string
}

type ViewMode = 'home' | 'song_charts' | 'audio' | 'library' | 'setlist' | 'setlist_dashboard' | 'setlist_editor' | 'performer'

export default function Home() {
  const { fileType, fileUrl, setFile, transposition, setTransposition, playbackQueue, queueIndex, nextSong, prevSong } = useMusicStore()
  const { addItem, clear: clearSetlist } = useSetlistStore()

  // State
  const [view, setView] = useState<ViewMode>('home')
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [errorMSG, setErrorMSG] = useState<string | null>(null)

  // Setlist State
  const [editingSetlist, setEditingSetlist] = useState<Setlist | null>(null)
  const [importedTracks, setImportedTracks] = useState<SetlistTrack[]>([])
  const [suggestedSetlistName, setSuggestedSetlistName] = useState("")
  const [showImportModal, setShowImportModal] = useState(false)

  // 1. Initial Load
  useEffect(() => {
    async function fetchFiles() {
      try {
        setLoadingFiles(true)
        setLoadingFiles(true)
        // No folderId param = Global Search (All Shared Files)
        const res = await fetch(`/api/drive/list`)
        if (!res.ok) throw new Error("Failed to sync library")

        const data = await res.json()
        setDriveFiles(data)
      } catch (err: any) {
        console.error(err)
        setErrorMSG(err.message || "Connection Error")
      } finally {
        setLoadingFiles(false)
      }
    }
    fetchFiles()
  }, [])

  // 2. Keyboard Navigation for Performer Mode
  useEffect(() => {
    if (view !== 'performer') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextSong()
      if (e.key === 'ArrowLeft') prevSong()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, nextSong, prevSong])

  // 3. Logic: Load File (and switch to Performer)
  const loadFile = async (file: DriveFile) => {
    const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
    const isExcel = file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx')

    // Excel -> Setlist Logic
    if (isExcel) {
      if (!confirm(`Import Setlist "${file.name}"? This will replace your current list.`)) return

      try {
        const res = await fetch(`/api/drive/file/${file.id}`)
        if (!res.ok) throw new Error("Download failed")
        const blob = await res.blob()
        const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])

        clearSetlist()
        data.forEach((row: any) => {
          const rawName = row['Song'] || row['Name'] || Object.values(row)[0]
          if (!rawName) return

          const cleanTarget = String(rawName).toLowerCase().trim()

          // Fuzzy Search: Find the file with the lowest "Score"
          let bestMatch: DriveFile | undefined = undefined
          let bestScore = 0 // Higher is better

          for (const df of driveFiles) {
            if (df.mimeType.includes('folder') || df.mimeType.includes('spreadsheet')) continue

            // Normalize: remove extensions, lower case, then replace ALL non-alphanumeric with spaces
            // This handles "d'zimrah" -> "d zimrah", "s_fatai" -> "s fatai", "(Complete)" -> " complete "
            const rawFileName = df.name.toLowerCase().replace(/\.(pdf|musicxml|xml|mxl|xlsx)/, '')
            const cleanFileName = rawFileName.replace(/[^a-z0-9]/g, ' ').trim()

            // Normalize Target too
            const cleanTargetAlpha = cleanTarget.replace(/[^a-z0-9]/g, ' ').trim()

            // 1. Direct Inclusion (Score: 100)
            if (cleanFileName === cleanTargetAlpha) {
              if (bestScore < 100) { bestScore = 100; bestMatch = df; }
              continue
            }

            // 2. Starts With (Score: 90)
            if (cleanFileName.startsWith(cleanTargetAlpha)) {
              if (bestScore < 90) { bestScore = 90; bestMatch = df; }
              continue
            }

            // 3. Fuzzy Token Match (Score: 70-80)
            const targetTokens = cleanTargetAlpha.split(' ').filter(t => t.length > 0)
            const fileTokens = cleanFileName.split(' ').filter(t => t.length > 0)

            let matchedTokenCount = 0
            targetTokens.forEach(tToken => {
              const found = fileTokens.some(fToken => {
                if (fToken === tToken) return true
                // Allow small length diffs
                if (Math.abs(fToken.length - tToken.length) > 2) return false
                // Allow typos (levenshtein)
                return levenshtein(fToken, tToken) <= 1
              })
              if (found) matchedTokenCount++
            })

            const matchRatio = matchedTokenCount / targetTokens.length

            if (matchRatio === 1) {
              const score = 80
              if (score > bestScore) { bestScore = score; bestMatch = df; }
            }
            else if (matchRatio >= 0.66) {
              const score = 60
              if (score > bestScore) { bestScore = score; bestMatch = df; }
            }
          }

          if (rawName) {
            addItem({
              fileId: bestMatch ? bestMatch.id : `missing-${Math.random()}`, // Unique ID for missing items
              name: String(rawName),
              type: bestMatch && bestMatch.mimeType.includes('xml') ? 'musicxml' : 'pdf',
              url: bestMatch ? `/api/drive/file/${bestMatch.id}` : undefined,
              transposition: Number(row['Key'] || 0) || 0
            })
          }
        })
        setView('setlist') // Go to setlist manager
      } catch (e) {
        alert("Failed to parse setlist")
      }
      return
    }

    // Music -> Performer Logic
    const type: FileType = isXml ? 'musicxml' : 'pdf'
    setFile(`/api/drive/file/${file.id}`, type)
    setView('performer')
  }

  // --- VIEWS ---

  // A. Home Screen (Big Touch Targets)
  if (view === 'home') return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white p-6 gap-6">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-primary h-10 w-10 rounded-full flex items-center justify-center">
            <Music2 className="text-black h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">CRC Music Books</h1>
        </div>
        <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
          {loadingFiles ? <Loader2 className="animate-spin mr-2" /> : null} Sync Drive
        </Button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Song Charts */}
        <button
          onClick={() => setView('song_charts')}
          className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
        >
          <div className="bg-blue-500/20 p-6 rounded-full group-hover:bg-blue-500/30 transition-colors">
            <FileMusic className="h-16 w-16 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold">Song Charts</h2>
          <p className="text-zinc-400 text-lg">Browse {driveFiles.filter(f => !f.mimeType.startsWith('audio/')).length} charts</p>
        </button>

        {/* Setlists */}
        <button
          onClick={() => setView('setlist_dashboard')}
          className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
        >
          <div className="bg-green-500/20 p-6 rounded-full group-hover:bg-green-500/30 transition-colors">
            <ListMusic className="h-16 w-16 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold">Setlists</h2>
          <p className="text-zinc-400 text-lg">Manage or Import</p>
        </button>

        {/* Audio Files */}
        <button
          onClick={() => setView('audio')}
          className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
        >
          <div className="bg-purple-500/20 p-6 rounded-full group-hover:bg-purple-500/30 transition-colors">
            <Headphones className="h-16 w-16 text-purple-400" />
          </div>
          <h2 className="text-3xl font-bold">Audio Files</h2>
          <p className="text-zinc-400 text-lg">Practice recordings</p>
        </button>
      </div>

      {/* Quick Resume */}
      {fileUrl && (
        <Button size="lg" className="h-20 text-xl" onClick={() => setView('performer')}>
          Resume Performance <PlayCircle className="ml-2 h-6 w-6" />
        </Button>
      )}
    </div>
  )

  // B. Setlist Dashboard (Firebase)
  if (view === 'setlist_dashboard') return (
    <>
      <SetlistDashboard
        onBack={() => setView('home')}
        onSelect={(setlist) => {
          setEditingSetlist(setlist)
          setView('setlist_editor')
        }}
        onImport={() => setShowImportModal(true)}
        onCreateNew={() => {
          setEditingSetlist(null)
          setImportedTracks([])
          setView('setlist_editor')
        }}
      />
      {showImportModal && (
        <ImportModal
          driveFiles={driveFiles}
          onClose={() => setShowImportModal(false)}
          onImport={(tracks, suggestedName) => {
            setImportedTracks(tracks)
            setSuggestedSetlistName(suggestedName)
            setEditingSetlist(null)
            setShowImportModal(false)
            setView('setlist_editor')
          }}
        />
      )}
    </>
  )

  // C. Setlist Editor
  if (view === 'setlist_editor') return (
    <SetlistEditor
      setlistId={editingSetlist?.id}
      initialTracks={editingSetlist?.tracks || importedTracks}
      initialName={editingSetlist?.name || ""}
      suggestedName={suggestedSetlistName}
      initialIsPublic={editingSetlist?.isPublic || false}
      initialOwnerId={editingSetlist?.ownerId}
      driveFiles={driveFiles}
      onBack={() => {
        setEditingSetlist(null)
        setImportedTracks([])
        setSuggestedSetlistName("")
        setView('setlist_dashboard')
      }}
      onSave={() => {
        setEditingSetlist(null)
        setImportedTracks([])
        setSuggestedSetlistName("")
        setView('setlist_dashboard')
      }}
      onPlayTrack={(fileId, fileName) => {
        // Find the index of the clicked track
        const trackIndex = (editingSetlist?.tracks || importedTracks).findIndex(t => t.fileId === fileId)
        if (trackIndex === -1) return

        // Build queue from valid tracks
        const queue = (editingSetlist?.tracks || importedTracks)
          .filter(t => t.fileId) // Ensure fileId exists
          .map(t => {
            // Find matching Drive file for metadata (like type)
            const driveFile = driveFiles.find(df => df.id === t.fileId)
            // Default to PDF if we can't find it (safe fallback)
            const type: FileType = driveFile?.name.endsWith('.xml') || driveFile?.name.endsWith('.musicxml') || driveFile?.mimeType.includes('xml') ? 'musicxml' : 'pdf'
            return {
              name: t.title,
              fileId: t.fileId as string, // Safe cast
              type: type,
              transposition: Number(t.key) || 0
            }
          })

        // Initialize Queue at the specific index
        const clickedItemIndex = queue.findIndex(q => q.fileId === fileId)
        if (clickedItemIndex !== -1) {
          useMusicStore.getState().setQueue(queue, clickedItemIndex)
          setView('performer')
        }
      }}
    />
  )

  // D. Song Charts Library (A-Z or Folder view)
  if (view === 'song_charts') return (
    <SongChartsLibrary
      driveFiles={driveFiles}
      onBack={() => setView('home')}
      onSelectFile={(file) => loadFile(file)}
    />
  )

  // E. Audio Library (MP3 Player)
  if (view === 'audio') return (
    <AudioLibrary
      driveFiles={driveFiles}
      onBack={() => setView('home')}
    />
  )

  // Performer View (Immersive)
  return (
    <div className="h-screen flex flex-col bg-black text-white relative">

      {/* Floating Controls (Top) - Auto-hides or stays minimal */}
      <div className="absolute top-0 left-0 right-0 z-50 flex justify-between items-start p-2 pointer-events-none">
        {/* Back / Menu Pill */}
        <div className="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full p-1 pl-2 shadow-2xl transition-opacity hover:opacity-100 opacity-50 hover:bg-black/80">
          <Button size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full hover:bg-white/20" onClick={() => setView('home')}>
            <HomeIcon className="h-6 w-6" />
          </Button>
          <div className="h-6 w-px bg-white/20 mx-1"></div>
          <Button size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full hover:bg-white/20" onClick={() => setView('setlist')}>
            <ListMusic className="h-6 w-6" />
          </Button>
        </div>

        {/* Setlist Navigation Pill (Middle) */}
        {playbackQueue.length > 0 && (
          <div className="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-2xl transition-opacity hover:opacity-100 opacity-50 hover:bg-black/80">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 text-white rounded-full hover:bg-white/20"
              onClick={prevSong}
              disabled={queueIndex <= 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <div className="flex flex-col items-center px-2 min-w-[100px]">
              <span className="text-sm font-medium truncate max-w-[150px]">{playbackQueue[queueIndex]?.name}</span>
              <span className="text-[10px] text-zinc-400">{queueIndex + 1} / {playbackQueue.length}</span>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 text-white rounded-full hover:bg-white/20"
              onClick={nextSong}
              disabled={queueIndex >= playbackQueue.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        )}

        {/* Keyboard navigation handled by useEffect at component top level */}

        {/* Transposition Pill (Only XML) */}
        {fileType === 'musicxml' && (
          <div className="pointer-events-auto flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-2xl transition-opacity hover:opacity-100 opacity-50 hover:bg-black/80">
            <Button size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full text-xl hover:bg-white/20" onClick={() => setTransposition(transposition - 1)}>-</Button>
            <span className="w-8 text-center font-bold text-lg font-mono">
              {transposition > 0 ? `+${transposition}` : transposition}
            </span>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full text-xl hover:bg-white/20" onClick={() => setTransposition(transposition + 1)}>+</Button>
          </div>
        )}
      </div>

      <div className="flex-1 w-full h-full bg-black overflow-hidden relative">
        {/* Render Viewer (Edge to Edge) */}
        {/* We remove padding and centering divs to let the Viewer control scaling */}
        {fileType === 'musicxml' && fileUrl && <SmartScoreViewer url={fileUrl} />}
        {fileType === 'pdf' && fileUrl && <PDFViewer url={fileUrl} />}
        {!fileUrl && (
          <div className="flex w-full h-full items-center justify-center text-zinc-500">
            No Song Selected
          </div>
        )}
      </div>
    </div>
  )
}
