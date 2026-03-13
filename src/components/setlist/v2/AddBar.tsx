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
        <div className="sticky bottom-16 sm:bottom-20 md:bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t border-brand/10 px-4 py-3 flex items-center justify-center">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="default" className="w-full sm:w-64 h-11 gap-2 rounded-xl shadow-md bg-brand hover:bg-brand/90 text-primary-foreground">
                        <Plus className="h-5 w-5" />
                        <span className="font-semibold text-[15px]">Add Item</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56 rounded-xl p-1.5 shadow-xl">
                    <DropdownMenuItem 
                        onClick={onAddSongs}
                        className="py-2.5 px-3 cursor-pointer mb-1"
                    >
                        <Music className="h-4 w-4 mr-3 text-brand" />
                        <span className="font-medium">Song from Library</span>
                    </DropdownMenuItem>
                    
                    <div className="h-px bg-border/50 my-1 mx-2" />
                    
                    <DropdownMenuItem onClick={() => onAddItem("header")} className="py-2.5 px-3 cursor-pointer">
                        <Minus className="h-4 w-4 mr-3 text-muted-foreground" />
                        <span>Section Header</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("reading")} className="py-2.5 px-3 cursor-pointer">
                        <BookOpen className="h-4 w-4 mr-3 text-amber-500" />
                        <span>Reading</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("prayer")} className="py-2.5 px-3 cursor-pointer">
                        <BookOpen className="h-4 w-4 mr-3 text-blue-500" />
                        <span>Prayer</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("transition")} className="py-2.5 px-3 cursor-pointer">
                        <ArrowLeftRight className="h-4 w-4 mr-3 text-emerald-500" />
                        <span>Transition</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddItem("note")} className="py-2.5 px-3 cursor-pointer">
                        <StickyNote className="h-4 w-4 mr-3 text-muted-foreground" />
                        <span>Stage Note</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
