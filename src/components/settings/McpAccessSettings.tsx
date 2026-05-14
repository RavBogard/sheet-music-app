"use client"

import { useState, useEffect, useCallback } from "react"
import { KeyRound, Plus, Copy, Check, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"

/**
 * Settings section: "Claude / MCP Access". Lets a user mint and revoke the
 * bearer tokens that connect Claude to centralreform.live via the MCP route.
 * The raw token is shown exactly once on creation.
 */

interface McpToken {
    id: string
    label: string
    createdAt: number | null
    lastUsedAt: number | null
}

function formatDate(ms: number | null): string {
    if (!ms) return "—"
    return new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

export function McpAccessSettings() {
    const [tokens, setTokens] = useState<McpToken[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [label, setLabel] = useState("")
    const [newToken, setNewToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [revoking, setRevoking] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await apiFetch("/api/mcp/tokens")
            if (!res.ok) throw new Error()
            const data = await res.json()
            setTokens(data.tokens ?? [])
        } catch {
            toast.error("Could not load MCP tokens")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!label.trim()) return
        setCreating(true)
        try {
            const res = await apiFetch("/api/mcp/tokens", {
                method: "POST",
                body: JSON.stringify({ label: label.trim() }),
            })
            if (!res.ok) throw new Error()
            const data = await res.json()
            setNewToken(data.token)
            setLabel("")
            setCopied(false)
            await load()
        } catch {
            toast.error("Could not create token")
        } finally {
            setCreating(false)
        }
    }

    const handleCopy = async () => {
        if (!newToken) return
        try {
            await navigator.clipboard.writeText(newToken)
            setCopied(true)
            toast.success("Token copied")
        } catch {
            toast.error("Copy failed — select and copy manually")
        }
    }

    const handleRevoke = async (id: string) => {
        setRevoking(id)
        try {
            const res = await apiFetch(`/api/mcp/tokens/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error()
            toast.success("Token revoked")
            await load()
        } catch {
            toast.error("Could not revoke token")
        } finally {
            setRevoking(null)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                    <h3 className="font-semibold text-foreground">Claude / MCP Access</h3>
                    <p className="text-sm text-muted-foreground">
                        Generate a token to connect Claude to your setlists and library.
                    </p>
                </div>
            </div>

            {/* One-time token reveal */}
            {newToken && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Copy this token now — you will not be able to see it again.
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono bg-background/60 border border-border rounded-lg px-3 py-2 break-all">
                            {newToken}
                        </code>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={handleCopy}
                            aria-label="Copy token"
                            className="shrink-0"
                        >
                            {copied ? (
                                <Check className="h-4 w-4 text-success" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setNewToken(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        Done
                    </button>
                </div>
            )}

            {/* Create form */}
            <form onSubmit={handleCreate} className="flex items-center gap-2">
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Token label (e.g. Claude Desktop)"
                    maxLength={80}
                    className="h-9 text-sm"
                />
                <Button
                    type="submit"
                    size="sm"
                    disabled={creating || !label.trim()}
                    className="gap-1.5 shrink-0 rounded-xl"
                >
                    {creating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Plus className="h-4 w-4" />
                    )}
                    Generate
                </Button>
            </form>

            {/* Token list */}
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
                </div>
            ) : tokens.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tokens yet.</p>
            ) : (
                <div className="border border-border rounded-xl divide-y divide-border">
                    {tokens.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {t.label}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Created {formatDate(t.createdAt)} · Last used{" "}
                                    {formatDate(t.lastUsedAt)}
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRevoke(t.id)}
                                disabled={revoking === t.id}
                                aria-label={`Revoke ${t.label}`}
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                            >
                                {revoking === t.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
