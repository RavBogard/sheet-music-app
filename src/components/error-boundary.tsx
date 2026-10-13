"use client"

import { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { clearFirestoreIndexedDB } from "@/lib/firebase"
import { useT } from "@/i18n/client"

interface Props {
    children?: ReactNode
}

interface State {
    hasError: boolean
    error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error("Uncaught error:", error, errorInfo)
        captureException(error, {
            source: 'client',
            location: 'ErrorBoundary',
            extra: { componentStack: errorInfo.componentStack }
        })

        // Auto-recover from Firestore assertion errors caused by corrupted IndexedDB
        const msg = error.message || ""
        if (
            (msg.includes("INTERNAL ASSERTION FAILED") || msg.includes("Unexpected state")) &&
            typeof window !== "undefined" &&
            !sessionStorage.getItem("firestore-idb-recovery-attempted")
        ) {
            logger.warn("[ErrorBoundary] Firestore assertion error detected, clearing IndexedDB")
            sessionStorage.setItem("firestore-idb-recovery-attempted", "1")
            clearFirestoreIndexedDB().catch(e => logger.error("Failed to clear IDB", e))
        }
    }

    public render() {
        if (this.state.hasError) {
            return (
                <CriticalErrorScreen
                    error={this.state.error}
                    onReload={() => {
                        this.setState({ hasError: false })
                        window.location.href = '/'
                    }}
                />
            )
        }

        return this.props.children
    }
}

/** The boundary's full-page fallback (a function component, so it can use `useT()`). */
function CriticalErrorScreen({ error, onReload }: { error?: Error; onReload: () => void }) {
    const t = useT()
    return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 gap-6 text-center">
            <div className="bg-red-500/20 p-6 rounded-full">
                <AlertTriangle className="h-16 w-16 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold">{t("shell.somethingWentWrong")}</h1>
            <p className="text-muted-foreground max-w-md">
                {t("shell.criticalError")}
            </p>
            {error && (
                <pre className="bg-card p-4 rounded text-xs text-red-400 max-w-lg overflow-auto text-start">
                    {error.message}
                </pre>
            )}
            <Button size="lg" onClick={onReload}>
                {t("shell.reloadApplication")}
            </Button>
        </div>
    )
}
