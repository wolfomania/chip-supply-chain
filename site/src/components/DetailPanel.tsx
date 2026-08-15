import { useEffect, useRef } from 'react';
import type { Company } from '../data/types';
import { CompanyDetail } from './CompanyDetail';
import { CloseIcon } from './icons';
import './DetailPanel.css';

export interface DetailPanelProps {
  /** The company to show, or null when the panel is closed. */
  company: Company | null;
  onClose: () => void;
  /** Navigate the panel to a related company. */
  onSelectCompany?: (id: string) => void;
}

/**
 * Shared slide-in detail panel. All three views (Flow, Globe, Companies)
 * write into this one panel, so selecting a node anywhere in the app produces
 * the same reading experience.
 */
export function DetailPanel({ company, onClose, onSelectCompany }: DetailPanelProps) {
  const open = company !== null;
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Move focus in on open, back out on close.
  useEffect(() => {
    if (open) {
      restoreFocusTo.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else {
      restoreFocusTo.current?.focus?.();
      restoreFocusTo.current = null;
    }
  }, [open]);

  // Scroll back to the top whenever the subject changes.
  useEffect(() => {
    if (company) bodyRef.current?.scrollTo({ top: 0 });
  }, [company]);

  return (
    <>
      <div
        className={`panel-scrim${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
        data-testid="panel-scrim"
      />
      <aside
        className={`panel${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label={company ? `${company.name} details` : 'Company details'}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="panel__bar">
          <span className="eyebrow">Company</span>
          <button ref={closeRef} type="button" className="panel__close" onClick={onClose} aria-label="Close details">
            <CloseIcon />
          </button>
        </div>
        <div className="panel__body" ref={bodyRef}>
          {company ? <CompanyDetail company={company} onSelectCompany={onSelectCompany} /> : null}
        </div>
      </aside>
    </>
  );
}
