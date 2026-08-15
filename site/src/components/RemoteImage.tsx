import { useEffect, useState } from 'react';
import './RemoteImage.css';

interface RemoteImageProps {
  src?: string | null;
  alt: string;
  credit?: string | null;
  /** CSS aspect-ratio for the reserved box, e.g. "16 / 9". */
  ratio?: string;
  className?: string;
}

/**
 * Third-party image (Wikimedia Commons, press photos). Renders nothing at all
 * when `src` is missing or the request fails, so a broken link leaves no gap —
 * important because the dataset is research-sourced and links rot.
 */
export function RemoteImage({ src, alt, credit, ratio = '16 / 9', className }: RemoteImageProps) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');

  useEffect(() => setState(src ? 'loading' : 'error'), [src]);

  if (!src || state === 'error') return null;

  return (
    <figure
      className={['remote-image', state === 'loading' && 'is-loading', className].filter(Boolean).join(' ')}
      style={{ '--ratio': ratio } as React.CSSProperties}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
      />
      {credit ? <figcaption>{credit}</figcaption> : null}
    </figure>
  );
}
