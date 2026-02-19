"use client"

import { useAuth } from "@/lib/auth-context"
import { PeopleSection } from "@/components/admin/PeopleSection"
import { BandPrepSection } from "@/components/admin/BandPrepSection"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"
import { SystemSection } from "@/components/admin/SystemSection"
import { Loader2 } from "lucide-react"

/**
 * Admin dashboard — composed of four independent sections.
 * Each section manages its own state, subscriptions, and UI.
 * 
 * Previously a 726-line monolith, now a slim composition wrapper.
 */
export default function AdminSections() {
    const { isAdmin, isBandLeader, loading: authLoading } = useAuth()

    if (authLoading) return (
        <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-violet-500" />
        </div>
    )
    if (!isBandLeader) return null

    return (
        <div className="space-y-8">
            <PeopleSection />
            {isAdmin && <BandPrepSection />}
            {isAdmin && <SoundSystemSection />}
            {isAdmin && <LibraryDataSection />}
            {isAdmin && <SystemSection />}
        </div>
    )
}
