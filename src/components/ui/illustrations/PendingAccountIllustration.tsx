export function PendingAccountIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Clock circle */}
            <circle cx="48" cy="48" r="28" fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Clock hands */}
            <line x1="48" y1="48" x2="48" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
            <line x1="48" y1="48" x2="60" y2="52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
            {/* Center dot */}
            <circle cx="48" cy="48" r="2" fill="currentColor" opacity="0.3" />
            {/* Approaching checkmark */}
            <g transform="translate(68, 22)" opacity="0.25">
                <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.15" />
                <path d="M4 8 L7 11 L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            {/* Hour markers */}
            <circle cx="48" cy="22" r="1.5" fill="currentColor" opacity="0.15" />
            <circle cx="74" cy="48" r="1.5" fill="currentColor" opacity="0.15" />
            <circle cx="48" cy="74" r="1.5" fill="currentColor" opacity="0.15" />
            <circle cx="22" cy="48" r="1.5" fill="currentColor" opacity="0.15" />
        </svg>
    )
}
