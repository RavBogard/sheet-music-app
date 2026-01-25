"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useMusicStore, FileType } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileMusic, Music2, Share2, Printer, Settings, Loader2, FileText, LayoutTemplate, AlertCircle, ListPlus } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSetlistStore } from "@/lib/setlist-store"
import { SetlistManager } from "@/components/setlist/setlist-manager"
import { UserNav } from "@/components/user-nav"
import * as XLSX from 'xlsx'

// Dynamic import for client components that use browser APIs
const PDFViewer = dynamic(() => import("@/components/music/PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => import("@/components/music/SmartScoreViewer").then(mod => mod.SmartScoreViewer), { ssr: false })

// Hardcoded Master Folder ID
const MASTER_FOLDER_ID = "1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK"

interface DriveFile {
  id: string
  name: string
  mimeType: string
  webContentLink?: string
}

export default function Home() {
  const { data: session } = useSession()
  const { fileType, fileUrl, setFile, transposition, setTransposition } = useMusicStore()
  const { addItem, clear: clearSetlist } = useSetlistStore()

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [errorFiles, setErrorFiles] = useState<string | null>(null)

  // Fetch Drive Files (Targeting Master Folder)
  useEffect(() => {
    async function fetchFiles() {
      if (!session) return

      try {
        setLoadingFiles(true)
        // Use the Master Folder ID
        const res = await fetch(`/api/drive/list?folderId=${MASTER_FOLDER_ID}`)
        if (!res.ok) throw new Error("Failed to search Drive")
        const data = await res.json()
        setDriveFiles(data)
      } catch (err) {
        console.error(err)
        setErrorFiles("Could not load Drive files. Check console.")
      } finally {
        setLoadingFiles(false)
      }
    }

    fetchFiles()
  }, [session])

  // Helper to load file (Handle Excel Parsing & Proxy loading)
  const loadDriveFile = async (file: DriveFile) => {

    const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
    const isExcel = file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx')

    if (isExcel) {
      // Parse Excel Setlist
      try {
        const res = await fetch(`/api/drive/file/${file.id}`)
        if (!res.ok) throw new Error("Failed to fetch Excel file")
        const blob = await res.blob()
        const buffer = await blob.arrayBuffer()

        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(sheet)

        console.log("Parsed Excel:", data)

        if (confirm(`Found ${data.length} songs in setlist. Replace current setlist?`)) {
          clearSetlist()
          // Iterate and add placeholder items
          data.forEach((row: any) => {
            const name = row['Song'] || row['Name'] || Object.values(row)[0]
            if (name) {
              addItem({
                fileId: 'placeholder',
                name: String(name),
                type: 'pdf', // default
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

    // Use the PROXY endpoint for content loading to avoid CORS/Auth issues
    // This allows the viewer to load the binary stream directly
    const proxyUrl = `/api/drive/file/${file.id}`
    setFile(proxyUrl, type)
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 text-foreground overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b bg-background/50 backdrop-blur z-20">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
            <Music2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Synagogue Music Manager</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon"><Printer className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon"><Share2 className="h-5 w-5" /></Button>
          <UserNav />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">

        {/* Sidebar / Library */}
        <aside className="w-80 border-r bg-muted/30 flex flex-col hidden md:flex">
          <Tabs defaultValue="library" className="flex-1 flex flex-col h-full">
            <div className="p-4 border-b">
              <TabsList className="w-full">
                <TabsTrigger value="library" className="flex-1">Library</TabsTrigger>
                <TabsTrigger value="setlist" className="flex-1">Setlist</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="library" className="flex-1 min-h-0 m-0">
              <div className="p-4 border-b">
                {!session && (
                  <div className="bg-blue-500/10 text-blue-500 p-3 rounded-md text-xs flex gap-2 items-start">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Sign in to see your Google Drive files.</span>
                  </div>
                )}
              </div>

              <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                  {/* Hardcoded Demo Section */}
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Demos</div>
                  <div className="flex items-center gap-1 group">
                    <Button
                      variant={fileType === 'musicxml' && fileUrl?.includes('demo') ? "secondary" : "ghost"}
                      className="flex-1 justify-start font-normal"
                      onClick={() => setFile('/demo.musicxml', 'musicxml')}
                    >
                      <FileMusic className="mr-2 h-4 w-4" /> Demo Song (Smart)
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      onClick={() => addItem({
                        fileId: 'demo',
                        name: 'Demo Song (Smart)',
                        type: 'musicxml',
                        url: '/demo.musicxml'
                      })}
                    >
                      <ListPlus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Dynamic Drive Section */}
                  {session && (
                    <>
                      <div className="px-2 py-1.5 mt-4 text-xs text-muted-foreground font-medium flex items-center justify-between">
                        <span>Google Drive</span>
                        {loadingFiles && <Loader2 className="h-3 w-3 animate-spin" />}
                      </div>
                      {driveFiles.map(file => (
                        <div key={file.id} className="flex items-center gap-1 group">
                          <Button
                            variant="ghost"
                            className="flex-1 justify-start font-normal truncate"
                            onClick={() => loadDriveFile(file)}
                          >
                            {file.mimeType.includes('pdf') ? <FileText className="mr-2 h-4 w-4 text-red-500" /> :
                              file.mimeType.includes('spreadsheet') ? <LayoutTemplate className="mr-2 h-4 w-4 text-green-500" /> :
                                <FileMusic className="mr-2 h-4 w-4 text-blue-400" />}
                            <span className="truncate">{file.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={() => addItem({
                              fileId: file.id,
                              name: file.name,
                              type: file.mimeType.includes('pdf') ? 'pdf' : 'musicxml',
                              url: file.webContentLink // In real apps, we'd want the ID to load via proxy
                            })}
                          >
                            <ListPlus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {driveFiles.length === 0 && !loadingFiles && (
                        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                          No music files found in Folder.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="setlist" className="flex-1 min-h-0 m-0 p-4">
              <SetlistManager />
            </TabsContent>
          </Tabs>
        </aside>

        {/* Viewer Area */}
        <section className="flex-1 flex flex-col relative bg-muted/10">

          {/* Toolbar */}
          <div className="h-16 border-b flex items-center px-6 gap-4 bg-background">
            {fileType === 'musicxml' ? (
              <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <span className="text-sm font-medium text-muted-foreground">Transposition:</span>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setTransposition(transposition - 1)}
                  >-</Button>
                  <span className="w-8 text-center font-mono font-bold">
                    {transposition > 0 ? `+${transposition}` : transposition}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setTransposition(transposition + 1)}
                  >+</Button>
                </div>
                {transposition !== 0 && (
                  <Button variant="link" size="sm" onClick={() => setTransposition(0)} className="text-xs text-muted-foreground">
                    Reset
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
                Static Mode (Transposition Unavailable)
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center">
            {fileType === 'musicxml' && fileUrl && <SmartScoreViewer url={fileUrl} />}
            {fileType === 'pdf' && fileUrl && <PDFViewer url={fileUrl} />}
            {!fileUrl && <div className="m-auto text-muted-foreground">Select a song to begin</div>}
          </div>

        </section>
      </main>
    </div>
  )
}
