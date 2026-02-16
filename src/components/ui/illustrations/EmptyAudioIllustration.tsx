export function EmptyAudioIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Headphone band */}
            <path d="M24 52 C24 36 34 24 48 24 C62 24 72 36 72 52"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" fill="none" />
            {/* Left earpiece */}
            <rect x="18" y="48" width="12" height="20" rx="6" fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Right earpiece */}
            <rect x="66" y="48" width="12" height="20" rx="6" fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Music note 1 */}
            <g transform="translate(44, 52)" opacity="0.2">
                <circle cx="0" cy="4" r="3" fill="currentColor" />
                <line x1="3" y1="4" x2="3" y2="-8" stroke="currentColor" strokeWidth="1.5" />
            </g>
            {/* Music note 2 */}
            <g transform="translate(54, 48)" opacity="0.15">
                <circle cx="0" cy="4" r="2.5" fill="currentColor" />
                <line x1="2.5" y1="4" x2="2.5" y2="-7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2.5 -7 Q6 -9 2.5 -3" stroke="currentColor" strokeWidth="1" fill="none" />
            </g>
        </svg>
    )
}
