import type { SetlistTrack, UserProfile, Setlist } from '@/types/models'

let counter = 0

export function createTrack(overrides?: Partial<SetlistTrack>): SetlistTrack {
    counter++
    return {
        id: `track-${counter}`,
        title: 'Test Song',
        type: 'song',
        key: 'C',
        bpm: 120,
        ...overrides,
    }
}

export function createUserProfile(overrides?: Partial<UserProfile>): UserProfile {
    counter++
    return {
        uid: `user-${counter}`,
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'musician',
        ...overrides,
    }
}

export function createSetlist(overrides?: Partial<Setlist>): Setlist {
    counter++
    return {
        id: `setlist-${counter}`,
        name: 'Test Setlist',
        date: new Date('2026-01-01'),
        trackCount: 0,
        ...overrides,
    }
}

/** Reset the counter between test suites if needed */
export function resetFactoryCounter() {
    counter = 0
}
