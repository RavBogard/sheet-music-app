"use client"

import { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"

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
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 gap-6 text-center">
                    <div className="bg-red-500/20 p-6 rounded-full">
                        <AlertTriangle className="h-16 w-16 text-red-500" />
                    </div>
                    <h1 className="text-3xl font-bold">Something went wrong</h1>
                    <p className="text-muted-foreground max-w-md">
                        The application encountered a critical error. Please reload the page.
                    </p>
                    {this.state.error && (
                        <pre className="bg-card p-4 rounded text-xs text-red-400 max-w-lg overflow-auto text-left">
                            {this.state.error.message}
                        </pre>
                    )}
                    <Button
                        size="lg"
                        onClick={() => {
                            this.setState({ hasError: false })
                            window.location.href = '/'
                        }}
                    >
                        Reload Application
                    </Button>
                </div>
            )
        }

        return this.props.children
    }
}
