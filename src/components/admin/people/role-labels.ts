"use client"

import { useCallback } from "react"
import { useT } from "@/i18n/client"

/**
 * Phase 7: the role names shown in /manage People, translated. English matches
 * ROLE_LABELS (src/lib/roles.ts) exactly; an unknown role shows as stored.
 */
const ROLE_LABEL_KEYS = {
    admin: "admin-people.roleAdmin",
    band_leader: "admin-people.roleBandLeader",
    musician: "admin-people.roleMusician",
    member: "admin-people.roleMember",
    pending: "admin-people.rolePending",
    denied: "admin-people.roleDenied",
} as const

export function useRoleLabel(): (role: string | null | undefined) => string {
    const t = useT()
    return useCallback(
        (role) => {
            if (!role) return ""
            const key = ROLE_LABEL_KEYS[role as keyof typeof ROLE_LABEL_KEYS]
            return key ? t(key) : role
        },
        [t],
    )
}
