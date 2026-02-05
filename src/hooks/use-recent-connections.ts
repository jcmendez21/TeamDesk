"use client";

import { useState, useEffect } from "react";

export interface RecentConnection {
    id: string; // The connection ID (e.g. "123 456 789")
    timestamp: number;
}

const STORAGE_KEY = "teamdesk-recent-connections";
const MAX_RECENTS = 5;

export function useRecentConnections() {
    const [recents, setRecents] = useState<RecentConnection[]>([]);

    useEffect(() => {
        // Load from local storage on mount
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setRecents(JSON.parse(stored));
            }
        } catch (error) {
            console.error("Failed to load recent connections", error);
        }
    }, []);

    const addRecent = (id: string) => {
        const cleanId = id.replace(/\s/g, ""); // Store cleaned ID

        setRecents((prev) => {
            // Remove existing occurrence if any (to bump to top)
            const filtered = prev.filter((item) => item.id !== cleanId);

            // Add new to top
            const newItem: RecentConnection = {
                id: cleanId,
                timestamp: Date.now(),
            };

            const newRecents = [newItem, ...filtered].slice(0, MAX_RECENTS);

            // Save to local storage
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecents));
            } catch (error) {
                console.error("Failed to save recent connection", error);
            }

            return newRecents;
        });
    };

    return {
        recents,
        addRecent,
    };
}
