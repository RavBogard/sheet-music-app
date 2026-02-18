"use client"

import { useState } from "react"
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion"
import { useDndContext } from "@dnd-kit/core"
import { Trash2 } from "lucide-react"

interface SwipeToDeleteProps {
    children: React.ReactNode
    onDelete: () => void
    enabled: boolean
}

const DELETE_THRESHOLD = -80

export function SwipeToDelete({ children, onDelete, enabled }: SwipeToDeleteProps) {
    const x = useMotionValue(0)
    const [swiping, setSwiping] = useState(false)
    const { active } = useDndContext()

    // Red background opacity based on swipe distance
    const bgOpacity = useTransform(x, [-120, -40, 0], [1, 0.5, 0])
    const iconScale = useTransform(x, [-120, -60, 0], [1.2, 0.8, 0.5])

    // Disable swipe when not in edit mode or when a dnd-kit drag is active
    if (!enabled || active) {
        return <>{children}</>
    }

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        setSwiping(false)
        if (info.offset.x < DELETE_THRESHOLD) {
            onDelete()
        }
    }

    return (
        <div className="relative overflow-hidden rounded-lg">
            {/* Red background revealed on swipe */}
            <motion.div
                className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500 rounded-lg"
                style={{ opacity: bgOpacity }}
            >
                <motion.div style={{ scale: iconScale }}>
                    <Trash2 className="h-5 w-5 text-white" />
                </motion.div>
            </motion.div>

            {/* Swipeable content */}
            <motion.div
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: -120, right: 0 }}
                dragElastic={{ left: 0.1, right: 0 }}
                onDragStart={() => setSwiping(true)}
                onDragEnd={handleDragEnd}
                style={{ x }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`relative bg-background ${swiping ? "z-10" : ""}`}
            >
                {children}
            </motion.div>
        </div>
    )
}
