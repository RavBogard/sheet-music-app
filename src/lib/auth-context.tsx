"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { ensureUserProfile, subscribeToUserProfile } from "./users-firebase"
import { UserProfile } from "@/types/models"

interface AuthContextType {
    user: User | null
    profile: UserProfile | null
    loading: boolean
    signIn: () => Promise<void>
    signOut: () => Promise<void>
    isAdmin: boolean
    isMember: boolean
    isLeader: boolean
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    signIn: async () => { },
    signOut: async () => { },
    isAdmin: false,
    isMember: false,
    isLeader: false
})

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)

    // Derived roles for convenience
    const isAdmin = profile?.role === 'admin'
    const isLeader = profile?.role === 'leader' || isAdmin
    const isMember = profile?.role === 'member' || isLeader

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser)
            if (currentUser) {
                // 1. Ensure profile exists (create if new)
                try {
                    await ensureUserProfile(currentUser)
                    // 2. Subscribe to profile updates
                    subscribeToUserProfile(currentUser.uid, (p) => {
                        setProfile(p)
                        setLoading(false)
                    })
                } catch (e) {
                    console.error("Error fetching user profile", e)
                    setLoading(false)
                }
            } else {
                setProfile(null)
                setLoading(false)
            }
        })

        return () => unsubscribeAuth()
    }, [])

    const signIn = async () => {
        try {
            await signInWithPopup(auth, googleProvider)
        } catch (error) {
            console.error("Sign in error:", error)
        }
    }

    const signOut = async () => {
        try {
            await firebaseSignOut(auth)
        } catch (error) {
            console.error("Sign out error:", error)
        }
    }

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            loading,
            signIn,
            signOut,
            isAdmin,
            isLeader,
            isMember
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
