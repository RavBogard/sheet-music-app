"use client"

import { ProtectedLayout } from "@/components/auth/ProtectedLayout"

export default function PerformLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ProtectedLayout>
            {children}
        </ProtectedLayout>
    )
}
