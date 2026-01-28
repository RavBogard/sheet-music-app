"use client"

export const dynamic = 'force-dynamic'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { UserProfile, subscribeToAllUsers } from "@/lib/users-firebase"
import { UserRow } from "@/components/admin/UserRow"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export default function AdminUsersPage() {
    const { user, isAdmin, loading: authLoading } = useAuth()
    const router = useRouter()
    const [users, setUsers] = useState<UserProfile[]>([])
    const [loading, setLoading] = useState(true)

    // Security Check
    useEffect(() => {
        if (!authLoading && !isAdmin) {
            router.push("/")
        }
    }, [authLoading, isAdmin, router])

    // Data Fetch
    useEffect(() => {
        if (!isAdmin) return

        const unsubscribe = subscribeToAllUsers((data) => {
            setUsers(data)
            setLoading(false)
        }, (error) => {
            console.error("Subscription failed:", error)
            setLoading(false) // Stop loading even if error
        })
        return () => unsubscribe()
    }, [isAdmin])

    if (authLoading) {
        return (
            <div className="h-screen bg-zinc-950 flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        )
    }

    if (!isAdmin) {
        return null // Will redirect
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push("/")}
                            className="rounded-full hover:bg-white/10"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <ShieldAlert className="w-6 h-6 text-purple-400" />
                                User Management
                            </h1>
                            <p className="text-zinc-400 text-sm">Manage access and roles for all registered users.</p>
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                    </div>
                )}

                {!loading && (
                    <div className="grid gap-3">
                        {users.map((u) => (
                            <UserRow
                                key={u.uid}
                                user={u}
                                currentUserUid={user?.uid || ""}
                            />
                        ))}

                        {users.length === 0 && (
                            <EmptyState
                                icon={ShieldAlert}
                                title="No users found"
                                description="There are no registered users yet, or you don't have permission to view them."
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
