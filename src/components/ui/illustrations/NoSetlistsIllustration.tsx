export function NoSetlistsIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
            {/* Music stand */}
            <line x1="48" y1="80" x2="48" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <line x1="36" y1="80" x2="60" y2="80" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            {/* Stand top / shelf */}
            <rect x="30" y="28" width="36" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Floating sheet music pages */}
            <g opacity="0.4">
                <rect x="22" y="16" width="16" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(-12 30 26)" />
                <line x1="26" y1="22" x2="34" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5" transform="rotate(-12 30 26)" />
                <line x1="26" y1="26" x2="34" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.5" transform="rotate(-12 30 26)" />
            </g>
            <g opacity="0.25">
                <rect x="56" y="10" width="16" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(8 64 20)" />
                <line x1="60" y1="16" x2="68" y2="17" stroke="currentColor" strokeWidth="1" opacity="0.5" transform="rotate(8 64 20)" />
                <line x1="60" y1="20" x2="68" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.5" transform="rotate(8 64 20)" />
            </g>
            <g opacity="0.15">
                <rect x="40" y="4" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(3 47 13)" />
            </g>
        </svg>
    )
}
