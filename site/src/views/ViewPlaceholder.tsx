import type { Company } from '../data/types';
import { TIER_LABEL } from '../data/tiers';
import './ViewPlaceholder.css';

interface ViewPlaceholderProps {
  title: string;
  /** What this view will show once implemented. */
  summary: string;
  /** Bullet list of the planned behaviour — the implementation brief, on screen. */
  plan: string[];
  icon: React.ReactNode;
  /** Wiring check: clicking a name opens the shared detail panel. */
  companies: Company[];
  selectedId: string | null;
  onSelectCompany: (id: string) => void;
  /** Small stats to show the data reached the view. */
  stats: { label: string; value: string | number }[];
}

/**
 * Temporary stage stand-in for a view that is not built yet. It renders the
 * real data it was handed, so the props contract and the selection wiring are
 * exercised before the visualisation itself exists.
 */
export function ViewPlaceholder({
  title,
  summary,
  plan,
  icon,
  companies,
  selectedId,
  onSelectCompany,
  stats,
}: ViewPlaceholderProps) {
  return (
    <div className="stage">
      <div className="stage__box">
        <span className="stage__icon">{icon}</span>
        <p className="eyebrow">In development</p>
        <h2 className="stage__title">{title}</h2>
        <p className="stage__summary">{summary}</p>

        <ul className="stage__plan">
          {plan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <dl className="stage__stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="stage__wiring">
        <h3 className="eyebrow">Data received — select a company to open the detail panel</h3>
        <ul className="stage__chips">
          {companies.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`stage__chip${c.id === selectedId ? ' is-selected' : ''}`}
                data-tier={c.tier}
                onClick={() => onSelectCompany(c.id)}
              >
                <span className="stage__chip-dot" />
                {c.name}
                <span className="stage__chip-tier">{TIER_LABEL[c.tier]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
