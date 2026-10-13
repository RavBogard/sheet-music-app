import type { T } from "@/i18n/core"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"

/**
 * Phase 7: display text for the fixed instrument presets. Stored values stay
 * the INSTRUMENT_PRESETS slug keys (`musicianProfile.instrument`); the English
 * of each key equals the preset's `label` / `description`. MCP tools keep
 * reading `INSTRUMENT_PRESETS[k].label` (English by ruling).
 */
export const INSTRUMENT_LABEL_KEYS: Readonly<Record<string, string>> = {
    acoustic_guitar: "settings.instruments.acousticGuitar",
    electric_bass: "settings.instruments.electricBass",
    mandolin: "settings.instruments.mandolin",
    electric_guitar: "settings.instruments.electricGuitar",
    classical_guitar: "settings.instruments.classicalGuitar",
    voice: "settings.instruments.voice",
    hand_drums: "settings.instruments.handDrums",
    violin: "settings.instruments.violin",
    eb_alto_sax: "settings.instruments.ebAltoSax",
    bb_tenor_sax: "settings.instruments.bbTenorSax",
    bb_soprano_sax: "settings.instruments.bbSopranoSax",
    bb_clarinet: "settings.instruments.bbClarinet",
    bb_trumpet: "settings.instruments.bbTrumpet",
    f_horn: "settings.instruments.fHorn",
    trombone: "settings.instruments.trombone",
    piano: "settings.instruments.piano",
    ukulele: "settings.instruments.ukulele",
    other: "settings.instruments.other",
}

/** Transposition description per preset (same English as INSTRUMENT_PRESETS[k].description). */
export const INSTRUMENT_NOTE_KEYS: Readonly<Record<string, string>> = {
    acoustic_guitar: "settings.instrumentNotes.concertPitch",
    electric_bass: "settings.instrumentNotes.concertPitchOctaveLower",
    mandolin: "settings.instrumentNotes.concertPitch",
    electric_guitar: "settings.instrumentNotes.concertPitch",
    classical_guitar: "settings.instrumentNotes.concertPitch",
    voice: "settings.instrumentNotes.concertPitch",
    hand_drums: "settings.instrumentNotes.rhythmOnly",
    violin: "settings.instrumentNotes.concertPitch",
    eb_alto_sax: "settings.instrumentNotes.major6thLower",
    bb_tenor_sax: "settings.instrumentNotes.major9thLower",
    bb_soprano_sax: "settings.instrumentNotes.wholeStepLower",
    bb_clarinet: "settings.instrumentNotes.wholeStepLower",
    bb_trumpet: "settings.instrumentNotes.wholeStepLower",
    f_horn: "settings.instrumentNotes.fifthLower",
    trombone: "settings.instrumentNotes.concertPitch",
    piano: "settings.instrumentNotes.concertPitch",
    ukulele: "settings.instrumentNotes.concertPitch",
    other: "settings.instrumentNotes.custom",
}

/** An instrument slug's display label in the UI language; unknown slugs show the preset label, else the slug. */
export function instrumentLabel(slug: string, t: T): string {
    const key = INSTRUMENT_LABEL_KEYS[slug]
    if (key) return t(key)
    return INSTRUMENT_PRESETS[slug]?.label ?? slug
}

/** A preset's transposition description in the UI language ("" for an unknown slug). */
export function instrumentNote(slug: string, t: T): string {
    const key = INSTRUMENT_NOTE_KEYS[slug]
    if (key) return t(key)
    return INSTRUMENT_PRESETS[slug]?.description ?? ""
}
