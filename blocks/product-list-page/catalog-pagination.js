import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const STORE_CONFIG_GRID_PAGINATION_QUERY = `
  query CatalogGridPagination {
    storeConfig {
      grid_per_page
      grid_per_page_values
    }
  }
`;

const SESSION_CACHE_KEY = 'lf-catalog-grid-pagination';

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
  const fallbackValues = gridPerPageValues.length ? gridPerPageValues : [12, 24, 36];
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
 * Reads cached Magento catalog grid pagination from sessionStorage.
 * @returns {{ gridPerPage: number, gridPerPageValues: number[] }|null}
 */
function readSessionCache() {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
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
 * Result is cached in-memory and sessionStorage for the tab session.
 * @returns {Promise<{ gridPerPage: number, gridPerPageValues: number[] }>}
 */
export async function fetchCatalogGridPagination() {
  const cached = readSessionCache();
  if (cached) return cached;

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
        sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore quota / private mode
      }
      return normalized;
    })
    .catch((error) => {
      console.warn('Failed to load Magento storeConfig grid pagination:', error);
      return normalizeStoreConfig();
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}
