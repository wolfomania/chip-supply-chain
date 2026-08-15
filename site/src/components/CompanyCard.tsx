import type { Company } from '../data/types';
import { CompanyLogo } from './CompanyLogo';
import { BottleneckChip, TierBadge } from './Chips';
import { RemoteImage } from './RemoteImage';
import { ExternalLink, PinIcon } from './icons';
import './CompanyCard.css';

export interface CompanyCardProps {
  company: Company;
  /** Called when the card body is activated. Opens the detail panel. */
  onSelect?: (id: string) => void;
  /** Renders the card in its selected state (used when the panel is open). */
  selected?: boolean;
  /** Hide the tier badge inside tier-grouped sections where it is redundant. */
  showTier?: boolean;
}

/**
 * The dataset's primary unit of display: one company, one card.
 * Used by the Companies grid, and reused as the row item in the Sankey /
 * Globe side lists. The whole card is a button; the outbound links sit above
 * it and stop propagation so they never trigger a selection.
 */
export function CompanyCard({ company, onSelect, selected = false, showTier = true }: CompanyCardProps) {
  const { name, tier, role, description, bottleneck, hq, website, productUrl, imageUrl, imageCredit, logoDomain } =
    company;

  return (
    <article
      className={`card${selected ? ' is-selected' : ''}`}
      data-tier={tier}
      aria-current={selected ? 'true' : undefined}
    >
      {onSelect ? (
        <button
          type="button"
          className="card__hit"
          onClick={() => onSelect(company.id)}
          aria-label={`Open details for ${name}`}
        />
      ) : null}

      <header className="card__head">
        <CompanyLogo name={name} logoDomain={logoDomain} size={44} />
        <div className="card__ident">
          <h3 className="card__name">{name}</h3>
          <p className="card__role">{role}</p>
        </div>
      </header>

      {showTier || bottleneck ? (
        <div className="card__chips">
          {showTier ? <TierBadge tier={tier} size="sm" /> : null}
          {bottleneck ? <BottleneckChip size="sm" /> : null}
        </div>
      ) : null}

      <p className="card__desc">{description}</p>

      <RemoteImage src={imageUrl} alt={`${name}`} credit={imageCredit} ratio="16 / 9" className="card__media" />

      <footer className="card__foot">
        <p className="card__hq">
          <PinIcon />
          {hq.city}, {hq.country}
        </p>
        <nav className="card__links" aria-label={`${name} links`}>
          {website ? (
            <a href={website} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
              Website
              <ExternalLink />
            </a>
          ) : null}
          {productUrl ? (
            <a href={productUrl} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
              Product
              <ExternalLink />
            </a>
          ) : null}
        </nav>
      </footer>
    </article>
  );
}
