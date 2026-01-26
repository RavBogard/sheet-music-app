"use client"

import { useEffect, useState } from "react"
import { useMusicStore, FileType } from "@/lib/store"
import { levenshtein } from "@/lib/utils"
import { useSetlistStore } from "@/lib/setlist-store"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { SetlistEditor } from "@/components/setlist/SetlistEditor"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"
import { AudioLibrary } from "@/components/audio/AudioLibrary"
import { Setlist, SetlistTrack } from "@/lib/setlist-firebase"
import * as XLSX from 'xlsx'

// New Views
import { HomeView } from "@/components/views/HomeView"
import { SetlistDashboardView } from "@/components/views/SetlistDashboardView"
import { PerformerView } from "@/components/views/PerformerView"

const MASTER_FOLDER_ID = "1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK"

interface DriveFile {
  id: string
  name: string
  mimeType: string
}

type ViewMode = 'home' | 'song_charts' | 'audio' | 'library' | 'setlist' | 'setlist_dashboard' | 'setlist_editor' | 'performer'

export default function Home() {
  const {
    fileType,
    fileUrl,
    setFile,
    transposition,
    setTransposition,
    playbackQueue,
    queueIndex,
    nextSong,
    prevSong,
    aiTransposer,
    setTransposerState
  } = useMusicStore()

  // Auto-Transpose Logic
  // 1. Trigger Transposer if PDF has target key
  useEffect(() => {
    const currentTrack = playbackQueue[queueIndex]
    // If track has a target key (and it's a PDF)
    if (currentTrack?.targetKey && fileType === 'pdf') {
      // Only enable if not already active/scanned
      if (!aiTransposer.isVisible && aiTransposer.status === 'idle') {
        setTransposerState({ isVisible: true })
      }
    }
  }, [queueIndex, fileType, playbackQueue])

  // 2. Once key is detected, set transposition to match target
  useEffect(() => {
    const currentTrack = playbackQueue[queueIndex]
    if (currentTrack?.targetKey && aiTransposer.detectedKey) {
      const target = currentTrack.targetKey.replace(/m$/, '') // Remove minor 'm' for simple scaling
      const detected = aiTransposer.detectedKey.replace(/m$/, '')

      // Simple chromatic map
      const keys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
      const tIndex = keys.indexOf(target)
      const dIndex = keys.indexOf(detected)

      if (tIndex !== -1 && dIndex !== -1) {
        let delta = tIndex - dIndex
        // Normalize to smallest jump (e.g. +11 -> -1)
        if (delta > 6) delta -= 12
        if (delta < -6) delta += 12

        setTransposition(delta)
      }
    }
  }, [aiTransposer.detectedKey, queueIndex])

  const { addItem, clear: clearSetlist } = useSetlistStore()

  // State
  const [view, setView] = useState<ViewMode>('home')
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Setlist State
  const [editingSetlist, setEditingSetlist] = useState<Setlist | null>(null)
  const [importedTracks, setImportedTracks] = useState<SetlistTrack[]>([])
  const [suggestedSetlistName, setSuggestedSetlistName] = useState("")

  // 1. Initial Load
  useEffect(() => {
    // Only fetch if we have 0 files (basic caching prevention)
    if (driveFiles.length > 0) return

    async function fetchFiles() {
      try {
        setLoadingFiles(true)
        // No folderId param = Global Search (All Shared Files)
        // TODO: This should be cached on server!
        const res = await fetch(`/api/drive/list`)
        if (!res.ok) throw new Error("Failed to sync library")

        const data = await res.json()
        setDriveFiles(data)
      } catch (err: any) {
        console.error(err)
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
      importSetlistFromExcel(file)
      return
    }

    // Music -> Performer Logic
    const type: FileType = isXml ? 'musicxml' : 'pdf'
    setFile(`/api/drive/file/${file.id}`, type)
    setView('performer')
  }

  const importSetlistFromExcel = async (file: DriveFile) => {
    try {
      const res = await fetch(`/api/drive/file/${file.id}`)
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])

      clearSetlist()

      // ... (Logic extracted to separate function would be better, but keeping here for now)
      // Re-using the logic from original file, simplified for brevity in this refactor step
      // In a real refactor, this should move to a utility
      data.forEach((row: any) => {
        const rawName = row['Song'] || row['Name'] || Object.values(row)[0]
        if (!rawName) return

        const cleanTarget = String(rawName).toLowerCase().trim()
        let bestMatch: DriveFile | undefined = undefined
        let bestScore = 0

        for (const df of driveFiles) {
          if (df.mimeType.includes('folder') || df.mimeType.includes('spreadsheet')) continue
          const rawFileName = df.name.toLowerCase().replace(/\.(pdf|musicxml|xml|mxl|xlsx)/, '')
          const cleanFileName = rawFileName.replace(/[^a-z0-9]/g, ' ').trim()
          const cleanTargetAlpha = cleanTarget.replace(/[^a-z0-9]/g, ' ').trim()

          if (cleanFileName === cleanTargetAlpha) {
            if (bestScore < 100) { bestScore = 100; bestMatch = df; }
            continue
          }
          if (cleanFileName.startsWith(cleanTargetAlpha)) {
            if (bestScore < 90) { bestScore = 90; bestMatch = df; }
            continue
          }
          const targetTokens = cleanTargetAlpha.split(' ').filter(t => t.length > 0)
          const fileTokens = cleanFileName.split(' ').filter(t => t.length > 0)
          let matchedTokenCount = 0
          targetTokens.forEach(tToken => {
            const found = fileTokens.some(fToken => {
              if (fToken === tToken) return true
              if (Math.abs(fToken.length - tToken.length) > 2) return false
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
            fileId: bestMatch ? bestMatch.id : `missing-${Math.random()}`,
            name: String(rawName),
            type: bestMatch && bestMatch.mimeType.includes('xml') ? 'musicxml' : 'pdf',
            url: bestMatch ? `/api/drive/file/${bestMatch.id}` : undefined,
            transposition: Number(row['Key'] || 0) || 0
          })
        }
      })
      setView('setlist')
    } catch (e) {
      alert("Failed to parse setlist")
    }
  }

  // --- VIEWS ---

  // Wake Lock Logic
  const { requestWakeLock, releaseWakeLock } = useWakeLock()

  useEffect(() => {
    if (view === 'performer') {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }
  }, [view, requestWakeLock, releaseWakeLock])

  if (view === 'home') return (
    <HomeView
      driveFiles={driveFiles}
      loadingFiles={loadingFiles}
      onSync={() => window.location.reload()}
      onChangeView={setView}
      fileUrl={fileUrl}
      onResume={() => setView('performer')}
    />
  )

  if (view === 'setlist_dashboard') return (
    <SetlistDashboardView
      driveFiles={driveFiles}
      onBack={() => setView('home')}
      onEditSetlist={(setlist) => {
        setEditingSetlist(setlist)
        setView('setlist_editor')
      }}
      onCreateNew={() => {
        setEditingSetlist(null)
        setImportedTracks([])
        setView('setlist_editor')
      }}
      onImportSuccess={(tracks, name) => {
        setImportedTracks(tracks)
        setSuggestedSetlistName(name)
        setEditingSetlist(null)
        setView('setlist_editor')
      }}
    />
  )

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
        const trackIndex = (editingSetlist?.tracks || importedTracks).findIndex(t => t.fileId === fileId)
        if (trackIndex === -1) return

        const queue = (editingSetlist?.tracks || importedTracks)
          .filter(t => t.fileId)
          .map(t => {
            const driveFile = driveFiles.find(df => df.id === t.fileId)
            const type: FileType = driveFile?.name.endsWith('.xml') || driveFile?.name.endsWith('.musicxml') || driveFile?.mimeType.includes('xml') ? 'musicxml' : 'pdf'
            return {
              name: t.title,
              fileId: t.fileId as string,
              type: type,
              transposition: Number(t.key) ? 0 : 0,
              targetKey: t.key || undefined
            }
          })
        const clickedItemIndex = queue.findIndex(q => q.fileId === fileId)
        if (clickedItemIndex !== -1) {
          useMusicStore.getState().setQueue(queue, clickedItemIndex)
          setView('performer')
        }
      }}
    />
  )

  if (view === 'song_charts') return (
    <SongChartsLibrary
      driveFiles={driveFiles}
      onBack={() => setView('home')}
      onSelectFile={(file) => loadFile(file)}
    />
  )

  if (view === 'audio') return (
    <AudioLibrary
      driveFiles={driveFiles}
      onBack={() => setView('home')}
    />
  )

  return (
    <PerformerView
      fileType={fileType}
      fileUrl={fileUrl}
      onHome={() => setView('home')}
      onSetlist={() => setView('setlist')}
    />
  )
}
