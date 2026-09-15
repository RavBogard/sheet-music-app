import { createHash } from "node:crypto"

import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import { fetchFileById, type FetchedFile } from "@/lib/file-fetcher"
import { initAdmin } from "@/lib/firebase-admin"
import { downloadExactStorageGeneration } from "@/lib/firebase-storage"
import { rowOrg, rowOrgIds, userInOrg } from "@/lib/org/membership"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import {
    selectLatestReaderMusic,
    type ReaderMusicBinding,
    type ReaderMusicCrosswalk,
    type ReaderMusicSetlist,
} from "@/lib/reader-music"
import {
    approvedPublicReaderCrosswalk,
    isSafePublicReaderChart,
    MAX_PUBLIC_READER_CHART_BYTES,
    normalizeReaderMusicMime,
    publicReaderChartDefinition,
    type ApprovedPublicReaderCrosswalk,
    type PublicReaderChartManifest,
    type PublicReaderChartDefinition,
} from "@/lib/reader-music-public"
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
    // Custom claims are the role authority. A user may write their own profile
    // document under the existing Firestore rules, so profile.role must never
    // be accepted as an authorization fallback.
    if (!ELIGIBLE_ROLES.has(String(decoded.role ?? ""))) {
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

async function approvedPublicCrosswalk(
    definition: PublicReaderChartDefinition,
): Promise<ApprovedPublicReaderCrosswalk | null> {
    const snap = await getFirestore()
        .collection("reader_music_crosswalk")
        .doc(definition.unitId)
        .get()
    if (!snap.exists) return null
    return approvedPublicReaderCrosswalk(snap.data() ?? {}, definition)
}

async function bindingIsActiveAndAuthorized(
    binding: ReaderMusicBinding,
    orgId: string,
    manifest?: PublicReaderChartManifest,
): Promise<boolean> {
    const db = getFirestore()
    const [song, library] = await db.getAll(
        db.collection("songs").doc(binding.songId),
        db.collection("library_index").doc(binding.fileId),
    )
    if (!song.exists || !library.exists) return false
    const songRow = song.data() ?? {}
    const libraryRow = library.data() ?? {}
    if (!(
        songRow.status === "active" &&
        libraryRow.status === "active" &&
        rowOrg(songRow.orgId) === orgId &&
        rowOrg(libraryRow.orgId) === orgId
    )) return false
    if (!manifest) return true

    const contentHash = libraryRow.contentHash
    const hashRow =
        contentHash && typeof contentHash === "object"
            ? (contentHash as Record<string, unknown>)
            : null
    return (
        binding.songId === manifest.songId &&
        binding.fileId === manifest.fileId &&
        normalizeReaderMusicMime(binding.mimeType) === manifest.contentType &&
        normalizeReaderMusicMime(libraryRow.mimeType) === manifest.contentType &&
        Number(libraryRow.fileSize) === manifest.sizeBytes &&
        hashRow?.alg === "sha256" &&
        typeof hashRow.value === "string" &&
        hashRow.value.toLowerCase() === manifest.sha256 &&
        Number(hashRow.sizeBytes) === manifest.sizeBytes
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
    return resolveWithCrosswalk(crosswalk, nowMs)
}

async function resolveWithCrosswalk(
    crosswalk: ReaderMusicCrosswalk,
    nowMs: number,
    manifest?: PublicReaderChartManifest,
): Promise<ResolvedReaderMusic> {
    const db = getFirestore()
    const snap = await db
        .collection("setlists")
        .where("orgId", "==", crosswalk.orgId)
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
                bindingIsActiveAndAuthorized(binding, crosswalk.orgId, manifest),
        },
    )
    return selection.status === "available"
        ? { ...selection, pieceId: crosswalk.pieceId }
        : selection
}

export type PublicResolvedReaderMusic = {
    status: "available"
    binding: ReaderMusicBinding
    definition: PublicReaderChartDefinition
    manifest: PublicReaderChartManifest
} | { status: "unavailable" }

/** Anonymous resolution has no user/profile dependency and no arbitrary-id path. */
export async function resolvePublicReaderMusic(
    unitId: string,
    nowMs = Date.now(),
): Promise<PublicResolvedReaderMusic> {
    const definition = publicReaderChartDefinition(unitId)
    if (!definition) return { status: "unavailable" }
    if (!initAdmin()) return { status: "unavailable" }
    const crosswalk = await approvedPublicCrosswalk(definition)
    if (!crosswalk) return { status: "unavailable" }
    const manifest = crosswalk.publicReaderManifest
    const resolved = await resolveWithCrosswalk(crosswalk, nowMs, manifest)
    if (
        resolved.status !== "available" ||
        resolved.pieceId !== definition.pieceId ||
        resolved.binding.songId !== manifest.songId ||
        resolved.binding.fileId !== manifest.fileId ||
        normalizeReaderMusicMime(resolved.binding.mimeType) !== manifest.contentType
    ) {
        return { status: "unavailable" }
    }
    return {
        status: "available",
        binding: resolved.binding,
        definition,
        manifest,
    }
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

export async function fetchPublicResolvedReaderMusic(
    unitId: string,
): Promise<{
    definition: PublicReaderChartDefinition
    buffer: Buffer
} | null> {
    const resolved = await resolvePublicReaderMusic(unitId)
    if (resolved.status !== "available") return null
    const storage = await downloadExactStorageGeneration({
        path: resolved.manifest.storagePath,
        generation: resolved.manifest.generation,
        contentType: resolved.manifest.contentType,
        expectedSizeBytes: resolved.manifest.sizeBytes,
        maxBytes: MAX_PUBLIC_READER_CHART_BYTES,
    })
    if (
        !storage.success ||
        storage.data.generation !== resolved.manifest.generation ||
        storage.data.sizeBytes !== resolved.manifest.sizeBytes ||
        createHash("sha256").update(storage.data.buffer).digest("hex") !==
            resolved.manifest.sha256 ||
        !isSafePublicReaderChart(
            storage.data.contentType,
            storage.data.buffer,
            resolved.definition,
        )
    ) {
        return null
    }

    // Revocation/catalog recheck after the potentially slow byte fetch.  The
    // immutable generation+SHA bind the bytes themselves; this second resolve
    // ensures an approval hold, catalog archive, or newer eligible occurrence
    // that landed while fetching prevents delivery.
    const current = await resolvePublicReaderMusic(unitId)
    if (
        current.status !== "available" ||
        current.binding.songId !== resolved.binding.songId ||
        current.binding.fileId !== resolved.binding.fileId ||
        JSON.stringify(current.manifest) !== JSON.stringify(resolved.manifest)
    ) return null
    return { definition: resolved.definition, buffer: storage.data.buffer }
}
