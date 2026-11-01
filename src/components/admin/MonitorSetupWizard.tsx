"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, ArrowRight, ArrowLeft, Wifi, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"

interface WizardProps {
    bridgeUrl: string
    setBridgeUrl: (v: string) => void
    x32Address: string
    setX32Address: (v: string) => void
    monitorBusesStr: string
    setMonitorBusesStr: (v: string) => void
    onComplete: () => void
}

const STEPS = [
    { label: "admin-sound.wizardStepBridge", icon: Wifi, description: "admin-sound.wizardStepBridgeDescription" },
    { label: "admin-sound.wizardStepX32", icon: Radio, description: "admin-sound.wizardStepX32Description" },
    { label: "admin-sound.wizardStepBuses", icon: Radio, description: "admin-sound.wizardStepBusesDescription" },
] as const

export function MonitorSetupWizard({
    bridgeUrl, setBridgeUrl,
    x32Address, setX32Address,
    monitorBusesStr, setMonitorBusesStr,
    onComplete,
}: WizardProps) {
    const [step, setStep] = useState(0)
    const t = useT()

    const canAdvance = [
        () => bridgeUrl.trim().length > 5,           // Step 0: bridge URL
        () => x32Address.trim().length > 0,           // Step 1: X32 found
        () => monitorBusesStr.trim().length > 0,      // Step 2: buses set
    ]

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Progress */}
            <div className="flex border-b border-border">
                {STEPS.map((s, i) => {
                    const Icon = s.icon
                    return (
                        <div
                            key={i}
                            className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors",
                                i === step ? "bg-brand/10 text-foreground border-b-2 border-brand"
                                    : i < step ? "text-success" : "text-muted-foreground"
                            )}
                        >
                            {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{t(s.label)}</span>
                        </div>
                    )
                })}
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
                <div>
                    <h3 className="font-semibold text-sm">{t(STEPS[step].description)}</h3>
                </div>

                {step === 0 && (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            {t("admin-sound.wizardBridgeHint")}
                        </p>
                        <Input
                            value={bridgeUrl}
                            onChange={e => setBridgeUrl(e.target.value)}
                            // i18n-ignore: example address, machine text
                            placeholder="firestore://192.168.1.50"
                        />
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            {t("admin-sound.wizardX32Hint")}
                        </p>
                        <Input
                            value={x32Address}
                            onChange={e => setX32Address(e.target.value)}
                            placeholder={t("admin-sound.autoDetectedPlaceholder")}
                        />
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            {t("admin-sound.wizardBusesHint")}
                        </p>
                        <Input
                            value={monitorBusesStr}
                            onChange={e => setMonitorBusesStr(e.target.value)}
                            placeholder="1, 2, 3, 4, 5"
                        />
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between p-4 border-t border-border">
                <Button
                    variant="ghost"
                    onClick={() => setStep(s => s - 1)}
                    disabled={step === 0}
                    className="gap-2"
                >
                    <DirectionalIcon icon={ArrowLeft} className="w-4 h-4" /> {t("admin-sound.wizardBack")}
                </Button>

                {step < STEPS.length - 1 ? (
                    <Button
                        onClick={() => setStep(s => s + 1)}
                        disabled={!canAdvance[step]()}
                        className="gap-2"
                    >
                        {t("admin-sound.wizardNext")} <DirectionalIcon icon={ArrowRight} className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button onClick={onComplete} className="gap-2 bg-success hover:bg-success/90">
                        <CheckCircle className="w-4 h-4" /> {t("admin-sound.wizardFinish")}
                    </Button>
                )}
            </div>
        </div>
    )
}
