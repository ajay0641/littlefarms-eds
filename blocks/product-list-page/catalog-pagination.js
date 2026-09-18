import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const STORE_CONFIG_GRID_PAGINATION_QUERY = `
  query CatalogGridPagination {
    storeConfig {
      grid_per_page
      grid_per_page_values
    }
  }
`;

// Persisted (not per-tab) so only a visitor's very first page view pays the round-trip
const STORAGE_KEY = 'lf-catalog-grid-pagination';

/** Magento-aligned fallback when storeConfig is unavailable */
const DEFAULT_PAGINATION = Object.freeze({
  gridPerPage: 12,
  gridPerPageValues: Object.freeze([12, 24, 36]),
});

/** @type {Promise<{ gridPerPage: number, gridPerPageValues: number[] }>|null} */
let pendingRequest = null;

/**
 * Parses Magento catalog/frontend/grid_per_page_values (comma-separated).
 * @param {string|null|undefined} raw
 * @returns {number[]}
 */
function parseGridPerPageValues(raw) {
  return String(raw || '')
    .split(',')
    .map((value) => parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/**
 * @param {{ grid_per_page?: number|string|null, grid_per_page_values?: string|null }} [storeConfig]
 * @returns {{ gridPerPage: number, gridPerPageValues: number[] }}
 */
function normalizeStoreConfig(storeConfig = {}) {
  const gridPerPageValues = parseGridPerPageValues(storeConfig.grid_per_page_values);
  const gridPerPage = parseInt(storeConfig.grid_per_page, 10);
  const fallbackValues = gridPerPageValues.length
    ? gridPerPageValues
    : [...DEFAULT_PAGINATION.gridPerPageValues];
  const resolvedPageSize = Number.isFinite(gridPerPage) && gridPerPage > 0
    ? gridPerPage
    : fallbackValues[0];

  // Prefer Magento default when it is in the allowed list; otherwise first allowed value
  const gridPerPageResolved = fallbackValues.includes(resolvedPageSize)
    ? resolvedPageSize
    : fallbackValues[0];

  return {
    gridPerPage: gridPerPageResolved,
    gridPerPageValues: fallbackValues,
  };
}

/**
 * Reads previously stored Magento catalog grid pagination.
 * @returns {{ gridPerPage: number, gridPerPageValues: number[] }|null}
 */
export function getCachedCatalogGridPagination() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.gridPerPage || !Array.isArray(parsed.gridPerPageValues)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fetches Magento catalog grid pagination from storeConfig:
 * - grid_per_page → default products per page
 * - grid_per_page_values → allowed page sizes (e.g. "12,24,36")
 *
 * Always hits the network (deduped per page view) and refreshes the stored value, so
 * admin changes are picked up without ever blocking a render on this request.
 * @returns {Promise<{ gridPerPage: number, gridPerPageValues: number[] }>}
 */
export async function fetchCatalogGridPagination() {
  if (pendingRequest) return pendingRequest;

  pendingRequest = CORE_FETCH_GRAPHQL.fetchGraphQl(STORE_CONFIG_GRID_PAGINATION_QUERY, {
    method: 'GET',
    cache: 'force-cache',
  })
    .then(({ data, errors }) => {
      if (errors?.length) {
        throw new Error(errors.map((error) => error.message).join(', '));
      }
      const normalized = normalizeStoreConfig(data?.storeConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore quota / private mode
      }
      return normalized;
    })
    .catch((error) => {
      console.warn('Failed to load Magento storeConfig grid pagination:', error);
      return {
        gridPerPage: DEFAULT_PAGINATION.gridPerPage,
        gridPerPageValues: [...DEFAULT_PAGINATION.gridPerPageValues],
      };
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

/**
 * Resolves catalog grid pagination without a network round-trip so the first
 * productSearch is not delayed by storeConfig. Returns the stored admin value when
 * available, otherwise Magento's defaults, and refreshes the stored value in the
 * background for subsequent page views.
 * @returns {{ gridPerPage: number, gridPerPageValues: number[] }}
 */
export function getCatalogGridPagination() {
  const cached = getCachedCatalogGridPagination();

  fetchCatalogGridPagination();

  return cached ?? {
    gridPerPage: DEFAULT_PAGINATION.gridPerPage,
    gridPerPageValues: [...DEFAULT_PAGINATION.gridPerPageValues],
  };
}
