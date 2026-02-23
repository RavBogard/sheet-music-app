"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/firebase"
import { collection, query, where, onSnapshot, limit } from "firebase/firestore"
import { SetlistTask } from "@/types/models"

import { Loader2, ListTodo, Circle, CheckCircle2, Calendar, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

export default function TasksDashboardPage() {
    const { user, isAdmin, isBandLeader } = useAuth()
    const router = useRouter()

    const [tasks, setTasks] = useState<SetlistTask[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<'my_tasks' | 'overview'>('my_tasks')

    const canSeeOverview = isAdmin || isBandLeader

    useEffect(() => {
        if (!user) {
            // Need a valid user to show tasks
            const timeout = setTimeout(() => {
                if (!user) setLoading(false)
            }, 1000)
            return () => clearTimeout(timeout)
        }

        const tasksRef = collection(db, 'tasks')
        let q;

        if (viewMode === 'my_tasks') {
            // We need a composite index for assigneeId + status (ascending) + eventDate (ascending)
            // But since eventDate might be missing, let's just query by assigneeId and order client-side to avoid strict index matching first,
            // or query by assigneeId and status=='todo'.
            q = query(
                tasksRef,
                where('assigneeId', '==', user.uid),
                where('status', '==', 'todo'),
                limit(100)
            )
        } else {
            // Overview: all outstanding tasks across the congregation
            q = query(
                tasksRef,
                where('status', '==', 'todo'),
                limit(100)
            )
        }

        const unsub = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(d => d.data() as SetlistTask)
            // Client side sort: EventDate ascending, then Priority (null dates last)
            fetched.sort((a, b) => {
                const aTime = (a.eventDate as any)?.seconds || Number.MAX_SAFE_INTEGER
                const bTime = (b.eventDate as any)?.seconds || Number.MAX_SAFE_INTEGER
                return aTime - bTime
            })
            setTasks(fetched)
            setLoading(false)
        }, (error) => {
            console.error("Tasks snapshot error:", error)
            setLoading(false)
            // It might be a missing index error, will log nicely.
            if (error.message.includes('index')) {
                toast.error("Database index is currently building. Tasks will load shortly.")
            }
        })

        return () => unsub()
    }, [user, viewMode])

    const markComplete = async (taskId: string) => {
        try {
            const res = await apiFetch('/api/tasks/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId,
                    updates: { status: 'completed' }
                })
            })
            if (!res.ok) throw new Error(await res.text())
            // local state will update via snapshot
            toast.success("Task completed!")
        } catch (err) {
            console.error(err)
            toast.error("Failed to mark task as complete")
        }
    }

    if (!user && !loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground gap-4">
                <p>Please sign in to view your tasks.</p>
                <Button onClick={() => router.push('/')}>Go Home</Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-[calc(100dvh-5rem)] bg-background text-foreground">
            {/* Header */}
            <div className="px-6 py-6 border-b border-border/50 bg-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-5xl mx-auto w-full">
                    <div>
                        <h1 className="text-2xl font-bold font-display flex items-center gap-2">
                            <ListTodo className="h-6 w-6 text-primary" /> Tasks Hub
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Keep track of setlist preparations and assignments.
                        </p>
                    </div>

                    {canSeeOverview && (
                        <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50 shrink-0 self-start sm:self-auto">
                            <button
                                onClick={() => setViewMode('my_tasks')}
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                    viewMode === 'my_tasks' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                My Tasks
                            </button>
                            <button
                                onClick={() => setViewMode('overview')}
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                    viewMode === 'overview' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Overview
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto bg-muted/10 p-4 sm:p-6">
                <div className="max-w-5xl mx-auto space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center p-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center p-20 bg-card/50 border border-border/50 rounded-2xl my-8">
                            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-success/50" />
                            <h3 className="text-lg font-semibold text-foreground font-display">All caught up!</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                {viewMode === 'my_tasks'
                                    ? "You have no outstanding tasks assigned to you."
                                    : "There are no outstanding tasks across the congregation."}
                            </p>
                        </div>
                    ) : (
                        tasks.map((task) => {
                            const isMine = user?.uid === task.assigneeId
                            const canCheckOff = isMine || canSeeOverview

                            const dateLabel = task.eventDate && (task.eventDate as any).seconds
                                ? new Date((task.eventDate as any).seconds * 1000).toLocaleDateString(undefined, {
                                    month: 'short', day: 'numeric', year: 'numeric'
                                }) : 'No strict deadline'

                            return (
                                <div
                                    key={task.id}
                                    className="group flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                    {/* Checkbox (Left) */}
                                    <div className="hidden sm:flex shrink-0">
                                        <button
                                            disabled={!canCheckOff}
                                            onClick={() => markComplete(task.id)}
                                            className={cn(
                                                "transition-colors",
                                                !canCheckOff ? "cursor-not-allowed opacity-50" : "cursor-pointer text-muted-foreground hover:text-primary"
                                            )}
                                        >
                                            <Circle className="h-6 w-6" />
                                        </button>
                                    </div>

                                    {/* Main Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {/* Mobile checkbox inline */}
                                            <button
                                                disabled={!canCheckOff}
                                                onClick={() => markComplete(task.id)}
                                                className={cn(
                                                    "sm:hidden transition-colors shrink-0",
                                                    !canCheckOff ? "cursor-not-allowed opacity-50" : "cursor-pointer text-muted-foreground hover:text-primary"
                                                )}
                                            >
                                                <Circle className="h-5 w-5" />
                                            </button>

                                            <h3 className="text-base font-semibold truncate text-foreground flex-1">
                                                {task.title}
                                            </h3>
                                        </div>

                                        {task.description && (
                                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                                {task.description}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand bg-brand/10 px-2.5 py-1 rounded-md">
                                                <FileText className="h-3.5 w-3.5" />
                                                <Link href={`/perform/setlist/${task.setlistId}`} className="hover:underline">
                                                    {task.setlistName}
                                                </Link>
                                            </span>

                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Calendar className="h-3.5 w-3.5" />
                                                {dateLabel}
                                            </span>

                                            {viewMode === 'overview' && (
                                                <span className="inline-flex items-center gap-1.5 text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded ml-auto">
                                                    Assigned to {task.assigneeName}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Side action: Mark Complete for Mobile, or Go to Setlist */}
                                    <div className="shrink-0 flex items-center justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-border/50">
                                        {canCheckOff && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => markComplete(task.id)}
                                                className="sm:hidden w-full gap-2"
                                            >
                                                <CheckCircle2 className="h-4 w-4" /> Complete
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="hidden sm:flex text-muted-foreground gap-2 hover:bg-muted"
                                            asChild
                                        >
                                            <Link href={`/perform/setlist/${task.setlistId}`}>
                                                Open <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}

function ChevronRight(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m9 18 6-6-6-6" />
        </svg>
    )
}
