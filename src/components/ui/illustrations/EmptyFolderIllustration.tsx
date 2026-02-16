export function EmptyFolderIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
            <path d="M16 32 L16 72 L80 72 L80 36 L52 36 L46 28 L16 28 Z" stroke="currentColor" strokeWidth="1.5" opacity="0.2" strokeLinejoin="round" />
            <path d="M16 40 L80 40 L80 72 L16 72 Z" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinejoin="round" />
            <rect x="30" y="48" width="36" height="16" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" opacity="0.15" />
        </svg>
    )
}
