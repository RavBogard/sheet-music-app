"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { PeopleSection } from "@/components/admin/PeopleSection"
import { BandPrepSection } from "@/components/admin/BandPrepSection"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"
import { SystemSection } from "@/components/admin/SystemSection"
import { LiveServiceSection } from "@/components/admin/LiveServiceSection"
import { DeveloperToolsSection } from "@/components/admin/DeveloperToolsSection"
import { UsageAnalyticsSection } from "@/components/admin/UsageAnalyticsSection"
import { Loader2, Users, Music2, Volume2, Database, Settings, TerminalSquare, BarChart3, Activity } from "lucide-react"

type AdminTab = 'people' | 'live' | 'band-prep' | 'sound' | 'library' | 'analytics' | 'system' | 'dev'

export default function AdminSections() {
    const { isAdmin, isBandLeader, loading: authLoading } = useAuth()
    const [activeTab, setActiveTab] = useState<AdminTab>('people')

    if (authLoading) return (
        <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-violet-500" />
        </div>
    )
    if (!isBandLeader) return null

    const tabs = [
        { id: 'people', label: 'People & Roles', icon: Users, show: isBandLeader },
        { id: 'live', label: 'Live Service', icon: Activity, show: isBandLeader },
        { id: 'band-prep', label: 'Band Prep', icon: Music2, show: isAdmin },
        { id: 'sound', label: 'Sound System', icon: Volume2, show: isAdmin },
        { id: 'library', label: 'Library Data', icon: Database, show: isAdmin },
        { id: 'analytics', label: 'Usage Analytics', icon: BarChart3, show: isAdmin },
        { id: 'system', label: 'System Settings', icon: Settings, show: isAdmin },
        { id: 'dev', label: 'Developer Tools', icon: TerminalSquare, show: isAdmin },
    ].filter(t => t.show)

    return (
        <div className="flex flex-col md:flex-row gap-6">
            {/* Sidebar Navigation */}
            <div className="flex-[0_0_200px] flex flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 shrink-0 border-b md:border-b-0 md:border-r border-border pr-0 md:pr-4">
                <div className="flex md:flex-col gap-1 w-max md:w-full p-1">
                    {tabs.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as AdminTab)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                                    ${isActive
                                        ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }
                                `}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="whitespace-nowrap md:whitespace-normal">{tab.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-w-0">
                {activeTab === 'people' && <PeopleSection />}
                {activeTab === 'live' && <LiveServiceSection />}
                {activeTab === 'band-prep' && isAdmin && <BandPrepSection />}
                {activeTab === 'sound' && isAdmin && <SoundSystemSection />}
                {activeTab === 'library' && isAdmin && <LibraryDataSection />}
                {activeTab === 'analytics' && isAdmin && <UsageAnalyticsSection />}
                {activeTab === 'system' && isAdmin && <SystemSection />}
                {activeTab === 'dev' && isAdmin && <DeveloperToolsSection />}
            </div>
        </div>
    )
}
