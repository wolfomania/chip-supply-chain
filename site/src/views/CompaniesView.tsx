import { useMemo, useState } from 'react';
import type { Company, Tier } from '../data/types';
import type { ViewProps } from './viewProps';
import { TIER_BLURB, TIER_LABEL, TIER_ORDER, tierIndex } from '../data/tiers';
import { CompanyCard } from '../components/CompanyCard';
import './CompaniesView.css';

function matches(company: Company, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    company.name.toLowerCase().includes(q) ||
    company.role.toLowerCase().includes(q) ||
    company.description.toLowerCase().includes(q) ||
    company.hq.country.toLowerCase().includes(q) ||
    company.hq.city.toLowerCase().includes(q) ||
    TIER_LABEL[company.tier].toLowerCase().includes(q) ||
    company.facilities.some((f) => `${f.name} ${f.city} ${f.country}`.toLowerCase().includes(q))
  );
}

/**
 * The reference view of the dataset: every company as a card, grouped by tier
 * in chain order so the page itself reads top-to-bottom as the supply chain.
 */
export function CompaniesView({ companies, selectedId, onSelectCompany }: ViewProps) {
  const [query, setQuery] = useState('');
  const [onlyBottlenecks, setOnlyBottlenecks] = useState(false);

  const filtered = useMemo(
    () => companies.filter((c) => (!onlyBottlenecks || c.bottleneck) && matches(c, query.trim())),
    [companies, query, onlyBottlenecks],
  );

  const groups = useMemo(() => {
    const map = new Map<Tier, Company[]>();
    for (const company of filtered) {
      const bucket = map.get(company.tier);
      if (bucket) bucket.push(company);
      else map.set(company.tier, [company]);
    }
    return [...map.entries()].sort((a, b) => tierIndex(a[0]) - tierIndex(b[0]));
  }, [filtered]);

  const availableTiers = useMemo(() => new Set(companies.map((c) => c.tier)), [companies]);

  return (
    <div className="companies">
      <div className="companies__controls">
        <div className="field">
          <label className="visually-hidden" htmlFor="company-search">
            Search companies
          </label>
          <input
            id="company-search"
            className="field__input"
            type="search"
            placeholder="Search company, product, country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>

        <button
          type="button"
          className={`toggle${onlyBottlenecks ? ' is-on' : ''}`}
          onClick={() => setOnlyBottlenecks((v) => !v)}
          aria-pressed={onlyBottlenecks}
        >
          <span className="toggle__dot" />
          Bottlenecks only
        </button>

        <p className="companies__count">
          <strong>{filtered.length}</strong> of {companies.length}
        </p>
      </div>

      <nav className="tier-rail" aria-label="Jump to tier">
        {TIER_ORDER.filter((t) => availableTiers.has(t)).map((tier) => (
          <a key={tier} className="tier-rail__item" href={`#tier-${tier}`} data-tier={tier}>
            <span className="tier-rail__swatch" />
            {TIER_LABEL[tier]}
          </a>
        ))}
      </nav>

      {groups.length === 0 ? (
        <p className="companies__empty">No companies match that search.</p>
      ) : (
        groups.map(([tier, list], i) => (
          <section key={tier} className="tier-section" id={`tier-${tier}`} data-tier={tier}>
            <header className="tier-section__head">
              <p className="tier-section__index">{String(i + 1).padStart(2, '0')}</p>
              <div>
                <h2 className="tier-section__title">{TIER_LABEL[tier]}</h2>
                <p className="tier-section__blurb">{TIER_BLURB[tier]}</p>
              </div>
              <p className="tier-section__count">
                {list.length} {list.length === 1 ? 'company' : 'companies'}
              </p>
            </header>

            <ul className="card-grid">
              {list.map((company) => (
                <li key={company.id}>
                  <CompanyCard
                    company={company}
                    onSelect={onSelectCompany}
                    selected={company.id === selectedId}
                    showTier={false}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
