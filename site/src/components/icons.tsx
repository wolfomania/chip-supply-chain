/** Inline icon set. 1.5px stroke on a 16px grid, matching IBM Plex's weight. */

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
};

export function ExternalLink({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 3.5H3.5v9h9v-3" />
      <path d="M9.5 3.5h3v3M12.5 3.5 7.5 8.5" />
    </svg>
  );
}

export function PinIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.8 8 14 8 14Z" />
      <circle cx="8" cy="6.4" r="1.6" />
    </svg>
  );
}

export function ArrowRight({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function ArrowLeft({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M13 8H3M7 4 3 8l4 4" />
    </svg>
  );
}

export function CloseIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export function FlowIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M2 4h3c3 0 2 8 5 8h4M2 12h3c1.6 0 2-2.2 2.6-4" />
    </svg>
  );
}

export function GlobeIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.4 8h11.2M8 2.25c1.6 1.7 2.4 3.7 2.4 5.75S9.6 12.05 8 13.75c-1.6-1.7-2.4-3.7-2.4-5.75S6.4 3.95 8 2.25Z" />
    </svg>
  );
}

export function GridIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" />
      <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" />
      <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" />
      <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" />
    </svg>
  );
}
