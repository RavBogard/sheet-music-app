import { useState, useCallback } from 'react';
import { saveOfflineFile, isFileOffline } from '@/lib/offline-store';
import { SetlistTrack } from '@/lib/setlist-firebase';

export function useOfflineSync() {
    const [downloading, setDownloading] = useState<Record<string, boolean>>({});
    const [offlineStatus, setOfflineStatus] = useState<Record<string, boolean>>({});

    const checkOfflineStatus = useCallback(async (tracks: SetlistTrack[]) => {
        const status: Record<string, boolean> = {};
        for (const track of tracks) {
            if (track.fileId) {
                status[track.fileId] = await isFileOffline(track.fileId);
            }
            if (track.audioFileId) {
                status[track.audioFileId] = await isFileOffline(track.audioFileId);
            }
        }
        setOfflineStatus(status);
        return status;
    }, []);

    const downloadFile = useCallback(async (fileId: string, fileName: string) => {
        if (downloading[fileId]) return;

        setDownloading(prev => ({ ...prev, [fileId]: true }));
        try {
            // Fetch from our API proxy
            const res = await fetch(`/api/drive/file/${fileId}`);
            if (!res.ok) throw new Error("Download failed");

            const blob = await res.blob();
            const mimeType = res.headers.get('Content-Type') || 'application/pdf';

            await saveOfflineFile(fileId, blob, fileName, mimeType);
            setOfflineStatus(prev => ({ ...prev, [fileId]: true }));
            console.log(`Downloaded ${fileName} for offline use.`);
        } catch (error) {
            console.error(`Failed to download ${fileName}:`, error);
        } finally {
            setDownloading(prev => ({ ...prev, [fileId]: false }));
        }
    }, [downloading]);

    const syncSetlist = useCallback(async (tracks: SetlistTrack[]) => {
        const tasks: Promise<void>[] = []

        tracks.forEach(t => {
            if (t.fileId && !offlineStatus[t.fileId]) {
                tasks.push(downloadFile(t.fileId, t.title))
            }
            if (t.audioFileId && !offlineStatus[t.audioFileId]) {
                tasks.push(downloadFile(t.audioFileId, `${t.title} (Audio)`))
            }
        })

        await Promise.all(tasks);
    }, [downloadFile, offlineStatus]);

    return {
        checkOfflineStatus,
        downloadFile,
        syncSetlist,
        downloading,
        offlineStatus
    };
}
