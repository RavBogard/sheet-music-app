export function PendingAccountIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
            {/* Clock face */}
            <circle cx="48" cy="48" r="24" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            {/* Clock hands */}
            <line x1="48" y1="48" x2="48" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <line x1="48" y1="48" x2="58" y2="48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            {/* Center dot */}
            <circle cx="48" cy="48" r="2" fill="currentColor" opacity="0.3" />
            {/* Checkmark approaching (dashed arc) */}
            <path d="M76 48 C76 63 63 76 48 76" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.15" fill="none" />
            {/* Small check */}
            <path d="M78 38 L82 42 L88 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" fill="none" />
        </svg>
    )
}
