"use client"

import { UserProfile, UserRole, updateUserRole } from "@/lib/users-firebase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface UserRowProps {
    user: UserProfile
    currentUserUid: string
}

export function UserRow({ user, currentUserUid }: UserRowProps) {
    const [loading, setLoading] = useState(false)

    const handleRoleChange = async (newRole: string) => {
        if (user.uid === currentUserUid) {
            toast.error("You cannot change your own role here.")
            return
        }

        setLoading(true)
        try {
            await updateUserRole(user.uid, newRole as UserRole)
            toast.success(`Updated ${user.displayName} to ${newRole}`)
        } catch (e) {
            console.error(e)
            toast.error("Failed to update role")
        } finally {
            setLoading(false)
        }
    }

    const isPending = user.role === 'pending'
    const isAdmin = user.role === 'admin'

    return (
        <div className="flex items-center justify-between p-4 bg-zinc-900/50 border border-white/5 rounded-xl transition-all hover:bg-zinc-900">
            <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10 border border-white/10">
                    <AvatarImage src={user.photoURL} />
                    <AvatarFallback>{user.displayName?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div>
                    <div className="flex items-center gap-2">
                        <p className="font-medium text-white">{user.displayName}</p>
                        {isAdmin && <Badge variant="default" className="bg-purple-500/20 text-purple-300 border-purple-500/50">Admin</Badge>}
                        {isPending && <Badge variant="destructive" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50">Pending</Badge>}
                    </div>
                    <p className="text-xs text-zinc-400">{user.email}</p>
                    <p className="text-[10px] text-zinc-600 mt-1">
                        Joined {user.createdAt ? formatDistanceToNow(user.createdAt.toDate(), { addSuffix: true }) : "Unknown"}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Select
                    disabled={loading || user.uid === currentUserUid}
                    value={user.role}
                    onValueChange={handleRoleChange}
                >
                    <SelectTrigger className="w-32 bg-zinc-950 border-white/10 h-8 text-xs">
                        <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="leader">Leader</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
