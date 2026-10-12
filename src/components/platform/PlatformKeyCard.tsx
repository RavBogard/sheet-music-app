"use client"

import { useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { errorText, platformApi } from "./api"
import { CopyButton, ErrorLine, PlatformCard } from "./shared"

const PLATFORM_URL = "https://www.centralreform.live/api/platform/mcp"

/** Multi-tenant phase 4: a key for Claude's platform connector (/api/platform/mcp). */
export function PlatformKeyCard() {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [token, setToken] = useState<string | null>(null)

    const mint = async () => {
        setBusy(true)
        setError(null)
        try {
            setToken((await platformApi.mintPlatformToken("Platform (Claude)")).token)
        } catch (e) {
            setError(errorText(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <PlatformCard
            id="platform-key"
            title="Claude platform connector"
            description={`Lets Claude run the platform tools. Connector address: ${PLATFORM_URL}. Add the key as an Authorization: Bearer header.`}
        >
            <Button variant="outline" onClick={() => void mint()} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />}
                Make platform key
            </Button>
            <ErrorLine error={error} />
            {token && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                    <p className="text-sm">Copy it now. It will not be shown again.</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs break-all bg-muted/50 rounded px-2 py-1" data-testid="platform-key">{token}</code>
                        <CopyButton text={token} label="Copy key" />
                        <Button size="sm" variant="ghost" onClick={() => setToken(null)}>Hide</Button>
                    </div>
                </div>
            )}
        </PlatformCard>
    )
}
