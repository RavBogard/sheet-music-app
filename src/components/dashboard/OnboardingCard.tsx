"use client"

import { useState } from "react"
import { doc, updateDoc } from "firebase/firestore"
import { getDb } from "@/lib/firebase"
import { Music2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PendingAccountIllustration } from "@/components/ui/illustrations"
import { NudgeAdminButton } from "@/components/people/NudgeAdminButton"
import { ONBOARDING_INSTRUMENT_KEYS } from "@/lib/musician-profile"
import { instrumentLabel } from "@/lib/instrument-labels"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

interface Props {
    role: string | undefined
    isMember: boolean
    profile: {
        viewedWelcomeModal?: boolean
        musicianProfile?: { instrument?: string }
    } | null
    congregationShortName: string
    userId: string | null | undefined
    /** Optional stagger class passed down from the dashboard for entrance animation */
    staggerClass?: string
}

type Variant = "pending" | "approved" | null

function pickVariant(role: string | undefined, isMember: boolean, profile: Props["profile"]): Variant {
    // Mutually exclusive — "pending" wins if both predicates overlap during a
    // role transition. This is the stacking-bug guard.
    if (role === "pending") return "pending"
    if (
        isMember &&
        profile &&
        !profile.musicianProfile?.instrument &&
        !profile.viewedWelcomeModal
    ) return "approved"
    return null
}

export function OnboardingCard({ role, isMember, profile, congregationShortName, userId, staggerClass }: Props) {
    const t = useT()
    const variant = pickVariant(role, isMember, profile)
    const [showQuickSetup, setShowQuickSetup] = useState(false)
    const [selectedInstrument, setSelectedInstrument] = useState("")
    const [saving, setSaving] = useState(false)

    if (!variant || !userId) return null

    async function saveInstrument(andMarkViewed: boolean) {
        if (!userId || !selectedInstrument) return
        setSaving(true)
        try {
            const db = await getDb()
            const userRef = doc(db, "users", userId)
            await updateDoc(userRef, { "musicianProfile.instrument": selectedInstrument })
            if (andMarkViewed) {
                const { markWelcomeModalViewed } = await import("@/lib/users-firebase")
                await markWelcomeModalViewed(userId)
            }
        } catch {
            // Silent fail — user can set instrument later in settings.
        } finally {
            setSaving(false)
            setShowQuickSetup(false)
        }
    }

    async function dismissWelcome() {
        if (!userId) return
        const { markWelcomeModalViewed } = await import("@/lib/users-firebase")
        await markWelcomeModalViewed(userId)
    }

    const selectId = variant === "pending" ? "instrument-select" : "instrument-select-approved"
    const pickerBlock = (
        <div className="space-y-3">
            <label htmlFor={selectId} className="text-sm font-medium text-foreground">
                {t("dashboard.onboardingInstrumentQuestion")}
            </label>
            <select
                id={selectId}
                value={selectedInstrument}
                onChange={e => setSelectedInstrument(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            >
                <option value="">{t("dashboard.onboardingSelectInstrument")}</option>
                {ONBOARDING_INSTRUMENT_KEYS.map(key => (
                    <option key={key} value={key}>{instrumentLabel(key, t)}</option>
                ))}
            </select>
            <div className="flex gap-2">
                <Button
                    className="flex-1"
                    disabled={!selectedInstrument || saving}
                    onClick={() => saveInstrument(variant === "approved")}
                >
                    {saving ? t("dashboard.onboardingSaving") : t("dashboard.onboardingSaveContinue")}
                </Button>
                {variant === "approved" && (
                    <Button
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={async () => {
                            await dismissWelcome()
                            setShowQuickSetup(false)
                        }}
                    >
                        {t("dashboard.onboardingSkip")}
                    </Button>
                )}
            </div>
        </div>
    )

    if (variant === "pending") {
        return (
            <div className={cn("bg-card border border-brand/15 rounded-2xl p-6 space-y-4", staggerClass)}>
                <div className="flex flex-col items-center text-center gap-3">
                    <PendingAccountIllustration className="w-20 h-20 text-muted-foreground" />
                    <div>
                        <h2 className="text-lg font-semibold">{t("dashboard.onboardingWelcome", { congregation: congregationShortName })}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t("dashboard.onboardingPendingBody")}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    {!showQuickSetup ? (
                        <Button variant="outline" className="w-full gap-2" onClick={() => setShowQuickSetup(true)}>
                            <Music2 className="w-4 h-4" />
                            {t("dashboard.onboardingSetUpMyInstrument")}
                        </Button>
                    ) : (
                        pickerBlock
                    )}
                    <NudgeAdminButton />
                </div>
            </div>
        )
    }

    // approved
    return (
        <div className={cn("bg-card border-2 border-brand/30 rounded-2xl p-6 space-y-4", staggerClass)}>
            <div className="text-center">
                <span className="text-2xl">{"\u{1F389}"}</span>
                <h2 className="text-lg font-semibold mt-2">{t("dashboard.onboardingApprovedTitle")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    {t("dashboard.onboardingApprovedBody")}
                </p>
            </div>
            {!showQuickSetup ? (
                <div className="flex gap-2">
                    <Button className="flex-1 gap-2" onClick={() => setShowQuickSetup(true)}>
                        <Music2 className="w-4 h-4" />
                        {t("dashboard.onboardingSetUpInstrument")}
                    </Button>
                    <Button variant="ghost" className="text-muted-foreground" onClick={dismissWelcome}>
                        {t("dashboard.onboardingSkip")}
                    </Button>
                </div>
            ) : (
                pickerBlock
            )}
        </div>
    )
}
