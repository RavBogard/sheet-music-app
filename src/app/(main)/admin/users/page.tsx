"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { UserProfile, subscribeToAllUsers } from "@/lib/users-firebase"
import { UserRow } from "@/components/admin/UserRow"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react"

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
        })
        return () => unsubscribe()
    }, [isAdmin])

    if (authLoading || (isAdmin && loading)) {
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

                {/* DEBUG PANEL */}
                <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-xl text-xs font-mono space-y-2">
                    <h3 className="text-red-300 font-bold uppercase mb-2">Debug Diagnostics</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-zinc-500 block">User Email (Auth)</span>
                            <span className="text-white">{user?.email}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500 block">User UID</span>
                            <span className="text-white bg-black/50 px-2 py-1 rounded select-all">{user?.uid}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500 block">Firebase Project</span>
                            <span className="text-white">{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "Unknown"}</span>
                        </div>
                    </div>
                </div>

                {/* User List */}
                <div className="grid gap-3">
                    {users.map((u) => (
                        <UserRow
                            key={u.uid}
                            user={u}
                            currentUserUid={user?.uid || ""}
                        />
                    ))}

                    {users.length === 0 && (
                        <div className="text-center p-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                            No users found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
