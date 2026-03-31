"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore"
import { toDate } from "@/lib/firestore-helpers"
import { CheckSquare, Square, Clock } from "lucide-react"
import { logger } from "@/lib/logger"

interface TaskItem {
    id: string
    title: string
    description?: string
    status: 'todo' | 'completed'
    setlistName: string
    eventDate?: Date | null
}

/**
 * Dashboard task cards showing prep tasks assigned to the current user.
 * Pulls from the `tasks` collection where assigneeId matches.
 */
export function TaskCards() {
    const { user } = useAuth()
    const [tasks, setTasks] = useState<TaskItem[]>([])

    useEffect(() => {
        if (!user) return

        const q = query(
            collection(db, 'tasks'),
            where('assigneeId', '==', user.uid),
            where('status', '==', 'todo'),
            orderBy('createdAt', 'desc'),
            limit(5)
        )

        const unsub = onSnapshot(q, (snap) => {
            const items: TaskItem[] = snap.docs.map(d => {
                const data = d.data()
                return {
                    id: d.id,
                    title: data.title,
                    description: data.description,
                    status: data.status,
                    setlistName: data.setlistName || '',
                    eventDate: toDate(data.eventDate),
                }
            })
            setTasks(items)
        }, (err) => {
            logger.error("[TaskCards] Listener error:", err)
            setTasks([])
        })

        return () => unsub()
    }, [user])

    if (tasks.length === 0) return null

    return (
        <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-brand" />
                Your Tasks
            </h2>
            <div className="flex flex-col gap-1.5">
                {tasks.map(task => (
                    <div
                        key={task.id}
                        className="bg-card border border-brand/10 border-l-2 border-l-brand/20 rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                    >
                        <Square className="w-4 h-4 text-brand/30 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                                {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground truncate">
                                    {task.setlistName}
                                </span>
                                {task.eventDate && (
                                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
                                        <Clock className="w-2.5 h-2.5" />
                                        {task.eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
