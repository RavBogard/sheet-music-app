"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useMusicStore, FileType } from "@/lib/store"
import { levenshtein } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  FileMusic, Music2, Share2, Printer, Settings, Loader2,
  FileText, LayoutTemplate, ListPlus, FolderOpen, ChevronLeft,
  PlayCircle, Home as HomeIcon, Library as LibIcon, ListMusic
} from "lucide-react"
import { useSetlistStore } from "@/lib/setlist-store"
import { SetlistManager } from "@/components/setlist/setlist-manager"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { SetlistEditor } from "@/components/setlist/SetlistEditor"
import { ImportModal } from "@/components/setlist/ImportModal"
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

type ViewMode = 'home' | 'library' | 'setlist' | 'setlist_dashboard' | 'setlist_editor' | 'performer'

export default function Home() {
  const { fileType, fileUrl, setFile, transposition, setTransposition } = useMusicStore()
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

  // 2. Logic: Load File (and switch to Performer)
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

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => setView('library')}
          className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
        >
          <div className="bg-blue-500/20 p-6 rounded-full group-hover:bg-blue-500/30 transition-colors">
            <LibIcon className="h-16 w-16 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold">Files Library</h2>
          <p className="text-zinc-400 text-lg">Browse {driveFiles.length} songs (PDF / XML)</p>
        </button>

        <button
          onClick={() => setView('setlist_dashboard')}
          className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
        >
          <div className="bg-green-500/20 p-6 rounded-full group-hover:bg-green-500/30 transition-colors">
            <ListMusic className="h-16 w-16 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold">Setlists</h2>
          <p className="text-zinc-400 text-lg">Manage or Import Setlists</p>
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
        // Find the file in driveFiles to get mimeType
        const file = driveFiles.find(f => f.id === fileId)
        if (file) {
          loadFile(file)
        }
      }}
    />
  )

  // D. Library View (Touch List)
  if (view === 'library') return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
        <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => setView('home')}>
          <ChevronLeft className="h-8 w-8" />
        </Button>
        <h1 className="text-2xl font-bold flex-1">All Songs</h1>
      </div>

      <ScrollArea className="flex-1 p-4">
        {loadingFiles && <div className="p-8 text-center text-xl">Loading...</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {driveFiles
            .filter(f => !f.mimeType.includes('folder') && !f.mimeType.includes('spreadsheet') && !f.name.endsWith('.xlsx'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(file => (
              <button
                key={file.id}
                onClick={() => loadFile(file)}
                className="flex items-center gap-4 p-4 text-left bg-zinc-900 rounded-xl hover:bg-zinc-800 border border-zinc-800 transition-colors active:scale-98"
              >
                {file.mimeType.includes('pdf') ?
                  <FileText className="h-8 w-8 text-red-400 shrink-0" /> :
                  <Music2 className="h-8 w-8 text-blue-400 shrink-0" />
                }
                <span className="font-medium text-lg truncate flex-1">{file.name}</span>
              </button>
            ))}
        </div>
      </ScrollArea>
    </div>
  )

  // C. Setlist View
  if (view === 'setlist') return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
        <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => setView('home')}>
          <ChevronLeft className="h-8 w-8" />
        </Button>
        <h1 className="text-2xl font-bold flex-1">Setlist Manager</h1>
        <Button onClick={() => setView('performer')}>
          Perform Set <PlayCircle className="ml-2 h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-x divide-zinc-800 overflow-hidden">
        {/* Excel Import List */}
        <div className="md:w-1/3 bg-zinc-900/50 flex flex-col">
          <div className="p-4 font-semibold text-zinc-400 uppercase text-sm tracking-wider">Import from Drive</div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {driveFiles
                .filter(f => f.mimeType.includes('spreadsheet') || f.name.endsWith('.xlsx') || f.mimeType === 'application/vnd.google-apps.document')
                .map(file => (
                  <button
                    key={file.id}
                    onClick={() => loadFile(file)}
                    className="w-full flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-green-500/50 transition-colors text-left"
                  >
                    <LayoutTemplate className="h-6 w-6 text-green-500 shrink-0" />
                    <span className="font-medium">{file.name}</span>
                  </button>
                ))}
            </div>
          </ScrollArea>
        </div>

        {/* Active Setlist - Reuse existing component but ensure it fits */}
        <div className="flex-1 bg-zinc-950 p-4 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <SetlistManager onSongSelect={() => setView('performer')} />
          </div>
        </div>
      </div>
    </div>
  )

  // D. Performer View (Immersive)
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
