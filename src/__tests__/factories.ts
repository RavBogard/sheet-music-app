import type { SetlistTrack, UserProfile, Setlist, SchedulingAssignment } from '@/types/models'

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
        tracks: [],
        trackCount: 0,
        ...overrides,
    }
}

export function createAssignment(overrides?: Partial<SchedulingAssignment>): SchedulingAssignment {
    counter++
    return {
        id: `assign-${counter}`,
        setlistId: 'setlist-1',
        setlistName: 'Test Setlist',
        eventDate: null,
        musicianUid: 'user-1',
        musicianName: 'Test User',
        musicianEmail: 'test@example.com',
        status: 'pending',
        autoConfirmed: false,
        assignedBy: 'admin-1',
        assignedByName: 'Admin',
        assignedAt: new Date('2026-01-01'),
        ...overrides,
    }
}

/** Reset the counter between test suites if needed */
export function resetFactoryCounter() {
    counter = 0
}
