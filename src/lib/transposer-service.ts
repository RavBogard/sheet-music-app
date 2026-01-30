import { auth } from "@/lib/firebase"; // Client SDK
import { OMRCorrection } from "@/types/models";

export const transposerService = {
    async saveCorrections(fileId: string, corrections: OMRCorrection[]) {
        const user = auth.currentUser;
        if (!user) throw new Error("Must be logged in to save corrections");

        const token = await user.getIdToken();

        const res = await fetch('/api/library/save-corrections', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ fileId, corrections })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to save corrections");
        }

        return true;
    }
};
