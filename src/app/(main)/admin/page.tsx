"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Legacy /admin route — redirects to /manage.
 * The middleware handles most cases, but this covers client-side navigation.
 */
export default function AdminPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/manage')
    }, [router])

    return (
        <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
        </div>
    )
}
