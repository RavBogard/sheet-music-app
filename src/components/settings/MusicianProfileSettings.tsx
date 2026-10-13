"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { MusicianProfile } from "@/types/models"
import { saveMusicianProfile, subscribeToMusicianProfile, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { INSTRUMENT_LABEL_KEYS as INSTRUMENT_LABEL, INSTRUMENT_NOTE_KEYS as INSTRUMENT_NOTE } from "@/lib/instrument-labels"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Guitar, Check, Phone, CalendarDays, Bell, Shield, Users, Star, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { SchedulingTier } from "@/types/models"
import { useFeature } from "@/lib/org/use-feature"
import { useT } from "@/i18n/client"

export function MusicianProfileSettings() {
    const { user } = useAuth()
    const t = useT()
    // Multi-tenant phase 6: the Email toggle is for scheduling emails.
    const schedulingEmailsOn = useFeature("schedulingEmails")
    const [profile, setProfile] = useState<MusicianProfile>({})
    const [saving, setSaving] = useState(false)
    const [generatingCal, setGeneratingCal] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Subscribe to current profile
    useEffect(() => {
        if (!user) return
        const unsub = subscribeToMusicianProfile(user.uid, (p) => {
            if (p) setProfile(p)
            setLoaded(true)
        })
        return unsub
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid])

    const updateField = <K extends keyof MusicianProfile>(key: K, value: MusicianProfile[K]) => {
        setProfile(prev => ({ ...prev, [key]: value }))
        setHasChanges(true)
    }

    const selectInstrument = (instrumentKey: string) => {
        const preset = INSTRUMENT_PRESETS[instrumentKey]
        if (!preset) return

        setProfile(prev => ({
            ...prev,
            instrument: instrumentKey,
            defaultTransposition: preset.transposition,
            // Set sensible defaults based on instrument
            preferCapo: preset.suggestCapo || false,
            preferFlats: preset.transposition !== 0, // Transposing instruments often prefer flats
        }))
        setHasChanges(true)
    }

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        try {
            await saveMusicianProfile(profile)
            setHasChanges(false)
            toast.success(t("settings.profile.saved"))
        } catch (err: unknown) {
            toast.error(t("settings.profile.saveFailed", { error: err instanceof Error ? err.message : t("settings.profile.unknownError") }))
        } finally {
            setSaving(false)
        }
    }

    if (!loaded) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 bg-muted rounded w-48" />
                <div className="h-32 bg-muted rounded-xl" />
            </div>
        )
    }

    const currentPreset = profile.instrument ? INSTRUMENT_PRESETS[profile.instrument] : null
    // One sentence with a bold phrase inside it: split the template at {emphasis}.
    const [nudgeBefore, nudgeAfter = ""] = t("settings.profile.nudge").split("{emphasis}")

    return (
        <div className="space-y-6">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                    <Guitar className="w-5 h-5 text-brand" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("settings.profile.title")}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t("settings.profile.description")}
                    </p>
                </div>
            </div>

            {/* Nudge: no instrument configured yet */}
            {!profile.instrument && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-lg mt-0.5">🎵</span>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                        {nudgeBefore}<strong>{t("settings.profile.nudgeEmphasis")}</strong>{nudgeAfter}
                    </p>
                </div>
            )}

            {/* Instrument Selection */}
            <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">{t("settings.profile.instrument")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(INSTRUMENT_PRESETS).map(([key, preset]) => (
                        <button
                            key={key}
                            onClick={() => selectInstrument(key)}
                            className={`
                                relative px-3 py-2.5 rounded-xl text-start transition-all duration-200 text-sm
                                ${profile.instrument === key
                                    ? 'bg-brand/10 border-brand/50 text-foreground ring-1 ring-brand/30'
                                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                                }
                                border
                            `}
                        >
                            <div className="font-medium">{key in INSTRUMENT_LABEL ? t(INSTRUMENT_LABEL[key]) : preset.label}</div>
                            {preset.transposition !== 0 && (
                                <div className="text-xs opacity-60 mt-0.5">
                                    {t("settings.profile.semitones", {
                                        count: Math.abs(preset.transposition),
                                        offset: `${preset.transposition > 0 ? '+' : ''}${preset.transposition}`,
                                    })}
                                </div>
                            )}
                            {profile.instrument === key && (
                                <Check className="absolute top-2 end-2 w-3.5 h-3.5 text-brand" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Transposition Details (shown when instrument selected) */}
            {currentPreset && (
                <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border">
                    <p className="text-sm text-muted-foreground">{profile.instrument && profile.instrument in INSTRUMENT_NOTE ? t(INSTRUMENT_NOTE[profile.instrument]) : currentPreset.description}</p>

                    {/* Custom Transposition Override */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            {t("settings.profile.transpositionOffset")}
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => updateField('defaultTransposition', (profile.defaultTransposition || 0) - 1)}
                                className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors font-bold"
                            >
                                −
                            </button>
                            <div className="w-16 text-center font-mono text-lg text-foreground">
                                {(profile.defaultTransposition || 0) > 0 ? '+' : ''}{profile.defaultTransposition || 0}
                            </div>
                            <button
                                onClick={() => updateField('defaultTransposition', (profile.defaultTransposition || 0) + 1)}
                                className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors font-bold"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Capo Preferences (for instruments that use capo) */}
                    {currentPreset?.suggestCapo && (
                        <div className="space-y-3 pt-2 border-t border-border">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">
                                    {t("settings.profile.showCapo")}
                                </label>
                                <button
                                    onClick={() => updateField('preferCapo', !profile.preferCapo)}
                                    className={`
                                        w-11 h-6 rounded-full transition-all duration-200 relative
                                        ${profile.preferCapo ? 'bg-brand' : 'bg-muted border border-border'}
                                    `}
                                >
                                    <div className={`
                                        w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all duration-200
                                        ${profile.preferCapo ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'}
                                    `} />
                                </button>
                            </div>
                            {profile.preferCapo && (
                                <div className="space-y-2">
                                    <label className="text-sm text-muted-foreground">
                                        {t("settings.profile.defaultCapoFret")}
                                    </label>
                                    <div className="flex gap-1.5">
                                        {[0, 1, 2, 3, 4, 5, 6, 7].map(fret => (
                                            <button
                                                key={fret}
                                                onClick={() => updateField('preferredCapoFret', fret)}
                                                className={`
                                                    w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200
                                                    ${profile.preferredCapoFret === fret
                                                        ? 'bg-brand text-brand-foreground'
                                                        : 'bg-muted border border-border text-muted-foreground hover:text-foreground'
                                                    }
                                                `}
                                            >
                                                {fret || '—'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Flat/Sharp Preference */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <label className="text-sm font-medium text-foreground">
                            {t("settings.profile.preferFlats")}
                        </label>
                        <button
                            onClick={() => updateField('preferFlats', !profile.preferFlats)}
                            className={`
                                w-11 h-6 rounded-full transition-all duration-200 relative
                                ${profile.preferFlats ? 'bg-brand' : 'bg-muted border border-border'}
                            `}
                        >
                            <div className={`
                                w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all duration-200
                                ${profile.preferFlats ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'}
                            `} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Scheduling Settings ─── */}
            <div className="space-y-5 pt-6 border-t border-border/60">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                        <CalendarDays className="w-5 h-5 text-brand" />
                    </div>
                    <div>
                        <h4 className="text-base font-semibold text-foreground">{t("settings.scheduling.title")}</h4>
                        <p className="text-sm text-muted-foreground">{t("settings.scheduling.description")}</p>
                    </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-2 p-4 rounded-xl bg-muted/20 border border-border/40">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("settings.scheduling.phone")}
                    </label>
                    <Input
                        type="tel"
                        placeholder={t("settings.scheduling.phonePlaceholder")}
                        value={profile.phone || ''}
                        onChange={(e) => updateField('phone', e.target.value)}
                        className="h-10 text-sm rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">{t("settings.scheduling.phoneHint")}</p>
                </div>

                {/* Notification Preferences */}
                <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/40">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("settings.scheduling.notifications")}
                    </label>
                    <div className="space-y-3">
                        {([
                            { key: 'email' as const, label: t("settings.scheduling.email"), desc: t("settings.scheduling.emailDescription") },
                            { key: 'sms' as const, label: t("settings.scheduling.sms"), desc: t("settings.scheduling.smsDescription") },
                            { key: 'push' as const, label: t("settings.scheduling.push"), desc: t("settings.scheduling.pushDescription") },
                        ]).filter(({ key }) => key !== 'email' || schedulingEmailsOn).map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between py-1">
                                <div>
                                    <span className="text-sm font-medium text-foreground">{label}</span>
                                    <p className="text-xs text-muted-foreground">{desc}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const current = profile.notificationPreferences || { email: true, sms: false, push: true }
                                        updateField('notificationPreferences', {
                                            ...current,
                                            [key]: !current[key],
                                        })
                                    }}
                                    className={`
                                        w-11 h-6 rounded-full transition-all duration-200 relative
                                        ${(profile.notificationPreferences?.[key] ?? (key === 'email' || key === 'push'))
                                            ? 'bg-brand' : 'bg-muted border border-border'}
                                    `}
                                >
                                    <div className={`
                                        w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all duration-200
                                        ${(profile.notificationPreferences?.[key] ?? (key === 'email' || key === 'push'))
                                            ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'}
                                    `} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Calendar Feed URL */}
                <div className="space-y-2 p-4 rounded-xl bg-muted/20 border border-border/40">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("settings.scheduling.calendarTitle")}
                    </label>
                    {profile.calendarFeedToken ? (
                        <>
                            <div className="flex gap-2">
                                <Input
                                    readOnly
                                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/scheduling/calendar-feed/${profile.calendarFeedToken}`}
                                    className="h-9 text-xs font-mono bg-muted rounded-lg"
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 shrink-0 text-xs rounded-lg"
                                    onClick={() => {
                                        const url = `${window.location.origin}/api/scheduling/calendar-feed/${profile.calendarFeedToken}`
                                        navigator.clipboard.writeText(url)
                                        toast.success(t("settings.scheduling.calendarCopied"))
                                    }}
                                >
                                    {t("settings.scheduling.copy")}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t("settings.scheduling.calendarAddHint")}
                            </p>
                        </>
                    ) : (
                        <div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1.5 rounded-lg fluid-interaction"
                                disabled={generatingCal}
                                onClick={async () => {
                                    if (!user) return
                                    setGeneratingCal(true)
                                    try {
                                        const { generateCalendarFeedToken } = await import('@/lib/scheduling-firebase')
                                        const token = await generateCalendarFeedToken(user.uid)
                                        setProfile(prev => ({ ...prev, calendarFeedToken: token }))
                                        toast.success(t("settings.scheduling.calendarGenerated"))
                                    } catch {
                                        toast.error(t("settings.scheduling.calendarGenerateFailed"))
                                    } finally {
                                        setGeneratingCal(false)
                                    }
                                }}
                            >
                                {generatingCal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                                {generatingCal ? t("settings.scheduling.calendarGenerating") : t("settings.scheduling.calendarGenerate")}
                            </Button>
                            <p className="text-xs text-muted-foreground mt-1.5">
                                {t("settings.scheduling.calendarGenerateHint")}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Save Button */}
            {hasChanges && (
                <div className="animate-spring">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full h-11 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-semibold fluid-interaction shadow-sm shadow-brand/20"
                    >
                        {saving ? t("settings.profile.saving") : t("settings.profile.save")}
                    </Button>
                </div>
            )}
        </div>
    )
}
