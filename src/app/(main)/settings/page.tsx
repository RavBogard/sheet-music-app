"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { PushNotificationSettings } from "@/components/settings/PushNotificationSettings"
import { McpAccessSettings } from "@/components/settings/McpAccessSettings"
import { LanguageSettings } from "@/components/settings/LanguageSettings"
import { useTheme } from "next-themes"
import { useMusicStore } from "@/lib/store"
import { Switch } from "@/components/ui/switch"
import buildInfo from "@/build-info.json"
import {
    Loader2, User, Moon, Sun, Monitor,
    LogOut, Pencil, Check, Lock,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { PageContainer, PageHeader, CARD_CLASS, GROUP_HEADING_CLASS } from "@/components/layout/Page"
import { useT } from "@/i18n/client"
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
} from "firebase/auth"

/** Role id → badge text key. `leader` is the legacy id for band_leader. */
const ROLE_LABEL = {
    admin: "settings.role.admin",
    band_leader: "settings.role.bandLeader",
    musician: "settings.role.musician",
    member: "settings.role.member",
    leader: "settings.role.bandLeader",
    pending: "settings.role.pending",
} as const

export default function SettingsPage() {
    const { user, profile, role, loading: authLoading, signOut } = useAuth()
    const t = useT()
    const { theme, setTheme } = useTheme()
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
            setPasswordError(t("settings.password.mismatch"))
            return
        }
        if (newPassword.length < 6) {
            setPasswordError(t("settings.password.tooShort"))
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
                    setPasswordError(t("settings.password.incorrect"))
                } else if (code === "auth/weak-password") {
                    setPasswordError(t("settings.password.weak"))
                } else if (code === "auth/too-many-requests") {
                    setPasswordError(t("settings.password.tooManyAttempts"))
                } else {
                    setPasswordError(t("settings.password.failed"))
                }
            } else {
                setPasswordError(t("settings.password.failed"))
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
        <PageContainer className="space-y-7">
                {/* Consistency pass: the one page head; the tab bar and the
                    user menu are the way out, so no back button. */}
                <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

                {/* Account */}
                <section className="space-y-4">
                    <h2 className={GROUP_HEADING_CLASS}>{t("settings.account")}</h2>

                    <div className={cn(CARD_CLASS, "p-4 sm:p-5 flex flex-wrap items-center gap-x-4 gap-y-2")}>
                        <Avatar className="h-14 w-14 border border-border">
                            <AvatarImage src={user?.photoURL ?? undefined} alt={t("settings.profilePhotoAlt")} />
                            <AvatarFallback className="bg-muted">
                                <User className="w-7 h-7 text-muted-foreground" />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-[1_1_12rem] min-w-0">
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
                                        className="h-11 text-base font-semibold"
                                        autoFocus
                                    />
                                    <Button type="submit" size="icon" variant="ghost" aria-label={t("settings.saveName")} className="h-11 w-11 shrink-0" disabled={savingName}>
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
                                    <h3 className="text-[17px] font-bold text-foreground text-start break-words">{profile?.displayName || user?.displayName || t("settings.defaultDisplayName")}</h3>
                                    <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                                </button>
                            )}
                            <p className="text-muted-foreground text-sm truncate" title={user?.email ?? undefined}>{user?.email}</p>
                        </div>
                        <div className="text-xs font-semibold bg-secondary px-2.5 py-1 rounded-md text-secondary-foreground border border-border">
                            {(() => {
                                const r = role ?? 'pending'
                                // Unknown role ids fall through to the raw id (data, as before).
                                return Object.hasOwn(ROLE_LABEL, r) ? t(ROLE_LABEL[r as keyof typeof ROLE_LABEL]) : role?.toUpperCase() || t("settings.role.member")
                            })()}
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className={cn(CARD_CLASS, "p-4 sm:p-5")}>
                        <h3 className="text-[15px] font-bold text-foreground mb-3">{t("settings.appearance")}</h3>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: "light", icon: Sun, label: t("settings.theme.light") },
                                { value: "dark", icon: Moon, label: t("settings.theme.dark") },
                                { value: "system", icon: Monitor, label: t("settings.theme.system") },
                            ].map(({ value, icon: Icon, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setTheme(value)}
                                    className={cn("flex items-center gap-2 min-h-11 px-4 rounded-md text-sm font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        theme === value
                                            ? "bg-accent text-foreground border-brand"
                                            : "bg-card text-muted-foreground hover:text-foreground border-border"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                            {t("settings.performThemeHint")}
                        </p>
                    </div>

                    {/* Language (phase 7: only on a non-English tenant) */}
                    <LanguageSettings />

                    {/* Performance Modes */}
                    <div className={cn(CARD_CLASS, "p-4 sm:p-5")}>
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <h3 id="gig-mode-title" className="text-[15px] font-bold text-foreground">{t("settings.gigMode.title")}</h3>
                                <p id="gig-mode-desc" className="text-sm text-muted-foreground mt-1">
                                    {t("settings.gigMode.description")}
                                </p>
                            </div>
                            <Switch
                                checked={gigModeActive}
                                onCheckedChange={setGigModeActive}
                                aria-labelledby="gig-mode-title"
                                aria-describedby="gig-mode-desc"
                            />
                        </div>
                    </div>

                    {/* Push Notifications */}
                    <div className={cn(CARD_CLASS, "p-4 sm:p-5")}>
                        <PushNotificationSettings />
                    </div>

                    {/* Change Password (email/password users only) */}
                    {isEmailPasswordUser && (
                        <div className={cn(CARD_CLASS, "p-4 sm:p-5")}>
                            <h3 className="text-[15px] font-bold text-foreground mb-1">{t("settings.password.title")}</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                {t("settings.password.description")}
                            </p>
                            <form onSubmit={handleChangePassword} className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="current-password">{t("settings.password.current")}</Label>
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
                                    <Label htmlFor="new-password">{t("settings.password.new")}</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        placeholder={t("settings.password.newPlaceholder")}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirm-password">{t("settings.password.confirm")}</Label>
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
                                    <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3">
                                        {passwordError}
                                    </div>
                                )}
                                {passwordSuccess && (
                                    <div className="bg-success/10 border border-success/20 text-success text-sm rounded-md p-3">
                                        {t("settings.password.success")}
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    disabled={passwordLoading}
                                    className="gap-2 rounded-md h-11"
                                >
                                    {passwordLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Lock className="h-4 w-4" />
                                    )}
                                    {t("settings.password.submit")}
                                </Button>
                            </form>
                        </div>
                    )}
                </section>

                {/* My Instrument */}
                <section className="space-y-4">
                    <h2 className={GROUP_HEADING_CLASS}>{t("settings.myInstrument")}</h2>
                    <div className={cn(CARD_CLASS, "p-4 sm:p-5")}>
                        <MusicianProfileSettings />
                    </div>
                </section>

                {/* Integrations */}
                <section className="space-y-4">
                    <h2 className={GROUP_HEADING_CLASS}>{t("settings.integrations")}</h2>
                    <div className={cn(CARD_CLASS, "p-4 sm:p-5")}>
                        <McpAccessSettings />
                    </div>
                </section>

                {/* Footer */}
                <div className="pt-6 pb-8 flex flex-col items-center gap-3">
                    <Button
                        onClick={() => signOut()}
                        variant="ghost"
                        className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 gap-2 px-8 h-11 rounded-md font-semibold"
                    >
                        <LogOut className="w-4 h-4" />
                        {t("settings.logOut")}
                    </Button>
                    <div className="tnum text-muted-foreground text-xs">
                        {t("settings.version", { version: buildInfo.version, commit: buildInfo.commit?.slice(0, 7) })}
                    </div>
                </div>
        </PageContainer>
    )
}
