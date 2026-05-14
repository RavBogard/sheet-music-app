"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { PushNotificationSettings } from "@/components/settings/PushNotificationSettings"
import { McpAccessSettings } from "@/components/settings/McpAccessSettings"
import { useTheme } from "next-themes"
import { useMusicStore } from "@/lib/store"
import { Switch } from "@/components/ui/switch"
import buildInfo from "@/build-info.json"
import {
    ArrowLeft, Loader2, User, Moon, Sun, Monitor,
    LogOut, Pencil, Check, Lock,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
} from "firebase/auth"

export default function SettingsPage() {
    const { user, profile, loading: authLoading, signOut } = useAuth()
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const [editingName, setEditingName] = useState(false)
    const [nameValue, setNameValue] = useState("")
    const [savingName, setSavingName] = useState(false)
    const gigModeActive = useMusicStore(s => s.gigModeActive)
    const setGigModeActive = useMusicStore(s => s.setGigModeActive)

    // Change password state (email/password users only)
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [passwordLoading, setPasswordLoading] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordSuccess, setPasswordSuccess] = useState(false)

    const isEmailPasswordUser = user?.providerData[0]?.providerId === "password"

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setPasswordError(null)
        setPasswordSuccess(false)

        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match.")
            return
        }
        if (newPassword.length < 6) {
            setPasswordError("New password must be at least 6 characters.")
            return
        }
        if (!user?.email) return

        setPasswordLoading(true)
        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword)
            await reauthenticateWithCredential(user, credential)
            await updatePassword(user, newPassword)
            setPasswordSuccess(true)
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        } catch (err: unknown) {
            if (err && typeof err === "object" && "code" in err) {
                const code = (err as { code: string }).code
                if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
                    setPasswordError("Current password is incorrect.")
                } else if (code === "auth/weak-password") {
                    setPasswordError("New password is too weak. Use at least 6 characters.")
                } else if (code === "auth/too-many-requests") {
                    setPasswordError("Too many attempts. Please try again later.")
                } else {
                    setPasswordError("Failed to change password. Please try again.")
                }
            } else {
                setPasswordError("Failed to change password. Please try again.")
            }
        } finally {
            setPasswordLoading(false)
        }
    }

    if (authLoading) return (
        <div className="h-screen bg-background flex items-center justify-center">
            <Loader2 className="animate-spin text-primary" />
        </div>
    )

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
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
                        <Avatar className="h-14 w-14 border border-border">
                            <AvatarImage src={user?.photoURL ?? undefined} alt="Profile" />
                            <AvatarFallback className="bg-muted">
                                <User className="w-7 h-7 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            {editingName ? (
                                <form
                                    className="flex items-center gap-2"
                                    onSubmit={async (e) => {
                                        e.preventDefault()
                                        if (!user || !nameValue.trim()) return
                                        setSavingName(true)
                                        try {
                                            const { updateUserDisplayName } = await import("@/lib/users-firebase")
                                            await updateUserDisplayName(user.uid, nameValue.trim())
                                            setEditingName(false)
                                        } catch { /* silent */ }
                                        setSavingName(false)
                                    }}
                                >
                                    <Input
                                        value={nameValue}
                                        onChange={(e) => setNameValue(e.target.value)}
                                        className="h-8 text-sm font-semibold"
                                        autoFocus
                                    />
                                    <Button type="submit" size="icon" variant="ghost" aria-label="Save name" className="h-8 w-8 shrink-0" disabled={savingName}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                </form>
                            ) : (
                                <button
                                    className="flex items-center gap-1.5 group"
                                    onClick={() => {
                                        setNameValue(profile?.displayName || user?.displayName || "")
                                        setEditingName(true)
                                    }}
                                >
                                    <h3 className="font-semibold text-foreground">{profile?.displayName || user?.displayName || "Musician"}</h3>
                                    <Pencil className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                                </button>
                            )}
                            <p className="text-muted-foreground text-sm">{user?.email}</p>
                        </div>
                        <div className="text-xs font-mono bg-muted px-2.5 py-1 rounded-lg text-muted-foreground border border-border">
                            {(() => {
                                const labels: Record<string, string> = { admin: 'ADMIN', band_leader: 'BAND LEADER', musician: 'MUSICIAN', member: 'MEMBER', leader: 'BAND LEADER', pending: 'PENDING' }
                                return labels[profile?.role || ''] || profile?.role?.toUpperCase() || 'MEMBER'
                            })()}
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
                                    className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                                        theme === value
                                            ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                                    )}
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

                    {/* Performance Modes */}
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-foreground">Live Gig Mode</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Disables background syncing and analytics for bulletproof stability on stage.
                                </p>
                            </div>
                            <Switch checked={gigModeActive} onCheckedChange={setGigModeActive} />
                        </div>
                    </div>

                    {/* Push Notifications */}
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <PushNotificationSettings />
                    </div>

                    {/* Change Password (email/password users only) */}
                    {isEmailPasswordUser && (
                        <div className="bg-card border border-border p-5 rounded-2xl">
                            <h3 className="font-semibold text-foreground mb-1">Change Password</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Update the password for your email account.
                            </p>
                            <form onSubmit={handleChangePassword} className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="current-password">Current password</Label>
                                    <Input
                                        id="current-password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="new-password">New password</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        placeholder="At least 6 characters"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirm-password">Confirm new password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>

                                {passwordError && (
                                    <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl p-3">
                                        {passwordError}
                                    </div>
                                )}
                                {passwordSuccess && (
                                    <div className="bg-success/10 border border-success/20 text-success text-sm rounded-xl p-3">
                                        Password updated successfully.
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    disabled={passwordLoading}
                                    className="gap-2 rounded-xl"
                                >
                                    {passwordLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Lock className="h-4 w-4" />
                                    )}
                                    Update password
                                </Button>
                            </form>
                        </div>
                    )}
                </section>

                {/* My Instrument */}
                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Instrument</h2>
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <MusicianProfileSettings />
                    </div>
                </section>

                {/* Integrations */}
                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Integrations</h2>
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <McpAccessSettings />
                    </div>
                </section>

                {/* Footer */}
                <div className="pt-6 pb-8 flex flex-col items-center gap-3">
                    <Button
                        onClick={() => signOut()}
                        variant="ghost"
                        className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 gap-2 px-8 rounded-xl"
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
