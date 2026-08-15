import type { Company, Edge } from '../data/types';

/**
 * The contract every top-level view implements. App owns the data and the
 * selection; views are presentational and report selections upward.
 */
export interface ViewProps {
  /** All loaded companies, pre-sorted by tier order then name. */
  companies: Company[];
  /** Resolved supply edges — both endpoints are guaranteed to be in `companies`. */
  edges: Edge[];
  /** Currently selected company id, or null. Views should highlight it. */
  selectedId: string | null;
  /** Report a selection. App opens the shared detail panel in response. */
  onSelectCompany: (id: string) => void;
}
