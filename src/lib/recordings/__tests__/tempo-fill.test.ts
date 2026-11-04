import { describe, expect, it } from "vitest"
import type { Recording } from "@/types/models"
import { decideField, isAutoFilled, pickSongTempos, rowTempoPatch, type TempoPick } from "../tempo-fill"

const pick: TempoPick = { recordingId: "r-new", songId: "s1", bpm: 96, confidence: 0.9 }

const rec = (id: string, extra: Partial<Recording> = {}): Recording => ({
    id,
    songId: "s1",
    title: "t",
    storagePath: `recordings/${id}.mp3`,
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: "ingest",
    ...extra,
})
const tempo = (bpm: number | null, confidence: number, confident = confidence >= 0.5) => ({
    bpm, alt: bpm ? bpm / 2 : null, confidence, confident, method: "librosa-tempogram-v1", ...(confident ? {} : { reason: "rubato" }),
})

describe("fill rules", () => {
    it("an empty field is filled", () => {
        for (const bpm of [undefined, null, 0, ""]) {
            expect(decideField({ bpm }, pick)).toMatchObject({ action: "fill", after: 96 })
        }
    })

    it("a typed bpm is never touched", () => {
        expect(decideField({ bpm: 120 }, pick).action).toBe("skip")
        expect(decideField({ bpm: "fast" }, pick).action).toBe("skip")
        // A person changed an auto-filled value: the stale marker no longer matches, so it is theirs.
        const edited = { bpm: 100, bpmSource: "recording", bpmSourceRecordingId: "r-old", bpmSourceValue: 92 }
        expect(isAutoFilled(edited)).toBe(false)
        expect(decideField(edited, pick).action).toBe("skip")
    })

    it("an auto-filled value is updated by a more confident take, and kept when it is the same", () => {
        const auto = { bpm: 92, bpmSource: "recording", bpmSourceRecordingId: "r-old", bpmSourceValue: 92 }
        expect(decideField(auto, pick)).toMatchObject({ action: "update", before: 92, after: 96 })
        const same = { bpm: 96, bpmSource: "recording", bpmSourceRecordingId: "r-new", bpmSourceValue: 96 }
        expect(decideField(same, pick).action).toBe("keep")
    })

    it("the row patch carries the marker", () => {
        expect(rowTempoPatch(pick)).toEqual({ bpm: 96, bpmSource: "recording", bpmSourceRecordingId: "r-new", bpmSourceValue: 96 })
    })
})

describe("which take's tempo a song uses", () => {
    it("the most confident live take with a confident beat; held, hidden and beatless takes are skipped", () => {
        const { picks, verdicts } = pickSongTempos([
            rec("lo", { tempo: tempo(95.6, 0.6) }),
            rec("hi", { tempo: tempo(97.2, 0.8) }),
            rec("held", { status: "held", tempo: tempo(140, 0.99) }),
            rec("hidden", { status: "hidden", tempo: tempo(140, 0.99) }),
            rec("chant", { songId: "s2", tempo: tempo(84, 0.1) }),
            rec("new", { songId: "s3" }),
        ])
        expect(picks.get("s1")).toEqual({ recordingId: "hi", songId: "s1", bpm: 97, confidence: 0.8 })
        expect(picks.has("s2")).toBe(false)
        expect(picks.has("s3")).toBe(false)
        const by = Object.fromEntries(verdicts.map((v) => [v.recordingId, v]))
        expect(by.hi.used).toBe(true)
        expect(by.lo.used).toBe(false)
        expect(by.held.why).toMatch(/held/)
        expect(by.hidden.why).toMatch(/hidden/)
        expect(by.chant.why).toMatch(/no confident beat/)
        expect(by.new.why).toMatch(/back-fill/)
    })
})
