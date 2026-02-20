"use client"
import { useState, useEffect } from "react"
import { Hand } from "lucide-react"

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
                <button
                    className="mt-6 px-8 py-3 bg-white hover:bg-white/90 text-black rounded-full font-bold transition-colors"
                    onClick={handleDismiss}
                >
                    Got it
                </button>
            </div>
            <style jsx global>{`
                @keyframes swipe-anim {
                    0% { transform: translateX(40px) rotate(-15deg); opacity: 0; }
                    20% { opacity: 1; }
                    60% { transform: translateX(-40px) rotate(15deg); opacity: 1; }
                    80% { opacity: 0; transform: translateX(-50px) rotate(15deg); }
                    100% { opacity: 0; }
                }
            `}</style>
        </div>
    )
}
