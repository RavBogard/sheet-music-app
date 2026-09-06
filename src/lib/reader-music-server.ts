import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import { fetchFileById, type FetchedFile } from "@/lib/file-fetcher"
import { initAdmin } from "@/lib/firebase-admin"
import { rowOrg, rowOrgIds, userInOrg } from "@/lib/org/membership"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import {
    selectLatestReaderMusic,
    type ReaderMusicBinding,
    type ReaderMusicCrosswalk,
    type ReaderMusicSetlist,
} from "@/lib/reader-music"
import { getTracksForSetlist } from "@/lib/server-tracks"

const ELIGIBLE_ROLES = new Set(["member", "musician", "band_leader", "admin"])

export type ReaderMusicAccess =
    | {
          ok: true
          uid: string
          orgId: string
          readerMusicEnabled: boolean
      }
    | { ok: false; kind: "unauthenticated" | "forbidden" }

function targetOrg(): string {
    return process.env.READER_MUSIC_ORG_ID?.trim() || DEFAULT_ORG_ID
}

function bearerToken(request: Request): string | null {
    const match = /^Bearer\s+([^\s]+)$/i.exec(
        request.headers.get("authorization")?.trim() ?? "",
    )
    return match?.[1] ?? null
}

/** Firebase ID bearer only; cookies, MCP bearers, and CORS never authenticate. */
export async function authorizeReaderMusic(
    request: Request,
    requireOptIn: boolean,
): Promise<ReaderMusicAccess> {
    const token = bearerToken(request)
    if (!token || !initAdmin()) return { ok: false, kind: "unauthenticated" }

    let decoded
    try {
        decoded = await getAuth().verifyIdToken(token, true)
    } catch {
        return { ok: false, kind: "unauthenticated" }
    }

    const orgId = targetOrg()
    const profileSnap = await getFirestore().collection("users").doc(decoded.uid).get()
    if (!profileSnap.exists) return { ok: false, kind: "forbidden" }
    const profile = profileSnap.data() ?? {}
    if (!ELIGIBLE_ROLES.has(String(profile.role ?? decoded.role ?? ""))) {
        return { ok: false, kind: "forbidden" }
    }
    // Claims are the authentication authority; the user row is an independent
    // tenant wall so a stale/mis-scoped profile cannot enable the pilot.
    if (!userInOrg(decoded, orgId) || !rowOrgIds(profile.orgIds).includes(orgId)) {
        return { ok: false, kind: "forbidden" }
    }

    const readerMusicEnabled = profile.readerMusicEnabled === true
    if (requireOptIn && !readerMusicEnabled) {
        return { ok: false, kind: "forbidden" }
    }
    return { ok: true, uid: decoded.uid, orgId, readerMusicEnabled }
}

export async function setReaderMusicPreference(
    uid: string,
    enabled: boolean,
): Promise<void> {
    await getFirestore()
        .collection("users")
        .doc(uid)
        .update({ readerMusicEnabled: enabled })
}

async function reviewedCrosswalk(
    unitId: string,
    orgId: string,
): Promise<ReaderMusicCrosswalk | null> {
    const snap = await getFirestore()
        .collection("reader_music_crosswalk")
        .doc(unitId)
        .get()
    if (!snap.exists) return null
    const row = snap.data() ?? {}
    if (
        row.status !== "reviewed" ||
        row.orgId !== orgId ||
        row.momentId !== unitId ||
        typeof row.pieceId !== "string" ||
        !row.pieceId.trim()
    ) {
        return null
    }
    return {
        orgId,
        momentId: unitId,
        pieceId: row.pieceId,
        status: "reviewed",
    }
}

async function bindingIsActiveAndAuthorized(
    binding: ReaderMusicBinding,
    orgId: string,
): Promise<boolean> {
    const db = getFirestore()
    const [song, library] = await db.getAll(
        db.collection("songs").doc(binding.songId),
        db.collection("library_index").doc(binding.fileId),
    )
    if (!song.exists || !library.exists) return false
    const songRow = song.data() ?? {}
    const libraryRow = library.data() ?? {}
    return (
        songRow.status === "active" &&
        libraryRow.status === "active" &&
        rowOrg(songRow.orgId) === orgId &&
        rowOrg(libraryRow.orgId) === orgId
    )
}

export type ResolvedReaderMusic =
    | { status: "available"; binding: ReaderMusicBinding; pieceId: string }
    | { status: "unavailable" }

export async function resolveReaderMusic(
    unitId: string,
    orgId: string,
    nowMs = Date.now(),
): Promise<ResolvedReaderMusic> {
    const crosswalk = await reviewedCrosswalk(unitId, orgId)
    if (!crosswalk) return { status: "unavailable" }

    const db = getFirestore()
    const snap = await db
        .collection("setlists")
        .where("orgId", "==", orgId)
        .get()
    const setlists = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as ReaderMusicSetlist,
    )
    const selection = await selectLatestReaderMusic(
        setlists,
        crosswalk,
        nowMs,
        {
            getTracksForSetlist: (setlistId, setlist) =>
                getTracksForSetlist(db, setlistId, setlist),
            isBindingAuthorized: (binding) =>
                bindingIsActiveAndAuthorized(binding, orgId),
        },
    )
    return selection.status === "available"
        ? { ...selection, pieceId: crosswalk.pieceId }
        : selection
}

export async function fetchResolvedReaderMusic(
    unitId: string,
    orgId: string,
): Promise<{ binding: ReaderMusicBinding; file: FetchedFile } | null> {
    const resolved = await resolveReaderMusic(unitId, orgId)
    if (resolved.status !== "available") return null
    const file = await fetchFileById(
        resolved.binding.fileId,
        resolved.binding.mimeType ?? undefined,
    )
    if (!file) return null
    return { binding: resolved.binding, file }
}
