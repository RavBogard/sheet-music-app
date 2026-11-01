"use client"

import { Component, ReactNode, ErrorInfo } from "react"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"
import { useT } from "@/i18n/client"

/**
 * Lightweight error boundary that contains crashes within a single section.
 * Shared across admin/manage pages to prevent one section from taking down the whole page.
 */
export class SectionErrorBoundary extends Component<
    { children: ReactNode; label: string },
    { hasError: boolean; error?: Error }
> {
    state = { hasError: false, error: undefined as Error | undefined }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        logger.error(`[Section] ${this.props.label} crashed:`, error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <SectionErrorFallback
                    label={this.props.label}
                    error={this.state.error}
                    onRetry={() => this.setState({ hasError: false, error: undefined })}
                />
            )
        }
        return this.props.children
    }
}

/** The boundary's fallback (a function component, so it can use `useT()`). */
function SectionErrorFallback({ label, error, onRetry }: { label: string; error?: Error; onRetry: () => void }) {
    const t = useT()
    return (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-destructive mx-auto" />
            <h3 className="font-semibold text-destructive">
                {t("ui.sectionFailed", { label })}
            </h3>
            {error && (
                <pre className="text-xs text-destructive bg-destructive/5 rounded-lg p-3 overflow-auto max-h-32 text-start">
                    {error.message}
                </pre>
            )}
            <Button
                variant="link"
                onClick={onRetry}
                className="text-sm font-medium text-destructive hover:text-destructive/80"
            >
                {t("ui.retry")}
            </Button>
        </div>
    )
}
