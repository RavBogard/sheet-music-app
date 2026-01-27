"use client"

import { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

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
        console.error("Uncaught error:", error, errorInfo)
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-white p-6 gap-6 text-center">
                    <div className="bg-red-500/20 p-6 rounded-full">
                        <AlertTriangle className="h-16 w-16 text-red-500" />
                    </div>
                    <h1 className="text-3xl font-bold">Something went wrong</h1>
                    <p className="text-zinc-400 max-w-md">
                        The application encountered a critical error. Please reload the page.
                    </p>
                    {this.state.error && (
                        <pre className="bg-zinc-900 p-4 rounded text-xs text-red-400 max-w-lg overflow-auto text-left">
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
