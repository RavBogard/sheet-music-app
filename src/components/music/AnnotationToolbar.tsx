"use client"

import { Pencil, Type, Highlighter, Undo2, Trash2, X } from "lucide-react"
import { useAnnotationStore } from "@/lib/annotation-store"
import { ANNOTATION_COLORS, type AnnotationTool, type AnnotationColor } from "@/types/annotations"
import { Button } from "@/components/ui/button"

interface AnnotationToolbarProps {
    currentPage: number
    onClose: () => void
}

const TOOLS: { tool: AnnotationTool; icon: typeof Pencil; label: string }[] = [
    { tool: "freehand", icon: Pencil, label: "Draw" },
    { tool: "text", icon: Type, label: "Text" },
    { tool: "highlight", icon: Highlighter, label: "Highlight" },
]

export function AnnotationToolbar({ currentPage, onClose }: AnnotationToolbarProps) {
    const { activeTool, setTool, activeColor, setColor, undoLastAnnotation, clearPage } = useAnnotationStore()

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-700 safe-area-bottom">
            <div className="flex items-center justify-center gap-1 px-3 py-2 max-w-lg mx-auto">
                {/* Tools */}
                {TOOLS.map(({ tool, icon: Icon, label }) => (
                    <button
                        key={tool}
                        onClick={() => setTool(tool)}
                        className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                            activeTool === tool
                                ? "bg-white/15 text-white"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px]">{label}</span>
                    </button>
                ))}

                {/* Divider */}
                <div className="w-px h-8 bg-zinc-700 mx-1" />

                {/* Colors */}
                {ANNOTATION_COLORS.map(({ hex }) => (
                    <button
                        key={hex}
                        onClick={() => setColor(hex)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            activeColor === hex ? "border-white scale-125" : "border-transparent"
                        }`}
                        style={{ backgroundColor: hex }}
                    />
                ))}

                {/* Divider */}
                <div className="w-px h-8 bg-zinc-700 mx-1" />

                {/* Actions */}
                <button
                    onClick={() => undoLastAnnotation(currentPage)}
                    className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10"
                    title="Undo"
                >
                    <Undo2 className="w-4 h-4" />
                </button>
                <button
                    onClick={() => {
                        if (confirm("Clear all annotations on this page?")) {
                            clearPage(currentPage)
                        }
                    }}
                    className="p-2 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-white/10"
                    title="Clear page"
                >
                    <Trash2 className="w-4 h-4" />
                </button>

                {/* Close */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onClose}
                    className="ml-1 text-zinc-400 hover:text-white"
                >
                    <X className="w-4 h-4 mr-1" />
                    Done
                </Button>
            </div>
        </div>
    )
}
