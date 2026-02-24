"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, ShieldAlert, Users, Radio, Wrench, AreaChart, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { PeopleSection } from "@/components/admin/PeopleSection"
import { AccessAuditLog } from "@/components/admin/people/AccessAuditLog"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"
import { SystemSection } from "@/components/admin/SystemSection"
import { LiveServiceSection } from "@/components/admin/LiveServiceSection"
import { DeveloperToolsSection } from "@/components/admin/DeveloperToolsSection"
import { BandPrepSection } from "@/components/admin/BandPrepSection"
import { UsageAnalyticsSection } from "@/components/admin/UsageAnalyticsSection"

type ManageTab = 'overview' | 'people' | 'production' | 'system'

export default function ManagePage() {
    const { isAdmin, isBandLeader, loading } = useAuth()
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<ManageTab>('overview')
    const [advancedOpen, setAdvancedOpen] = useState(false)

    if (loading) return (
        <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
        </div>
    )

    if (!isBandLeader) {
        router.replace('/setlists')
        return null
    }

    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: AreaChart, show: isBandLeader },
        { id: 'people' as const, label: 'People & Access', icon: Users, show: isBandLeader },
        { id: 'production' as const, label: 'Live Production', icon: Radio, show: isBandLeader },
        { id: 'system' as const, label: 'System', icon: Wrench, show: isAdmin },
    ].filter(t => t.show)

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <ShieldAlert className="w-6 h-6 text-brand" />
                            Manage
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Team analytics, user management, and system administration
                        </p>
                    </div>
                </div>

                <div className="bg-card border border-border p-5 rounded-2xl">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Tab Navigation */}
                        <div className="flex-[0_0_auto] md:flex-[0_0_220px] flex flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 shrink-0 border-b md:border-b-0 md:border-r border-border pr-0 md:pr-4">
                            <p className="hidden md:block text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-2">Navigation</p>
                            <div className="flex md:flex-col gap-1.5 w-full p-1">
                                {tabs.map(tab => {
                                    const Icon = tab.icon
                                    const isActive = activeTab === tab.id
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            aria-pressed={isActive}
                                            className={`flex items-center justify-center md:justify-start gap-2.5 flex-1 md:flex-initial px-4 py-3 rounded-xl text-sm font-medium transition-colors text-center md:text-left border
                                                ${isActive
                                                    ? 'bg-brand/10 text-brand border-brand/30'
                                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground border-transparent'
                                                }
                                            `}
                                        >
                                            <Icon className="w-5 h-5 shrink-0" />
                                            <span className="whitespace-nowrap md:whitespace-normal">{tab.label}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0">
                            {activeTab === 'overview' && (
                                <div className="space-y-8 animate-in fade-in duration-300">
                                    <SectionErrorBoundary label="Band Prep">
                                        <BandPrepSection />
                                    </SectionErrorBoundary>
                                    <hr className="border-border" />
                                    <SectionErrorBoundary label="Usage Analytics">
                                        <UsageAnalyticsSection />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {activeTab === 'people' && (
                                <div className="space-y-8 animate-in fade-in duration-300">
                                    <SectionErrorBoundary label="People">
                                        <PeopleSection />
                                    </SectionErrorBoundary>
                                    {isAdmin && (
                                        <SectionErrorBoundary label="Access Audit">
                                            <AccessAuditLog />
                                        </SectionErrorBoundary>
                                    )}
                                </div>
                            )}

                            {activeTab === 'production' && (
                                <div className="space-y-12 animate-in fade-in duration-300">
                                    <SectionErrorBoundary label="Live Production">
                                        <LiveServiceSection />
                                    </SectionErrorBoundary>
                                    {isAdmin && (
                                        <>
                                            <hr className="border-border" />
                                            <SectionErrorBoundary label="Sound System">
                                                <SoundSystemSection />
                                            </SectionErrorBoundary>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === 'system' && isAdmin && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Danger Zone</h3>
                                            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                                                These settings affect application stability, core configuration, and raw data integrity.
                                                Do not modify unless you know what you are doing.
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setAdvancedOpen(!advancedOpen)}
                                        className="w-full flex items-center justify-between p-4 bg-muted/30 border border-border rounded-xl hover:bg-muted/50 transition-colors"
                                    >
                                        <span className="font-semibold text-sm">Reveal Advanced Tools</span>
                                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {advancedOpen && (
                                        <div className="space-y-12 pt-4 px-1 animate-in slide-in-from-top-4 fade-in duration-300">
                                            <SystemSection />
                                            <hr className="border-border" />
                                            <LibraryDataSection />
                                            <hr className="border-border" />
                                            <DeveloperToolsSection />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
