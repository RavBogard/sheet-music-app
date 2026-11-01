"use client"

import { createContext, useContext } from "react"
import type { SetlistTrack } from "@/types/models"

/**
 * Live reorder: the setlist rows in the order the SERVER has them, while the
 * page shows a leader's pending reorder over them. Null when nothing is
 * pending (the screen order is the server order). Live-director inserts read
 * it so they never number rows from an order the server hasn't taken.
 */
export const ServerOrderContext = createContext<readonly SetlistTrack[] | null>(null)

export const useServerOrder = () => useContext(ServerOrderContext)
