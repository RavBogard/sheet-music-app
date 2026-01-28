"use client"

import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { LogOut, User, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export default function SettingsPage() {
    const { user, signOut } = useAuth()
    const { theme, setTheme } = useTheme()

    return (
        <div className="flex flex-col min-h-screen p-6 pb-24 gap-6 max-w-lg mx-auto w-full">
            <h1 className="text-3xl font-bold">Settings</h1>

            {/* Profile Section */}
            {user && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center gap-4">
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-20 h-20 rounded-full border-2 border-zinc-700" />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700">
                            <User className="w-10 h-10 text-zinc-500" />
                        </div>
                    )}
                    <div className="text-center">
                        <h2 className="text-xl font-bold">{user.displayName}</h2>
                        <p className="text-zinc-500 text-sm">{user.email}</p>
                    </div>
                </div>
            )}

            {/* Admin Controls */}
            {user && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-2">
                    <button
                        onClick={() => window.location.href = '/admin/users'}
                        className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 rounded-xl transition-colors text-red-400 group"
                    >
                        <User className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <div className="flex-1 text-left">
                            <span className="font-medium block text-white">Admin Portal</span>
                            <span className="text-xs text-zinc-500">Manage users and roles</span>
                        </div>
                    </button>
                </div>
            )}

            {/* Appearance */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-2">
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 rounded-xl transition-colors"
                >
                    <div className="flex items-center gap-3">
                        {theme === 'dark' ? <Moon className="w-5 h-5 text-blue-400" /> : <Sun className="w-5 h-5 text-orange-400" />}
                        <span className="font-medium">Appearance</span>
                    </div>
                    <span className="text-sm text-zinc-500 capitalize">{theme || 'System'}</span>
                </button>
            </div>

            {/* Actions */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-2">
                <button
                    onClick={() => signOut()}
                    className="w-full flex items-center gap-3 p-4 hover:bg-red-500/10 rounded-xl transition-colors text-red-400"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Log Out</span>
                </button>
            </div>

            <div className="text-center text-xs text-zinc-600 mt-4">
                Version 2026.01.28
            </div>
        </div>
    )
}
