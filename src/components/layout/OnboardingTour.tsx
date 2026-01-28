"use client"

import { useEffect } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"

export function OnboardingTour() {
    useEffect(() => {
        const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding")

        if (!hasSeenOnboarding) {
            const tour = driver({
                showProgress: true,
                animate: true,
                doneBtnText: 'Finish',
                nextBtnText: 'Next',
                prevBtnText: 'Previous',
                onDestroyed: () => {
                    localStorage.setItem("hasSeenOnboarding", "true")
                },
                steps: [
                    {
                        element: '#tour-welcome',
                        popover: {
                            title: 'Welcome to Music Books',
                            description: 'Your digital sheet music library and setlist manager.',
                            side: "bottom",
                            align: 'start'
                        }
                    },
                    {
                        element: '#tour-library-tab', // We need to add this ID
                        popover: {
                            title: 'Library',
                            description: 'Access your complete collection of charts and song sheets here.',
                            side: "bottom"
                        }
                    },
                    {
                        element: '#tour-setlists-tab', // We need to add this ID
                        popover: {
                            title: 'Setlists',
                            description: 'Create and manage setlists for your performances.',
                            side: "bottom"
                        }
                    },
                    {
                        element: '#tour-calendar-view', // We need to add this ID to Calendar link/tab if exists
                        popover: {
                            title: 'Calendar',
                            description: 'See your upcoming events and quickly create setlists for them.',
                            side: "bottom"
                        }
                    },
                    {
                        popover: {
                            title: 'Global Search',
                            description: 'Press <kbd class="bg-gray-200 px-1 rounded mx-1">Cmd+K</kbd> or <kbd class="bg-gray-200 px-1 rounded mx-1">Ctrl+K</kbd> anywhere to open the command menu for quick navigation.'
                        }
                    }
                ]
            })

            // Small delay to ensure elements are mounted
            setTimeout(() => {
                tour.drive()
            }, 1000)
        }
    }, [])

    return null // Headless component
}
