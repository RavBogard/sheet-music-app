"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { doc, getDoc, updateDoc, setDoc, type DocumentReference } from "firebase/firestore"
import { getDb } from "@/lib/firebase"
import { MonitorSetupWizard } from "@/components/admin/MonitorSetupWizard"
import { DefaultChannelPicker } from "@/components/monitor/DefaultChannelPicker"
import { MonitorConfig } from "@/types/monitor"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { cn } from "@/lib/utils"
import {
    Loader2, Radio, CheckCircle,
    Save, Settings2, Download, Copy, KeyRound,
} from "lucide-react"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { useT } from "@/i18n/client"

const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
    bridgeUrl: "firestore://192.168.1.50",
    x32Address: "192.168.1.100",
    x32Port: 10023,
    monitorBuses: [1, 2, 3, 4, 5],
    busAssignments: {},
}

export function SoundSystemSection() {
    const [monitorLoading, setMonitorLoading] = useState(true)
    const [monitorConfigExists, setMonitorConfigExists] = useState(true)
    const [monitorSaving, setMonitorSaving] = useState(false)
    const [monitorSaved, setMonitorSaved] = useState(false)
    const [bridgeUrl, setBridgeUrl] = useState("")
    const [x32Address, setX32Address] = useState("")
    const [x32Port, setX32Port] = useState("10023")
    const [monitorBusesStr, setMonitorBusesStr] = useState("")
    const [bridgeStatus, setBridgeStatus] = useState<{ status: string; lastSeen: Date | null; x32Connected: boolean; clients: number; version: string } | null>(null)
    const [setupCode, setSetupCode] = useState<string | null>(null)
    const [setupCodeExpiry, setSetupCodeExpiry] = useState<number | null>(null)
    const [generatingCode, setGeneratingCode] = useState(false)
    const t = useT()

    // Firestore SDK is lazy-loaded; resolve the doc-ref in an effect so the
    // module-top stays free of `firebase/firestore`. useSafeFirestoreSync
    // tolerates a null ref until the lazy-load lands.
    const [configRef, setConfigRef] = useState<DocumentReference | null>(null)
    useEffect(() => {
        let cancelled = false
        void getDb().then((d) => {
            if (!cancelled) setConfigRef(doc(d, "config", "monitor"))
        })
        return () => { cancelled = true }
    }, [])
    const setupCodeControllerRef = useRef<AbortController | null>(null)
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Cancel all in-flight network and pending timers on unmount.
    useEffect(() => {
        return () => {
            setupCodeControllerRef.current?.abort()
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        }
    }, [])
    const { data: configData, loading: configLoading } = useSafeFirestoreSync<Partial<MonitorConfig>>(configRef)

    useEffect(() => {
        if (configLoading) return

        try {
            const data = configData
                ? { ...DEFAULT_MONITOR_CONFIG, ...configData }
                : DEFAULT_MONITOR_CONFIG

            setMonitorConfigExists(!!configData)
            setBridgeUrl(data.bridgeUrl)
            setX32Address(data.x32Address)
            setX32Port(String(data.x32Port))
            setMonitorBusesStr(data.monitorBuses.join(", "))

            const raw: any = configData || {}
            const bridge = raw?.bridge
            if (bridge?.lastSeen) {
                const ts = bridge.lastSeen
                let lastSeen: Date | null = null
                try {
                    if (ts.toDate) lastSeen = ts.toDate()
                    else if (ts.seconds) lastSeen = new Date(ts.seconds * 1000)
                } catch { /* ignore */ }
                setBridgeStatus({
                    status: bridge.status || "unknown",
                    lastSeen,
                    x32Connected: bridge.x32Connected ?? false,
                    clients: bridge.clients ?? 0,
                    version: bridge.version || "?",
                })
            }
        } catch (err) {
            logger.error("Failed to load monitor config:", err)
        } finally {
            setMonitorLoading(false)
        }
    }, [configData, configLoading])

    // BR-05: the manual "Scan for X32" flow was removed. It fetched `/scan` on
    // a bridge HTTP port that no longer exists — the WebSocket/HTTP server was
    // replaced by the Firestore transport, so the bridge starts no HTTP server.
    // The X32 is auto-discovered on bridge startup (x32-client discover()) and
    // its IP is written to config; manual entry remains as the override.

    const handleGenerateSetupCode = useCallback(async () => {
        setGeneratingCode(true)
        setupCodeControllerRef.current?.abort()
        const controller = new AbortController()
        setupCodeControllerRef.current = controller
        try {
            const { auth: firebaseAuth } = await import("@/lib/firebase")
            if (controller.signal.aborted) return
            const user = firebaseAuth.currentUser
            if (!user) throw new Error(t("admin-sound.notSignedIn"))
            const token = await user.getIdToken()
            if (controller.signal.aborted) return
            const res = await fetch("/api/bridge/setup-code", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })
            if (controller.signal.aborted) return
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || t("admin-sound.setupCodeFailed"))
            }
            const { code, expiresAt } = await res.json()
            if (controller.signal.aborted) return
            setSetupCode(code)
            setSetupCodeExpiry(expiresAt)
            toast.success(t("admin-sound.setupCodeGenerated"))
        } catch (err) {
            if ((err as Error).name === 'AbortError') return
            toast.error(err instanceof Error ? err.message : t("admin-sound.setupCodeFailed"))
        } finally {
            if (!controller.signal.aborted) setGeneratingCode(false)
        }
    }, [t])

    const handleMonitorSave = useCallback(async () => {
        setMonitorSaving(true); setMonitorSaved(false)
        const parsed = {
            bridgeUrl: bridgeUrl.trim(),
            x32Address: x32Address.trim(),
            x32Port: parseInt(x32Port) || 10023,
            monitorBuses: monitorBusesStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 16),
        }
        try {
            const db = await getDb()
            const ref = doc(db, "config", "monitor")
            const existing = await getDoc(ref)
            if (existing.exists()) { await updateDoc(ref, { ...parsed } as Record<string, unknown>) }
            else { await setDoc(ref, { ...parsed, busAssignments: {} }) }
            setMonitorSaved(true)
            toast.success(t("admin-sound.configSaved"))
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
            savedTimerRef.current = setTimeout(() => setMonitorSaved(false), 2000)
        } catch (err) {
            logger.error("Failed to save:", err)
            toast.error(t("admin-sound.configSaveFailed"))
        } finally { setMonitorSaving(false) }
    }, [bridgeUrl, x32Address, x32Port, monitorBusesStr, t])

    return (
        <SectionErrorBoundary label={t("admin-sound.title")}>
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-brand" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("admin-sound.title")}
                    </h2>
                </div>
                <Button onClick={handleMonitorSave} disabled={monitorSaving} size="sm" className="gap-2">
                    {monitorSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : monitorSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {monitorSaved ? t("admin-sound.saved") : t("admin-sound.saveSettings")}
                </Button>
            </div>

            <div className="pt-2">
                {monitorLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : !monitorConfigExists ? (
                    <MonitorSetupWizard
                        bridgeUrl={bridgeUrl}
                        setBridgeUrl={setBridgeUrl}
                        x32Address={x32Address}
                        setX32Address={setX32Address}
                        monitorBusesStr={monitorBusesStr}
                        setMonitorBusesStr={setMonitorBusesStr}
                        onComplete={() => { handleMonitorSave(); setMonitorConfigExists(true) }}
                    />
                ) : (
                    <div className="space-y-4">
                        {/* Bridge Installation */}
                        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
                            <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                <Download className="w-4 h-4 text-muted-foreground" />
                                {t("admin-sound.bridgeInstallTitle")}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {t("admin-sound.bridgeInstallHint")}
                            </p>
                            <div className="flex items-center gap-3">
                                <Button onClick={handleGenerateSetupCode} disabled={generatingCode} variant="outline" size="sm" className="gap-2">
                                    {generatingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                                    {t("admin-sound.generateSetupCode")}
                                </Button>
                                {setupCode && (
                                    <div className="flex items-center gap-2">
                                        <code className="bg-muted px-4 py-2 rounded-lg text-lg font-mono font-bold tracking-[0.3em] select-all">
                                            {setupCode}
                                        </code>
                                        <Button variant="ghost" size="icon" aria-label={t("admin-sound.copySetupCode")} className="min-h-11 min-w-11" onClick={() => {
                                            navigator.clipboard.writeText(setupCode)
                                            toast.success(t("admin-sound.copied"))
                                        }}>
                                            <Copy className="w-3 h-3" />
                                        </Button>
                                        {setupCodeExpiry && (
                                            <span className="text-xs text-muted-foreground">
                                                {t("admin-sound.setupCodeExpires", { minutes: Math.max(0, Math.round((setupCodeExpiry - Date.now()) / 60000)) })}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
                            <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                <Settings2 className="w-4 h-4 text-muted-foreground" />
                                {t("admin-sound.bridgeServerTitle")}
                            </h3>
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">{t("admin-sound.bridgeAddress")}</label>
                                {/* i18n-ignore: example address, machine text */}
                                <Input value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} placeholder="firestore://192.168.1.50" />
                                <p className="text-xs text-muted-foreground mt-1">{t("admin-sound.bridgeAddressHint")}</p>
                            </div>

                            {bridgeStatus && (
                                <div className={cn("flex items-center gap-3 rounded-lg px-4 py-3 text-sm",
                                    bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000
                                        ? "bg-success/10 border border-success/20"
                                        : "bg-destructive/10 border border-destructive/20"
                                )}>
                                    <div className={cn("w-2 h-2 rounded-full",
                                        bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000
                                            ? "bg-success animate-pulse" : "bg-destructive"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium">
                                            {bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000
                                                ? t("admin-sound.bridgeOnline") : t("admin-sound.bridgeOffline")}
                                        </span>
                                        {bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000 && (
                                            <span className="text-muted-foreground ms-2">
                                                {t("admin-sound.bridgeX32", { mark: bridgeStatus.x32Connected ? "✓" : "✗" })}
                                                {" · "}
                                                {t("admin-sound.bridgeClients", { count: bridgeStatus.clients })}
                                                {" · "}
                                                {t("admin-sound.bridgeVersion", { version: bridgeStatus.version })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">{t("admin-sound.x32Address")}</label>
                                    <Input value={x32Address} onChange={e => setX32Address(e.target.value)} placeholder={t("admin-sound.autoDetectedPlaceholder")} />
                                    <p className="text-xs text-muted-foreground mt-1">{t("admin-sound.x32AddressHint")}</p>
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">{t("admin-sound.oscPort")}</label>
                                    <Input value={x32Port} onChange={e => setX32Port(e.target.value)} placeholder="10023" />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <label className="text-sm text-muted-foreground">{t("admin-sound.monitorBuses")}</label>
                                    <span className="text-xs bg-brand/15 text-brand px-1.5 py-0.5 rounded font-mono">
                                        {t("admin-sound.busCount", { count: monitorBusesStr.split(",").map(s => s.trim()).filter(Boolean).length })}
                                    </span>
                                </div>
                                <Input value={monitorBusesStr} onChange={e => setMonitorBusesStr(e.target.value)} placeholder="1, 2, 3, 4, 5" />
                                <p className="text-xs text-muted-foreground mt-1">{t("admin-sound.monitorBusesHint")}</p>
                            </div>
                        </div>
                        {/* Default Channel Picker -- sound engineer picks global defaults */}
                        <DefaultChannelPicker />
                    </div>
                )}
            </div>
        </section>
        </SectionErrorBoundary>
    )
}
