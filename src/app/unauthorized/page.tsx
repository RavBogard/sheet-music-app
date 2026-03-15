import { UnauthorizedState } from "@/components/ui/unauthorized-state"

export const metadata = {
    title: 'Unauthorized | Central Reform Congregation',
}

export default function UnauthorizedPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
            <UnauthorizedState />
        </div>
    )
}
