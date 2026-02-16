"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Admin page redirects to Settings where admin sections are now integrated
export default function AdminRedirect() {
    const router = useRouter()
    useEffect(() => {
        router.replace("/settings")
    }, [router])
    return null
}
