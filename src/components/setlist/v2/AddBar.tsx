"use client"

import { Plus, Music, BookOpen, ArrowLeftRight, StickyNote, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TrackType } from "@/types/models"

interface AddBarProps {
    onAddSongs: () => void
    onAddItem: (type: TrackType) => void
}

export function AddBar({ onAddSongs, onAddItem }: AddBarProps) {
    return (
        <div className="sticky bottom-16 sm:bottom-20 md:bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex items-center gap-3">
            <Button
                variant="outline"
                className="flex-1 h-10 gap-2"
                onClick={onAddSongs}
            >
                <Music className="h-4 w-4" />
                Add Song
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-10 gap-2">
                        <Plus className="h-4 w-4" />
                        Add Item
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onAddItem("header")}>
                        <Minus className="h-4 w-4 mr-2" />
                        Section Header
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("reading")}>
                        <BookOpen className="h-4 w-4 mr-2 text-amber-500" />
                        Reading
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("prayer")}>
                        <BookOpen className="h-4 w-4 mr-2 text-blue-500" />
                        Prayer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("transition")}>
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Transition
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("note")}>
                        <StickyNote className="h-4 w-4 mr-2" />
                        Note
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
