"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Radar, CheckCircle, ArrowRight, ArrowLeft, Wifi, Radio } from "lucide-react"

interface WizardProps {
    bridgeUrl: string
    setBridgeUrl: (v: string) => void
    x32Address: string
    setX32Address: (v: string) => void
    onScan: () => Promise<void>
    scanning: boolean
    scanResult: string | null
    monitorBusesStr: string
    setMonitorBusesStr: (v: string) => void
    onComplete: () => void
}

const STEPS = [
    { label: "Bridge", icon: Wifi, description: "Connect to the bridge server" },
    { label: "X32", icon: Radio, description: "Find your Behringer X32" },
    { label: "Buses", icon: Radio, description: "Choose monitor buses" },
]

export function MonitorSetupWizard({
    bridgeUrl, setBridgeUrl,
    x32Address, setX32Address,
    onScan, scanning, scanResult,
    monitorBusesStr, setMonitorBusesStr,
    onComplete,
}: WizardProps) {
    const [step, setStep] = useState(0)

    const canAdvance = [
        () => bridgeUrl.trim().length > 5,           // Step 0: bridge URL
        () => x32Address.trim().length > 0,           // Step 1: X32 found
        () => monitorBusesStr.trim().length > 0,      // Step 2: buses set
    ]

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Progress */}
            <div className="flex border-b border-border">
                {STEPS.map((s, i) => {
                    const Icon = s.icon
                    return (
                        <div
                            key={i}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${
                                i === step ? "bg-blue-500/10 text-blue-400 border-b-2 border-blue-500"
                                    : i < step ? "text-success" : "text-muted-foreground"
                            }`}
                        >
                            {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{s.label}</span>
                        </div>
                    )
                })}
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
                <div>
                    <h3 className="font-semibold text-sm">{STEPS[step].description}</h3>
                </div>

                {step === 0 && (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Enter the WebSocket URL of the bridge server running on your production machine.
                        </p>
                        <Input
                            value={bridgeUrl}
                            onChange={e => setBridgeUrl(e.target.value)}
                            placeholder="wss://192.168.1.50:9001"
                        />
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Scan your network for the X32, or enter its IP manually.
                        </p>
                        <div className="flex gap-2">
                            <Input
                                value={x32Address}
                                onChange={e => setX32Address(e.target.value)}
                                placeholder="Auto-detected"
                                className="flex-1"
                            />
                            <Button variant="outline" onClick={onScan} disabled={scanning}>
                                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                                <span className="ml-2">Scan</span>
                            </Button>
                        </div>
                        {scanResult && (
                            <p className={`text-xs ${scanResult.includes("Found") ? "text-success" : "text-yellow-500"}`}>
                                {scanResult}
                            </p>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Which X32 mix buses are used as monitor sends? (1–16, comma-separated)
                        </p>
                        <Input
                            value={monitorBusesStr}
                            onChange={e => setMonitorBusesStr(e.target.value)}
                            placeholder="1, 2, 3, 4"
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
                    <ArrowLeft className="w-4 h-4" /> Back
                </Button>

                {step < STEPS.length - 1 ? (
                    <Button
                        onClick={() => setStep(s => s + 1)}
                        disabled={!canAdvance[step]()}
                        className="gap-2"
                    >
                        Next <ArrowRight className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button onClick={onComplete} className="gap-2 bg-success hover:bg-success/90">
                        <CheckCircle className="w-4 h-4" /> Save & Finish
                    </Button>
                )}
            </div>
        </div>
    )
}
