"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { useTheme } from "next-themes"
import buildInfo from "@/build-info.json"
import {
    ArrowLeft, Loader2, User, Moon, Sun, Monitor,
    LogOut, ShieldAlert, ArrowRight,
} from "lucide-react"

export default function SettingsPage() {
    const { user, isAdmin, loading: authLoading, signOut } = useAuth()
    const { theme, setTheme } = useTheme()
    const router = useRouter()

    if (authLoading) return (
        <div className="h-screen bg-background flex items-center justify-center">
            <Loader2 className="animate-spin text-violet-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold">Settings</h1>
                        <p className="text-muted-foreground text-sm">Profile and preferences</p>
                    </div>
                </div>

                {/* Account */}
                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</h2>

                    <div className="bg-card border border-border p-5 rounded-2xl flex items-center gap-4">
                        {user?.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-14 h-14 rounded-full border border-border" />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center border border-border">
                                <User className="w-7 h-7 text-muted-foreground" />
                            </div>
                        )}
                        <div className="flex-1">
                            <h3 className="font-semibold text-foreground">{user?.displayName || "Musician"}</h3>
                            <p className="text-muted-foreground text-sm">{user?.email}</p>
                        </div>
                        <div className="text-xs font-mono bg-muted px-2.5 py-1 rounded-lg text-muted-foreground border border-border">
                            {isAdmin ? "ADMIN" : "MEMBER"}
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <h3 className="font-semibold text-foreground mb-3">Appearance</h3>
                        <div className="flex gap-2">
                            {[
                                { value: "light", icon: Sun, label: "Light" },
                                { value: "dark", icon: Moon, label: "Dark" },
                                { value: "system", icon: Monitor, label: "System" },
                            ].map(({ value, icon: Icon, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setTheme(value)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                        theme === value
                                            ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/30"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                            Performance mode always uses dark theme for stage visibility.
                        </p>
                    </div>
                </section>

                {/* My Instrument */}
                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Instrument</h2>
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <MusicianProfileSettings />
                    </div>
                </section>

                {/* Admin Link */}
                {isAdmin && (
                    <section>
                        <button
                            onClick={() => router.push("/admin")}
                            className="w-full bg-card border border-border p-5 rounded-2xl text-left hover:border-violet-500/50 hover:bg-accent transition-all group flex items-center gap-4"
                        >
                            <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-500">
                                <ShieldAlert className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-foreground">Admin Dashboard</h3>
                                <p className="text-muted-foreground text-sm">Users, sound system, library, and system settings</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-violet-500 transition-colors" />
                        </button>
                    </section>
                )}

                {/* Footer */}
                <div className="pt-6 pb-8 flex flex-col items-center gap-3">
                    <Button
                        onClick={() => signOut()}
                        variant="ghost"
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10 gap-2 px-8 rounded-xl"
                    >
                        <LogOut className="w-4 h-4" />
                        Log Out
                    </Button>
                    <div className="text-muted-foreground/40 text-xs">
                        v{buildInfo.version} • {buildInfo.commit?.slice(0, 7)}
                    </div>
                </div>
            </div>
        </div>
    )
}
