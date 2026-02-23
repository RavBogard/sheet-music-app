"use client"

import { useState, useEffect, useMemo } from "react"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { SetlistTask, UserProfile } from "@/types/models"
import { subscribeToAllUsers } from "@/lib/users-firebase"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CheckCircle2, Circle, Loader2, Plus, GripVertical, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface TaskSheetProps {
    setlistId: string
    setlistName: string
    eventDate: Date | null | undefined
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function TaskSheet({ setlistId, setlistName, eventDate, open, onOpenChange }: TaskSheetProps) {
    const { user: currentUser, isAdmin, isBandLeader } = useAuth()
    const [tasks, setTasks] = useState<SetlistTask[]>([])
    const [loadingTasks, setLoadingTasks] = useState(true)

    // Form State
    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [selectedAssigneeUid, setSelectedAssigneeUid] = useState<string>("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Users
    const [allUsers, setAllUsers] = useState<UserProfile[]>([])
    const canCreate = isAdmin || isBandLeader

    useEffect(() => {
        if (!open) return

        const unsubUsers = subscribeToAllUsers((users) => {
            const active = users.filter(u =>
                u.role === 'musician' || u.role === 'band_leader' || u.role === 'admin' || u.role === ('leader' as string)
            )
            setAllUsers(active)
            if (!selectedAssigneeUid && currentUser) {
                setSelectedAssigneeUid(currentUser.uid)
            }
        })

        const q = query(
            collection(db, 'tasks'),
            where('setlistId', '==', setlistId)
        )
        const unsubTasks = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => doc.data() as SetlistTask)
            // Sort client side by createdAt to avoid needing an index
            docs.sort((a, b) => {
                const aTime = (a.createdAt as any)?.seconds || 0
                const bTime = (b.createdAt as any)?.seconds || 0
                return bTime - aTime // Newest first
            })
            setTasks(docs)
            setLoadingTasks(false)
        })

        return () => {
            unsubUsers()
            unsubTasks()
        }
    }, [open, setlistId, currentUser])

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTaskTitle.trim() || !selectedAssigneeUid) return

        const assignee = allUsers.find(u => u.uid === selectedAssigneeUid)
        if (!assignee) return

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/tasks/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    setlistId,
                    setlistName,
                    eventDate: eventDate ? eventDate.toISOString() : null,
                    title: newTaskTitle.trim(),
                    assigneeId: assignee.uid,
                    assigneeName: assignee.displayName || assignee.email?.split('@')[0],
                    assigneeEmail: assignee.email,
                    notifiedEmails: [], // Extendable later if we want a CC field
                })
            })

            if (!res.ok) throw new Error(await res.text())
            toast.success("Task assigned successfully!")
            setNewTaskTitle("")
        } catch (err) {
            console.error(err)
            toast.error("Failed to create task")
        } finally {
            setIsSubmitting(false)
        }
    }

    const toggleCompletion = async (task: SetlistTask) => {
        // Optimistic UI toggle is tough without breaking the snapshot listen, 
        // we'll rely on the snapshot being fast, but we can visually disable the button
        const newStatus = task.status === 'completed' ? 'todo' : 'completed'

        try {
            const res = await fetch('/api/tasks/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: task.id,
                    updates: { status: newStatus }
                })
            })
            if (!res.ok) throw new Error(await res.text())
        } catch (err) {
            console.error(err)
            toast.error("Failed to update status")
        }
    }

    const deleteTask = async (taskId: string) => {
        if (!confirm("Delete this task entirely?")) return
        try {
            const res = await fetch(`/api/tasks/delete?id=${taskId}`, { method: 'DELETE' })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Task deleted")
        } catch (err) {
            console.error(err)
            toast.error("Failed to delete task")
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md flex flex-col p-0 border-l border-border/50 shadow-2xl">
                <SheetHeader className="p-6 pb-4 border-b border-border/50 bg-muted/20">
                    <SheetTitle>Setlist Workflow</SheetTitle>
                    <SheetDescription>
                        Assign tracking tasks for {setlistName}.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 p-6">
                        {loadingTasks ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : tasks.length === 0 ? (
                            <div className="text-center p-8 text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                                <GripVertical className="h-8 w-8 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">No tasks assigned yet.</p>
                                {canCreate && <p className="text-xs mt-1">Use the form below to add one.</p>}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {tasks.map(task => {
                                    const isCompleted = task.status === 'completed'
                                    const isMine = currentUser?.uid === task.assigneeId
                                    const canCheckOff = isMine || canCreate

                                    return (
                                        <div key={task.id} className={cn(
                                            "group flex items-start gap-3 p-3 rounded-xl border transition-all duration-200",
                                            isCompleted
                                                ? "bg-muted/30 border-border/50 opacity-70"
                                                : "bg-card border-border shadow-sm hover:border-primary/30 hover:shadow-primary/5"
                                        )}>
                                            <button
                                                disabled={!canCheckOff}
                                                onClick={() => toggleCompletion(task)}
                                                className={cn(
                                                    "mt-0.5 shrink-0 transition-colors",
                                                    !canCheckOff ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                                                    isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"
                                                )}
                                            >
                                                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <p className={cn("text-sm font-medium", isCompleted && "line-through text-muted-foreground")}>
                                                    {task.title}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] uppercase font-bold tracking-wide bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                                                        {task.assigneeName}
                                                    </span>
                                                    {isCompleted && task.completedAt && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Done
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {canCreate && (
                                                <button
                                                    onClick={() => deleteTask(task.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all shrink-0"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    {canCreate && (
                        <div className="p-4 border-t border-border/50 bg-muted/10">
                            <form onSubmit={handleCreateTask} className="grid gap-3">
                                <div className="grid grid-cols-[1fr_120px] gap-2">
                                    <Input
                                        placeholder="Add chart wrapper..."
                                        value={newTaskTitle}
                                        onChange={e => setNewTaskTitle(e.target.value)}
                                        className="h-9 shrink-0"
                                        disabled={isSubmitting}
                                    />
                                    <Select
                                        value={selectedAssigneeUid}
                                        onValueChange={setSelectedAssigneeUid}
                                        disabled={isSubmitting || allUsers.length === 0}
                                    >
                                        <SelectTrigger className="h-9 truncate">
                                            <SelectValue placeholder="Assign To" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allUsers.map(u => (
                                                <SelectItem key={u.uid} value={u.uid}>
                                                    {u.displayName || u.email?.split('@')[0]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button type="submit" className="w-full gap-2 transition-all active:scale-[0.98]" disabled={isSubmitting || !newTaskTitle.trim()}>
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    Assign Task
                                </Button>
                            </form>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
