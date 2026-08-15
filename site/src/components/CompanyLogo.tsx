import { useEffect, useState } from 'react';
import { logoUrl } from '../data/loadData';
import './CompanyLogo.css';

interface CompanyLogoProps {
  name: string;
  logoDomain: string;
  /** Rendered box size in px. Requests a 2x favicon for crispness. */
  size?: number;
  className?: string;
}

/** Initials fallback: first letter of up to two significant words. */
function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|and|of|inc|ltd|llc|corp|co|group|holdings)$/i.test(w));
  if (words.length === 0) return name.slice(0, 1).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Company mark. Loads the favicon for `logoDomain`; if the request fails —
 * or the domain is missing — falls back to a tier-tinted monogram tile so the
 * card layout never shifts.
 */
export function CompanyLogo({ name, logoDomain, size = 40, className }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);

  // Reset when the company changes (component may be reused across selections).
  useEffect(() => setFailed(false), [logoDomain]);

  const showImage = Boolean(logoDomain) && !failed;

  return (
    <span
      className={['logo', className].filter(Boolean).join(' ')}
      style={{ '--logo-size': `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          className="logo__img"
          src={logoUrl(logoDomain, size <= 32 ? 64 : 128)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="logo__monogram">{monogram(name)}</span>
      )}
    </span>
  );
}
