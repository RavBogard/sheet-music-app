"use client"
import { useState, useEffect } from "react"
import { Hand } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SwipeOverlay() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (!localStorage.getItem("hasSeenSwipeOverlay")) {
            // Slight delay so it doesn't pop up instantly before rendering the score
            const timer = setTimeout(() => setVisible(true), 1500)
            return () => clearTimeout(timer)
        }
    }, [])

    const handleDismiss = () => {
        localStorage.setItem("hasSeenSwipeOverlay", "true")
        setVisible(false)
    }

    if (!visible) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md touch-none"
            onClick={handleDismiss}
        >
            <div className="flex flex-col items-center justify-center gap-6 p-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative flex items-center justify-center w-32 h-32">
                    <Hand
                        className="w-20 h-20 text-white absolute"
                        style={{
                            animation: "swipe-anim 2.5s ease-in-out infinite"
                        }}
                    />
                </div>
                <div className="text-center space-y-2 max-w-xs">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Swipe to Navigate</h2>
                    <p className="text-white/80 mt-2">Swipe left or right across the screen to change songs.</p>
                </div>
                <Button
                    variant="ghost"
                    className="mt-6 px-8 py-3 bg-white hover:bg-white/90 text-black rounded-full font-bold"
                    onClick={handleDismiss}
                >
                    Got it
                </Button>
            </div>
        </div>
    )
}
