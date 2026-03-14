import { UnauthorizedState } from "@/components/ui/unauthorized-state"

export default function MonitorAdminRedirect() {
    return (
        <UnauthorizedState 
            title="Monitor Config Restricted" 
            description="Only Sound Engineers can configure monitor buses." 
            actionHref="/setlists" 
        />
    )
}
