"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useMusicStore, FileType } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  FileMusic, Music2, Share2, Printer, Settings, Loader2,
  FileText, LayoutTemplate, ListPlus, FolderOpen, ChevronLeft,
  PlayCircle, Home as HomeIcon, Library as LibIcon, ListMusic
} from "lucide-react"
import { useSetlistStore } from "@/lib/setlist-store"
import { SetlistManager } from "@/components/setlist/setlist-manager"
import * as XLSX from 'xlsx'

// Components
const PDFViewer = dynamic(() => import("@/components/music/PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => import("@/components/music/SmartScoreViewer").then(mod => mod.SmartScoreViewer), { ssr: false })

const MASTER_FOLDER_ID = "1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK"

interface DriveFile {
  id: string
  name: string
  mimeType: string
}

type ViewMode = 'home' | 'library' | 'setlist' | 'performer'

export default function Home() {
  const { fileType, fileUrl, setFile, transposition, setTransposition } = useMusicStore()
  const { addItem, clear: clearSetlist } = useSetlistStore()

  // State
  const [view, setView] = useState<ViewMode>('home')
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [errorMSG, setErrorMSG] = useState<string | null>(null)

  // 1. Initial Load
  useEffect(() => {
    async function fetchFiles() {
      try {
        setLoadingFiles(true)
        const res = await fetch(`/api/drive/list?folderId=${MASTER_FOLDER_ID}`)
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
          const name = row['Song'] || row['Name'] || Object.values(row)[0]
          const match = driveFiles.find(df =>
            df.name.toLowerCase().includes(String(name).toLowerCase()) &&
            !df.mimeType.includes('folder') && !df.mimeType.includes('spreadsheet')
          )

          if (name) {
            addItem({
              fileId: match ? match.id : 'placeholder',
              name: String(name),
              type: match && match.mimeType.includes('xml') ? 'musicxml' : 'pdf',
              url: match ? `/api/drive/file/${match.id}` : undefined,
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
          <h1 className="text-2xl font-bold">Synagogue Kiosk</h1>
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
          onClick={() => setView('setlist')}
          className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
        >
          <div className="bg-green-500/20 p-6 rounded-full group-hover:bg-green-500/30 transition-colors">
            <ListMusic className="h-16 w-16 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold">Setlists</h2>
          <p className="text-zinc-400 text-lg">Manage Active Set or Import from Excel</p>
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

  // B. Library View (Touch List)
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
                .filter(f => f.mimeType.includes('spreadsheet') || f.name.endsWith('.xlsx'))
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
            <SetlistManager />
          </div>
        </div>
      </div>
    </div>
  )

  // D. Performer View (Fullscreen Music)
  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      {/* Top Bar - Hideable? For now just minimal */}
      <div className="h-16 flex items-center justify-between px-4 bg-zinc-900 border-b border-zinc-800 z-10">
        <Button size="icon" variant="ghost" onClick={() => setView('home')}>
          <HomeIcon className="h-6 w-6" />
        </Button>

        {/* Key Controls (Center) - Only for XML */}
        {fileType === 'musicxml' && (
          <div className="flex items-center gap-2 bg-black/40 rounded-full p-1">
            <Button size="icon" variant="ghost" className="h-10 w-10 text-xl" onClick={() => setTransposition(transposition - 1)}>-</Button>
            <span className="w-12 text-center font-bold text-xl font-mono">
              {transposition > 0 ? `+${transposition}` : transposition}
            </span>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-xl" onClick={() => setTransposition(transposition + 1)}>+</Button>
          </div>
        )}

        <Button variant="ghost" onClick={() => setView('setlist')}>
          <ListMusic className="h-6 w-6 mr-2" /> Setlist
        </Button>
      </div>

      <div className="flex-1 overflow-hidden relative bg-white/5">
        {/* Render Viewer */}
        <div className="absolute inset-0 overflow-auto flex justify-center p-4">
          {fileType === 'musicxml' && fileUrl && <SmartScoreViewer url={fileUrl} />}
          {fileType === 'pdf' && fileUrl && <PDFViewer url={fileUrl} />}
          {!fileUrl && (
            <div className="m-auto text-2xl text-muted-foreground flex flex-col items-center gap-4">
              <Music2 className="h-16 w-16 opacity-20" />
              No Song Selected
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
