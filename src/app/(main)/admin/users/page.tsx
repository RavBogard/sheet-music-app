"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { UserProfile, subscribeToAllUsers, updateUserRole, UserRole } from "@/lib/users-firebase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Shield, ShieldAlert, ShieldCheck, User, UserCheck, UserX } from "lucide-react"

export default function AdminUsersPage() {
    const { user, profile, isAdmin, loading } = useAuth()
    const router = useRouter()
    const [users, setUsers] = useState<UserProfile[]>([])
    const [loadingUsers, setLoadingUsers] = useState(true)

    // Redirect if not admin
    useEffect(() => {
        if (!loading && !isAdmin) {
            // Temporary backdoor for the developer/owner to claim access if no admins exist?
            // For now, strict redirect.
            // router.push("/")
        }
    }, [isAdmin, loading, router])

    // Fetch users
    useEffect(() => {
        if (!isAdmin) return
        const unsubscribe = subscribeToAllUsers((data) => {
            setUsers(data)
            setLoadingUsers(false)
        })
        return () => unsubscribe()
    }, [isAdmin])

    const handleRoleChange = async (uid: string, newRole: UserRole) => {
        try {
            await updateUserRole(uid, newRole)
        } catch (e) {
            console.error("Failed to update role", e)
            alert("Failed to update role")
        }
    }

    if (loading || loadingUsers && isAdmin) {
        return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>
    }

    if (!isAdmin) {
        return (
            <div className="p-10 text-center space-y-4">
                <h1 className="text-2xl font-bold text-red-400">Access Denied</h1>
                <p>You must be an Admin to view this page.</p>
                <p className="text-sm text-zinc-500">Your current role: <span className="text-white font-mono">{profile?.role || "none"}</span></p>
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg max-w-md mx-auto text-left text-xs font-mono text-zinc-400">
                    <p>DEBUG INFO:</p>
                    <p>UID: {user?.uid}</p>
                    <p>Email: {user?.email}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <ShieldAlert className="h-8 w-8 text-red-500" />
                        User Management
                    </h1>
                    <p className="text-zinc-400">Manage access and permissions.</p>
                </div>
                <div className="bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800 text-sm">
                    Total Users: <span className="font-bold text-white">{users.length}</span>
                </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-zinc-950/50 text-zinc-400 text-sm uppercase">
                        <tr>
                            <th className="p-4 font-medium">User</th>
                            <th className="p-4 font-medium">Email</th>
                            <th className="p-4 font-medium">Role</th>
                            <th className="p-4 font-medium">Joined</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                        {users.map(u => (
                            <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                                            {u.photoURL ? (
                                                <img src={u.photoURL} alt={u.displayName} className="w-full h-full" />
                                            ) : (
                                                <User className="h-4 w-4 text-zinc-500" />
                                            )}
                                        </div>
                                        <span className="font-medium">{u.displayName}</span>
                                        {u.uid === user?.uid && <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">You</span>}
                                    </div>
                                </td>
                                <td className="p-4 text-zinc-400 font-mono text-sm">{u.email}</td>
                                <td className="p-4">
                                    <BadgeRole role={u.role} />
                                </td>
                                <td className="p-4 text-zinc-500 text-sm">
                                    {u.createdAt?.toDate().toLocaleDateString()}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        {u.role !== 'admin' && (
                                            <>
                                                {u.role === 'pending' && (
                                                    <Button size="sm" onClick={() => handleRoleChange(u.uid, 'member')} className="bg-green-600 hover:bg-green-500">
                                                        Approve
                                                    </Button>
                                                )}
                                                {u.role !== 'pending' && (
                                                    <Button size="sm" variant="ghost" onClick={() => handleRoleChange(u.uid, 'pending')} className="text-zinc-500 hover:text-red-400 hover:bg-red-900/20">
                                                        <UserX className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                {u.role === 'member' && (
                                                    <Button size="sm" variant="outline" onClick={() => handleRoleChange(u.uid, 'leader')} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                                                        Promote
                                                    </Button>
                                                )}
                                                {u.role === 'leader' && (
                                                    <Button size="sm" variant="ghost" onClick={() => handleRoleChange(u.uid, 'member')} className="text-zinc-400">
                                                        Demote
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                        {/* Danger Zone: Make Admin */}
                                        {u.role === 'leader' && (
                                            <Button size="sm" variant="ghost" onClick={() => handleRoleChange(u.uid, 'admin')} className="text-red-900 hover:bg-red-500 hover:text-white" title="Make Admin">
                                                <Shield className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function BadgeRole({ role }: { role: UserRole }) {
    switch (role) {
        case 'admin':
            return <div className="inline-flex items-center gap-1 bg-red-500/20 text-red-300 px-2 py-1 rounded text-xs font-bold ring-1 ring-red-500/50"><ShieldAlert className="h-3 w-3" /> ADMIN</div>
        case 'leader':
            return <div className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs font-bold ring-1 ring-blue-500/50"><ShieldCheck className="h-3 w-3" /> LEADER</div>
        case 'member':
            return <div className="inline-flex items-center gap-1 bg-green-500/20 text-green-300 px-2 py-1 rounded text-xs font-bold ring-1 ring-green-500/50"><UserCheck className="h-3 w-3" /> MEMBER</div>
        default:
            return <div className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-400 px-2 py-1 rounded text-xs font-bold"><UserX className="h-3 w-3" /> PENDING</div>
    }
}
