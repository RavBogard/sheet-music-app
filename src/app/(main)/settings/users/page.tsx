import { UnauthorizedState } from "@/components/ui/unauthorized-state"

export default function UsersRedirect() {
    return (
        <UnauthorizedState 
            title="Admins Only" 
            description="Only Administrators and Band Leaders can manage user assignments." 
            actionHref="/setlists" 
        />
    )
}
