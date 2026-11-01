import type { ReactNode } from 'react'

/** An open book seen from above: two folded leaves on the accent square. Same artwork as resources/icon.svg. */
export function Logo({ size = 18 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <rect width="1024" height="1024" rx="228" fill="var(--accent)" />
      <path d="M512 300 C 420 236 300 222 196 244 L 196 760 C 300 738 420 752 512 816 Z" fill="#ffffff" />
      <path d="M512 300 C 604 236 724 222 828 244 L 828 760 C 724 738 604 752 512 816 Z" fill="#ffffff" opacity="0.78" />
      <path d="M512 300 L 512 816" stroke="var(--accent)" strokeWidth="18" />
    </svg>
  )
}
