"use client"

import * as React from "react"
import { Command } from "cmdk"
import { Search, Music, Moon, Sun, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"

export function CommandPalette() {
    const [open, setOpen] = React.useState(false)
    const { setTheme } = useTheme()
    const router = useRouter()

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    const runCommand = React.useCallback((command: () => void) => {
        setOpen(false)
        command()
    }, [])

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label="Global Command Menu"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-xl overflow-hidden z-[9999]"
        >
            <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-3">
                <Search className="w-5 h-5 text-zinc-500 mr-2" />
                <Command.Input
                    placeholder="Type a command or search..."
                    className="w-full h-12 outline-none bg-transparent text-sm placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100"
                />
            </div>

            <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
                <Command.Empty className="py-6 text-center text-sm text-zinc-500">
                    No results found.
                </Command.Empty>

                <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/library"))}
                        className="flex items-center px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-sm text-zinc-700 dark:text-zinc-200"
                    >
                        <Music className="w-4 h-4 mr-2" />
                        Go to Library
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/setlists"))}
                        className="flex items-center px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-sm text-zinc-700 dark:text-zinc-200"
                    >
                        <Music className="w-4 h-4 mr-2" />
                        Go to Setlists
                    </Command.Item>
                </Command.Group>

                <Command.Group heading="Theme" className="px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    <Command.Item
                        onSelect={() => runCommand(() => setTheme("light"))}
                        className="flex items-center px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-sm text-zinc-700 dark:text-zinc-200"
                    >
                        <Sun className="w-4 h-4 mr-2" />
                        Light Mode
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => setTheme("dark"))}
                        className="flex items-center px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-sm text-zinc-700 dark:text-zinc-200"
                    >
                        <Moon className="w-4 h-4 mr-2" />
                        Dark Mode
                    </Command.Item>
                </Command.Group>
            </Command.List>
        </Command.Dialog>
    )
}
