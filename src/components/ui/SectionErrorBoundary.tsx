"use client"

import { Component, ReactNode, ErrorInfo } from "react"
import { ShieldAlert } from "lucide-react"

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
        console.error(`[Section] ${this.props.label} crashed:`, error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center space-y-3">
                    <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
                    <h3 className="font-semibold text-red-600 dark:text-red-400">
                        {this.props.label} failed to load
                    </h3>
                    {this.state.error && (
                        <pre className="text-xs text-red-400/80 bg-red-500/5 rounded-lg p-3 overflow-auto max-h-32 text-left">
                            {this.state.error.message}
                        </pre>
                    )}
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="text-sm font-medium text-red-500 hover:text-red-400 underline"
                    >
                        Retry
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
