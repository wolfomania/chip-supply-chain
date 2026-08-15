import type { Company, Edge } from '../data/types';
import { companiesById, edges } from '../data/loadData';
import { TIER_LABEL } from '../data/tiers';
import { CompanyLogo } from './CompanyLogo';
import { BottleneckChip, TierBadge } from './Chips';
import { RemoteImage } from './RemoteImage';
import { StockQuote } from './StockQuote';
import { ArrowLeft, ArrowRight, ExternalLink, PinIcon } from './icons';
import './CompanyDetail.css';

export interface CompanyDetailProps {
  company: Company;
  /** Navigate to a related company. Omit to render relations as plain text. */
  onSelectCompany?: (id: string) => void;
}

interface Relation {
  company: Company;
  what: string;
}

function relations(list: Edge[], key: 'source' | 'target', id: string): Relation[] {
  const other = key === 'source' ? 'target' : 'source';
  return list
    .filter((e) => e[key] === id)
    .map((e) => ({ company: companiesById.get(e[other]), what: e.what }))
    .filter((r): r is Relation => Boolean(r.company))
    .sort((a, b) => a.company.name.localeCompare(b.company.name));
}

/**
 * Full record for one company. Rendered inside the slide-in detail panel by
 * all three views, so it must stand alone — no assumptions about surrounding
 * chrome beyond a scrollable column roughly 380-480px wide.
 */
export function CompanyDetail({ company, onSelectCompany }: CompanyDetailProps) {
  const { name, tier, role, description, bottleneck, hq, facilities, website, productUrl, imageUrl, imageCredit } =
    company;

  const supplies = relations(edges, 'source', company.id);
  const suppliedBy = relations(edges, 'target', company.id);

  return (
    <div className="detail" data-tier={tier}>
      <header className="detail__head">
        <CompanyLogo name={name} logoDomain={company.logoDomain} size={52} />
        <div>
          <h2 className="detail__name">{name}</h2>
          <p className="detail__role">{role}</p>
        </div>
      </header>

      <div className="detail__chips">
        <TierBadge tier={tier} />
        {bottleneck ? <BottleneckChip /> : null}
      </div>

      <RemoteImage src={imageUrl} alt={name} credit={imageCredit} ratio="16 / 9" />

      <p className="detail__desc">{description}</p>

      <StockQuote company={company} />

      <section className="detail__section">
        <h3 className="eyebrow">Headquarters</h3>
        <p className="detail__hq">
          <PinIcon />
          {hq.city}, {hq.country}
          <span className="detail__coords">
            {hq.lat.toFixed(2)}, {hq.lng.toFixed(2)}
          </span>
        </p>
      </section>

      {facilities.length > 0 ? (
        <section className="detail__section">
          <h3 className="eyebrow">Key facilities</h3>
          <ul className="detail__facilities">
            {facilities.map((f) => (
              <li key={`${f.name}-${f.city}`}>
                <span className="detail__facility-name">{f.name}</span>
                <span className="detail__facility-loc">
                  {f.city}, {f.country}
                </span>
                {f.note ? <span className="detail__facility-note">{f.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suppliedBy.length > 0 ? (
        <RelationList
          title="Supplied by"
          direction="in"
          relations={suppliedBy}
          onSelectCompany={onSelectCompany}
        />
      ) : null}

      {supplies.length > 0 ? (
        <RelationList title="Supplies" direction="out" relations={supplies} onSelectCompany={onSelectCompany} />
      ) : null}

      {website || productUrl ? (
        <footer className="detail__links">
          {website ? (
            <a className="detail__link" href={website} target="_blank" rel="noreferrer noopener">
              Official site
              <ExternalLink />
            </a>
          ) : null}
          {productUrl ? (
            <a className="detail__link" href={productUrl} target="_blank" rel="noreferrer noopener">
              Product page
              <ExternalLink />
            </a>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}

function RelationList({
  title,
  direction,
  relations: list,
  onSelectCompany,
}: {
  title: string;
  direction: 'in' | 'out';
  relations: Relation[];
  onSelectCompany?: (id: string) => void;
}) {
  return (
    <section className="detail__section">
      <h3 className="eyebrow">
        {title} <span className="detail__count">{list.length}</span>
      </h3>
      <ul className="detail__relations">
        {list.map(({ company, what }) => {
          const body = (
            <>
              <span className="detail__relation-arrow" aria-hidden="true">
                {direction === 'in' ? <ArrowLeft /> : <ArrowRight />}
              </span>
              <span className="detail__relation-body">
                <span className="detail__relation-name">
                  {company.name}
                  <span className="detail__relation-tier">{TIER_LABEL[company.tier]}</span>
                </span>
                {what ? <span className="detail__relation-what">{what}</span> : null}
              </span>
            </>
          );

          return (
            <li key={company.id} data-tier={company.tier}>
              {onSelectCompany ? (
                <button type="button" className="detail__relation" onClick={() => onSelectCompany(company.id)}>
                  {body}
                </button>
              ) : (
                <span className="detail__relation">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
