"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useMusicStore, FileType } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileMusic, Music2, Share2, Printer, Settings, Loader2, FileText, LayoutTemplate, ListPlus } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSetlistStore } from "@/lib/setlist-store"
import { SetlistManager } from "@/components/setlist/setlist-manager"
import * as XLSX from 'xlsx'

// Dynamic import for client components
const PDFViewer = dynamic(() => import("@/components/music/PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => import("@/components/music/SmartScoreViewer").then(mod => mod.SmartScoreViewer), { ssr: false })

// Hardcoded Master Folder ID
const MASTER_FOLDER_ID = "1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK"

interface DriveFile {
  id: string
  name: string
  mimeType: string
  parents?: string[]
}

export default function Home() {
  const { fileType, fileUrl, setFile, transposition, setTransposition } = useMusicStore()
  const { addItem, clear: clearSetlist } = useSetlistStore()

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Load Files on Mount (Public Kiosk Mode)
  useEffect(() => {
    async function fetchFiles() {
      try {
        setLoadingFiles(true)
        const res = await fetch(`/api/drive/list?folderId=${MASTER_FOLDER_ID}`)
        if (!res.ok) throw new Error("Failed to load Kiosk Library")
        const data = await res.json()
        setDriveFiles(data)

        const excels = data.filter((f: DriveFile) => f.mimeType.includes('spreadsheet') || f.name.endsWith('.xlsx'))
        console.log("Found master setlists:", excels)

      } catch (err) {
        console.error(err)
      } finally {
        setLoadingFiles(false)
      }
    }

    fetchFiles()
  }, [])

  const loadFile = async (file: DriveFile) => {
    const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
    const isExcel = file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx')

    if (isExcel) {
      try {
        const res = await fetch(`/api/drive/file/${file.id}`)
        if (!res.ok) throw new Error("Failed to fetch Excel file")
        const blob = await res.blob()
        const buffer = await blob.arrayBuffer()

        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(sheet)

        if (confirm(`Load Master Setlist: "${file.name}" (${data.length} songs)?`)) {
          clearSetlist()
          data.forEach((row: any) => {
            const name = row['Song'] || row['Name'] || Object.values(row)[0]

            // Smart Search: Try to find this song in our Drive Index
            const matchingFile = driveFiles.find(df =>
              df.name.toLowerCase().includes(String(name).toLowerCase()) &&
              (df.mimeType.includes('pdf') || df.mimeType.includes('xml'))
            )

            if (name) {
              addItem({
                fileId: matchingFile ? matchingFile.id : 'placeholder',
                name: String(name),
                type: matchingFile && matchingFile.mimeType.includes('xml') ? 'musicxml' : 'pdf',
                url: matchingFile ? `/api/drive/file/${matchingFile.id}` : undefined,
                transposition: Number(row['Key'] || 0) || 0
              })
            }
          })
        }
      } catch (e) {
        console.error(e)
        alert("Failed to parse setlist file.")
      }
      return
    }

    const type: FileType = isXml ? 'musicxml' : 'pdf'
    // Use the PROXY endpoint
    setFile(`/api/drive/file/${file.id}`, type)
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 text-foreground overflow-hidden">

      {/* Kiosk Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b bg-background/50 backdrop-blur z-20">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
            <Music2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Synagogue Music (Kiosk)</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Sync Drive
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">

        {/* Sidebar / Library */}
        <aside className="w-80 border-r bg-muted/30 flex flex-col hidden md:flex">
          <Tabs defaultValue="library" className="flex-1 flex flex-col h-full">
            <div className="p-4 border-b">
              <TabsList className="w-full h-12">
                <TabsTrigger value="library" className="flex-1 py-1 text-md">Library</TabsTrigger>
                <TabsTrigger value="setlist" className="flex-1 py-1 text-md">Setlist</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="library" className="flex-1 min-h-0 m-0">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                  {loadingFiles && (
                    <div className="p-4 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto opacity-50" />
                      <p className="text-xs text-muted-foreground mt-2">Syncing Master Folder...</p>
                    </div>
                  )}

                  {/* Sort: Folders/Excel first, then files */}
                  {driveFiles.sort((a, b) => {
                    const aScore = a.mimeType.includes('folder') || a.mimeType.includes('spreadsheet') ? 0 : 1
                    const bScore = b.mimeType.includes('folder') || b.mimeType.includes('spreadsheet') ? 0 : 1
                    return aScore - bScore
                  }).map(file => (
                    <div key={file.id} className="flex items-center gap-1 group">
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start font-normal truncate h-12 text-base"
                        onClick={() => loadFile(file)}
                      >
                        {file.mimeType.includes('pdf') ? <FileText className="mr-2 h-5 w-5 text-red-500" /> :
                          file.mimeType.includes('spreadsheet') ? <LayoutTemplate className="mr-2 h-5 w-5 text-green-500" /> :
                            <FileMusic className="mr-2 h-5 w-5 text-blue-400" />}
                        <span className="truncate">{file.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 opacity-0 group-hover:opacity-100"
                        onClick={() => addItem({
                          fileId: file.id,
                          name: file.name,
                          type: file.mimeType.includes('pdf') ? 'pdf' : 'musicxml',
                          url: `/api/drive/file/${file.id}`
                        })}
                      >
                        <ListPlus className="h-5 w-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="setlist" className="flex-1 min-h-0 m-0 p-4">
              <SetlistManager />
            </TabsContent>
          </Tabs>
        </aside>

        {/* Viewer */}
        <section className="flex-1 flex flex-col relative bg-muted/10">
          <div className="h-16 border-b flex items-center px-6 gap-4 bg-background">
            {fileType === 'musicxml' ? (
              <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <span className="text-sm font-medium text-muted-foreground mr-2">Key:</span>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button size="lg" variant="ghost" className="h-10 w-12 text-lg" onClick={() => setTransposition(transposition - 1)}>-</Button>
                  <span className="w-12 text-center font-mono font-bold text-lg">
                    {transposition > 0 ? `+${transposition}` : transposition}
                  </span>
                  <Button size="lg" variant="ghost" className="h-10 w-12 text-lg" onClick={() => setTransposition(transposition + 1)}>+</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
                Static Mode
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center">
            {fileType === 'musicxml' && fileUrl && <SmartScoreViewer url={fileUrl} />}
            {fileType === 'pdf' && fileUrl && <PDFViewer url={fileUrl} />}
            {!fileUrl && <div className="m-auto text-muted-foreground text-lg">Select a song from the Library</div>}
          </div>
        </section>
      </main>
    </div>
  )
}
