import type { Tier } from '../data/types';
import { TIER_LABEL } from '../data/tiers';
import './Chips.css';

/** Small tier label. Colour comes from the nearest [data-tier] scope. */
export function TierBadge({ tier, size = 'md' }: { tier: Tier; size?: 'sm' | 'md' }) {
  return (
    <span className={`badge badge--tier badge--${size}`} data-tier={tier}>
      <span className="badge__dot" />
      {TIER_LABEL[tier]}
    </span>
  );
}

/** Flags a company that is effectively the only viable supplier of something. */
export function BottleneckChip({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={`badge badge--alert badge--${size}`} title="Effectively the sole or dominant supplier">
      <svg viewBox="0 0 12 12" className="badge__icon" aria-hidden="true">
        <path
          d="M2 1h8L7 5.6v3.1L5 10.6V5.6L2 1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      sole-supplier bottleneck
    </span>
  );
}

/** Neutral metadata chip (counts, countries, and other small facts). */
export function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="badge badge--meta badge--sm">{children}</span>;
}
