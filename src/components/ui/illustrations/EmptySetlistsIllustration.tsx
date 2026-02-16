export function EmptySetlistsIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Music stand */}
            <rect x="44" y="60" width="8" height="24" rx="2" fill="currentColor" opacity="0.1" />
            <rect x="36" y="82" width="24" height="4" rx="2" fill="currentColor" opacity="0.15" />
            {/* Stand top / holder */}
            <rect x="24" y="16" width="48" height="44" rx="4" fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Sheet music lines */}
            <line x1="32" y1="28" x2="64" y2="28" stroke="currentColor" strokeWidth="1" opacity="0.15" />
            <line x1="32" y1="34" x2="64" y2="34" stroke="currentColor" strokeWidth="1" opacity="0.15" />
            <line x1="32" y1="40" x2="64" y2="40" stroke="currentColor" strokeWidth="1" opacity="0.15" />
            <line x1="32" y1="46" x2="64" y2="46" stroke="currentColor" strokeWidth="1" opacity="0.15" />
            {/* Floating note 1 */}
            <g transform="translate(68, 20) rotate(15)" opacity="0.25">
                <circle cx="0" cy="0" r="3" fill="currentColor" />
                <line x1="3" y1="0" x2="3" y2="-12" stroke="currentColor" strokeWidth="1.5" />
            </g>
            {/* Floating note 2 */}
            <g transform="translate(18, 24) rotate(-10)" opacity="0.18">
                <circle cx="0" cy="0" r="2.5" fill="currentColor" />
                <line x1="2.5" y1="0" x2="2.5" y2="-10" stroke="currentColor" strokeWidth="1.5" />
            </g>
        </svg>
    )
}
