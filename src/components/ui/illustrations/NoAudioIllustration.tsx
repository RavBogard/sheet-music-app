export function NoAudioIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
            {/* Headphones */}
            <path d="M24 52 C24 36 36 24 48 24 C60 24 72 36 72 52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" fill="none" />
            <rect x="18" y="50" width="10" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            <rect x="68" y="50" width="10" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            {/* Music notes floating */}
            <g opacity="0.2">
                <circle cx="40" cy="18" r="2" fill="currentColor" />
                <line x1="42" y1="18" x2="42" y2="10" stroke="currentColor" strokeWidth="1" />
                <path d="M42 10 L46 12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </g>
            <g opacity="0.15">
                <circle cx="58" cy="14" r="2" fill="currentColor" />
                <line x1="60" y1="14" x2="60" y2="6" stroke="currentColor" strokeWidth="1" />
                <path d="M60 6 L64 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </g>
        </svg>
    )
}
