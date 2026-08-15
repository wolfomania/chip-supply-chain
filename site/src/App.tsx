import { useCallback, useEffect, useMemo, useState } from 'react';
import { companies, companiesById, edges, stats } from './data/loadData';
import { CompaniesView } from './views/CompaniesView';
import { SankeyView } from './views/SankeyView';
import { GlobeView } from './views/GlobeView';
import { DetailPanel } from './components/DetailPanel';
import { FlowIcon, GlobeIcon, GridIcon } from './components/icons';
import './App.css';

const VIEWS = [
  { id: 'flow', label: 'Flow', hint: 'Sankey diagram', Icon: FlowIcon },
  { id: 'globe', label: 'Globe', hint: 'World map', Icon: GlobeIcon },
  { id: 'companies', label: 'Companies', hint: 'Card index', Icon: GridIcon },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

const DEFAULT_VIEW: ViewId = 'companies';

function viewFromHash(): ViewId {
  const id = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return VIEWS.some((v) => v.id === id) ? (id as ViewId) : DEFAULT_VIEW;
}

export default function App() {
  const [view, setView] = useState<ViewId>(viewFromHash);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the hash in sync so a view is linkable and back/forward works.
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const goTo = useCallback((id: ViewId) => {
    setView(id);
    if (viewFromHash() !== id) window.location.hash = `/${id}`;
  }, []);

  const selected = selectedId ? (companiesById.get(selectedId) ?? null) : null;
  const closePanel = useCallback(() => setSelectedId(null), []);

  const viewProps = useMemo(
    () => ({ companies, edges, selectedId, onSelectCompany: setSelectedId }),
    [selectedId],
  );

  return (
    <div className={`app${selected ? ' has-panel' : ''}`}>
      <header className="masthead">
        <div className="page masthead__inner">
          <div className="masthead__text">
            <h1 className="masthead__title">The Chip Supply Chain</h1>
            <p className="masthead__standfirst">
              Every advanced chip is the output of a few hundred companies, several of which have no real
              competitor. This is who they are, what they make, and where it comes from.
            </p>
            <p className="masthead__credit">
              Inspired by the video <cite>&ldquo;The Insane Supply Chain Behind AI Chips&rdquo;</cite>
            </p>
          </div>

          <dl className="masthead__stats">
            <div>
              <dt>Companies</dt>
              <dd>{stats.companies}</dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>{stats.edges}</dd>
            </div>
            <div>
              <dt>Bottlenecks</dt>
              <dd>{stats.bottlenecks}</dd>
            </div>
            <div>
              <dt>Countries</dt>
              <dd>{stats.countries}</dd>
            </div>
          </dl>
        </div>
      </header>

      <nav className="tabs" aria-label="Views">
        <div className="page tabs__inner">
          {VIEWS.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              className={`tab${view === id ? ' is-active' : ''}`}
              onClick={() => goTo(id)}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon />
              <span className="tab__label">{label}</span>
              <span className="tab__hint">{hint}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="page" id="main">
        {view === 'flow' ? <SankeyView {...viewProps} /> : null}
        {view === 'globe' ? <GlobeView {...viewProps} /> : null}
        {view === 'companies' ? <CompaniesView {...viewProps} /> : null}
      </main>

      <footer className="site-foot">
        <div className="page site-foot__inner">
          <p>
            Built as a static site. Data is researched from public sources; corrections welcome. Company logos are
            fetched from each company&rsquo;s own domain.
          </p>
          <p className="site-foot__note">
            Inspired by the video &ldquo;The Insane Supply Chain Behind AI Chips&rdquo;.
          </p>
        </div>
      </footer>

      <DetailPanel company={selected} onClose={closePanel} onSelectCompany={setSelectedId} />
    </div>
  );
}
